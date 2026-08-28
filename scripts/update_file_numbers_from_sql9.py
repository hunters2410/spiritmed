import re
import os
import requests
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

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

def fetch_all_supabase():
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
    return sp_patients

def patch_file_number(task):
    p_id = task['id']
    target_fn = task['target_fn']
    base_fn = task['base_fn']

    candidate_fn = target_fn
    suffix = 1
    
    while True:
        payload = {'file_number': candidate_fn}
        try:
            r = requests.patch(
                f"{SUPABASE_URL}/rest/v1/patients?id=eq.{p_id}",
                headers=headers,
                json=payload
            )
            if r.status_code in (200, 204):
                return True, p_id, candidate_fn, task['name']
            elif r.status_code == 409:
                # Collision: try next suffix
                suffix += 1
                if base_fn:
                    candidate_fn = f"{base_fn}-{suffix}"
                else:
                    candidate_fn = f"{candidate_fn}-{suffix}"
                if suffix > 50:
                    return False, p_id, f"409 retry limit reached", task['name']
            else:
                return False, p_id, f"HTTP {r.status_code}: {r.text}", task['name']
        except Exception as e:
            return False, p_id, str(e), task['name']

def main():
    print("==========================================================")
    print("    UPDATING PATIENT FILE NUMBERS FROM PATIENT (9).SQL    ")
    print("==========================================================\n")

    print(f"Reading SQL file: {SQL_FILE}...")
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

    print(f"Total SQL rows parsed: {len(sql_patients)}")

    print("Fetching current patients from Supabase...")
    sp_patients = fetch_all_supabase()
    print(f"Total Supabase patients: {len(sp_patients)}")

    # Index Supabase patients
    sp_by_pno = defaultdict(list)
    sp_by_name = defaultdict(list)
    occupied_fns = set()

    for p in sp_patients:
        pno = str(p.get('patient_number') or '').strip()
        cname = clean_name(p.get('full_name'))
        if pno: sp_by_pno[pno].append(p)
        if cname: sp_by_name[cname].append(p)
        
        fn = p.get('file_number')
        if fn and str(fn).strip() not in ('', 'NULL', 'null', '0', 'None'):
            occupied_fns.add(str(fn).strip())

    print(f"Currently occupied file numbers in Supabase: {len(occupied_fns)}")

    # Match SQL rows to Supabase patients
    tasks_to_update = []
    seen_sp_ids = set()

    for sql_p in sql_patients:
        sql_fn = sql_p['filenumber']
        if not sql_fn:
            continue

        pid = sql_p['patient_id']
        cname = sql_p['clean_name']
        
        sp_match = None
        # Match by patient_number
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

        # Match by name
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
                    no_fn_list = [m for m in matched_list if not m.get('file_number')]
                    if len(no_fn_list) == 1:
                        sp_match = no_fn_list[0]

        if not sp_match:
            continue

        if sp_match['id'] in seen_sp_ids:
            continue

        cur_fn = str(sp_match.get('file_number') or '').strip()
        if cur_fn == sql_fn:
            seen_sp_ids.add(sp_match['id'])
            continue

        if not cur_fn or cur_fn.lower() in ('null', 'none', '0'):
            seen_sp_ids.add(sp_match['id'])
            tasks_to_update.append({
                'id': sp_match['id'],
                'pno': sp_match.get('patient_number'),
                'name': sp_match.get('full_name'),
                'base_fn': sql_fn,
                'target_fn': sql_fn
            })

    # Also check if any patient without file number in SQL currently has invalid/placeholder string, ensure NULL
    # (Supabase patients without file numbers are already NULL)

    print(f"Total patient file numbers to update: {len(tasks_to_update)}")

    # Pre-assign unique target file numbers to minimize collisions
    simulated_assigned = set(occupied_fns)
    final_tasks = []
    for t in tasks_to_update:
        base_fn = t['base_fn']
        candidate = base_fn
        suffix = 1
        while candidate in simulated_assigned:
            suffix += 1
            candidate = f"{base_fn}-{suffix}"
        simulated_assigned.add(candidate)
        t['target_fn'] = candidate
        final_tasks.append(t)

    # Sort tasks so clean base file numbers are executed first
    final_tasks.sort(key=lambda x: (1 if '-' in x['target_fn'] else 0, x['target_fn']))

    print(f"\nExecuting {len(final_tasks)} updates in parallel (30 worker threads)...")
    success_count = 0
    failure_count = 0

    with ThreadPoolExecutor(max_workers=30) as executor:
        results = list(executor.map(patch_file_number, final_tasks))

    for ok, p_id, result_fn, name in results:
        if ok:
            success_count += 1
        else:
            failure_count += 1
            print(f"  [ERROR] Failed to update {name} ({p_id}): {result_fn}")

    print(f"\nUpdate Execution Completed:")
    print(f"  - Successful: {success_count}/{len(final_tasks)}")
    print(f"  - Failed: {failure_count}")

    # Verification: Fetch all patients again
    print("\nVerifying updated state in Supabase...")
    sp_patients_after = fetch_all_supabase()
    with_fn = sum(1 for p in sp_patients_after if p.get('file_number') and str(p.get('file_number')).strip() not in ('', 'NULL', 'null', '0', 'None'))
    without_fn = len(sp_patients_after) - with_fn

    print(f"Total Patients in Supabase: {len(sp_patients_after)}")
    print(f"Patients WITH File Number: {with_fn} ({with_fn/len(sp_patients_after)*100:.1f}%)")
    print(f"Patients WITHOUT File Number (NULL / No File): {without_fn} ({without_fn/len(sp_patients_after)*100:.1f}%)")

    # Sample verification
    print("\nSample Verification of Updated Patients:")
    sample_pnos = ['175972', '32082', '790626', '63400', '280537', '381812', '422586']
    for pno in sample_pnos:
        r = requests.get(f"{SUPABASE_URL}/rest/v1/patients?patient_number=eq.{pno}&select=id,patient_number,full_name,file_number,status", headers=headers)
        data = r.json()
        if data:
            p = data[0]
            print(f"  Patient: {p['full_name']} | Patient #: {p['patient_number']} | File #: {p['file_number']} | Status: {p['status']}")

if __name__ == '__main__':
    main()
