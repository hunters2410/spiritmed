import os
import re
import uuid
import sys
from datetime import datetime

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
    if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        return f"'{raw}'"
    for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%m-%y']:
        try:
            d = datetime.strptime(raw, fmt)
            return f"'{d.strftime('%Y-%m-%d')}'"
        except ValueError:
            pass
    return 'NULL'

def parse_only_time(raw):
    if not raw or str(raw).strip() in ('', 'NULL', 'null', '0'):
        return 'NULL'
    raw = str(raw).strip()
    for fmt in ['%I:%M %p', '%I:%M%p', '%H:%M:%S', '%H:%M']:
        try:
            t = datetime.strptime(raw, fmt)
            return f"'{t.strftime('%H:%M:%S')}'"
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

def clean_int_id(v):
    if not v or str(v).strip() in ('', 'NULL', 'null', '0'):
        return None
    return str(v).strip()

def clean_name(n):
    if not n or str(n).strip() in ('', 'NULL', 'null', '0'):
        return None
    return str(n).strip()

def strip_html_tags(text):
    if not text:
        return ""
    # Strip HTML tags
    clean = re.compile('<.*?>')
    return re.sub(clean, '', text).strip()

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

    import requests
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

    # 2. Build Hospitals mapping
    print("Reconstructing hospitals mapping...")
    hosp_rows = extract_all_rows_robust(content, 'hospital')
    old_hosp_id_to_uuid = {}
    for row_str in hosp_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 2: continue
        old_id = cols[0]
        name_clean = cols[1].strip() if cols[1] else f"Hospital {old_id}"
        norm_name = name_clean.lower()
        h_uuid = get_entity_uuid("hospital", norm_name)
        old_hosp_id_to_uuid[old_id] = h_uuid

    # 3. Build Diagnoses mapping
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

    # 4. Build OperationProcedure (Surgical Procedures) mapping
    print("Reconstructing surgical procedures mapping...")
    proc_rows = extract_all_rows_robust(content, 'operationprocedure')
    old_proc_id_to_uuid = {}
    for row_str in proc_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 2: continue
        old_id = cols[0]
        proc_name_clean = cols[1].strip() if cols[1] else f"Procedure {old_id}"
        norm_name = proc_name_clean.lower()
        p_uuid = get_entity_uuid("surgical_procedure", norm_name)
        old_proc_id_to_uuid[old_id] = p_uuid

    # 5. Extract Anaesthetists and generate SQL
    print("\n--- Extracting Anaesthetists ---")
    ana_rows = extract_all_rows_robust(content, 'anaesthetist')
    print(f"Found {len(ana_rows)} anaesthetist rows in dump.")
    
    anaesthetists_sql = []
    old_anaesthetist_id_to_uuid = {}
    
    for row_str in ana_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 2: continue
        old_id = cols[0]
        name = clean_name(cols[1])
        if not name: continue
        
        # Deterministic UUID by name (deduplicated)
        norm_name = name.lower()
        a_uuid = get_entity_uuid("anaesthetist", norm_name)
        old_anaesthetist_id_to_uuid[old_id] = a_uuid
        
        # Specialization can be NULL or we check if they have email/code details
        # Let's insert unique ones by UUID
        anaesthetists_sql.append((a_uuid, name))

    # Deduplicate by UUID
    unique_anaesthetists = {}
    for a_uuid, name in anaesthetists_sql:
        if a_uuid not in unique_anaesthetists:
            unique_anaesthetists[a_uuid] = name

    ana_file = os.path.join(OUTPUT_DIR, "import_step16_anaesthetists.sql")
    with open(ana_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        out.write("INSERT INTO public.anaesthetists (id, branch_id, full_name, specialization, created_at, updated_at) VALUES\n")
        items = list(unique_anaesthetists.items())
        for idx, (a_uuid, name) in enumerate(items):
            comma = ";" if idx == len(items) - 1 else ","
            out.write(f"  ('{a_uuid}', '{BRANCH_ID}', {sql_str(name)}, NULL, NOW(), NOW()){comma}\n")
        out.write("\nCOMMIT;\n")
    print(f"Created: {os.path.basename(ana_file)} with {len(unique_anaesthetists)} records.")

    # 6. Extract Assistants and generate SQL
    print("\n--- Extracting Assistants ---")
    asst_rows = extract_all_rows_robust(content, 'assistant')
    print(f"Found {len(asst_rows)} assistant rows in dump.")
    
    assistants_sql = []
    old_assistant_id_to_uuid = {}
    
    for row_str in asst_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        if len(cols) < 2: continue
        old_id = cols[0]
        name = clean_name(cols[1])
        if not name: continue
        
        # Deterministic UUID by name (deduplicated)
        norm_name = name.lower()
        a_uuid = get_entity_uuid("assistant", norm_name)
        old_assistant_id_to_uuid[old_id] = a_uuid
        
        # Role defaults to NULL
        assistants_sql.append((a_uuid, name))

    unique_assistants = {}
    for a_uuid, name in assistants_sql:
        if a_uuid not in unique_assistants:
            unique_assistants[a_uuid] = name

    # Clean up old split parts to prevent orphaned files
    import glob
    for p in glob.glob(os.path.join(OUTPUT_DIR, "import_step18_operation_reports_part*.sql")):
        try: os.remove(p)
        except: pass
    for p in glob.glob(os.path.join(OUTPUT_DIR, "import_step16_anaesthetists_part*.sql")):
        try: os.remove(p)
        except: pass
    for p in glob.glob(os.path.join(OUTPUT_DIR, "import_step17_assistants_part*.sql")):
        try: os.remove(p)
        except: pass

    asst_file = os.path.join(OUTPUT_DIR, "import_step17_assistants.sql")
    with open(asst_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        out.write("INSERT INTO public.assistants (id, branch_id, full_name, role, created_at, updated_at) VALUES\n")
        items = list(unique_assistants.items())
        for idx, (a_uuid, name) in enumerate(items):
            comma = ";" if idx == len(items) - 1 else ","
            out.write(f"  ('{a_uuid}', '{BRANCH_ID}', {sql_str(name)}, NULL, NOW(), NOW()){comma}\n")
        out.write("\nCOMMIT;\n")
    print(f"Created: {os.path.basename(asst_file)} with {len(unique_assistants)} records.")

    # Also write part 1 directly
    import shutil
    asst_part1 = os.path.join(OUTPUT_DIR, "import_step17_assistants_part1_assistants.sql")
    shutil.copyfile(asst_file, asst_part1)
    print(f"Created part 1 directly: {os.path.basename(asst_part1)}")

    # 7. Extract Operation Reports and generate SQL
    print("\n--- Extracting Operation Reports ---")
    op_rows = extract_all_rows_robust(content, 'operation')
    print(f"Found {len(op_rows)} operation rows in dump.")
    
    op_reports_sql = []
    
    for row_str in op_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 31: cols.append(None)
        
        old_id = cols[0]
        old_patient_id = cols[2]
        
        # Patient link
        patient_uuid = get_patient_uuid(old_patient_id)
        if not patient_uuid:
            # Skip operations for patients that are not imported
            continue
            
        # Surgeon link
        surgeon_uuid = DOCTOR_MEKI_UUID
        
        # Operation Date
        op_date = parse_datetime(cols[15] or cols[4] or cols[23]) # add_date_time, date timestamp, or datedone
        
        # Operation Name (Required NOT NULL)
        op_name_raw = clean_name(cols[29]) or clean_name(strip_html_tags(cols[13]))
        if not op_name_raw:
            op_name_raw = "Surgical Operation"
        
        # Description / report
        proc_desc = cols[14] # description
        findings = cols[6] or cols[25] # report or remarks
        
        # Lookup links
        old_hosp_id = clean_int_id(cols[16])
        hosp_uuid = old_hosp_id_to_uuid.get(old_hosp_id) if old_hosp_id else None
        
        old_anaesthetist_id = clean_int_id(cols[21])
        anaesthetist_uuid = old_anaesthetist_id_to_uuid.get(old_anaesthetist_id) if old_anaesthetist_id else None
        
        old_assistant_id = clean_int_id(cols[22])
        assistant_uuid = old_assistant_id_to_uuid.get(old_assistant_id) if old_assistant_id else None
        
        old_proc_id = clean_int_id(cols[28])
        procedure_uuid = old_proc_id_to_uuid.get(old_proc_id) if old_proc_id else None
        
        # Text fields
        hospital_name = cols[24]
        anaesthetist_name = clean_name(cols[26])
        
        assistant_name = clean_name(cols[27])
        if assistant_name == '0':
            assistant_name = None
            
        anaesthesia_type = cols[20] # craestiesia
        procedure_text = clean_name(strip_html_tags(cols[13])) or op_name_raw
        post_op_plan = cols[19] # operationplan
        
        # Follow up date and time
        follow_up_date = parse_only_date(cols[18]) # followupdate
        follow_up_time = parse_only_time(cols[17]) # followuptime
        
        # Array columns
        if anaesthetist_uuid:
            anaesthetist_ids_arr = f"ARRAY['{anaesthetist_uuid}'::uuid]"
        else:
            anaesthetist_ids_arr = "'{}'::uuid[]"
            
        if assistant_uuid:
            assistant_ids_arr = f"ARRAY['{assistant_uuid}'::uuid]"
        else:
            assistant_ids_arr = "'{}'::uuid[]"
            
        created_at = op_date
        
        # Generate random or deterministic UUID for operation_report
        op_report_uuid = str(uuid.uuid5(BASE_UUID, f"operation_report_old_id:{old_id}"))
        
        row_values = (
            f"('{op_report_uuid}', '{BRANCH_ID}', '{patient_uuid}', '{surgeon_uuid}', {op_date}, "
            f"{sql_str(op_name_raw)}, NULL, NULL, {sql_str(proc_desc)}, {sql_str(findings)}, "
            f"NULL, {created_at}, {sql_str(hosp_uuid)}, {sql_str(anaesthetist_uuid)}, {sql_str(assistant_uuid)}, "
            f"{sql_str(procedure_uuid)}, {sql_str(hospital_name)}, {sql_str(anaesthetist_name)}, {sql_str(assistant_name)}, "
            f"{sql_str(anaesthesia_type)}, {sql_str(procedure_text)}, {sql_str(post_op_plan)}, {follow_up_date}, "
            f"{follow_up_time}, {anaesthetist_ids_arr}, {assistant_ids_arr})"
        )
        
        op_reports_sql.append(row_values)

    op_report_file = os.path.join(OUTPUT_DIR, "import_step18_operation_reports.sql")
    with open(op_report_file, 'w', encoding='utf-8') as out:
        out.write("BEGIN;\n\n")
        for chunk in [op_reports_sql[i:i+100] for i in range(0, len(op_reports_sql), 100)]:
            out.write("INSERT INTO public.operation_reports (id, branch_id, patient_id, surgeon_id, operation_date, operation_name, pre_operative_diagnosis, post_operative_diagnosis, procedure_description, findings, complications, created_at, hospital_id, anaesthetist_id, assistant_id, procedure_id, hospital, anaesthetist, assistant, anaesthesia_type, procedure_text, post_op_plan, follow_up_date, follow_up_time, anaesthetist_ids, assistant_ids) VALUES\n")
            for j, val in enumerate(chunk):
                comma = ";" if j == len(chunk) - 1 else ","
                out.write(f"  {val}{comma}\n")
            out.write("\n")
        out.write("COMMIT;\n")
        
    print(f"Created operation reports SQL import at: {op_report_file} ({len(op_reports_sql)} records)")

    # Directly split into files
    chunk_size = 50
    part_num = 1

    for i in range(0, len(op_reports_sql), chunk_size):
        chunk = op_reports_sql[i:i+chunk_size]
        part_file = os.path.join(OUTPUT_DIR, f"import_step18_operation_reports_part{part_num}_operation_reports.sql")
        with open(part_file, 'w', encoding='utf-8') as pf:
            pf.write("BEGIN;\n\n")
            for subchunk in [chunk[k:k+100] for k in range(0, len(chunk), 100)]:
                pf.write("INSERT INTO public.operation_reports (id, branch_id, patient_id, surgeon_id, operation_date, operation_name, pre_operative_diagnosis, post_operative_diagnosis, procedure_description, findings, complications, created_at, hospital_id, anaesthetist_id, assistant_id, procedure_id, hospital, anaesthetist, assistant, anaesthesia_type, procedure_text, post_op_plan, follow_up_date, follow_up_time, anaesthetist_ids, assistant_ids) VALUES\n")
                for j, val in enumerate(subchunk):
                    comma = ";" if j == len(subchunk) - 1 else ","
                    pf.write(f"  {val}{comma}\n")
                pf.write("\n")
            pf.write("COMMIT;\n")
        print(f"  Created directly: {os.path.basename(part_file)} with {len(chunk)} records.")
        part_num += 1

if __name__ == '__main__':
    main()

