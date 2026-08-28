import requests
import uuid
from datetime import datetime

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'
headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}', 'Content-Type': 'application/json'}

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

def step1_clean_existing_file_numbers():
    print("=== STEP 1: CLEANING EXISTING PATIENT FILE NUMBERS ===")
    from_idx = 0
    page_size = 1000
    cleaned_count = 0

    while True:
        r = requests.get(f'{url}/rest/v1/patients?select=id,full_name,file_number,patient_number&range={from_idx}-{from_idx+page_size-1}', headers=headers)
        if r.status_code != 200 or not r.json():
            break

        rows = r.json()
        to_update = []
        for row in rows:
            fn = row.get('file_number')
            if fn and '-' in fn:
                clean_fn = fn.split('-')[0].strip()
                if clean_fn:
                    to_update.append({'id': row['id'], 'file_number': clean_fn})

        if to_update:
            # Update in small chunks
            for i in range(0, len(to_update), 100):
                chunk = to_update[i:i+100]
                for item in chunk:
                    requests.patch(f"{url}/rest/v1/patients?id=eq.{item['id']}", headers=headers, json={'file_number': item['file_number']})
                cleaned_count += len(chunk)
                print(f"Cleaned {cleaned_count} patient file numbers...")

        if len(rows) < page_size:
            break
        from_idx += page_size

    print(f"STEP 1 COMPLETE: Cleaned file_number for {cleaned_count} patients.")


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

def step2_import_missing_patients():
    print("\n=== STEP 2: IMPORTING MISSING PATIENTS FROM PATIENT (4).SQL ===")
    
    # Get all existing patient_numbers and IDs in Supabase
    existing_pnos = set()
    existing_ids = set()
    
    from_idx = 0
    page_size = 1000
    while True:
        r = requests.get(f'{url}/rest/v1/patients?select=id,patient_number&range={from_idx}-{from_idx+page_size-1}', headers=headers)
        if r.status_code != 200 or not r.json():
            break
        rows = r.json()
        for r_item in rows:
            existing_ids.add(r_item['id'])
            if r_item.get('patient_number'):
                existing_pnos.add(str(r_item['patient_number']).strip())
        if len(rows) < page_size:
            break
        from_idx += page_size

    print(f"Existing Supabase patients: {len(existing_ids)} IDs, {len(existing_pnos)} patient numbers.")

    with open(r'database/patient (4).sql', 'r', encoding='utf-8', errors='ignore') as f:
        sql = f.read()

    lines = [l.strip() for l in sql.splitlines() if l.strip().startswith('(') and (l.strip().endswith('),') or l.strip().endswith(');'))]
    print(f"Total lines in patient (4).sql: {len(lines)}")

    inserted_count = 0
    skipped_count = 0

    for l in lines:
        try:
            row = parse_sql_values(l)
            if len(row) < 13:
                continue

            old_id = row[0]
            p_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{old_id}"))

            if p_uuid in existing_ids:
                skipped_count += 1
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

            res = requests.post(f"{url}/rest/v1/patients", headers=headers, json=p_obj)
            if res.status_code in (200, 201):
                inserted_count += 1
                existing_ids.add(p_uuid)
                if inserted_count % 50 == 0:
                    print(f"Inserted {inserted_count} missing patients...")
            else:
                pass
        except Exception as e:
            pass

    print(f"STEP 2 COMPLETE: Inserted {inserted_count} missing patients. Skipped {skipped_count} existing patients.")

if __name__ == "__main__":
    step1_clean_existing_file_numbers()
    step2_import_missing_patients()
