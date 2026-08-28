import re
import os
import requests
import json
from collections import defaultdict

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
    if v.upper() == 'NULL':
        return None
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
            in_q = True
            current += c
        elif c == "'" and in_q:
            if i + 1 < len(row_str) and row_str[i+1] == "'":
                current += "''"
                i += 2
                continue
            in_q = False
            current += c
        elif c == ',' and not in_q:
            values.append(current.strip())
            current = ''
        else:
            current += c
        i += 1
    if current.strip():
        values.append(current.strip())
    return values

def main():
    print(f'Parsing SQL file: {SQL_FILE}...')
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
                if depth == 0:
                    start = idx + 1
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0 and start is not None:
                    row_str = block[start:idx]
                    cols = [unquote(v) for v in split_values(row_str)]
                    while len(cols) < 53:
                        cols.append(None)
                    
                    sql_id = cols[0]
                    name = cols[2]
                    phone = cols[6]
                    birthdate = cols[8]
                    pid = cols[12]
                    fn = cols[45] # filenumber
                    status = cols[51]
                    
                    sql_patients.append({
                        'sql_id': str(sql_id).strip() if sql_id else '',
                        'name': str(name).strip() if name else '',
                        'patient_id': str(pid).strip() if pid else '',
                        'filenumber': str(fn).strip() if fn and str(fn).strip() not in ('', 'NULL', 'null', '0', 'None') else None,
                        'phone': str(phone).strip() if phone else '',
                        'birthdate': str(birthdate).strip() if birthdate else '',
                        'status': str(status).strip() if status else ''
                    })

    print(f'Total rows in SQL: {len(sql_patients)}')

    # Fetch Supabase patients
    print('Fetching all Supabase patients...')
    sp_patients = []
    limit = 1000
    offset = 0
    while True:
        h = headers.copy()
        h['Range'] = f'{offset}-{offset + limit - 1}'
        url = f'{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name,phone,status,created_at'
        r = requests.get(url, headers=h)
        data = r.json()
        if not data or not isinstance(data, list):
            break
        sp_patients.extend(data)
        if len(data) < limit:
            break
        offset += limit

    print(f'Total patients in Supabase: {len(sp_patients)}')

    # Let's inspect Supabase patients with no file_number
    sp_no_fn = [p for p in sp_patients if not p.get('file_number') or str(p.get('file_number')).strip() in ('', 'NULL', 'null', '0', 'None')]
    print(f'Total Supabase patients with null/empty file_number: {len(sp_no_fn)}')

    # Build lookup dicts for SQL patients
    sql_by_pid = {p['patient_id']: p for p in sql_patients if p['patient_id']}
    sql_by_sql_id = {p['sql_id']: p for p in sql_patients if p['sql_id']}
    sql_by_name = {p['name'].lower(): p for p in sql_patients if p['name']}

    # Build lookup dicts for Supabase patients
    sp_by_pno = {str(p['patient_number']).strip(): p for p in sp_patients if p.get('patient_number')}
    sp_by_name = {str(p['full_name']).strip().lower(): p for p in sp_patients if p.get('full_name')}

    # Let's check how many of the Supabase no-fn patients can be matched in SQL
    can_update_by_pno = []
    can_update_by_name = []
    still_no_fn_in_sql = []
    not_in_sql = []

    for sp_p in sp_no_fn:
        pno = str(sp_p.get('patient_number') or '').strip()
        name = str(sp_p.get('full_name') or '').strip().lower()

        matched_sql = None
        match_reason = None

        if pno and pno in sql_by_pid:
            matched_sql = sql_by_pid[pno]
            match_reason = f'patient_number={pno}'
        elif name and name in sql_by_name:
            matched_sql = sql_by_name[name]
            match_reason = f'name={sp_p.get("full_name")}'

        if matched_sql:
            if matched_sql['filenumber']:
                if match_reason.startswith('patient_number'):
                    can_update_by_pno.append((sp_p, matched_sql))
                else:
                    can_update_by_name.append((sp_p, matched_sql))
            else:
                still_no_fn_in_sql.append((sp_p, matched_sql, 'SQL has no filenumber either'))
        else:
            not_in_sql.append(sp_p)

    print(f'\nBreakdown of the {len(sp_no_fn)} Supabase patients with NO file number:')
    print(f'  - Matched by patient_number with valid SQL filenumber: {len(can_update_by_pno)}')
    print(f'  - Matched by full_name with valid SQL filenumber: {len(can_update_by_name)}')
    print(f'  - Matched in SQL, but SQL also has NO filenumber: {len(still_no_fn_in_sql)}')
    print(f'  - Not found in SQL: {len(not_in_sql)}')

    print('\nSamples of can_update_by_pno (first 10):')
    for sp_p, sql_p in can_update_by_pno[:10]:
        print(f"  SP: id={sp_p['id']}, name='{sp_p['full_name']}', pno={sp_p['patient_number']} --> SQL file_number='{sql_p['filenumber']}' (SQL name='{sql_p['name']}')")

    if can_update_by_name:
        print('\nSamples of can_update_by_name (first 10):')
        for sp_p, sql_p in can_update_by_name[:10]:
            print(f"  SP: id={sp_p['id']}, name='{sp_p['full_name']}', pno={sp_p['patient_number']} --> SQL file_number='{sql_p['filenumber']}' (SQL pno={sql_p['patient_id']})")

    # Let's inspect the 53 different file numbers
    print('\nInvestigating 53 different file numbers...')
    diff_matches = []
    for sql_p in sql_patients:
        pid = sql_p['patient_id']
        sql_fn = sql_p['filenumber']
        if not sql_fn:
            continue
        if pid in sp_by_pno:
            sp_p = sp_by_pno[pid]
            sp_fn = str(sp_p.get('file_number') or '').strip()
            if sp_fn and sp_fn != sql_fn and sp_fn.lower() not in ('null', 'none', '0'):
                diff_matches.append({
                    'pid': pid,
                    'sql_name': sql_p['name'],
                    'sp_name': sp_p['full_name'],
                    'sql_fn': sql_fn,
                    'sp_fn': sp_fn,
                    'sp_id': sp_p['id']
                })

    print(f'Found {len(diff_matches)} where patient_number matches but file_number differs.')
    same_person_diff_fn = 0
    diff_person_diff_fn = 0
    for d in diff_matches:
        if d['sql_name'].lower().replace(' ', '') == d['sp_name'].lower().replace(' ', ''):
            same_person_diff_fn += 1
        else:
            diff_person_diff_fn += 1
            print(f"  DIFFERENT PERSON on same patient_number: pno={d['pid']} | SQL: '{d['sql_name']}' (fn={d['sql_fn']}) vs SP: '{d['sp_name']}' (fn={d['sp_fn']})")

    print(f'  Same person, updated file_number: {same_person_diff_fn}')
    print(f'  Different person conflict: {diff_person_diff_fn}')

if __name__ == '__main__':
    main()
