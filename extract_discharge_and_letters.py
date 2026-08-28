import os
import re
import uuid
import sys
from datetime import datetime
import requests

# Config
DUMP_PATH   = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database\u819957882_urocaresystem (16).sql"
OUTPUT_DIR  = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database"
BRANCH_ID   = "697a3863-1de7-4615-819c-45b0d7066d67"
DOCTOR_MEKI_UUID = "90a905bc-d22a-4db3-bd43-2c1c6bf488e0"

# Base UUID for deterministic UUID generation
BASE_UUID = uuid.uuid5(uuid.NAMESPACE_DNS, "urocare.co.zw")

def get_entity_uuid(entity_type, name_key):
    return str(uuid.uuid5(BASE_UUID, f"{entity_type}_name:{name_key}"))

def sql_str(v):
    if v is None or str(v).strip() in ('', 'NULL', 'null'):
        return 'NULL'
    return "'" + str(v).strip().replace("'", "''") + "'"

def parse_datetime(raw):
    if not raw or str(raw).strip() in ('', 'NULL', 'null'):
        return 'NOW()'
    raw = str(raw).strip()
    if re.match(r'^\d{10}$', raw):
        try:
            return f"'{datetime.fromtimestamp(int(raw)).strftime('%Y-%m-%d %H:%M:%S')}'"
        except:
            pass
    for fmt in ['%d-%m-%Y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y %H:%M', '%d/%m/%Y %H:%M']:
        try:
            d = datetime.strptime(raw, fmt)
            return f"'{d.strftime('%Y-%m-%d %H:%M:%S')}'"
        except ValueError:
            pass
    for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%m-%y']:
        try:
            d = datetime.strptime(raw, fmt)
            return f"'{d.strftime('%Y-%m-%d')} 00:00:00'"
        except ValueError:
            pass
    return 'NOW()'

def parse_only_date(raw):
    if not raw or str(raw).strip() in ('', 'NULL', 'null', '0'):
        return 'NULL'
    raw = str(raw).strip()
    if re.match(r'^\d{10}$', raw):
        try:
            return f"'{datetime.fromtimestamp(int(raw)).strftime('%Y-%m-%d')}'"
        except:
            pass
    if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        return f"'{raw}'"
    for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%m-%y']:
        try:
            d = datetime.strptime(raw, fmt)
            return f"'{d.strftime('%Y-%m-%d')}'"
        except ValueError:
            pass
    return 'NULL'

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
        v = v.replace("\\'", "'")
        v = v.replace('\\"', '"')
        v = v.replace('\\n', '\n')
        v = v.replace('\\r', '\r')
        v = v.replace('\\t', '\t')
        v = v.replace('\\\\', '\\')
        v = v.replace("''", "'")
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

def extract_all_rows_robust(content, table_name):
    pattern = re.compile(r"INSERT\s+INTO\s+`" + table_name + r"`", re.I)
    all_rows = []
    
    for match in pattern.finditer(content):
        values_match = re.search(r"\bVALUES\b", content[match.end():], re.I)
        if not values_match:
            continue
            
        start_idx = match.end() + values_match.end()
        idx = start_idx
        in_str = False
        escape = False
        depth = 0
        tuple_start = None
        
        while idx < len(content):
            c = content[idx]
            if escape:
                escape = False
                idx += 1
                continue
            if c == '\\':
                escape = True
                idx += 1
                continue
            if c == "'":
                in_str = not in_str
                idx += 1
                continue
            if not in_str:
                if c == '(':
                    if depth == 0:
                        tuple_start = idx + 1
                    depth += 1
                elif c == ')':
                    depth -= 1
                    if depth == 0 and tuple_start is not None:
                        all_rows.append(content[tuple_start:idx])
                        tuple_start = None
                elif c == ';':
                    break
            idx += 1
            
    return all_rows

