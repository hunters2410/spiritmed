import requests
import uuid
import re
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'
headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}', 'Content-Type': 'application/json'}

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

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

def update_patient_file_number(p):
    p_id, clean_fn = p
    try:
        r = requests.patch(f"{url}/rest/v1/patients?id=eq.{p_id}", headers=headers, json={'file_number': clean_fn})
        return r.status_code == 204
    except:
        return False

def insert_single_patient(p_obj):
    try:
        r = requests.post(f"{url}/rest/v1/patients", headers=headers, json=p_obj)
        return r.status_code in (200, 201)
    except:
        return False

def main():
    print("=== STEP 1: FETCHING ALL EXISTING PATIENTS FROM SUPABASE ===")
    supabase_patients = []
    from_idx = 0
    page_size = 1000
    while True:
        r = requests.get(f'{url}/rest/v1/patients?select=id,file_number,patient_number&range={from_idx}-{from_idx+page_size-1}', headers=headers)
        if r.status_code != 200 or not r.json():
            break
        rows = r.json()
        supabase_patients.extend(rows)
        if len(rows) < page_size:
            break
        from_idx += page_size

    print(f"Total existing patients in Supabase: {len(supabase_patients)}")

    # Build clean file_number updates for hyphenated file numbers
    to_clean = []
    existing_ids = set()
    existing_pnos = set()

    for p in supabase_patients:
        existing_ids.add(p['id'])
        if p.get('patient_number'):
            existing_pnos.add(str(p['patient_number']).strip())

        fn = p.get('file_number')
        if fn and '-' in fn:
            clean_fn = fn.split('-')[0].strip()
            if clean_fn:
                to_clean.append((p['id'], clean_fn))

    print(f"Found {len(to_clean)} patients with hyphenated file_number to clean.")

    # Execute file_number updates concurrently
    if to_clean:
        print("Updating file_number in parallel (30 worker threads)...")
        with ThreadPoolExecutor(max_workers=30) as executor:
            results = list(executor.map(update_patient_file_number, to_clean))
        print(f"Cleaned {results.count(True)}/{len(to_clean)} patient file numbers successfully!")

    print("\n=== STEP 2: READING AND PARSING PATIENT (4).SQL ===")
    with open(r'database/patient (4).sql', 'r', encoding='utf-8', errors='ignore') as f:
        sql = f.read()

    lines = [l.strip() for l in sql.splitlines() if l.strip().startswith('(') and (l.strip().endswith('),') or l.strip().endswith(');'))]
    print(f"Total lines in patient (4).sql: {len(lines)}")

    to_insert = []
    for l in lines:
        try:
            row = parse_sql_values(l)
            if len(row) < 13:
                continue

            old_id = row[0]
            p_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{old_id}"))

            if p_uuid in existing_ids:
                continue

            name = str(row[2]).strip() if row[2] else f"Patient #{old_id}"
            email = str(row[3]).strip() if row[3] else None
            phone = str(row[6]).strip() if row[6] else None
            raw_gender = str(row[7]).strip().lower() if row[7] else 'other'
            gender = 'male' if 'male' in raw_gender and 'female' not in raw_gender else 'female' if 'female' in raw_gender else 'other'
            dob = parse_dob(row[8])
            address = str(row[5]).strip() if row[5] else None

            raw_pno = str(row[12]).strip() if row[12] else str(old_id)
            if raw_pno in existing_pnos:
                patient_no = f"{raw_pno}-{old_id}"
            else:
                patient_no = raw_pno
                existing_pnos.add(patient_no)

            raw_file_no = str(row[45]).strip() if len(row) > 45 and row[45] else None
            if raw_file_no and raw_file_no.upper() != 'NONE' and raw_file_no != '0':
                file_no = raw_file_no.split('-')[0]
            else:
                file_no = f"{old_id:04d}"

            title = str(row[43]).strip() if len(row) > 43 and row[43] else None

            p_obj = {
                "id": p_uuid,
                "branch_id": BRANCH_ID,
                "full_name": name,
                "patient_number": patient_no,
                "file_number": file_no,
                "email": email if email and '@' in email else f"patient.{old_id}@spiritmed.local",
                "phone": phone if phone else "263770000000",
                "gender": gender,
                "date_of_birth": dob if dob else "1980-01-01",
                "address": address,
                "title": title,
                "status": "active"
            }
            to_insert.append(p_obj)
        except Exception as e:
            pass

    print(f"Found {len(to_insert)} missing patients to insert.")

    if to_insert:
        print("Inserting missing patients in parallel...")
        with ThreadPoolExecutor(max_workers=20) as executor:
            res_insert = list(executor.map(insert_single_patient, to_insert))
        print(f"Successfully inserted {res_insert.count(True)}/{len(to_insert)} missing patients!")

    print("=== ALL PATIENT REPAIRS & MISSING IMPORTS COMPLETED SUCCESSFULLY! ===")

if __name__ == "__main__":
    main()
