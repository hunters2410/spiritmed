import os
import re
import requests
import sys
import uuid
from datetime import datetime

# ─── CONFIG ─────────────────────────────────────────────────────────────────
DUMP_PATH   = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database\u819957882_urocaresystem (16).sql"
OUTPUT_DIR  = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database"
BRANCH_ID   = "697a3863-1de7-4615-819c-45b0d7066d67"
DOCTOR_MEKI_UUID = "90a905bc-d22a-4db3-bd43-2c1c6bf488e0"
SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
BASE_UUID = uuid.uuid5(uuid.NAMESPACE_DNS, "urocare.co.zw")
# ────────────────────────────────────────────────────────────────────────────

def sql_str(v):
    if v is None or str(v).strip() in ('', 'NULL', 'null'):
        return 'NULL'
    return "'" + str(v).strip().replace("'", "''") + "'"

def parse_date(raw):
    if not raw or str(raw).strip() in ('', 'NULL', 'null'):
        return None
    raw = str(raw).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        return raw
    # Unix timestamp
    if re.match(r'^\d{10}$', raw):
        try:
            return datetime.fromtimestamp(int(raw)).strftime('%Y-%m-%d')
        except:
            pass
    for fmt in ['%d-%m-%Y','%d/%m/%Y','%m/%d/%Y','%m-%d-%Y','%Y/%m/%d','%d-%m-%y','%m/%d/%y']:
        try:
            d = datetime.strptime(raw, fmt)
            if 1900 <= d.year <= 2030:
                return d.strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None

def parse_datetime(raw):
    if not raw or str(raw).strip() in ('', 'NULL', 'null'):
        return 'NOW()'
    raw = str(raw).strip()
    if re.match(r'^\d{10}$', raw):
        try:
            return f"'{datetime.fromtimestamp(int(raw)).strftime('%Y-%m-%d %H:%M:%S')}'"
        except:
            pass
    for fmt in ['%d-%m-%Y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S']:
        try:
            d = datetime.strptime(raw, fmt)
            return f"'{d.strftime('%Y-%m-%d %H:%M:%S')}'"
        except ValueError:
            pass
    d = parse_date(raw)
    if d:
        return f"'{d} 00:00:00'"
    return 'NOW()'

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("''", "'")
    return v

def clean_html(raw_html):
    if not raw_html or str(raw_html).strip() in ('', 'NULL', 'null', "''", '""', '-'):
        return None
    raw_html = str(raw_html).strip()
    raw_html = re.sub(r'<br\s*/?>', '\n', raw_html)
    raw_html = re.sub(r'</(p|div|li|td)>', '\n', raw_html)
    raw_html = re.sub(r'<[^>]+>', '', raw_html)
    
    html_entities = {
        '&nbsp;': ' ',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '\\r\\n': '\n',
        '\\n': '\n',
        '\\r': '\n',
        '\r\n': '\n',
        '\r': '\n'
    }
    for entity, repl in html_entities.items():
        raw_html = raw_html.replace(entity, repl)
        
    raw_html = re.sub(r'\n\s*\n+', '\n\n', raw_html)
    raw_html = raw_html.strip()
    return raw_html if raw_html else None

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

def extract_rows(content, table_name):
    # Match INSERT INTO `table` followed by optional columns list, then VALUES and the insert rows
    insert_pat = re.compile(
        r'INSERT INTO\s+`' + table_name + r'`\s*(?:\([^)]+\))?\s*VALUES\s*(.*?);\s*(?=INSERT INTO|CREATE|DROP|ALTER|COMMIT|$)',
        re.DOTALL | re.IGNORECASE
    )
    all_rows = []
    for match in insert_pat.finditer(content):
        block = match.group(1)
        depth = 0
        start = None
        in_q = False
        escaped = False
        i = 0
        n = len(block)
        while i < n:
            ch = block[i]
            if escaped:
                escaped = False
            elif ch == '\\':
                escaped = True
            elif ch == "'":
                in_q = not in_q
            elif not in_q:
                if ch == '(':
                    if depth == 0:
                        start = i + 1
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0 and start is not None:
                        all_rows.append(block[start:i])
                        start = None
            i += 1
    return all_rows

