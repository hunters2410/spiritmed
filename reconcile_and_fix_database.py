import re
import os
import sys
import json
import uuid
import requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
DATABASES_DIR = r'C:\Users\Acer P16\Documents\Spiritmed\hospital update\databases 2'

def parse_sql_inserts(file_path, table_name):
    print(f"Parsing SQL file: {file_path} for table `{table_name}`...")
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    col_names = []
    create_pattern = re.compile(rf"CREATE TABLE\s+(?:`{table_name}`|{table_name})\s*\((.*?)\)\s*ENGINE", re.DOTALL | re.IGNORECASE)
    match = create_pattern.search(content)
    if match:
        table_def = match.group(1)
        for line in table_def.splitlines():
            line_s = line.strip()
            if line_s.startswith('`'):
                col = line_s.split('`')[1]
                col_names.append(col)
    
    rows = []
    lines = content.splitlines()
    in_target_insert = False
    
    for line in lines:
        line_s = line.strip()
        if f"INSERT INTO `{table_name}`" in line_s or f"INSERT INTO {table_name}" in line_s:
            in_target_insert = True
        elif line_s.startswith("INSERT INTO") or line_s.startswith("DROP TABLE") or line_s.startswith("CREATE TABLE"):
            in_target_insert = False

        if in_target_insert or line_s.startswith("("):
            if line_s.startswith("(") and (line_s.endswith("),") or line_s.endswith(");")):
                rows.append(line_s)

    return col_names, rows

def parse_sql_values(tuple_str):
    t_str = tuple_str.strip().rstrip(';,')
    if t_str.startswith('(') and t_str.endswith(')'):
        t_str = t_str[1:-1]
    
    tokens = []
    current = []
    in_quotes = False
    escape = False
    
    i = 0
    n = len(t_str)
    while i < n:
        char = t_str[i]
        if escape:
            current.append(char)
            escape = False
        elif char == '\\':
            escape = True
        elif char == "'":
            in_quotes = not in_quotes
            current.append(char)
        elif char == ',' and not in_quotes:
            val = ''.join(current).strip()
            tokens.append(val)
            current = []
        else:
            current.append(char)
        i += 1
    if current:
        tokens.append(''.join(current).strip())

    cleaned = []
    for tok in tokens:
        if tok.upper() == 'NULL':
            cleaned.append(None)
        elif tok.startswith("'") and tok.endswith("'"):
            val = tok[1:-1].replace("''", "'").replace("\\'", "'").replace("\\\\", "\\")
            cleaned.append(val)
        else:
            try:
                if '.' in tok:
                    cleaned.append(float(tok))
                else:
                    cleaned.append(int(tok))
            except:
                cleaned.append(tok)
    return cleaned

def parse_dob(dob_str):
    if not dob_str or not isinstance(dob_str, str):
        return None
    dob_str = dob_str.strip()
    if not dob_str or dob_str.upper() == 'NULL':
        return None
    for fmt in ('%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            dt = datetime.strptime(dob_str, fmt)
            return dt.strftime('%Y-%m-%d')
        except:
            pass
    return None

def fetch_all_supabase(table_name, select_cols):
    items = []
    limit = 1000
    offset = 0
    h_base = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json'
    }
    while True:
        h = h_base.copy()
        h['Range'] = f"{offset}-{offset + limit - 1}"
        url = f"{SUPABASE_URL}/rest/v1/{table_name}?select={select_cols}"
        resp = requests.get(url, headers=h)
        if resp.status_code not in (200, 206):
            print(f"Error fetching {table_name}: {resp.status_code} {resp.text}")
            break
        data = resp.json()
        if not data or not isinstance(data, list) or len(data) == 0:
            break
        items.extend(data)
        if len(data) < limit:
            break
        offset += limit
    return items

def update_single_patient_fn(item):
    p_id, new_fn = item
    h = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json'
    }
    url = f"{SUPABASE_URL}/rest/v1/patients?id=eq.{p_id}"
    try:
        r = requests.patch(url, headers=h, json={'file_number': new_fn})
        return r.status_code in (200, 204)
    except:
        return False

