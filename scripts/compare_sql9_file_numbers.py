import re
import os
import requests
import json

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
    print(f'Reading {SQL_FILE}...')
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
                    pid = cols[12]
                    fn = cols[45] # filenumber
                    phone = cols[6]
                    
                    sql_patients.append({
                        'sql_id': sql_id,
                        'name': name,
                        'patient_id': pid,
                        'filenumber': fn,
                        'phone': phone
                    })

    print(f'Total patient records in SQL: {len(sql_patients)}')

    # Fetch all patients from Supabase
    print('Fetching all patients from Supabase...')
    sp_patients = []
    limit = 1000
    offset = 0
    while True:
        h = headers.copy()
        h['Range'] = f'{offset}-{offset + limit - 1}'
        url = f'{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name,phone'
        r = requests.get(url, headers=h)
        data = r.json()
        if not data or not isinstance(data, list):
            break
        sp_patients.extend(data)
        if len(data) < limit:
            break
        offset += limit

    print(f'Total patients in Supabase: {len(sp_patients)}')

    # Index Supabase patients
    sp_by_pno = {str(p.get('patient_number')).strip(): p for p in sp_patients if p.get('patient_number')}
    sp_by_name = {str(p.get('full_name')).strip().lower(): p for p in sp_patients if p.get('full_name')}

    sql_with_fn = [p for p in sql_patients if p['filenumber'] and str(p['filenumber']).strip() not in ('', 'NULL', 'null', '0', 'None')]
    print(f'SQL patients with non-empty filenumber: {len(sql_with_fn)}')

    matched_exact_fn = 0
    sp_has_no_fn = []
    different_fn = []
    missing_in_sp = []

    for sql_p in sql_patients:
        pid = str(sql_p['patient_id']).strip() if sql_p['patient_id'] else ''
        sql_fn = str(sql_p['filenumber']).strip() if sql_p['filenumber'] else None
        if sql_fn in ('', 'NULL', 'null', '0', 'None'):
            sql_fn = None
            
        sp_match = sp_by_pno.get(pid)
        match_type = 'pno'
        if not sp_match and sql_p['name']:
            sp_match = sp_by_name.get(str(sql_p['name']).strip().lower())
            match_type = 'name'
            
        if sp_match:
            sp_fn = sp_match.get('file_number')
            sp_fn_str = str(sp_fn).strip() if sp_fn else ''
            
            if sql_fn:
                if not sp_fn_str or sp_fn_str.lower() in ('null', 'none', '0'):
                    sp_has_no_fn.append((sql_p, sp_match, match_type))
                elif sp_fn_str != sql_fn:
                    different_fn.append((sql_p, sp_match, match_type))
                else:
                    matched_exact_fn += 1
        else:
            if sql_fn:
                missing_in_sp.append(sql_p)

    print('\n================ SUMMARY ================')
    print(f'1. Exact match (SQL file_number == Supabase file_number): {matched_exact_fn}')
    print(f'2. Supabase missing file_number (SQL has filenumber, Supabase has null/empty): {len(sp_has_no_fn)}')
    print(f'3. Different file_number (SQL has filenumber, Supabase has different file_number): {len(different_fn)}')
    print(f'4. Missing in Supabase entirely (SQL patient with filenumber not found in Supabase): {len(missing_in_sp)}')

    if sp_has_no_fn:
        print('\n--- Samples where Supabase has NO file_number ---')
        for sql_p, sp_m, mt in sp_has_no_fn[:15]:
            print(f'  SQL: name="{sql_p["name"]}", pid={sql_p["patient_id"]}, fn={sql_p["filenumber"]} | SP: name="{sp_m["full_name"]}", pno={sp_m["patient_number"]}, cur_fn={sp_m.get("file_number")}')

    if different_fn:
        print('\n--- Samples where file_numbers differ ---')
        for sql_p, sp_m, mt in different_fn[:25]:
            print(f'  SQL: name="{sql_p["name"]}", pid={sql_p["patient_id"]}, fn={sql_p["filenumber"]} | SP: name="{sp_m["full_name"]}", pno={sp_m["patient_number"]}, cur_fn={sp_m.get("file_number")}')

    # Let's also check how many Supabase patients currently have file_number == patient_number (which was used as fallback)
    pno_as_fn = 0
    empty_fn = 0
    for p in sp_patients:
        fn = p.get('file_number')
        pno = p.get('patient_number')
        if not fn or str(fn).strip() in ('', 'NULL', 'null', '0', 'None'):
            empty_fn += 1
        elif pno and str(fn).strip() == str(pno).strip():
            pno_as_fn += 1
    print(f'\nSupabase total patients with null/empty file_number: {empty_fn}')
    print(f'Supabase total patients where file_number == patient_number (fallback): {pno_as_fn}')

if __name__ == '__main__':
    main()
