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

def clean_name(n):
    if not n: return ''
    return re.sub(r'\s+', ' ', str(n).strip().lower())

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

    # Map current Supabase file numbers
    current_sp_file_numbers = set()
    for p in sp_patients:
        fn = p.get('file_number')
        if fn and str(fn).strip() not in ('', 'NULL', 'null', '0', 'None'):
            current_sp_file_numbers.add(str(fn).strip())

    print(f'Current occupied file_numbers in Supabase: {len(current_sp_file_numbers)}')

    # Build matchers
    # 1. By patient_number (exact)
    # 2. By clean_name
    sp_by_pno = defaultdict(list)
    sp_by_name = defaultdict(list)
    for p in sp_patients:
        pno = str(p.get('patient_number') or '').strip()
        cname = clean_name(p.get('full_name'))
        if pno:
            sp_by_pno[pno].append(p)
        if cname:
            sp_by_name[cname].append(p)

    # Let's inspect matching candidates where Supabase has no file_number
    candidates = []
    
    for sql_p in sql_patients:
        sql_fn = sql_p['filenumber']
        if not sql_fn:
            continue
        
        pid = sql_p['patient_id']
        cname = sql_p['clean_name']
        
        # Try matching
        sp_match = None
        match_type = None

        # Strategy 1: Match by exact patient_number and verify name
        if pid and pid in sp_by_pno:
            matched_list = sp_by_pno[pid]
            for m in matched_list:
                # Check name similarity
                if cname == clean_name(m.get('full_name')):
                    sp_match = m
                    match_type = 'exact_pno_and_name'
                    break
            if not sp_match:
                # If name didn't match exactly, check if first/last words match
                for m in matched_list:
                    m_cname = clean_name(m.get('full_name'))
                    c_parts = set(cname.split())
                    m_parts = set(m_cname.split())
                    if len(c_parts.intersection(m_parts)) > 0:
                        sp_match = m
                        match_type = 'exact_pno_partial_name'
                        break

        # Strategy 2: If not matched or was a collision with P-prefix, match by exact name
        if not sp_match and cname and cname in sp_by_name:
            matched_list = sp_by_name[cname]
            if len(matched_list) == 1:
                sp_match = matched_list[0]
                match_type = 'unique_name'
            elif len(matched_list) > 1:
                # Disambiguate by phone
                for m in matched_list:
                    if sql_p['phone'] and sql_p['phone'] == str(m.get('phone') or '').strip():
                        sp_match = m
                        match_type = 'name_and_phone'
                        break
                if not sp_match:
                    # Choose the one without file_number
                    no_fn_list = [m for m in matched_list if not m.get('file_number')]
                    if len(no_fn_list) == 1:
                        sp_match = no_fn_list[0]
                        match_type = 'name_single_no_fn'

        if sp_match:
            cur_fn = str(sp_match.get('file_number') or '').strip()
            if not cur_fn or cur_fn.lower() in ('null', 'none', '0'):
                candidates.append({
                    'sp_id': sp_match['id'],
                    'sp_pno': sp_match.get('patient_number'),
                    'sp_name': sp_match.get('full_name'),
                    'target_file_number': sql_fn,
                    'sql_id': sql_p['sql_id'],
                    'sql_pid': sql_p['patient_id'],
                    'sql_name': sql_p['name'],
                    'match_type': match_type
                })

    print(f'\nTotal Supabase patients ready to be updated with file numbers: {len(candidates)}')
    
    # Check for duplicate candidates targeting same Supabase patient
    seen_sp_ids = set()
    unique_candidates = []
    dup_sp_ids = 0
    for c in candidates:
        if c['sp_id'] not in seen_sp_ids:
            seen_sp_ids.add(c['sp_id'])
            unique_candidates.append(c)
        else:
            dup_sp_ids += 1
    
    print(f'Unique candidates to update: {len(unique_candidates)} (filtered out {dup_sp_ids} duplicates)')

    # Check collisions: do any target_file_numbers collide with already existing file numbers in Supabase or each other?
    target_fn_counts = Counter([c['target_file_number'] for c in unique_candidates])
    
    collides_with_existing = [c for c in unique_candidates if c['target_file_number'] in current_sp_file_numbers]
    internal_duplicates = [c for c in unique_candidates if target_fn_counts[c['target_file_number']] > 1]

    print(f'Candidates colliding with already assigned Supabase file numbers: {len(collides_with_existing)}')
    print(f'Candidates sharing same target_file_number within the update batch: {len(internal_duplicates)}')

    if collides_with_existing:
        print('\nSamples of collision with existing file numbers (first 5):')
        for c in collides_with_existing[:5]:
            print(f"  Target FN {c['target_file_number']} for SP '{c['sp_name']}' (pno={c['sp_pno']}) already exists in Supabase!")

    if internal_duplicates:
        print('\nSamples of internal duplicate target file numbers (first 5):')
        for c in internal_duplicates[:5]:
            print(f"  Target FN {c['target_file_number']} shared by '{c['sp_name']}' (pno={c['sp_pno']})")

if __name__ == '__main__':
    main()