def delete_appointments_batch(id_batch):
    h = {
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json'
    }
    ids_str = ",".join(id_batch)
    url = f"{SUPABASE_URL}/rest/v1/appointments?id=in.({ids_str})"
    try:
        r = requests.delete(url, headers=h)
        return r.status_code in (200, 204)
    except:
        return False

def main():
    print("==========================================================")
    print("      SPIRITMED DATABASE RECONCILIATION & FIX SCRIPT      ")
    print("==========================================================\n")

    patient_sql = os.path.join(DATABASES_DIR, "patient (6).sql")
    appt_sql = os.path.join(DATABASES_DIR, "appointment (7).sql")

    # 1. Parse old database dumps
    p_cols, p_tuples = parse_sql_inserts(patient_sql, "patient")
    a_cols, a_tuples = parse_sql_inserts(appt_sql, "appointment")

    old_patients = [dict(zip(p_cols, parse_sql_values(t))) for t in p_tuples if len(parse_sql_values(t)) == len(p_cols)]
    old_appts = [dict(zip(a_cols, parse_sql_values(t))) for t in a_tuples if len(parse_sql_values(t)) == len(a_cols)]

    print(f"Parsed {len(old_patients)} old patients from patient (6).sql")
    print(f"Parsed {len(old_appts)} old appointments from appointment (7).sql")

    # Index old patients by patient_id
    old_p_by_pid = {}
    for op in old_patients:
        pid = str(op.get('patient_id')) if op.get('patient_id') is not None else str(op.get('id'))
        old_p_by_pid[pid] = op

    # ----------------------------------------------------
    # STEP 1: RESTORE MISSING FILE NUMBERS
    # ----------------------------------------------------
    print("\n--- STEP 1: RESTORING MISSING PATIENT FILE NUMBERS ---")
    sp_patients = fetch_all_supabase("patients", "id,patient_number,file_number,full_name")
    print(f"Loaded {len(sp_patients)} patients from Supabase.")

    sp_missing_fn = [p for p in sp_patients if not p.get('file_number') or str(p.get('file_number')).strip() == '' or str(p.get('file_number')).strip().lower() in ('null', 'none')]
    print(f"Found {len(sp_missing_fn)} patients with missing file_number.")

    updates_to_perform = []
    for sp_p in sp_missing_fn:
        p_id = sp_p['id']
        pno = str(sp_p.get('patient_number')).strip() if sp_p.get('patient_number') else ''
        op = old_p_by_pid.get(pno)
        
        target_fn = None
        if op:
            old_fn = str(op.get('filenumber')).strip() if op.get('filenumber') is not None else ''
            if old_fn and old_fn.lower() not in ('null', 'none', '0', ''):
                # Use clean file number from old DB
                target_fn = old_fn.split('-')[0]
        
        if not target_fn:
            # Fallback to patient_number so no patient has "NO FILE"
            target_fn = pno if pno else p_id[:8]

        updates_to_perform.append((p_id, target_fn))

    print(f"Preparing to update {len(updates_to_perform)} patients with restored/valid file numbers...")
    if updates_to_perform:
        with ThreadPoolExecutor(max_workers=30) as executor:
            results = list(executor.map(update_single_patient_fn, updates_to_perform))
        print(f"Successfully updated file_numbers for {results.count(True)}/{len(updates_to_perform)} patients.")

    # ----------------------------------------------------
    # STEP 2: IMPORT MISSING 74 PATIENTS
    # ----------------------------------------------------
    print("\n--- STEP 2: IMPORTING MISSING PATIENTS FROM OLD DATABASE ---")
    sp_patients_fresh = fetch_all_supabase("patients", "id,patient_number,file_number,full_name")
    existing_sp_pnos = {str(p.get('patient_number')).strip() for p in sp_patients_fresh if p.get('patient_number')}
    existing_sp_ids = {p['id'] for p in sp_patients_fresh}

    missing_patients_to_import = []
    for op in old_patients:
        old_id = op.get('id')
        old_pid = str(op.get('patient_id')) if op.get('patient_id') is not None else str(old_id)
        
        p_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{old_id}"))
        
        if p_uuid in existing_sp_ids or old_pid in existing_sp_pnos:
            continue

        raw_name = str(op.get('name')).strip() if op.get('name') else f"Patient {old_id}"
        email = str(op.get('email')).strip() if op.get('email') else None
        phone = str(op.get('phone')).strip() if op.get('phone') else None
        raw_gender = str(op.get('sex')).strip().lower() if op.get('sex') else 'other'
        gender = 'male' if 'male' in raw_gender and 'female' not in raw_gender else 'female' if 'female' in raw_gender else 'other'
        dob = parse_dob(op.get('birthdate'))
        address = str(op.get('address')).strip() if op.get('address') else None
        title = str(op.get('titlep')).strip() if op.get('titlep') else None

        raw_fn = str(op.get('filenumber')).strip() if op.get('filenumber') is not None else ''
        if raw_fn and raw_fn.lower() not in ('null', 'none', '0', ''):
            file_no = raw_fn.split('-')[0]
        else:
            file_no = old_pid

        p_dict = {
            "id": p_uuid,
            "branch_id": BRANCH_ID,
            "full_name": raw_name,
            "patient_number": old_pid,
            "file_number": file_no,
            "email": email if email and '@' in email else f"patient.{old_id}@spiritmed.local",
            "phone": phone if phone else "263770000000",
            "gender": gender,
            "date_of_birth": dob if dob else "1980-01-01",
            "address": address,
            "title": title,
            "status": "active"
        }
        missing_patients_to_import.append(p_dict)

    print(f"Found {len(missing_patients_to_import)} missing patients to ingest into Supabase.")
    if missing_patients_to_import:
        h = {
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        }
        # Ingest in chunks of 50
        chunk_size = 50
        for i in range(0, len(missing_patients_to_import), chunk_size):
            chunk = missing_patients_to_import[i:i+chunk_size]
            r = requests.post(f"{SUPABASE_URL}/rest/v1/patients", headers=h, json=chunk)
            if r.status_code in (200, 201, 204):
                print(f"  Successfully inserted missing patients batch {i//chunk_size + 1}")
            else:
                print(f"  Error inserting batch {i//chunk_size + 1}: {r.status_code} {r.text}")

    # ----------------------------------------------------
    # STEP 3: DEDUPLICATE & RECONCILE APPOINTMENTS
    # ----------------------------------------------------
    print("\n--- STEP 3: DEDUPLICATING AND RECONCILING APPOINTMENTS ---")
    sp_appts = fetch_all_supabase("appointments", "id,patient_id,doctor_id,appointment_date,appointment_type,status,notes,created_at")
    print(f"Loaded {len(sp_appts)} total appointments from Supabase.")

    # Group Supabase appointments to identify duplicates
    # Grouping key: (patient_id, appointment_date, notes)
    groups = {}
    for sa in sp_appts:
        key = (sa.get('patient_id'), sa.get('appointment_date'), sa.get('notes'))
        if key not in groups:
            groups[key] = []
        groups[key].append(sa)

    ids_to_delete = []
    for key, appt_list in groups.items():
        if len(appt_list) > 1:
            # Sort by created_at or id, keep first one
            appt_list.sort(key=lambda x: (x.get('created_at') or '', x.get('id')))
            for extra in appt_list[1:]:
                ids_to_delete.append(extra['id'])

    print(f"Identified {len(ids_to_delete)} duplicate appointment rows to remove from Supabase.")

    if ids_to_delete:
        print("Deleting duplicate appointments in batches of 50...")
        batch_size = 50
        deleted_count = 0
        for i in range(0, len(ids_to_delete), batch_size):
            b = ids_to_delete[i:i+batch_size]
            if delete_appointments_batch(b):
                deleted_count += len(b)
        print(f"Successfully deleted {deleted_count}/{len(ids_to_delete)} duplicate appointment rows from Supabase.")

    # Check total appointments remaining in Supabase
    sp_appts_after = fetch_all_supabase("appointments", "id,patient_id,appointment_date,notes")
    print(f"\nRemaining Supabase appointments after deduplication: {len(sp_appts_after)}")

    print("\n==========================================================")
    print("    DATABASE RECONCILIATION & FIX COMPLETED SUCCESSFULLY   ")
    print("==========================================================")

if __name__ == '__main__':
    main()
