import re
import os

INPUT_FILE = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (3).sql"

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
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

def run():
    with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    insert_pat = re.compile(
        r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
        re.DOTALL | re.IGNORECASE
    )

    referrals = []
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
                    
                    name = cols[2]
                    if not name or not str(name).strip() or re.match(r'^patient\s+\d+$', str(name).strip(), re.IGNORECASE):
                        continue
                    
                    ref_name = cols[33]
                    ref_afhoz = cols[34]
                    ref_contact = cols[41]
                    ref_email = cols[42]
                    ref_phys = cols[44]
                    ref_by = cols[52]

                    if ref_name or ref_by:
                        referrals.append({
                            'ref_name': ref_name,
                            'ref_afhoz': ref_afhoz,
                            'ref_contact': ref_contact,
                            'ref_email': ref_email,
                            'ref_phys': ref_phys,
                            'ref_by': ref_by
                        })

    print(f"Total rows with referral info: {len(referrals)}")
    print("First 15 referral records:")
    for idx, ref in enumerate(referrals[:15]):
        print(f"  {idx+1}. Name: {ref['ref_name']} | By: {ref['ref_by']} | Contact: {ref['ref_contact']} | Email: {ref['ref_email']} | Afhoz: {ref['ref_afhoz']}")

if __name__ == '__main__':
    run()
