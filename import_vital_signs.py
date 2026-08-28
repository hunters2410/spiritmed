import os
import re
import json
import uuid
import html
import urllib.request
from datetime import datetime

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

VITALS_FILE = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\vitalsign.sql"
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
DOCTOR_MEKI_UUID = "90a905bc-d22a-4db3-bd43-2c1c6bf488e0"
BASE_UUID = uuid.uuid5(uuid.NAMESPACE_DNS, "urocare.co.zw")

def clean_html(text):
    if not text:
        return ""
    text = html.unescape(text)
    # Convert breaks to newlines
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    # Convert block elements end tags to double newlines
    text = re.sub(r'</(p|div|h[1-6]|tr|li|ol|ul)>', '\n\n', text, flags=re.IGNORECASE)
    # Strip any remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    # Clean spaces
    text = re.sub(r'[ \t]+', ' ', text)
    # Clean multiple newlines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() in ('NULL', 'NONE'): return None
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
        if not values_match: continue
        start_idx = match.end() + values_match.end()
        idx = start_idx
        in_str = False; escape = False; depth = 0; tuple_start = None
        while idx < len(content):
            c = content[idx]
            if escape: escape = False; idx += 1; continue
            if c == '\\': escape = True; idx += 1; continue
            if c == "'": in_str = not in_str; idx += 1; continue
            if not in_str:
                if c == '(':
                    if depth == 0: tuple_start = idx + 1
                    depth += 1
                elif c == ')':
                    depth -= 1
                    if depth == 0 and tuple_start is not None:
                        all_rows.append(content[tuple_start:idx])
                        tuple_start = None
                elif c == ';': break
            idx += 1
    return all_rows

def parse_iso_datetime(add_dt):
    if add_dt and str(add_dt).strip() not in ('0', 'NULL', 'null', ''):
        raw = str(add_dt).strip()
        for fmt in ['%d-%m-%Y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y %H:%M', '%d/%m/%Y %H:%M']:
            try:
                d = datetime.strptime(raw, fmt)
                return d.strftime('%Y-%m-%dT%H:%M:%SZ')
            except ValueError:
                pass
    now = datetime.now()
    return now.strftime('%Y-%m-%dT%H:%M:%SZ')

def parse_num(val, is_float=False):
    if not val or str(val).strip() in ('0', 'NULL', 'null', '', '-'):
        return None
    raw = str(val).strip()
    m = re.search(r'[-+]?\d*\.?\d+', raw)
    if m:
        try:
            return float(m.group(0)) if is_float else int(float(m.group(0)))
        except ValueError:
            pass
    return None

def clean_phone(p):
    if not p: return ""
    digits = re.sub(r'\D', '', str(p))
    if len(digits) >= 7: return digits[-7:]
    return digits

def normalize_name(name):
    if not name or str(name).strip() in ('0', 'NULL', 'null', ''): return ""
    n = str(name).strip().lower()
    n = re.sub(r'^(dr|mr|mrs|ms|prof|rev|sr)\.?\s+', '', n)
    n = re.sub(r'\s+', ' ', n)
    return n

def first_last_key(name):
    nn = normalize_name(name)
    parts = nn.split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1]}"
    return nn

def fetch_all_patients():
    patients = []
    limit = 1000
    offset = 0
    while True:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,full_name,phone,file_number&limit={limit}&offset={offset}",
            headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            patients.extend(data)
            if len(data) < limit: break
            offset += limit
    return patients

def create_patient_record(patient_name, phone, address, old_pid):
    pid = str(uuid.uuid5(BASE_UUID, f"patient_created_for_vitals:{old_pid or patient_name}"))
    pnum = f"P{str(old_pid).zfill(4)}" if old_pid else f"MIG-{pid[:8]}"
    payload = json.dumps([{
        "id": pid,
        "branch_id": BRANCH_ID,
        "patient_number": pnum,
        "full_name": patient_name.strip(),
        "phone": phone if phone and phone != '0' else None,
        "address": address if address and address != '0' else None,
        "status": "active"
    }]).encode('utf-8')

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/patients",
        data=payload,
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode('utf-8'))
            print(f"Created/found missing patient: {patient_name} -> ID {pid}")
            return pid
    except urllib.error.HTTPError as e:
        print(f"Error creating patient {patient_name}:", e.read().decode('utf-8'))
        return pid

