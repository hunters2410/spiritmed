import re
import os
import requests
import json
from collections import defaultdict, Counter

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

def clean_name(n):
    if not n: return ''
    return re.sub(r'\s+', ' ', str(n).strip().lower())

def main():
    print('Parsing SQL...')
    with open(SQL_FILE, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    insert_pat = re.compile(
        r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
        re.DOTALL | re.IGNORECASE
    )

    sql_patients = []
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
                    pid = cols[12]
                    fn = cols[45]
                    status = cols[51]
                    
                    fn_clean = str(fn).strip() if fn and str(fn).strip() not in ('', 'NULL', 'null', '0', 'None', '-') else None
                    
                    sql_patients.append({
                        'sql_id': str(sql_id).strip() if sql_id else '',
                        'name': str(name).strip() if name else '',
                        'clean_name': clean_name(name),
                        'patient_id': str(pid).strip() if pid else '',
                        'filenumber': fn_clean,
                        'phone': str(phone).strip() if phone else '',
                        'birthdate': str(birthdate).strip() if birthdate else '',
                        'status': str(status).strip() if status else ''
                    })

    print(f'Total SQL rows: {len(sql_patients)}')

    print('Fetching Supabase patients...')
    sp_patients = []
    limit = 1000
    offset = 0
    while True:
        h = headers.copy()
        h['Range'] = f'{offset}-{offset + limit - 1}'
        url = f'{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name,phone,status,created_at'
        r = requests.get(url, headers=h)
        data = r.json()
        if not data or not isinstance(data, list): break
        sp_patients.extend(data)
        if len(data) < limit: break
        offset += limit

    print(f'Total Supabase patients: {len(sp_patients)}')

    # Map current Supabase file_number -> patient
    sp_by_fn = {}
    for p in sp_patients:
        fn = p.get('file_number')
        if fn and str(fn).strip() not in ('', 'NULL', 'null', '0', 'None'):
            fn_s = str(fn).strip()
            sp_by_fn[fn_s] = p

    # Map Supabase patients by patient_number
    sp_by_pno = {str(p.get('patient_number') or '').strip(): p for p in sp_patients if p.get('patient_number')}

    # Check patients in SQL with filenumber
    placeholder_matches = 0
    real_collisions = []
    same_person_already_has_it = 0
    new_assignments_no_collision = []

    for sql_p in sql_patients:
        fn = sql_p['filenumber']
        if not fn: continue
        pid = sql_p['patient_id']
        sp_p = sp_by_pno.get(pid)
        if not sp_p: continue

        cur_fn = str(sp_p.get('file_number') or '').strip()
        if cur_fn == fn:
            same_person_already_has_it += 1
            continue

        if not cur_fn or cur_fn.lower() in ('null', 'none', '0'):
            # Supabase patient has NO file number, wants `fn`
            if fn in sp_by_fn:
                existing_owner = sp_by_fn[fn]
                is_placeholder = bool(re.match(r'^patient\s+\d+$', str(existing_owner.get('full_name') or '').strip(), re.IGNORECASE))
                if is_placeholder:
                    placeholder_matches += 1
                real_collisions.append({
                    'target_fn': fn,
                    'sql_patient': sql_p,
                    'sp_target': sp_p,
                    'sp_existing_owner': existing_owner,
                    'is_placeholder': is_placeholder
                })
            else:
                new_assignments_no_collision.append((sp_p, fn))

    print(f'\nBreakdown of SQL patients with filenumber:')
    print(f'  - Already have exact same file_number in Supabase: {same_person_already_has_it}')
    print(f'  - Can be assigned clean file_number with ZERO collision: {len(new_assignments_no_collision)}')
    print(f'  - Collision with an existing Supabase file_number: {len(real_collisions)}')
    print(f'    * Existing owner is a placeholder ("patient XXXX"): {placeholder_matches}')
    print(f'    * Existing owner is a named patient: {len(real_collisions) - placeholder_matches}')

    print('\nSamples where existing owner is a PLACEHOLDER ("patient XXXX") (first 5):')
    ph_samples = [c for c in real_collisions if c['is_placeholder']]
    for c in ph_samples[:5]:
        print(f"  FN {c['target_fn']}: Target='{c['sp_target']['full_name']}' (pno={c['sp_target']['patient_number']}) vs Placeholder Owner='{c['sp_existing_owner']['full_name']}' (pno={c['sp_existing_owner']['patient_number']})")

    print('\nSamples where existing owner is a NAMED patient (first 10):')
    named_samples = [c for c in real_collisions if not c['is_placeholder']]
    for c in named_samples[:10]:
        print(f"  FN {c['target_fn']}: Target='{c['sp_target']['full_name']}' (pno={c['sp_target']['patient_number']}, status={c['sp_target']['status']}) vs Existing Owner='{c['sp_existing_owner']['full_name']}' (pno={c['sp_existing_owner']['patient_number']}, status={c['sp_existing_owner']['status']})")

if __name__ == '__main__':
    main()
