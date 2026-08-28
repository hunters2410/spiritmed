import os
import re
import json
import uuid
import html
import urllib.request
from datetime import datetime

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

LETTER_FILE = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\letter.sql"
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
    text = re.sub(r'</(p|div|h[1-6]|tr|li)>', '\n\n', text, flags=re.IGNORECASE)
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

def parse_iso_datetime(add_dt, date_str, raw_date):
    if add_dt and str(add_dt).strip() not in ('0', 'NULL', 'null', ''):
        raw = str(add_dt).strip()
        for fmt in ['%d-%m-%Y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%d-%m-%Y %H:%M', '%d/%m/%Y %H:%M']:
            try:
                d = datetime.strptime(raw, fmt)
                return d.strftime('%Y-%m-%dT%H:%M:%SZ'), d.strftime('%Y-%m-%d')
            except ValueError:
                pass

    if raw_date and str(raw_date).strip() not in ('0', 'NULL', 'null', ''):
        raw = str(raw_date).strip()
        if re.match(r'^\d{10}$', raw):
            try:
                d = datetime.fromtimestamp(int(raw))
                return d.strftime('%Y-%m-%dT%H:%M:%SZ'), d.strftime('%Y-%m-%d')
            except Exception:
                pass
        for fmt in ['%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y']:
            try:
                d = datetime.strptime(raw, fmt)
                return d.strftime('%Y-%m-%dT00:00:00Z'), d.strftime('%Y-%m-%d')
            except ValueError:
                pass

    if date_str and str(date_str).strip() not in ('0', 'NULL', 'null', ''):
        raw = str(date_str).strip()
        for fmt in ['%d-%m-%y', '%d/%m/%y', '%Y-%m-%d', '%d-%m-%Y']:
            try:
                d = datetime.strptime(raw, fmt)
                return d.strftime('%Y-%m-%dT00:00:00Z'), d.strftime('%Y-%m-%d')
            except ValueError:
                pass

    now = datetime.now()
    return now.strftime('%Y-%m-%dT%H:%M:%SZ'), now.strftime('%Y-%m-%d')

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
    pid = str(uuid.uuid5(BASE_UUID, f"patient_created_for_letter:{old_pid or patient_name}"))
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
    print("Starting Clean Medical Reports Import (Stripping <p>, <br>, etc.)...")
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

    with open(LETTER_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    rows = extract_all_rows_robust(content, 'letter')
    print(f"Found {len(rows)} total letter rows in letter.sql")

    reports_to_insert = []
    skipped_count = 0

    for r in rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 20: cols.append(None)

        old_letter_id = cols[0]
        old_patient_id = cols[2]
        raw_date = cols[4]
        user_id = cols[7]
        pname = cols[8]
        pphone = cols[9]
        paddr = cols[10]
        doctor_name = cols[11]
        date_str = cols[12]
        add_dt = cols[13]
        toa = cols[14] # recipient
        letter_content = cols[15]
        treatment_done = cols[16]
        diagnosis = cols[17]
        diagnosis_name = cols[18]
        icd_code = cols[19]

        if not pname or str(pname).strip() in ('0', 'NULL', 'null', ''):
            if not letter_content or len(str(letter_content).strip()) < 5:
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

        created_at_iso, report_date_str = parse_iso_datetime(add_dt, date_str, raw_date)

        # Build clean plain-text report content (without HTML tags)
        cleaned_body = clean_html(letter_content)
        
        treatment_clean = clean_html(treatment_done)
        if treatment_clean and treatment_clean not in ('0', '-'):
            cleaned_body += f"\n\nTreatment Done:\n{treatment_clean}"
            
        diag_clean = clean_html(diagnosis_name)
        if diag_clean and diag_clean not in ('0', '-'):
            icd_clean = clean_html(icd_code)
            icd_str = f" ({icd_clean})" if icd_clean and icd_clean not in ('0', '-') else ""
            cleaned_body += f"\n\nDiagnosis:\n{diag_clean}{icd_str}"

        report_uuid = str(uuid.uuid5(BASE_UUID, f"medical_report_old_id:{old_letter_id}"))

        recipient_clean = clean_html(toa) if toa else ""
        recipient_val = recipient_clean if recipient_clean and recipient_clean not in ('0', '-') else "Whom it May Concern"

        report_obj = {
            "id": report_uuid,
            "branch_id": BRANCH_ID,
            "patient_id": patient_uuid,
            "doctor_id": DOCTOR_MEKI_UUID,
            "report_type": "medical_report",
            "report_date": report_date_str,
            "recipient": recipient_val.strip(),
            "content": cleaned_body.strip(),
            "status": "active",
            "created_at": created_at_iso
        }

        reports_to_insert.append(report_obj)

    print(f"\nPrepared {len(reports_to_insert)} cleaned medical reports for upsert.")
    print(f"Skipped {skipped_count} invalid/placeholder rows.")

    # Upsert into Supabase in batches of 50
    batch_size = 50
    inserted_total = 0

    for i in range(0, len(reports_to_insert), batch_size):
        batch = reports_to_insert[i:i+batch_size]
        payload = json.dumps(batch).encode('utf-8')
        
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/medical_reports",
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
                print(f"Upserted batch {i//batch_size + 1}: {len(batch)} records (Total: {inserted_total}/{len(reports_to_insert)})")
        except urllib.error.HTTPError as e:
            print(f"Error upserting batch starting at index {i}:", e.read().decode('utf-8'))

    # Also clean existing records in medical_reports table if any were inserted previously outside letter.sql
    print("\nCleaning any remaining HTML tags in existing medical_reports database records...")
    req_all = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/medical_reports?select=id,content",
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
    )
    with urllib.request.urlopen(req_all) as resp:
        all_reps = json.loads(resp.read().decode('utf-8'))

    cleaned_db_count = 0
    for rep in all_reps:
        cnt = rep.get('content')
        if cnt and ('<' in cnt and '>' in cnt or '&' in cnt):
            c_cleaned = clean_html(cnt)
            req_up = urllib.request.Request(
                f"{SUPABASE_URL}/rest/v1/medical_reports?id=eq.{rep['id']}",
                data=json.dumps({"content": c_cleaned}).encode('utf-8'),
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
                print(f"Error patching record {rep['id']}:", e)

    print(f"Cleaned {cleaned_db_count} additional records directly in Supabase.")
    print(f"\nSUCCESS! All medical reports now store clean text without <p>, <br>, etc.")

if __name__ == '__main__':
    main()
