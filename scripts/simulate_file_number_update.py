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

def is_placeholder_name(n):
    if not n: return False
    return bool(re.match(r'^patient\s+\d+$', str(n).strip(), re.IGNORECASE))

def main():
    print('Reading SQL dump...')
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

    # Index Supabase patients
    sp_by_id = {p['id']: p for p in sp_patients}
    sp_by_pno = defaultdict(list)
    sp_by_name = defaultdict(list)
    
    # Track existing assigned file numbers in Supabase
    occupied_fns = set()
    for p in sp_patients:
        pno = str(p.get('patient_number') or '').strip()
        cname = clean_name(p.get('full_name'))
        if pno: sp_by_pno[pno].append(p)
        if cname: sp_by_name[cname].append(p)
        
        fn = p.get('file_number')
        if fn and str(fn).strip() not in ('', 'NULL', 'null', '0', 'None'):
            occupied_fns.add(str(fn).strip())

    print(f'Currently occupied file numbers in Supabase: {len(occupied_fns)}')

    # Plan updates
    # We want to match SQL rows to Supabase patients
    # Priority:
    # 1. Exact patient_number and verified name
    # 2. Exact clean_name + phone or unique name
    
    planned_updates = []
    already_correct = 0
    no_sql_fn = 0
    not_found = 0

    seen_sp_patient_ids = set()

    for sql_p in sql_patients:
        sql_fn = sql_p['filenumber']
        if not sql_fn:
            no_sql_fn += 1
            continue

        pid = sql_p['patient_id']
        cname = sql_p['clean_name']
        
        sp_match = None
        match_type = None

        # Strategy 1: Match by patient_number
        if pid and pid in sp_by_pno:
            matched_list = sp_by_pno[pid]
            for m in matched_list:
                if cname == clean_name(m.get('full_name')):
                    sp_match = m
                    match_type = 'pno_and_name'
                    break
            if not sp_match:
                for m in matched_list:
                    m_cname = clean_name(m.get('full_name'))
                    c_parts = set(cname.split())
                    m_parts = set(m_cname.split())
                    if len(c_parts.intersection(m_parts)) > 0:
                        sp_match = m
                        match_type = 'pno_partial_name'
                        break

        # Strategy 2: Match by name (e.g. for P-prefixed collision records)
        if not sp_match and cname and cname in sp_by_name:
            matched_list = sp_by_name[cname]
            if len(matched_list) == 1:
                sp_match = matched_list[0]
                match_type = 'unique_name'
            elif len(matched_list) > 1:
                for m in matched_list:
                    if sql_p['phone'] and sql_p['phone'] == str(m.get('phone') or '').strip():
                        sp_match = m
                        match_type = 'name_and_phone'
                        break
                if not sp_match:
                    no_fn_list = [m for m in matched_list if not m.get('file_number')]
                    if len(no_fn_list) == 1:
                        sp_match = no_fn_list[0]
                        match_type = 'name_single_no_fn'

        if not sp_match:
            not_found += 1
            continue

        # Check if this Supabase patient was already processed
        if sp_match['id'] in seen_sp_patient_ids:
            continue

        cur_fn = str(sp_match.get('file_number') or '').strip()
        if cur_fn == sql_fn:
            already_correct += 1
            seen_sp_patient_ids.add(sp_match['id'])
            continue

        # Only update if current file_number is null/empty or if placeholder
        if not cur_fn or cur_fn.lower() in ('null', 'none', '0'):
            seen_sp_patient_ids.add(sp_match['id'])
            planned_updates.append({
                'sp_id': sp_match['id'],
                'sp_pno': sp_match.get('patient_number'),
                'sp_name': sp_match.get('full_name'),
                'sp_status': sp_match.get('status'),
                'current_fn': sp_match.get('file_number'),
                'base_fn': sql_fn,
                'sql_pid': sql_p['patient_id'],
                'sql_name': sql_p['name'],
                'match_type': match_type
            })

    print(f'\nSimulation Summary:')
    print(f'  - Already correct: {already_correct}')
    print(f'  - Patients ready to be updated with file numbers: {len(planned_updates)}')

    # Resolve candidate file numbers to ensure uniqueness
    # Track simulated set of all assigned file numbers
    simulated_assigned = set(occupied_fns)
    final_update_plan = []
    direct_assigned = 0
    suffixed_assigned = 0

    for item in planned_updates:
        base_fn = item['base_fn']
        assigned_fn = base_fn
        suffix = 1
        
        while assigned_fn in simulated_assigned:
            suffix += 1
            assigned_fn = f"{base_fn}-{suffix}"
        
        simulated_assigned.add(assigned_fn)
        item['final_file_number'] = assigned_fn
        if suffix == 1:
            direct_assigned += 1
        else:
            suffixed_assigned += 1
        final_update_plan.append(item)

    print(f'  * Clean direct assignment (e.g. 0009): {direct_assigned}')
    print(f'  * Suffixed assignment for legacy duplicate numbers (e.g. 2112-2): {suffixed_assigned}')

    print('\nFirst 20 planned updates:')
    for item in final_update_plan[:20]:
        print(f"  {item['sp_name']} (Patient #{item['sp_pno']}): NULL -> '{item['final_file_number']}' (base={item['base_fn']}, match={item['match_type']})")

    # Check total patients in Supabase that will have file numbers after this
    print(f'\nTotal patients in Supabase: {len(sp_patients)}')
    print(f'Patients WITH file number currently: {len(occupied_fns)}')
    print(f'Patients WITH file number after update: {len(occupied_fns) + len(final_update_plan)} / {len(sp_patients)} ({((len(occupied_fns) + len(final_update_plan))/len(sp_patients))*100:.1f}%)')
    print(f'Remaining without file number: {len(sp_patients) - (len(occupied_fns) + len(final_update_plan))}')

if __name__ == '__main__':
    main()
