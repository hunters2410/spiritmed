import re
import os
import requests
import json
from datetime import datetime
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

def clean_dob_string(s, add_date_str=None, age_str=None):
    if not s:
        s = ''
    raw = str(s).strip()
    
    if raw.lower() in ('null', 'none', '0', '0000-00-00', '00-00-0000', 'n/a', '-', '', 'undefined'):
        raw = ''

    if raw:
        # Handle 5-digit years like 11953 -> 1953, 19993 -> 1993
        t = re.sub(r'1(\d{4})$', r'\1', raw)
        t = re.sub(r'199(\d{2})$', r'19\1', t)
        
        # Handle format without separators e.g. 0101-1950 -> 01-01-1950
        m_no_sep = re.match(r'^(\d{2})(\d{2})[-/](\d{4})$', t)
        if m_no_sep:
            t = f"{m_no_sep.group(1)}-{m_no_sep.group(2)}-{m_no_sep.group(3)}"
            
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
                    y = int(p3 + '0')
                elif len(p3) == 2:
                    y = int(p3)
                    y = 1900 + y if y > 26 else 2000 + y

                if y > 2026 and y <= 2099:
                    y -= 100
                elif y > 2099 and str(y).startswith('29'):
                    y = int('20' + str(y)[2:])

                v1, v2 = int(p1), int(p2)
                
                if v1 > 12 and 1 <= v2 <= 12 and 1 <= v1 <= 31:
                    d, m = v1, v2
                    try:
                        return datetime(y, m, d).strftime('%Y-%m-%d'), 'parsed_dmy'
                    except ValueError:
                        pass
                elif v2 > 12 and 1 <= v1 <= 12 and 1 <= v2 <= 31:
                    m, d = v1, v2
                    try:
                        return datetime(y, m, d).strftime('%Y-%m-%d'), 'parsed_mdy'
                    except ValueError:
                        pass
                elif 1 <= v1 <= 31 and 1 <= v2 <= 12:
                    d, m = v1, v2
                    try:
                        return datetime(y, m, d).strftime('%Y-%m-%d'), 'parsed_dmy_default'
                    except ValueError:
                        pass

    if age_str:
        age_clean = str(age_str).strip()
        if age_clean.isdigit():
            age_val = int(age_clean)
            if 0 < age_val < 125:
                base_year = 2023
                if add_date_str:
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

def fetch_all_supabase():
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
    return sp_patients

def patch_dob(task):
    p_id = task['id']
    target_dob = task['target_dob']
    try:
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/patients?id=eq.{p_id}",
            headers=headers,
            json={'date_of_birth': target_dob}
        )
        if r.status_code in (200, 204):
            return True, p_id, target_dob, task['name']
        else:
            return False, p_id, f"HTTP {r.status_code}: {r.text}", task['name']
    except Exception as e:
        return False, p_id, str(e), task['name']

def main():
    print("==========================================================")
    print("   UPDATING PATIENT DATE OF BIRTH FROM PATIENT (9).SQL    ")
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
                    age = cols[9]
                    pid = cols[12]
                    add_date = cols[13]
                    
                    dob, reason = clean_dob_string(birthdate, add_date, age)
                    
                    sql_patients.append({
                        'sql_id': str(sql_id).strip() if sql_id else '',
                        'name': str(name).strip() if name else '',
                        'clean_name': clean_name(name),
                        'patient_id': str(pid).strip() if pid else '',
                        'phone': str(phone).strip() if phone else '',
                        'dob': dob,
                        'reason': reason
                    })

    print(f"Total SQL rows parsed: {len(sql_patients)}")

    print("Fetching current patients from Supabase...")
    sp_patients = fetch_all_supabase()
    print(f"Total Supabase patients: {len(sp_patients)}")

    sp_by_pno = defaultdict(list)
    sp_by_name = defaultdict(list)
    for p in sp_patients:
        pno = str(p.get('patient_number') or '').strip()
        cname = clean_name(p.get('full_name'))
        if pno: sp_by_pno[pno].append(p)
        if cname: sp_by_name[cname].append(p)

    tasks_to_update = []
    seen_sp_ids = set()

    for sql_p in sql_patients:
        target_dob = sql_p['dob']
        if not target_dob:
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
                    no_dob_list = [m for m in matched_list if not m.get('date_of_birth')]
                    if len(no_dob_list) == 1:
                        sp_match = no_dob_list[0]

        if not sp_match:
            continue

        if sp_match['id'] in seen_sp_ids:
            continue

        cur_dob = str(sp_match.get('date_of_birth') or '').strip()
        if cur_dob == target_dob:
            seen_sp_ids.add(sp_match['id'])
            continue

        if not cur_dob or cur_dob.lower() in ('null', 'none', ''):
            seen_sp_ids.add(sp_match['id'])
            tasks_to_update.append({
                'id': sp_match['id'],
                'pno': sp_match.get('patient_number'),
                'name': sp_match.get('full_name'),
                'target_dob': target_dob,
                'reason': sql_p['reason']
            })

    print(f"Total patient DOB records to update: {len(tasks_to_update)}")

    print(f"\nExecuting {len(tasks_to_update)} updates in parallel (30 worker threads)...")
    success_count = 0
    failure_count = 0

    with ThreadPoolExecutor(max_workers=30) as executor:
        results = list(executor.map(patch_dob, tasks_to_update))

    for ok, p_id, result_dob, name in results:
        if ok:
            success_count += 1
        else:
            failure_count += 1
            print(f"  [ERROR] Failed to update {name} ({p_id}): {result_dob}")

    print(f"\nUpdate Execution Completed:")
    print(f"  - Successful: {success_count}/{len(tasks_to_update)}")
    print(f"  - Failed: {failure_count}")

    # Verification
    print("\nVerifying updated state in Supabase...")
    sp_patients_after = fetch_all_supabase()
    with_dob = sum(1 for p in sp_patients_after if p.get('date_of_birth') and str(p.get('date_of_birth')).strip() not in ('', 'NULL', 'null', '0', 'None'))
    without_dob = len(sp_patients_after) - with_dob

    print(f"Total Patients in Supabase: {len(sp_patients_after)}")
    print(f"Patients WITH Date of Birth: {with_dob} ({with_dob/len(sp_patients_after)*100:.1f}%)")
    print(f"Patients WITHOUT Date of Birth: {without_dob} ({without_dob/len(sp_patients_after)*100:.1f}%)")

    # Sample verification
    print("\nSample Verification of Updated Patients:")
    sample_pnos = ['270679', '867296', '761765', '293063', '997909', '385795', '417083']
    for pno in sample_pnos:
        r = requests.get(f"{SUPABASE_URL}/rest/v1/patients?patient_number=eq.{pno}&select=id,patient_number,full_name,date_of_birth,file_number,status", headers=headers)
        data = r.json()
        if data:
            p = data[0]
            print(f"  Patient: {p['full_name']} | Patient #: {p['patient_number']} | DOB: {p['date_of_birth']} | File #: {p['file_number']}")

if __name__ == '__main__':
    main()