def main():
    print(f"Reading SQL Dump from {DUMP_PATH}...")
    with open(DUMP_PATH, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # 1. Map old patient ID to patient_number
    print("Reconstructing patient numbers mapping...")
    patient_rows = extract_all_rows_robust(content, 'patient')
    old_id_to_pn = {}
    used_pns = set()
    for row_str in patient_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 53: cols.append(None)
        old_id = cols[0]
        name = cols[2]
        old_pid = cols[12]
        if not name or not str(name).strip() or re.match(r'^patient\s+\d+$', str(name).strip(), re.IGNORECASE):
            continue
        if old_pid and str(old_pid).strip() not in ('', 'NULL', 'null', '0'):
            pn_clean = str(old_pid).strip()
            if pn_clean in used_pns:
                pn_clean = f"MIG-{old_id}"
            used_pns.add(pn_clean)
            pn = pn_clean
        else:
            pn_clean = f"P{str(old_id).zfill(4)}"
            if pn_clean in used_pns:
                pn_clean = f"MIG-{old_id}"
            used_pns.add(pn_clean)
            pn = pn_clean
        old_id_to_pn[old_id] = pn

    # Retrieve all patients from Supabase
    anon_key = ""
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            for line in f:
                if "VITE_SUPABASE_ANON_KEY" in line:
                    anon_key = line.split("=")[1].strip()
    if not anon_key:
        print("ERROR: Anon key not found in .env.")
        return

    print("Logging in to Supabase to retrieve patient UUIDs...")
    auth_url = f"https://cpyyclrhnyeibxlouwep.supabase.co/auth/v1/token?grant_type=password"
    payload = {"email": "doctormeki@urocare.co.zw", "password": "123456"}
    res_auth = requests.post(auth_url, json=payload, headers={"apikey": anon_key})
    if res_auth.status_code != 200:
        print(f"ERROR: Auth failed: {res_auth.status_code}")
        return
    token = res_auth.json().get("access_token")
    headers = {"apikey": anon_key, "Authorization": f"Bearer {token}"}
    
    patients = []
    limit, offset = 1000, 0
    while True:
        res = requests.get(f"https://cpyyclrhnyeibxlouwep.supabase.co/rest/v1/patients?select=id,patient_number&limit={limit}&offset={offset}", headers=headers)
        if res.status_code == 200:
            batch = res.json()
            patients.extend(batch)
            if len(batch) < limit:
                break
            offset += limit
        else:
            print("ERROR: Failed to fetch patients")
            return
            
    pn_to_uuid = {p['patient_number']: p['id'] for p in patients if p.get('patient_number')}
    print(f"Loaded {len(pn_to_uuid)} patient UUIDs.")

    def get_patient_uuid(old_id):
        pn = old_id_to_pn.get(old_id)
        if not pn: return None
        return pn_to_uuid.get(pn)

    # Reconstruct diagnoses mapping
    print("Reconstructing diagnoses mapping...")
    diag_rows = extract_all_rows_robust(content, 'diagnosis')
    old_diag_id_to_uuid = {}
    for row_str in diag_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 2: continue
        old_id = cols[0]
        diag_name_clean = cols[1].strip() if cols[1] else f"Diagnosis {old_id}"
        norm_name = diag_name_clean.lower()
        d_uuid = get_entity_uuid("diagnosis", norm_name)
        old_diag_id_to_uuid[old_id] = d_uuid

    # 2. Extract Discharge Summaries (discharge table)
    print("\n--- Extracting Discharge Summaries ---")
    discharge_rows = extract_all_rows_robust(content, 'discharge')
    print(f"Found {len(discharge_rows)} discharge rows in dump.")
    
    discharge_sql = []
    
    for row_str in discharge_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 19: cols.append(None)
        
        old_id = cols[0]
        old_patient_id = cols[2]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid:
            # Skip if patient not imported
            continue
            
        report_date = parse_only_date(cols[4] or cols[13])
        discharge_date = parse_datetime(cols[13] or cols[4])
        recipient = cols[14] # toa
        medical_history = cols[15] # history
        treatment_done = cols[16] # treatment
        raw_diag = cols[17] # diagnosis
        diagnosis_text = re.sub(r'<[^>]*>', '', raw_diag).strip() if raw_diag else None
        follow_up_plan = cols[18] # followupplan
        created_at = parse_datetime(cols[13] or cols[4])
        
        summary_uuid = str(uuid.uuid5(BASE_UUID, f"discharge_summary_old_id:{old_id}"))
        
        row_values = (
            f"('{summary_uuid}', '{BRANCH_ID}', '{patient_uuid}', '{DOCTOR_MEKI_UUID}', "
            f"{discharge_date}, {discharge_date}, {sql_str(medical_history)}, {sql_str(treatment_done)}, "
            f"{sql_str(diagnosis_text)}, NULL, {sql_str(follow_up_plan)}, {created_at}, "
            f"NULL, {sql_str(recipient)}, {sql_str(diagnosis_text)}, "
            f"{sql_str(medical_history)}, {sql_str(treatment_done)}, {sql_str(follow_up_plan)}, {report_date})"
        )
        discharge_sql.append(row_values)

    discharge_file = os.path.join(OUTPUT_DIR, "import_step19_discharge_summaries.sql")
    with open(discharge_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        for chunk in [discharge_sql[i:i+100] for i in range(0, len(discharge_sql), 100)]:
            out.write("INSERT INTO public.discharge_summaries (id, branch_id, patient_id, doctor_id, admission_date, discharge_date, reason_for_admission, treatment_summary, discharge_diagnosis, medications_on_discharge, follow_up_instructions, created_at, diagnosis_id, recipient, diagnosis_text, medical_history, treatment_done, follow_up_plan, report_date) VALUES\n")
            for j, val in enumerate(chunk):
                if j == len(chunk) - 1:
                    out.write(f"  {val}\n"
                              f"ON CONFLICT (id) DO UPDATE SET\n"
                              f"  branch_id = EXCLUDED.branch_id,\n"
                              f"  patient_id = EXCLUDED.patient_id,\n"
                              f"  doctor_id = EXCLUDED.doctor_id,\n"
                              f"  admission_date = EXCLUDED.admission_date,\n"
                              f"  discharge_date = EXCLUDED.discharge_date,\n"
                              f"  reason_for_admission = EXCLUDED.reason_for_admission,\n"
                              f"  treatment_summary = EXCLUDED.treatment_summary,\n"
                              f"  discharge_diagnosis = EXCLUDED.discharge_diagnosis,\n"
                              f"  medications_on_discharge = EXCLUDED.medications_on_discharge,\n"
                              f"  follow_up_instructions = EXCLUDED.follow_up_instructions,\n"
                              f"  created_at = EXCLUDED.created_at,\n"
                              f"  diagnosis_id = EXCLUDED.diagnosis_id,\n"
                              f"  recipient = EXCLUDED.recipient,\n"
                              f"  diagnosis_text = EXCLUDED.diagnosis_text,\n"
                              f"  medical_history = EXCLUDED.medical_history,\n"
                              f"  treatment_done = EXCLUDED.treatment_done,\n"
                              f"  follow_up_plan = EXCLUDED.follow_up_plan,\n"
                              f"  report_date = EXCLUDED.report_date;\n")
                else:
                    out.write(f"  {val},\n")
            out.write("\n")
        out.write("COMMIT;\n")
    print(f"Created discharge summaries SQL import at: {discharge_file} ({len(discharge_sql)} records)")

    # 3. Extract Medical Reports (letter table)
    print("\n--- Extracting Medical Reports ---")
    letter_rows = extract_all_rows_robust(content, 'letter')
    print(f"Found {len(letter_rows)} letter rows in dump.")
    
    reports_sql = []
    
    for row_str in letter_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 20: cols.append(None)
        
        old_id = cols[0]
        old_patient_id = cols[2]
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid:
            # Skip if patient not imported
            continue
            
        report_date = parse_only_date(cols[4] or cols[13])
        recipient = cols[14] # toa
        content_text = cols[15] # letter
        created_at = parse_datetime(cols[13] or cols[4])
        
        # Resolve diagnosis UUID
        diagnosis_uuid = None
        old_diag_id = cols[17]
        diag_name = cols[18]
        
        if old_diag_id and str(old_diag_id).strip() not in ('', 'NULL', 'null', '0'):
            diagnosis_uuid = old_diag_id_to_uuid.get(str(old_diag_id).strip())
            
        if not diagnosis_uuid and diag_name and str(diag_name).strip() not in ('', 'NULL', 'null', '-'):
            norm_name = str(diag_name).strip().lower()
            diagnosis_uuid = get_entity_uuid("diagnosis", norm_name)
            
        diag_uuid_val = f"'{diagnosis_uuid}'" if diagnosis_uuid else "NULL"
        
        report_uuid = str(uuid.uuid5(BASE_UUID, f"medical_report_old_id:{old_id}"))
        
        row_values = (
            f"('{report_uuid}', '{BRANCH_ID}', '{patient_uuid}', '{DOCTOR_MEKI_UUID}', "
            f"'medical_report', {report_date}, {sql_str(recipient)}, {sql_str(content_text)}, 'active', {created_at}, {diag_uuid_val})"
        )
        reports_sql.append(row_values)

    reports_file = os.path.join(OUTPUT_DIR, "import_step20_medical_reports.sql")
    with open(reports_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        for chunk in [reports_sql[i:i+100] for i in range(0, len(reports_sql), 100)]:
            out.write("INSERT INTO public.medical_reports (id, branch_id, patient_id, doctor_id, report_type, report_date, recipient, content, status, created_at, diagnosis_id) VALUES\n")
            for j, val in enumerate(chunk):
                if j == len(chunk) - 1:
                    out.write(f"  {val}\n"
                              f"ON CONFLICT (id) DO UPDATE SET\n"
                              f"  branch_id = EXCLUDED.branch_id,\n"
                              f"  patient_id = EXCLUDED.patient_id,\n"
                              f"  doctor_id = EXCLUDED.doctor_id,\n"
                              f"  report_type = EXCLUDED.report_type,\n"
                              f"  report_date = EXCLUDED.report_date,\n"
                              f"  recipient = EXCLUDED.recipient,\n"
                              f"  content = EXCLUDED.content,\n"
                              f"  status = EXCLUDED.status,\n"
                              f"  created_at = EXCLUDED.created_at,\n"
                              f"  diagnosis_id = EXCLUDED.diagnosis_id;\n")
                else:
                    out.write(f"  {val},\n")
            out.write("\n")
        out.write("COMMIT;\n")
    print(f"Created medical reports SQL import at: {reports_file} ({len(reports_sql)} records)")

if __name__ == '__main__':
    main()