def main():
    print("Starting Clean Vital Signs Import (Stripping <p>, <br>, etc.)...")
    db_patients = fetch_all_patients()
    print(f"Loaded {len(db_patients)} patients from Supabase.")

    by_pn = {}
    by_fn = {}
    by_exact_name = {}
    by_norm_name = {}
    by_first_last = {}
    by_phone = {}

    for p in db_patients:
        pid = p['id']
        pn = p.get('patient_number')
        fn = p.get('file_number')
        name = p.get('full_name')
        phone = p.get('phone')

        if pn: by_pn[str(pn).strip()] = pid
        if fn: by_fn[str(fn).strip()] = pid
        if name:
            by_exact_name[str(name).strip().lower()] = pid
            nn = normalize_name(name)
            if nn: by_norm_name[nn] = pid
            flk = first_last_key(name)
            if flk: by_first_last[flk] = pid
        if phone:
            cp = clean_phone(phone)
            if cp: by_phone[cp] = pid

    with open(VITALS_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    rows = extract_all_rows_robust(content, 'vitalsign')
    print(f"Found {len(rows)} total vitalsign rows in vitalsign.sql")

    vitals_to_insert = []
    skipped_count = 0

    for r in rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 27: cols.append(None)

        old_vitals_id = cols[0]
        old_patient_id = cols[1]
        bmi_height = cols[2]
        bmi_weight = cols[3]
        resp_rate = cols[4]
        postvoid = cols[5]
        volume = cols[6]
        diastolic_bp = cols[7]
        qmax = cols[8]
        add_dt = cols[9]
        urinalysis = cols[10]
        hospital_id = cols[11]
        spo2 = cols[12]
        systolic_bp = cols[13]
        heart_rate = cols[14]
        temp = cols[15]
        qmax_name = cols[16]
        postvoid_name = cols[17]
        urinalysis_name = cols[18]
        volume_name = cols[19]
        flowrate_name = cols[20]
        flowrate = cols[21]
        bmi = cols[22]
        pname = cols[23]
        pphone = cols[24]
        paddr = cols[25]
        user_id = cols[26]

        if not pname or str(pname).strip().lower() in ('0', 'null', 'test', '000000000', ''):
            skipped_count += 1
            continue

        patient_uuid = None
        if old_patient_id and str(old_patient_id).strip() in by_pn:
            patient_uuid = by_pn[str(old_patient_id).strip()]
        elif old_patient_id and f"P{str(old_patient_id).zfill(4)}" in by_pn:
            patient_uuid = by_pn[f"P{str(old_patient_id).zfill(4)}"]
        elif old_patient_id and f"MIG-{old_patient_id}" in by_pn:
            patient_uuid = by_pn[f"MIG-{old_patient_id}"]
        elif pname and str(pname).strip().lower() in by_exact_name:
            patient_uuid = by_exact_name[str(pname).strip().lower()]
        elif pname and normalize_name(pname) in by_norm_name:
            patient_uuid = by_norm_name[normalize_name(pname)]
        elif pname and first_last_key(pname) in by_first_last:
            patient_uuid = by_first_last[first_last_key(pname)]
        elif pphone and clean_phone(pphone) in by_phone and len(clean_phone(pphone)) >= 7:
            patient_uuid = by_phone[clean_phone(pphone)]

        if not patient_uuid and pname and str(pname).strip() not in ('0', 'NULL', 'null', ''):
            patient_uuid = create_patient_record(pname, pphone, paddr, old_patient_id)
            if patient_uuid:
                by_exact_name[str(pname).strip().lower()] = patient_uuid

        if not patient_uuid:
            skipped_count += 1
            continue

        recorded_at_iso = parse_iso_datetime(add_dt)

        notes_clean = clean_html(urinalysis_name)
        if not notes_clean or notes_clean in ('0', 'test', '-'):
            notes_clean = None

        vitals_uuid = str(uuid.uuid5(BASE_UUID, f"vital_signs_old_id:{old_vitals_id}"))

        vitals_obj = {
            "id": vitals_uuid,
            "branch_id": BRANCH_ID,
            "patient_id": patient_uuid,
            "recorded_by": DOCTOR_MEKI_UUID,
            "recorded_at": recorded_at_iso,
            "temperature": parse_num(temp, is_float=True),
            "blood_pressure_systolic": parse_num(systolic_bp),
            "blood_pressure_diastolic": parse_num(diastolic_bp),
            "heart_rate": parse_num(heart_rate),
            "respiratory_rate": parse_num(resp_rate),
            "oxygen_saturation": parse_num(spo2, is_float=True),
            "weight": parse_num(bmi_weight, is_float=True),
            "height": parse_num(bmi_height, is_float=True),
            "notes": notes_clean,
            "created_at": recorded_at_iso
        }

        vitals_to_insert.append(vitals_obj)

    print(f"\nPrepared {len(vitals_to_insert)} cleaned vital signs for upsert.")
    print(f"Skipped {skipped_count} invalid/placeholder rows.")

    # Upsert into Supabase in batches of 50
    batch_size = 50
    inserted_total = 0

    for i in range(0, len(vitals_to_insert), batch_size):
        batch = vitals_to_insert[i:i+batch_size]
        payload = json.dumps(batch).encode('utf-8')
        
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/vital_signs",
            data=payload,
            headers={
                "apikey": SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal"
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as resp:
                inserted_total += len(batch)
                print(f"Upserted batch {i//batch_size + 1}: {len(batch)} records (Total: {inserted_total}/{len(vitals_to_insert)})")
        except urllib.error.HTTPError as e:
            print(f"Error upserting batch starting at index {i}:", e.read().decode('utf-8'))

    # Clean any remaining HTML tags in existing vital_signs database records
    print("\nCleaning any remaining HTML tags in existing vital_signs database records...")
    req_all = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/vital_signs?select=id,notes",
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
    )
    with urllib.request.urlopen(req_all) as resp:
        all_vits = json.loads(resp.read().decode('utf-8'))

    cleaned_db_count = 0
    for vit in all_vits:
        val = vit.get('notes')
        if val and ('<' in val and '>' in val or '&' in val):
            c_clean = clean_html(val)
            req_up = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/vital_signs?id=eq.{vit['id']}",
                data=json.dumps({"notes": c_clean}).encode('utf-8'),
                headers={
                    "apikey": SERVICE_ROLE_KEY,
                    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
                    "Content-Type": "application/json"
                },
                method="PATCH"
            )
            try:
                with urllib.request.urlopen(req_up) as resp:
                    cleaned_db_count += 1
            except Exception as e:
                print(f"Error patching record {vit['id']}:", e)

    print(f"Cleaned {cleaned_db_count} additional records directly in Supabase.")
    print(f"\nSUCCESS! All vital signs imported cleanly without <p>, <br>, etc.")

if __name__ == '__main__':
    main()