def main():
    print(f"Reading SQL Dump from {DUMP_PATH}...")
    with open(DUMP_PATH, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    # 1. Map old patient ID to patient_number (matching duplicate logic from convert_patient3.py)
    print("Reconstructing patient numbers and conflicts mapping...")
    patient_rows = extract_rows(content, 'patient')
    print(f"Found {len(patient_rows)} patient rows in dump.")
    
    IDX_PAT = {
        'id': 0, 'name': 2, 'patient_id': 12
    }
    
    old_id_to_pn = {}
    used_pns = set()
    
    for row_str in patient_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 53: cols.append(None)
        
        old_id = cols[IDX_PAT['id']]
        name = cols[IDX_PAT['name']]
        old_pid = cols[IDX_PAT['patient_id']]
        
        if not name or not str(name).strip() or re.match(r'^patient\s+\d+$', str(name).strip(), re.IGNORECASE):
            continue
            
        # Uniqueness resolution for patient_number (mapping old patient_id to patient_number)
        if old_pid and str(old_pid).strip() not in ('', 'NULL', 'null', '0'):
            pn_clean = str(old_pid).strip()
            if pn_clean in used_pns:
                pn_clean = f"MIG-{old_id}"
            used_pns.add(pn_clean)
            pn = pn_clean
        else:
            # Fallback to P + old_id
            pn_clean = f"P{str(old_id).zfill(4)}"
            if pn_clean in used_pns:
                pn_clean = f"MIG-{old_id}"
            used_pns.add(pn_clean)
            pn = pn_clean
            
        old_id_to_pn[old_id] = pn
            
    print(f"Mapped {len(old_id_to_pn)} old patient IDs to patient numbers.")
    
    # 2. Get active UUIDs of patients from Supabase
    anon_key = ""
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            for line in f:
                if "VITE_SUPABASE_ANON_KEY" in line:
                    anon_key = line.split("=")[1].strip()
                    
    if not anon_key:
        print("ERROR: Anon key not found in .env. Cannot verify UUIDs.")
        sys.exit(1)
        
    print("Logging in to Supabase as Doctor Meki to retrieve patient UUIDs...")
    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    payload = {"email": "doctormeki@urocare.co.zw", "password": "123456"}
    res_auth = requests.post(auth_url, json=payload, headers={"apikey": anon_key})
    if res_auth.status_code != 200:
        print(f"ERROR: Auth failed: {res_auth.status_code} - {res_auth.text}")
        sys.exit(1)
        
    token = res_auth.json().get("access_token")
    
    # Retrieve all patients (fetching paginated if necessary)
    print("Retrieving all patient UUIDs from Supabase...")
    headers = {"apikey": anon_key, "Authorization": f"Bearer {token}"}
    patients = []
    limit = 1000
    offset = 0
    while True:
        res = requests.get(f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number&limit={limit}&offset={offset}", headers=headers)
        if res.status_code == 200:
            batch = res.json()
            patients.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
        else:
            print(f"ERROR: Failed to fetch patients: {res.text}")
            sys.exit(1)
            
    pn_to_uuid = {p['patient_number']: p['id'] for p in patients if p.get('patient_number')}
    print(f"Loaded {len(pn_to_uuid)} patient UUIDs from Supabase.")
    
    # 3. Retrieve all medicine UUIDs
    print("Retrieving medicine UUIDs from Supabase...")
    res_meds = requests.get(f"{SUPABASE_URL}/rest/v1/medicines?select=id,name&limit=1000", headers=headers)
    medicines = res_meds.json() if res_meds.status_code == 200 else []
    med_name_to_uuid = {m['name'].lower().strip(): m['id'] for m in medicines if m.get('name')}
    print(f"Loaded {len(med_name_to_uuid)} medicine UUIDs.")
    
    # Helper to resolve patient UUID
    def get_patient_uuid(old_id):
        pn = old_id_to_pn.get(old_id)
        if not pn: return None
        return pn_to_uuid.get(pn)

    # Helper to resolve medicine UUID, inserts if missing in memory (we can create a SQL insert list)
    new_medicines_to_create = {}
    def get_medicine_uuid(name):
        if not name or not str(name).strip(): return None
        name_clean = str(name).strip()
        name_lower = name_clean.lower()
        if name_lower in med_name_to_uuid:
            return f"'{med_name_to_uuid[name_lower]}'"
        # If not present, we generate a UUID and queue it for insertion
        if name_lower not in new_medicines_to_create:
            new_id = f"gen_random_uuid()"
            new_medicines_to_create[name_lower] = (new_id, name_clean)
        # In SQL, we will reference the dynamic insert, but for now we write a statement.
        # So we return the subquery to find it
        return f"(SELECT id FROM medicines WHERE LOWER(name) = LOWER({sql_str(name_clean)}) LIMIT 1)"

    # 4. Generate Prescriptions SQL
    print("\n--- Processing Prescriptions ---")
    pres_rows = extract_rows(content, 'pres')
    print(f"Found {len(pres_rows)} prescription rows in dump.")
    
    pres_sql = []
    pres_items_sql = []
    
    # Column indices for pres table
    # pres columns: id: 0, patient: 36, date: 40, user: 41, doctor: 43
    # medicine name columns: 33 (medicine_name), 34 (medicine1_name), 373 (medicine3_name) etc
    # Let's use exact column names from headers. The CREATE TABLE has columns:
    # id(0), name(1), add_date(2), frequency(3), frequency1(4), frequency2(5)...
    # Let's map indexes from schema.
    # Columns in u819957882_urocaresystem (16).sql for pres:
    # 0: id, 1: name, 2: add_date, 3: frequency, 4: frequency1, 5: frequency2
    # 13-19: advice/instruction, 30: medicine, 31: medicine1, 32: medicine2
    # 33: medicine_name, 34: medicine1_name, 35: medicine2_name
    # 36: patient, 37: patient_name, 38: patient_phone, 39: patient_address
    # 40: date, 41: user, 42: doctor_name, 43: doctor, 44: date_string, 45: add_date_time
    # medicine3_name: 373, medicine4_name: 374, medicine5_name: 375, medicine6_name: 376, medicine7_name: 377, medicine8_name: 378, medicine9_name: 379
    # dosage: 416, dosage1: 417, dosage2: 418, dosage3: 419, dosage4: 420, dosage5: 421, dosage6: 422, dosage7: 423
    
    # Let's define the mapping
    IDX_PRES = {
        'id': 0, 'patient': 36, 'date': 40, 'add_date_time': 45,
        'meds': [
            (33, 416, 3, 22), # (name_idx, dosage_idx, freq_idx, freq_name_idx)
            (34, 417, 4, 28),
            (35, 418, 5, 29),
            (373, 419, 372, 359),
            (374, 420, 371, 360),
            (375, 421, 370, 361),
            (376, 422, 369, 362),
            (377, 423, 368, 363),
            (378, 423, 367, 364), # fallback index
            (379, 423, 366, 365)
        ]
    }
    
    for row_str in pres_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 46: continue
        
        old_id = cols[IDX_PRES['id']]
        old_patient_id = cols[IDX_PRES['patient']]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid: continue # Skip if patient not imported
        
        pres_uuid = f"gen_random_uuid()"
        pres_num = f"RX-{str(old_id).zfill(6)}"
        pres_date = parse_date(cols[IDX_PRES['date']] or cols[IDX_PRES['add_date_time']]) or datetime.now().strftime('%Y-%m-%d')
        created_at = parse_datetime(cols[IDX_PRES['add_date_time']] or cols[IDX_PRES['date']])
        
        # Insert prescription header
        pres_sql.append(
            f"(id, branch_id, patient_id, doctor_id, prescription_number, prescription_date, status, created_at) VALUES "
            f"('{old_id}', '{BRANCH_ID}', '{patient_uuid}', '{DOCTOR_MEKI_UUID}', '{pres_num}', '{pres_date}', 'active', {created_at})"
        )
        
        # Insert prescription items
        for m_idx, d_idx, f_idx, fn_idx in IDX_PRES['meds']:
            if m_idx >= len(cols): continue
            med_name = cols[m_idx]
            if not med_name or not str(med_name).strip() or str(med_name).upper() == 'NULL':
                continue
                
            dosage = cols[d_idx] if d_idx < len(cols) else None
            freq_name = cols[fn_idx] if fn_idx < len(cols) else None
            
            med_uuid = get_medicine_uuid(med_name)
            advice = []
            if dosage: advice.append(f"Dosage: {dosage}")
            if freq_name: advice.append(f"Frequency: {freq_name}")
            advice_str = " | ".join(advice) if advice else "Take as directed"
            
            pres_items_sql.append(
                f"(prescription_id, medicine_id, advice, created_at) VALUES "
                f"((SELECT id FROM prescriptions WHERE prescription_number = '{pres_num}' LIMIT 1), {med_uuid}, {sql_str(advice_str)}, {created_at})"
            )
            
    # Write Prescriptions SQL
    pres_file = os.path.join(OUTPUT_DIR, "import_step4_prescriptions.sql")
    with open(pres_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        # Write any new medicines to create
        if new_medicines_to_create:
            out.write("-- Seeding missing medicines referenced in prescriptions\n")
            for name_lower, (new_id, name_clean) in sorted(new_medicines_to_create.items()):
                out.write(f"INSERT INTO medicines (name, branch_id, is_active) SELECT {sql_str(name_clean)}, '{BRANCH_ID}', true WHERE NOT EXISTS (SELECT 1 FROM medicines WHERE LOWER(name) = LOWER({sql_str(name_clean)}));\n")
            out.write("\n")
            
        out.write("-- Inserting Prescription Headers\n")
        for chunk in [pres_sql[i:i+100] for i in range(0, len(pres_sql), 100)]:
            out.write("INSERT INTO prescriptions (id, branch_id, patient_id, doctor_id, prescription_number, prescription_date, status, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                # Extract values block
                val_clean = val.replace("(id, branch_id, patient_id, doctor_id, prescription_number, prescription_date, status, created_at) VALUES ", "")
                comma = "," if j < len(chunk) - 1 else ";"
                out.write(f"  {val_clean}{comma}\n")
            out.write("\n")
            
        out.write("-- Inserting Prescription Items\n")
        for chunk in [pres_items_sql[i:i+100] for i in range(0, len(pres_items_sql), 100)]:
            out.write("INSERT INTO prescription_items (prescription_id, medicine_id, advice, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                val_clean = val.replace("(prescription_id, medicine_id, advice, created_at) VALUES ", "")
                comma = "," if j < len(chunk) - 1 else ";"
                out.write(f"  {val_clean}{comma}\n")
            out.write("\n")
        out.write("COMMIT;\n")
        
    print(f"Created prescriptions SQL import at: {pres_file} ({len(pres_sql)} prescriptions, {len(pres_items_sql)} items)")

    # 5. Generate Medical History (Consultations) SQL
    print("\n--- Processing Consultations ---")
    medhist_file_path = os.path.join(os.path.dirname(__file__), "database", "medicalhistory.sql")
    print(f"Reading consultations from: {medhist_file_path}")
    with open(medhist_file_path, 'r', encoding='utf-8', errors='ignore') as f_med:
        med_content = f_med.read()
    medhist_rows = extract_rows(med_content, 'medicalhistory')
    print(f"Found {len(medhist_rows)} clinical records in user file.")
    
    consultations_sql = []
    
    # Schema columns indices for medicalhistory:
    # 0: id, 1: patient, 2: title, 3: description, 4: patient_name
    # 8: date, 17: diagnosis_name, 18: complaint_name, 19: investigation_name, 20: treatmentplan_name, 23: observation_name, 38: remarks
    IDX_HIST = {
        'id': 0, 'patient': 1, 'description': 3, 'date': 8,
        'diagnosis_name': 17, 'complaint_name': 18, 'investigation_name': 19, 
        'treatmentplan_name': 20, 'observation_name': 23, 'remarks': 38
    }
    
    def process_hist_row(row_str):
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 29: return None
        
        old_patient_id = cols[1]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid: return None
        
        c_date = parse_datetime(cols[8])
        complaint = clean_html(cols[18]) or clean_html(cols[26]) or clean_html(cols[3]) or "Routine Consult"
        diag = clean_html(cols[17]) or clean_html(cols[25])
        plan = clean_html(cols[12]) or clean_html(cols[20])
        
        obs_text = clean_html(cols[28]) or clean_html(cols[23])
        history = obs_text
        exam = obs_text
        phys_exam = obs_text
        
        remarks = clean_html(cols[38]) if len(cols) > 38 else None
        notes_str = remarks
        
        investigations = clean_html(cols[19]) or clean_html(cols[27])
        
        return (
            f"('{BRANCH_ID}', '{patient_uuid}', '{DOCTOR_MEKI_UUID}', {c_date}, "
            f"{sql_str(complaint)}, {sql_str(history)}, {sql_str(exam)}, {sql_str(phys_exam)}, {sql_str(diag)}, "
            f"{sql_str(plan)}, {sql_str(notes_str)}, {sql_str(investigations)}, {c_date})"
        )

    for row_str in medhist_rows:
        val = process_hist_row(row_str)
        if val:
            consultations_sql.append(val)
            
    consult_file = os.path.join(OUTPUT_DIR, "import_step5_consultations.sql")
    with open(consult_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        for chunk in [consultations_sql[i:i+100] for i in range(0, len(consultations_sql), 100)]:
            out.write("INSERT INTO consultations (branch_id, patient_id, doctor_id, consultation_date, chief_complaint, history, examination, physical_examination, diagnosis, treatment_plan, notes, investigations, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                comma = "," if j < len(chunk) - 1 else ";"
                out.write(f"  {val}{comma}\n")
            out.write("\n")
        out.write("COMMIT;\n")
        
    print(f"Created consultations SQL import at: {consult_file} ({len(consultations_sql)} consultations)")

    # 6. Generate Admissions SQL
    print("\n--- Processing Admissions ---")
    ad_rows = extract_rows(content, 'admission')
    print(f"Found {len(ad_rows)} admission rows in dump.")
    
    admissions_sql = []
    
    # Columns in admission:
    # 0: id, 2: patient, 4: date, 13: add_date_time, 17: datedone (datedone: 17 or datedone2: 21)
    # 18: blood, 19: imaging, 20: NPO, 22: fluids, 23: medication, 24: other1, 28: patient_sex
    # 30: diagnosis_name, 31: operationprocedure_name, 33: hospital_name
    IDX_AD = {
        'patient': 2, 'add_date_time': 13, 'hospital_name': 33, 
        'diagnosis_name': 30, 'operationprocedure_name': 31,
        'blood': 18, 'imaging': 19, 'npo': 20, 'fluids': 22, 'medication': 23, 'other': 24
    }
    
    for row_str in ad_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 34: continue
        
        old_patient_id = cols[IDX_AD['patient']]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid: continue
        
        hosp = cols[IDX_AD['hospital_name']] or "Urocare Clinic"
        ad_date = parse_datetime(cols[IDX_AD['add_date_time']])
        proc_text = cols[IDX_AD['operationprocedure_name']]
        
        # Test arrays (bloods, imaging)
        blood = cols[IDX_AD['blood']]
        blood_arr = f"ARRAY[{sql_str(blood)}]" if blood else "'{}'::text[]"
        
        imaging = cols[IDX_AD['imaging']]
        imaging_arr = f"ARRAY[{sql_str(imaging)}]" if imaging else "'{}'::text[]"
        
        npo = cols[IDX_AD['npo']]
        fluids = cols[IDX_AD['fluids']]
        meds = cols[IDX_AD['medication']]
        other = cols[IDX_AD['other']]
        
        admissions_sql.append(
            f"('{BRANCH_ID}', '{patient_uuid}', '{DOCTOR_MEKI_UUID}', {sql_str(hosp)}, {ad_date}, "
            f"{sql_str(proc_text)}, {blood_arr}, {imaging_arr}, {sql_str(npo)}, {sql_str(fluids)}, "
            f"{sql_str(meds)}, {sql_str(other)}, {ad_date})"
        )
        
    ad_file = os.path.join(OUTPUT_DIR, "import_step6_admissions.sql")
    with open(ad_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        for chunk in [admissions_sql[i:i+100] for i in range(0, len(admissions_sql), 100)]:
            out.write("INSERT INTO admission_forms (branch_id, patient_id, doctor_id, hospital, admission_date, procedure_text, plan_bloods, plan_imaging, npo_oral, iv_fluids, medication, other, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                comma = "," if j < len(chunk) - 1 else ";"
                out.write(f"  {val}{comma}\n")
            out.write("\n")
        out.write("COMMIT;\n")
        
    print(f"Created admission forms SQL import at: {ad_file} ({len(admissions_sql)} admissions)")

    # 7. Generate Referrals SQL
    print("\n--- Processing Referrals ---")
    ref_rows = extract_rows(content, 'referral')
    print(f"Found {len(ref_rows)} referral rows in dump.")
    
    referrals_sql = []
    
    # Columns in referral:
    # 0: id, 2: patient, 4: date, 13: add_date_time, 14: toa (recipient)
    # 15: reason, 16: history, 17: treatment
    IDX_REF = {
        'patient': 2, 'add_date_time': 13, 'toa': 14, 
        'reason': 15, 'history': 16, 'treatment': 17
    }
    
    for row_str in ref_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 18: continue
        
        old_patient_id = cols[IDX_REF['patient']]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid: continue
        
        recipient = cols[IDX_REF['toa']] or "Referring Doctor"
        ref_date = parse_date(cols[IDX_REF['add_date_time']]) or datetime.now().strftime('%Y-%m-%d')
        reason = cols[IDX_REF['reason']]
        hist = cols[IDX_REF['history']]
        treat = cols[IDX_REF['treatment']]
        created_at = parse_datetime(cols[IDX_REF['add_date_time']])
        
        referrals_sql.append(
            f"('{BRANCH_ID}', '{patient_uuid}', '{DOCTOR_MEKI_UUID}', '{ref_date}', {sql_str(recipient)}, "
            f"{sql_str(reason)}, {sql_str(hist)}, {sql_str(treat)}, {created_at})"
        )
        
    ref_file = os.path.join(OUTPUT_DIR, "import_step7_referrals.sql")
    with open(ref_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        for chunk in [referrals_sql[i:i+100] for i in range(0, len(referrals_sql), 100)]:
            out.write("INSERT INTO referral_forms (branch_id, patient_id, doctor_id, report_date, recipient, reason_for_referral, background_history, treatment_done, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                comma = "," if j < len(chunk) - 1 else ";"
                out.write(f"  {val}{comma}\n")
            out.write("\n")
        out.write("COMMIT;\n")
        
    print(f"Created referral forms SQL import at: {ref_file} ({len(referrals_sql)} referrals)")

    # 8. Generate Patient Files SQL
    print("\n--- Processing Patient Files ---")
    mat_rows = extract_rows(content, 'patient_material')
    print(f"Found {len(mat_rows)} material rows in dump.")
    
    files_sql = []
    
    # Columns in patient_material:
    # 0: id, 1: date, 2: title, 4: patient, 8: url, 9: date_string
    IDX_MAT = {
        'patient': 4, 'title': 2, 'url': 8, 'date': 1
    }
    
    for row_str in mat_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 9: continue
        
        old_patient_id = cols[IDX_MAT['patient']]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid: continue
        
        title = cols[IDX_MAT['title']] or "Attached Document"
        url = cols[IDX_MAT['url']]
        created_at = parse_datetime(cols[IDX_MAT['date']])
        
        # Get extension
        ext = 'pdf'
        if url:
            parts = url.split('.')
            if len(parts) > 1:
                ext = parts[-1].lower()
                
        # Approximate size
        size = 1024 * 100 # 100kb fallback
        
        files_sql.append(
            f"('{BRANCH_ID}', '{patient_uuid}', {sql_str(title)}, {sql_str(ext)}, {sql_str(url)}, "
            f"{size}, '{DOCTOR_MEKI_UUID}', {created_at})"
        )
        
    files_file = os.path.join(OUTPUT_DIR, "import_step8_patient_files.sql")
    with open(files_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        for chunk in [files_sql[i:i+100] for i in range(0, len(files_sql), 100)]:
            out.write("INSERT INTO patient_files (branch_id, patient_id, file_name, file_type, file_url, file_size, uploaded_by, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                comma = "," if j < len(chunk) - 1 else ";"
                out.write(f"  {val}{comma}\n")
            out.write("\n")
        out.write("COMMIT;\n")
        
    print(f"Created patient files SQL import at: {files_file} ({len(files_sql)} files)")
    
    # 9. Generate Appointments SQL
    print("\n--- Processing Appointments ---")
    appt_rows = extract_rows(content, 'appointment')
    print(f"Found {len(appt_rows)} appointment rows in dump.")
    
    appts_sql = []
    
    IDX_APPT = {
        'id': 0, 'patient': 1, 'doctor': 2, 'remarks': 7, 
        'registration_time': 9, 'status': 11, 'app_time': 18, 'reason': 27
    }
    
    for row_str in appt_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 19: continue
        
        old_id = cols[IDX_APPT['id']]
        old_patient_id = cols[IDX_APPT['patient']]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid: continue
        
        # Resolve doctor (default fallback to Doctor Meki UUID)
        doc_uuid = DOCTOR_MEKI_UUID
        
        # Calculate appt date
        appt_time = cols[IDX_APPT['app_time']]
        appt_date_val = parse_datetime(appt_time)
        
        # Map status
        old_status = cols[IDX_APPT['status']]
        status_val = 'confirmed'
        if old_status:
            os_lower = old_status.lower()
            if 'confirm' in os_lower:
                status_val = 'confirmed'
            elif 'pend' in os_lower:
                status_val = 'pending_confirmation'
            elif 'cancel' in os_lower:
                status_val = 'cancelled'
            elif 'complete' in os_lower:
                status_val = 'completed'
                
        remarks = cols[IDX_APPT['remarks']]
        reason = cols[IDX_APPT['reason']] if IDX_APPT['reason'] < len(cols) else None
        
        notes = []
        if remarks: notes.append(f"Remarks: {remarks}")
        if reason: notes.append(f"Reason: {reason}")
        notes_str = " | ".join(notes) if notes else "Routine Visit"
        
        # Dynamic classification of appointment type
        app_type_val = 'consultation'
        remarks_lower = remarks.lower() if remarks else ''
        reason_lower = reason.lower() if reason else ''
        
        if 'review' in remarks_lower or 'review' in reason_lower or 'check' in remarks_lower or 'follow' in remarks_lower:
            app_type_val = 'follow_up'
        elif any(kw in remarks_lower or kw in reason_lower for kw in ['change', 'uroflow', 'uss', 'scan', 'ultrasound', 'inj', 'catheter', 'biopsy', 'op ', 'operation', 'removal', 'insertion', 'histology', 'mri', 'psa', 'blood']):
            app_type_val = 'procedure'
        elif 'consult' in remarks_lower or 'consult' in reason_lower or 'n/p' in remarks_lower or 'n/p' in reason_lower:
            app_type_val = 'consultation'
            
        appt_uuid = str(uuid.uuid5(BASE_UUID, f"appointment_old_id:{old_id}"))
        created_at = parse_datetime(cols[IDX_APPT['registration_time']])
        
        appts_sql.append(
            f"('{appt_uuid}', '{BRANCH_ID}', '{patient_uuid}', '{doc_uuid}', {appt_date_val}, 15, '{app_type_val}', "
            f"'{status_val}', {sql_str(notes_str)}, '{DOCTOR_MEKI_UUID}', {created_at})"
        )
        
    appt_file = os.path.join(OUTPUT_DIR, "import_step9_appointments.sql")
    with open(appt_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        for chunk in [appts_sql[i:i+100] for i in range(0, len(appts_sql), 100)]:
            out.write("INSERT INTO appointments (id, branch_id, patient_id, doctor_id, appointment_date, duration_minutes, appointment_type, status, notes, created_by, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                comma = "," if j < len(chunk) - 1 else ""
                out.write(f"  {val}{comma}\n")
            out.write("ON CONFLICT (id) DO UPDATE SET\n"
                      "  branch_id = EXCLUDED.branch_id,\n"
                      "  patient_id = EXCLUDED.patient_id,\n"
                      "  doctor_id = EXCLUDED.doctor_id,\n"
                      "  appointment_date = EXCLUDED.appointment_date,\n"
                      "  duration_minutes = EXCLUDED.duration_minutes,\n"
                      "  appointment_type = EXCLUDED.appointment_type,\n"
                      "  status = EXCLUDED.status,\n"
                      "  notes = EXCLUDED.notes,\n"
                      "  created_by = EXCLUDED.created_by,\n"
                      "  created_at = EXCLUDED.created_at;\n\n")
        out.write("COMMIT;\n")
        
    print(f"Created appointments SQL import at: {appt_file} ({len(appts_sql)} appointments)")

    # 10. Generate Payments & Invoices SQL
    print("\n--- Processing Payments & Invoices ---")
    pay_rows = extract_rows(content, 'payment')
    print(f"Found {len(pay_rows)} payment rows in dump.")
    
    invoices_sql = []
    invoice_items_sql = []
    payments_sql = []
    
    IDX_PAY = {
        'id': 0, 'patient': 2, 'doctor': 3, 'date': 4, 'amount': 5, 'vat': 6,
        'discount': 9, 'gross_total': 11, 'remarks': 12, 'category_name': 16,
        'amount_received': 17, 'deposit_type': 18, 'status': 19, 'note': 28
    }
    
    for row_str in pay_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 20: continue
        
        old_id = cols[IDX_PAY['id']]
        old_patient_id = cols[IDX_PAY['patient']]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid: continue
        
        inv_num = f"INV-{str(old_id).zfill(6)}"
        inv_date = parse_date(cols[IDX_PAY['date']]) or datetime.now().strftime('%Y-%m-%d')
        inv_date_str = f"'{inv_date}'"
        
        amount = 0.0
        try: amount = float(cols[IDX_PAY['amount']] or 0)
        except: pass
        
        vat = 0.0
        try: vat = float(cols[IDX_PAY['vat']] or 0)
        except: pass
        
        discount = 0.0
        try: discount = float(cols[IDX_PAY['discount']] or 0)
        except: pass
        
        gross = 0.0
        try: gross = float(cols[IDX_PAY['gross_total']] or 0)
        except: pass
        
        # Payment status
        old_status = cols[IDX_PAY['status']]
        status_val = 'paid'
        if old_status and 'unpaid' in old_status.lower():
            status_val = 'unpaid'
            
        note_text = cols[IDX_PAY['note']] if IDX_PAY['note'] < len(cols) else cols[IDX_PAY['remarks']]
        
        # Write invoice header
        inv_uuid = str(uuid.uuid5(BASE_UUID, f"invoice_old_id:{old_id}"))
        invoices_sql.append(
            f"('{inv_uuid}', '{BRANCH_ID}', '{patient_uuid}', '{inv_num}', {inv_date_str}, {inv_date_str}, "
            f"{gross}, {vat}, {amount}, '{status_val}', {sql_str(note_text)}, '{DOCTOR_MEKI_UUID}', {inv_date_str})"
        )
        
        # Parse invoice items from category_name
        cat_name = cols[IDX_PAY['category_name']]
        item_counter = 0
        if cat_name and str(cat_name).strip() and str(cat_name).upper() != 'NULL':
            # Split items by comma
            items = cat_name.split(',')
            for item in items:
                parts = item.split('*')
                if len(parts) >= 3:
                    try:
                        u_price = float(parts[1] or 0)
                        desc = parts[2]
                        qty = float(parts[3] or 1) if len(parts) > 3 else 1
                        tot_price = u_price * qty
                        
                        item_uuid = str(uuid.uuid5(BASE_UUID, f"invoice_item_old_id:{old_id}_idx:{item_counter}"))
                        item_counter += 1
                        
                        invoice_items_sql.append(
                            f"('{item_uuid}', '{inv_uuid}', "
                            f"{sql_str(desc)}, {qty}, {u_price}, {tot_price}, {inv_date_str})"
                        )
                    except:
                        pass
        
        if item_counter == 0:
            # Fallback single item
            item_uuid = str(uuid.uuid5(BASE_UUID, f"invoice_item_old_id:{old_id}_fallback"))
            invoice_items_sql.append(
                f"('{item_uuid}', '{inv_uuid}', "
                f"'Medical Services', 1, {amount}, {amount}, {inv_date_str})"
            )
            
        # Write payment transaction (only if paid or amount received)
        dep_type = cols[IDX_PAY['deposit_type']] or 'Cash'
        amt_rec = cols[IDX_PAY['amount_received']]
        
        # Standardize deposit/payment method
        pay_method = 'cash'
        if dep_type:
            dt_lower = dep_type.lower()
            if 'card' in dt_lower: pay_method = 'card'
            elif 'bank' in dt_lower or 'transfer' in dt_lower: pay_method = 'bank_transfer'
            elif 'medical' in dt_lower: pay_method = 'medical_aid'
            else: pay_method = 'cash'
            
        # Create payment if it is paid or has amount received
        has_amt_rec = False
        try:
            if amt_rec and float(amt_rec) > 0: has_amt_rec = True
        except:
            pass
            
        if status_val == 'paid' or has_amt_rec:
            pay_amt = amount
            try:
                if has_amt_rec: pay_amt = float(amt_rec)
            except:
                pass
            ref_num = f"TX-{str(old_id).zfill(6)}"
            pay_uuid = str(uuid.uuid5(BASE_UUID, f"payment_old_id:{old_id}"))
            payments_sql.append(
                f"('{pay_uuid}', '{BRANCH_ID}', '{inv_uuid}', "
                f"'{patient_uuid}', {inv_date_str}, {pay_amt}, '{pay_method}', '{ref_num}', "
                f"{sql_str(note_text)}, '{DOCTOR_MEKI_UUID}', {inv_date_str})"
            )
            
    # Write Invoices and Payments SQL
    billing_file = os.path.join(OUTPUT_DIR, "import_step10_billing_and_payments.sql")
    with open(billing_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        
        out.write("-- Inserting Invoices\n")
        for chunk in [invoices_sql[i:i+100] for i in range(0, len(invoices_sql), 100)]:
            out.write("INSERT INTO invoices (id, branch_id, patient_id, invoice_number, invoice_date, due_date, subtotal, tax_amount, total_amount, status, notes, created_by, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                comma = "," if j < len(chunk) - 1 else ""
                out.write(f"  {val}{comma}\n")
            out.write("ON CONFLICT (id) DO UPDATE SET\n"
                      "  branch_id = EXCLUDED.branch_id,\n"
                      "  patient_id = EXCLUDED.patient_id,\n"
                      "  invoice_number = EXCLUDED.invoice_number,\n"
                      "  invoice_date = EXCLUDED.invoice_date,\n"
                      "  due_date = EXCLUDED.due_date,\n"
                      "  subtotal = EXCLUDED.subtotal,\n"
                      "  tax_amount = EXCLUDED.tax_amount,\n"
                      "  total_amount = EXCLUDED.total_amount,\n"
                      "  status = EXCLUDED.status,\n"
                      "  notes = EXCLUDED.notes,\n"
                      "  created_by = EXCLUDED.created_by,\n"
                      "  created_at = EXCLUDED.created_at;\n\n")
            
        out.write("-- Inserting Invoice Items\n")
        for chunk in [invoice_items_sql[i:i+100] for i in range(0, len(invoice_items_sql), 100)]:
            out.write("INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, total_price, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                comma = "," if j < len(chunk) - 1 else ""
                out.write(f"  {val}{comma}\n")
            out.write("ON CONFLICT (id) DO UPDATE SET\n"
                      "  invoice_id = EXCLUDED.invoice_id,\n"
                      "  description = EXCLUDED.description,\n"
                      "  quantity = EXCLUDED.quantity,\n"
                      "  unit_price = EXCLUDED.unit_price,\n"
                      "  total_price = EXCLUDED.total_price,\n"
                      "  created_at = EXCLUDED.created_at;\n\n")
            
        out.write("-- Inserting Payments\n")
        for chunk in [payments_sql[i:i+100] for i in range(0, len(payments_sql), 100)]:
            out.write("INSERT INTO payments (id, branch_id, invoice_id, patient_id, payment_date, amount, payment_method, reference_number, notes, received_by, created_at) VALUES\n")
            for j, val in enumerate(chunk):
                comma = "," if j < len(chunk) - 1 else ""
                out.write(f"  {val}{comma}\n")
            out.write("ON CONFLICT (id) DO UPDATE SET\n"
                      "  branch_id = EXCLUDED.branch_id,\n"
                      "  invoice_id = EXCLUDED.invoice_id,\n"
                      "  patient_id = EXCLUDED.patient_id,\n"
                      "  payment_date = EXCLUDED.payment_date,\n"
                      "  amount = EXCLUDED.amount,\n"
                      "  payment_method = EXCLUDED.payment_method,\n"
                      "  reference_number = EXCLUDED.reference_number,\n"
                      "  notes = EXCLUDED.notes,\n"
                      "  received_by = EXCLUDED.received_by,\n"
                      "  created_at = EXCLUDED.created_at;\n\n")
            
        out.write("COMMIT;\n")
        
    print(f"Created billing and payments SQL import at: {billing_file} ({len(invoices_sql)} invoices, {len(payments_sql)} payments)")
    print("\n=======================================================")
    print("SUCCESS: Generated all 7 clinical and administrative import SQL files!")
    print("=======================================================")

if __name__ == '__main__':
    main()
