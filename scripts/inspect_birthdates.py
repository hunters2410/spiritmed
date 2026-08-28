import re
import os
import requests
import json
from datetime import datetime
from collections import Counter, defaultdict

SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json'
}

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

def parse_dob(dob_raw):
    if not dob_raw: return None
    s = str(dob_raw).strip()
    if not s or s.lower() in ('null', 'none', '0', '0000-00-00', '00-00-0000', 'n/a', '-', ''):
        return None
    
    # Try various formats
    # 1. YYYY-MM-DD
    m1 = re.match(r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$', s)
    if m1:
        y, m, d = int(m1.group(1)), int(m1.group(2)), int(m1.group(3))
        try:
            dt = datetime(y, m, d)
            if 1900 <= y <= 2026:
                return dt.strftime('%Y-%m-%d')
        except ValueError:
            pass

    # 2. DD-MM-YYYY or DD/MM/YYYY
    m2 = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$', s)
    if m2:
        d, m, y = int(m2.group(1)), int(m2.group(2)), int(m2.group(3))
        try:
            dt = datetime(y, m, d)
            if 1900 <= y <= 2026:
                return dt.strftime('%Y-%m-%d')
        except ValueError:
            # If day and month were swapped (MM-DD-YYYY)
            try:
                dt = datetime(y, d, m)
                if 1900 <= y <= 2026:
                    return dt.strftime('%Y-%m-%d')
            except ValueError:
                pass

    # 3. Unix timestamp (e.g. 10 digits)
    if s.isdigit() and len(s) in (9, 10):
        try:
            ts = int(s)
            dt = datetime.utcfromtimestamp(ts)
            if 1900 <= dt.year <= 2026:
                return dt.strftime('%Y-%m-%d')
        except:
            pass

    return None

def clean_name(n):
    if not n: return ''
    return re.sub(r'\s+', ' ', str(n).strip().lower())

def main():
    print('Reading SQL dump...')
    with open(SQL_FILE, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    insert_pat = re.compile(
        r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
        re.DOTALL | re.IGNORECASE
    )

    sql_patients = []
    raw_dob_formats = Counter()
    unparseable_dobs = []

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
                    phone = cols[6]
                    birthdate = cols[8]
                    age = cols[9]
                    pid = cols[12]
                    
                    parsed_d = parse_dob(birthdate)
                    if birthdate and not parsed_d and str(birthdate).strip().lower() not in ('null', 'none', '0', '0000-00-00', '00-00-0000', 'n/a', '-', ''):
                        unparseable_dobs.append((sql_id, name, birthdate))

                    sql_patients.append({
                        'sql_id': str(sql_id).strip() if sql_id else '',
                        'name': str(name).strip() if name else '',
                        'clean_name': clean_name(name),
                        'patient_id': str(pid).strip() if pid else '',
                        'raw_birthdate': birthdate,
                        'parsed_dob': parsed_d,
                        'phone': str(phone).strip() if phone else '',
                    })

    print(f'Total SQL rows: {len(sql_patients)}')
    sql_with_dob = [p for p in sql_patients if p['parsed_dob']]
    print(f'SQL rows with valid parsed date_of_birth: {len(sql_with_dob)}')
    print(f'Unparseable non-empty raw birthdates: {len(unparseable_dobs)}')
    if unparseable_dobs:
        print('Samples of unparseable birthdates:')
        for uid, uname, udob in unparseable_dobs[:10]:
            print(f'  id={uid}, name={uname}, raw={udob}')

    # Fetch Supabase patients
    print('\nFetching Supabase patients...')
    sp_patients = []
    limit = 1000
    offset = 0
    while True:
        h = headers.copy()
        h['Range'] = f'{offset}-{offset + limit - 1}'
        url = f'{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name,phone,date_of_birth,status,created_at'
        r = requests.get(url, headers=h)
        data = r.json()
        if not data or not isinstance(data, list): break
        sp_patients.extend(data)
        if len(data) < limit: break
        offset += limit

    print(f'Total Supabase patients: {len(sp_patients)}')
    sp_with_dob = [p for p in sp_patients if p.get('date_of_birth')]
    sp_without_dob = [p for p in sp_patients if not p.get('date_of_birth')]
    print(f'Supabase patients WITH date_of_birth: {len(sp_with_dob)}')
    print(f'Supabase patients WITHOUT date_of_birth (NULL): {len(sp_without_dob)}')

    # Match SQL rows with Supabase patients without date_of_birth
    sp_by_pno = defaultdict(list)
    sp_by_name = defaultdict(list)
    for p in sp_patients:
        pno = str(p.get('patient_number') or '').strip()
        cname = clean_name(p.get('full_name'))
        if pno: sp_by_pno[pno].append(p)
        if cname: sp_by_name[cname].append(p)

    ready_to_update = []
    already_same_dob = 0
    different_dob = []

    seen_sp_ids = set()

    for sql_p in sql_patients:
        parsed_dob = sql_p['parsed_dob']
        if not parsed_dob:
            continue

        pid = sql_p['patient_id']
        cname = sql_p['clean_name']
        
        sp_match = None
        # 1. Match by patient_number
        if pid and pid in sp_by_pno:
            matched_list = sp_by_pno[pid]
            for m in matched_list:
                if cname == clean_name(m.get('full_name')):
                    sp_match = m
                    break
            if not sp_match:
                for m in matched_list:
                    m_cname = clean_name(m.get('full_name'))
                    c_parts = set(cname.split())
                    m_parts = set(m_cname.split())
                    if len(c_parts.intersection(m_parts)) > 0:
                        sp_match = m
                        break

        # 2. Match by name
        if not sp_match and cname and cname in sp_by_name:
            matched_list = sp_by_name[cname]
            if len(matched_list) == 1:
                sp_match = matched_list[0]
            elif len(matched_list) > 1:
                for m in matched_list:
                    if sql_p['phone'] and sql_p['phone'] == str(m.get('phone') or '').strip():
                        sp_match = m
                        break
                if not sp_match:
                    no_dob_list = [m for m in matched_list if not m.get('date_of_birth')]
                    if len(no_dob_list) == 1:
                        sp_match = no_dob_list[0]

        if not sp_match:
            continue

        if sp_match['id'] in seen_sp_ids:
            continue

        cur_dob = str(sp_match.get('date_of_birth') or '').strip()
        if cur_dob == parsed_dob:
            already_same_dob += 1
            seen_sp_ids.add(sp_match['id'])
            continue

        if not cur_dob or cur_dob.lower() in ('null', 'none', ''):
            seen_sp_ids.add(sp_match['id'])
            ready_to_update.append({
                'id': sp_match['id'],
                'pno': sp_match.get('patient_number'),
                'name': sp_match.get('full_name'),
                'target_dob': parsed_dob,
                'raw_dob': sql_p['raw_birthdate'],
                'sql_pid': sql_p['patient_id']
            })
        else:
            different_dob.append({
                'id': sp_match['id'],
                'pno': sp_match.get('patient_number'),
                'name': sp_match.get('full_name'),
                'cur_dob': cur_dob,
                'sql_dob': parsed_dob
            })

    print('\n================ DOB ANALYSIS SUMMARY ================')
    print(f'Patients in Supabase already having exact same date_of_birth: {already_same_dob}')
    print(f'Patients in Supabase with NULL date_of_birth that CAN BE UPDATED: {len(ready_to_update)}')
    print(f'Patients where date_of_birth differs from existing Supabase value: {len(different_dob)}')

    print('\nSample patients to update (first 15):')
    for item in ready_to_update[:15]:
        print(f"  {item['name']} (PNO: {item['pno']}): NULL -> {item['target_dob']} (raw: '{item['raw_dob']}')")

    if different_dob:
        print('\nSample patients with differing DOB (first 5):')
        for item in different_dob[:5]:
            print(f"  {item['name']} (PNO: {item['pno']}): SP={item['cur_dob']} vs SQL={item['sql_dob']}")

if __name__ == '__main__':
    main()
