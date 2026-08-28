import re
import os
import requests
import json
from datetime import datetime
from collections import Counter

SQL_FILE = r'C:\Users\Acer P16\Documents\Spiritmed\hospital update\db2\patient (9).sql'

def unquote(v):
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("\\'", "'").replace("''", "'").replace("\\\\", "\\")
    return v

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            current += c
            if i + 1 < len(row_str):
                current += row_str[i+1]
                i += 2
            else:
                i += 1
            continue
        elif c == "'" and not in_q:
            in_q = True; current += c
        elif c == "'" and in_q:
            if i + 1 < len(row_str) and row_str[i+1] == "'":
                current += "''"; i += 2; continue
            in_q = False; current += c
        elif c == ',' and not in_q:
            values.append(current.strip()); current = ''
        else:
            current += c
        i += 1
    if current.strip():
        values.append(current.strip())
    return values

def clean_dob_string(s, add_date_str=None, age_str=None):
    if not s:
        s = ''
    raw = str(s).strip()
    
    # Check if empty / placeholder
    if raw.lower() in ('null', 'none', '0', '0000-00-00', '00-00-0000', 'n/a', '-', '', 'undefined'):
        raw = ''

    if raw:
        # Normalize separators and whitespace
        # Handle 5-digit years like 11953 -> 1953, 19993 -> 1993
        t = re.sub(r'1(\d{4})$', r'\1', raw)
        t = re.sub(r'199(\d{2})$', r'19\1', t) # e.g. 19993 -> 1993
        
        # Replace non-digit separators with a single hyphen
        # But beware missing hyphen before 4-digit year e.g. '03-031972' -> '03-03-1972'
        t = re.sub(r'(\d{2})(\d{4})$', r'\1-\2', t)
        t = re.sub(r'[^\d]+', '-', t).strip('-')
        
        parts = t.split('-')
        if len(parts) == 3:
            p1, p2, p3 = parts[0], parts[1], parts[2]
            
            # Format A: YYYY-MM-DD
            if len(p1) == 4:
                y, m, d = int(p1), int(p2), int(p3)
                if 1900 <= y <= 2026:
                    if 1 <= m <= 12 and 1 <= d <= 31:
                        try:
                            return datetime(y, m, d).strftime('%Y-%m-%d'), 'parsed_ymd'
                        except ValueError:
                            pass
            
            # Format B: DD-MM-YYYY or MM-DD-YYYY
            if len(p3) == 4 or len(p3) in (2, 3):
                if len(p3) == 4:
                    y = int(p3)
                elif len(p3) == 3:
                    # e.g. '200' -> 2000, '198' -> 1980
                    y = int(p3 + '0')
                elif len(p3) == 2:
                    # 2-digit year
                    y = int(p3)
                    y = 1900 + y if y > 26 else 2000 + y

                # Fix typo future year e.g. 2068 -> 1968
                if y > 2026 and y <= 2099:
                    y -= 100
                elif y > 2099 and str(y).startswith('29'): # e.g. 2916 -> 2016
                    y = int('20' + str(y)[2:])

                v1, v2 = int(p1), int(p2)
                
                # Check if v1 > 12 -> must be day (DD-MM-YYYY)
                if v1 > 12 and 1 <= v2 <= 12 and 1 <= v1 <= 31:
                    d, m = v1, v2
                    try:
                        return datetime(y, m, d).strftime('%Y-%m-%d'), 'parsed_dmy'
                    except ValueError:
                        pass
                # Check if v2 > 12 -> must be day (MM-DD-YYYY)
                elif v2 > 12 and 1 <= v1 <= 12 and 1 <= v2 <= 31:
                    m, d = v1, v2
                    try:
                        return datetime(y, m, d).strftime('%Y-%m-%d'), 'parsed_mdy'
                    except ValueError:
                        pass
                # Both <= 12: assume DD-MM-YYYY default in Zimbabwe
                elif 1 <= v1 <= 31 and 1 <= v2 <= 12:
                    d, m = v1, v2
                    try:
                        return datetime(y, m, d).strftime('%Y-%m-%d'), 'parsed_dmy_default'
                    except ValueError:
                        pass

    # If no valid birthdate string, but age is provided
    if age_str:
        age_clean = str(age_str).strip()
        if age_clean.isdigit():
            age_val = int(age_clean)
            if 0 < age_val < 125:
                # Get base year from add_date or default to 2023
                base_year = 2023
                if add_date_str:
                    # e.g. '11/07/23' or '2023-07-11'
                    m_yr = re.search(r'(\d{2,4})$', str(add_date_str).strip())
                    if m_yr:
                        yr = int(m_yr.group(1))
                        if yr < 100:
                            base_year = 2000 + yr if yr <= 26 else 1900 + yr
                        else:
                            base_year = yr
                birth_year = base_year - age_val
                if 1900 <= birth_year <= 2026:
                    return f"{birth_year}-01-01", f"inferred_from_age_{age_val}"

    return None, 'unresolved'

def main():
    with open(SQL_FILE, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    insert_pat = re.compile(
        r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
        re.DOTALL | re.IGNORECASE
    )

    sql_rows = []
    for match in insert_pat.finditer(content):
        block = match.group(1)
        depth, start = 0, None
        for idx, ch in enumerate(block):
            if ch == '(':
                if depth == 0: start = idx + 1
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0 and start is not None:
                    row_str = block[start:idx]
                    cols = [unquote(v) for v in split_values(row_str)]
                    while len(cols) < 53: cols.append(None)
                    
                    sql_id = cols[0]
                    name = cols[2]
                    birthdate = cols[8]
                    age = cols[9]
                    pid = cols[12]
                    add_date = cols[13]
                    
                    dob, reason = clean_dob_string(birthdate, add_date, age)
                    sql_rows.append({
                        'sql_id': sql_id,
                        'name': name,
                        'pid': pid,
                        'raw_bd': birthdate,
                        'raw_age': age,
                        'add_date': add_date,
                        'dob': dob,
                        'reason': reason
                    })

    print(f"Total SQL rows: {len(sql_rows)}")
    with_dob = [r for r in sql_rows if r['dob']]
    print(f"Resolved DOB count: {len(with_dob)} ({len(with_dob)/len(sql_rows)*100:.1f}%)")
    
    reasons = Counter([r['reason'] for r in sql_rows])
    print("\nReason counts:")
    for r, c in reasons.most_common():
        print(f"  {r}: {c}")

    print("\nTesting previous unparseables:")
    test_ids = ['34', '55', '58', '262', '280', '294', '309', '362', '435', '2111', '2210']
    for r in sql_rows:
        if str(r['sql_id']) in test_ids:
            print(f"  id={r['sql_id']}, name='{r['name']}', raw_bd='{r['raw_bd']}', age='{r['raw_age']}' -> DOB={r['dob']} ({r['reason']})")

if __name__ == '__main__':
    main()
