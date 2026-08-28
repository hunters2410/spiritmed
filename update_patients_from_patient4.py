import re
import requests
import uuid
from datetime import datetime

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': service_key,
    'Authorization': f'Bearer {service_key}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

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
    # Try common formats: DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY
    for fmt in ('%d-%m-%Y', '%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y'):
        try:
            dt = datetime.strptime(dob_str, fmt)
            return dt.strftime('%Y-%m-%d')
        except:
            pass
    return None

def process():
    print("Reading patient (4).sql...")
    with open(r'database/patient (4).sql', 'r', encoding='utf-8', errors='ignore') as f:
        sql = f.read()

    lines = [l.strip() for l in sql.splitlines() if l.strip().startswith('(') and (l.strip().endswith('),') or l.strip().endswith(');'))]
    print(f"Total lines parsed: {len(lines)}")

    batch = []
    count = 0
    updated_count = 0

    for idx, l in enumerate(lines):
        try:
            row = parse_sql_values(l)
            if len(row) < 13:
                continue

            old_id = row[0]
            name = str(row[2]).strip() if row[2] else f"Patient #{old_id}"
            email = str(row[3]).strip() if row[3] else None
            phone = str(row[6]).strip() if row[6] else None
            
            raw_gender = str(row[7]).strip().lower() if row[7] else 'other'
            gender = 'male' if 'male' in raw_gender and 'female' not in raw_gender else 'female' if 'female' in raw_gender else 'other'
            
            dob = parse_dob(row[8])
            address = str(row[5]).strip() if row[5] else None
            patient_no = str(row[12]).strip() if row[12] else str(old_id)

            # CLEAN SINGLE FILE NUMBER
            raw_file_no = str(row[45]).strip() if len(row) > 45 and row[45] else None
            if raw_file_no and raw_file_no.upper() != 'NONE' and raw_file_no != '0':
                file_no = raw_file_no
            else:
                file_no = f"{old_id:04d}"

            title = str(row[43]).strip() if len(row) > 43 and row[43] else None

            # Deterministic UUID for patient matching existing imports
            p_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{old_id}"))

            patient_obj = {
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

            batch.append(patient_obj)
            count += 1

            if len(batch) >= 200:
                res = requests.post(f"{url}/rest/v1/patients", headers=headers, json=batch)
                if res.status_code in (200, 201):
                    updated_count += len(batch)
                    print(f"Ingested / updated {updated_count}/{len(lines)} patients...")
                else:
                    print(f"Batch error: {res.status_code} - {res.text[:200]}")
                batch = []
        except Exception as e:
            pass

    if batch:
        res = requests.post(f"{url}/rest/v1/patients", headers=headers, json=batch)
        if res.status_code in (200, 201):
            updated_count += len(batch)
            print(f"Final batch updated! Total processed: {updated_count}")
        else:
            print(f"Final batch error: {res.status_code} - {res.text[:200]}")

if __name__ == "__main__":
    process()
