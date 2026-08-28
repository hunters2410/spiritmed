"""
compare_and_sync_admissions.py
-------------------------------
Compares db5/admission (2).sql against the Supabase admission_forms table.
- Fetches all existing admission_form IDs from Supabase (deterministic UUIDs)
- Parses all records from the SQL source file
- Identifies which records are MISSING in Supabase
- Upserts ONLY the missing records safely (existing data is NEVER touched)
"""

import re
import json
import uuid
import html
import urllib.request
import urllib.error
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────────────────
SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

ADMISSION_FILE   = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\db5\admission (2).sql"
BRANCH_ID        = "697a3863-1de7-4615-819c-45b0d7066d67"
DOCTOR_MEKI_UUID = "90a905bc-d22a-4db3-bd43-2c1c6bf488e0"
BASE_UUID        = uuid.uuid5(uuid.NAMESPACE_DNS, "urocare.co.zw")

# ── Text helpers ────────────────────────────────────────────────────────────────

def clean_html(text):
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</(p|div|h[1-6]|tr|li|ol|ul)>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'[ \t]+', ' ', text)
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

# ── Date / time parsers ─────────────────────────────────────────────────────────

def parse_iso_datetime(add_dt, date_str, raw_date):
    for val in [add_dt, raw_date, date_str]:
        if not val or str(val).strip() in ('0', 'NULL', 'null', ''):
            continue
        raw = str(val).strip()
        # Unix timestamp
        if re.match(r'^\d{10}$', raw):
            try:
                d = datetime.fromtimestamp(int(raw))
                return d.strftime('%Y-%m-%dT%H:%M:%SZ'), d.strftime('%Y-%m-%d')
            except Exception:
                pass
        for fmt in ['%d-%m-%Y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S',
                    '%d-%m-%Y %H:%M', '%d/%m/%Y %H:%M',
                    '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y',
                    '%d-%m-%y', '%d/%m/%y']:
            try:
                d = datetime.strptime(raw, fmt)
                return d.strftime('%Y-%m-%dT%H:%M:%SZ'), d.strftime('%Y-%m-%d')
            except ValueError:
                pass
    now = datetime.now()
    return now.strftime('%Y-%m-%dT%H:%M:%SZ'), now.strftime('%Y-%m-%d')

def parse_date(raw):
    if not raw or str(raw).strip() in ('0', 'NULL', 'null', ''):
        return None
    raw = str(raw).strip()
    for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%m-%y']:
        try:
            return datetime.strptime(raw, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None

def parse_dob(raw):
    if not raw or str(raw).strip() in ('0', 'NULL', 'null', ''):
        return None
    raw = str(raw).strip()
    for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d/%m/%y']:
        try:
            return datetime.strptime(raw, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None

# ── Patient lookup helpers ──────────────────────────────────────────────────────

def clean_phone(p):
    if not p: return ""
    digits = re.sub(r'\D', '', str(p))
    return digits[-7:] if len(digits) >= 7 else digits

def normalize_name(name):
    if not name or str(name).strip() in ('0', 'NULL', 'null', ''): return ""
    n = str(name).strip().lower()
    n = re.sub(r'^(dr|mr|mrs|ms|prof|rev|sr)\.?\s+', '', n)
    return re.sub(r'\s+', ' ', n)

def first_last_key(name):
    nn = normalize_name(name)
    parts = nn.split()
    return f"{parts[0]} {parts[-1]}" if len(parts) >= 2 else nn

# ── Supabase helpers ────────────────────────────────────────────────────────────

def supabase_get(url):
    req = urllib.request.Request(
        url,
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def supabase_post(endpoint, payload_list, prefer="resolution=merge-duplicates,return=minimal"):
    data = json.dumps(payload_list).encode('utf-8')
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{endpoint}",
        data=data,
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": prefer
        },
        method="POST"
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status

def fetch_existing_admission_ids():
    print("Fetching existing admission_forms IDs from Supabase...")
    existing = set()
    limit, offset = 1000, 0
    while True:
        data = supabase_get(
            f"{SUPABASE_URL}/rest/v1/admission_forms?select=id&limit={limit}&offset={offset}"
        )
        for row in data:
            existing.add(row['id'])
        if len(data) < limit:
            break
        offset += limit
    print(f"  Found {len(existing)} existing records in Supabase.")
    return existing

def fetch_all_patients():
    print("Fetching patients from Supabase...")
    patients = []
    limit, offset = 1000, 0
    while True:
        data = supabase_get(
            f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,full_name,phone,file_number&limit={limit}&offset={offset}"
        )
        patients.extend(data)
        if len(data) < limit:
            break
        offset += limit
    print(f"  Loaded {len(patients)} patients.")
    return patients

def create_patient_record(pname, pphone, paddr, old_pid, dob, sex):
    pid = str(uuid.uuid5(BASE_UUID, f"patient_created_for_admission:{old_pid or pname}"))
    pnum = f"P{str(old_pid).zfill(4)}" if old_pid else f"MIG-{pid[:8]}"
    payload = [{
        "id": pid, "branch_id": BRANCH_ID, "patient_number": pnum,
        "full_name": pname.strip(),
        "phone": pphone if pphone and pphone != '0' else None,
        "address": paddr if paddr and paddr != '0' else None,
        "date_of_birth": parse_dob(dob),
        "gender": sex if sex and sex.strip() not in ('0', 'NULL', 'null', '') else "Male",
        "status": "active"
    }]
    try:
        supabase_post("patients", payload, "resolution=merge-duplicates,return=representation")
        print(f"  Created missing patient: {pname} -> {pid}")
        return pid
    except urllib.error.HTTPError as e:
        print(f"  Error creating patient {pname}: {e.read().decode('utf-8')}")
        return pid

# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    print("=" * 62)
    print("ADMISSION FORMS: Compare & Sync")
    print(f"Source: {ADMISSION_FILE}")
    print("=" * 62)

    # Step 1: Get existing IDs
    existing_ids = fetch_existing_admission_ids()

    # Step 2: Patient lookup maps
    db_patients = fetch_all_patients()
    by_pn, by_fn, by_exact, by_norm, by_fl, by_phone = {}, {}, {}, {}, {}, {}
    for p in db_patients:
        pid  = p['id']
        pn   = p.get('patient_number')
        fn   = p.get('file_number')
        name = p.get('full_name')
        phone= p.get('phone')
        if pn:   by_pn[str(pn).strip()] = pid
        if fn:   by_fn[str(fn).strip()] = pid
        if name:
            by_exact[str(name).strip().lower()] = pid
            nn = normalize_name(name)
            if nn: by_norm[nn] = pid
            flk = first_last_key(name)
            if flk: by_fl[flk] = pid
        if phone:
            cp = clean_phone(phone)
            if cp: by_phone[cp] = pid

    # Step 3: Parse SQL file
    print(f"\nParsing SQL file...")
    with open(ADMISSION_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    rows = extract_all_rows_robust(content, 'admission')
    print(f"  Found {len(rows)} total admission rows in SQL file.")

    # Step 4: Compare
    missing_records = []
    skipped = already_present = no_patient = 0

    print("Comparing records...")
    for r in rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 49: cols.append(None)

        old_adm_id   = cols[0]
        old_pid      = cols[2]
        raw_date     = cols[4]
        hospital_raw = cols[6]
        pname        = cols[8]
        pphone       = cols[9]
        paddr        = cols[10]
        date_str     = cols[12]
        add_dt       = cols[13]
        datedone     = cols[14]
        blood_raw    = cols[15]
        imaging_raw  = cols[16]
        npo_raw      = cols[17]
        datedone2    = cols[18]
        iv_raw       = cols[19]
        med_raw      = cols[20]
        other1_raw   = cols[21]
        datedone1    = cols[24]
        pdob         = cols[25]
        psex         = cols[26]
        diag_name    = cols[27]
        op_proc_name = cols[28]
        hosp_name    = cols[30]
        ctscan       = cols[32] if len(cols) > 32 else None
        uss          = cols[33] if len(cols) > 33 else None
        xray         = cols[34] if len(cols) > 34 else None
        cxr          = cols[35] if len(cols) > 35 else None
        inr          = cols[36] if len(cols) > 36 else None
        psa          = cols[37] if len(cols) > 37 else None
        camp         = cols[38] if len(cols) > 38 else None
        lfts         = cols[39] if len(cols) > 39 else None
        ue           = cols[40] if len(cols) > 40 else None
        fbc          = cols[41] if len(cols) > 41 else None
        ecg          = cols[42] if len(cols) > 42 else None
        echo         = cols[43] if len(cols) > 43 else None
        blood_extra  = cols[44] if len(cols) > 44 else None
        img_extra    = cols[45] if len(cols) > 45 else None
        othertest    = cols[46] if len(cols) > 46 else None
        other_raw    = cols[47] if len(cols) > 47 else None
        other_name   = cols[48] if len(cols) > 48 else None

        # Skip test / blank rows
        if not pname or str(pname).strip().lower() in ('0', 'null', 'test patient', 'test', ''):
            skipped += 1
            continue

        # Deterministic UUID — same formula as import_admission_forms.py
        adm_uuid = str(uuid.uuid5(BASE_UUID, f"admission_form_old_id:{old_adm_id}"))

        if adm_uuid in existing_ids:
            already_present += 1
            continue

        # Record is MISSING — resolve patient
        patient_uuid = None
        if old_pid and str(old_pid).strip() in by_pn:
            patient_uuid = by_pn[str(old_pid).strip()]
        elif old_pid and f"P{str(old_pid).zfill(4)}" in by_pn:
            patient_uuid = by_pn[f"P{str(old_pid).zfill(4)}"]
        elif old_pid and f"MIG-{old_pid}" in by_pn:
            patient_uuid = by_pn[f"MIG-{old_pid}"]
        elif pname and str(pname).strip().lower() in by_exact:
            patient_uuid = by_exact[str(pname).strip().lower()]
        elif pname and normalize_name(pname) in by_norm:
            patient_uuid = by_norm[normalize_name(pname)]
        elif pname and first_last_key(pname) in by_fl:
            patient_uuid = by_fl[first_last_key(pname)]
        elif pphone and clean_phone(pphone) in by_phone and len(clean_phone(pphone)) >= 7:
            patient_uuid = by_phone[clean_phone(pphone)]

        if not patient_uuid:
            patient_uuid = create_patient_record(pname, pphone, paddr, old_pid, pdob, psex)
            if patient_uuid:
                by_exact[str(pname).strip().lower()] = patient_uuid

        if not patient_uuid:
            no_patient += 1
            print(f"  [SKIP] Old ID {old_adm_id} ({pname}): patient not resolvable")
            continue

        # Build structured fields
        created_at_iso, _ = parse_iso_datetime(add_dt, date_str, raw_date)
        proc_date = parse_date(datedone1) or parse_date(datedone) or parse_date(datedone2)

        # Plan bloods
        bloods = []
        if blood_raw and blood_raw.strip() not in ('Select', '0', 'NULL', 'null', ''):
            bloods.append(blood_raw.strip())
        for val, label in [(fbc,"FBC"),(ue,"U&E"),(lfts,"LFTs"),(psa,"PSA"),
                           (inr,"INR"),(camp,"CAMP"),(blood_extra,"Blood Crossmatch")]:
            if val and str(val).strip() not in ('0','NULL','null','','Select') and label not in bloods:
                bloods.append(label)

        # Plan imaging
        imaging = []
        if imaging_raw and imaging_raw.strip() not in ('Select', '0', 'NULL', 'null', ''):
            imaging.append(imaging_raw.strip())
        for val, label in [(ctscan,"CT Scan"),(uss,"USS"),(xray,"X-Ray"),(cxr,"CXR"),
                           (ecg,"ECG"),(echo,"Echo"),(img_extra,"Imaging")]:
            if val and str(val).strip() not in ('0','NULL','null','','Select') and label not in imaging:
                imaging.append(label)

        clean_hosp = clean_html(hosp_name) or clean_html(hospital_raw)
        hospital_val = clean_hosp if clean_hosp and clean_hosp not in ('0','-','1','2','3','4') else "Avenues Hospital"

        proc_text  = clean_html(op_proc_name)
        clean_iv   = clean_html(iv_raw)
        clean_med  = clean_html(med_raw)
        clean_oth1 = clean_html(other1_raw)
        clean_oth  = clean_html(other_raw) or clean_html(other_name)
        clean_otest= clean_html(othertest)
        npo_val    = npo_raw.strip() if npo_raw and npo_raw.strip() in ('YES','NO','NPO','Oral') else "YES"

        adm_obj = {
            "id": adm_uuid,
            "branch_id": BRANCH_ID,
            "patient_id": patient_uuid,
            "doctor_id": DOCTOR_MEKI_UUID,
            "hospital": hospital_val,
            "admission_date": created_at_iso,
            "procedure_text": proc_text if proc_text else None,
            "procedure_date": proc_date,
            "plan_bloods": bloods,
            "plan_imaging": imaging,
            "plan_other": clean_otest if clean_otest else None,
            "npo_oral": npo_val,
            "iv_fluids": clean_iv if clean_iv and clean_iv not in ('nil','NIL','0','-') else None,
            "medication": clean_med if clean_med and clean_med not in ('nil','NIL','0','-') else None,
            "other": (clean_oth or clean_oth1) if (clean_oth or clean_oth1) and (clean_oth or clean_oth1) not in ('nil','NIL','0','-') else None,
            "created_at": created_at_iso
        }
        missing_records.append((old_adm_id, pname, adm_obj))

    # Step 5: Report
    print("\n" + "=" * 62)
    print("COMPARISON RESULTS")
    print("=" * 62)
    print(f"  Total SQL rows parsed     : {len(rows)}")
    print(f"  Already in Supabase       : {already_present}")
    print(f"  Missing (to be inserted)  : {len(missing_records)}")
    print(f"  Skipped (test/no name)    : {skipped}")
    print(f"  Skipped (no patient)      : {no_patient}")

    if not missing_records:
        print("\nAll admission records are already in Supabase. Nothing to do!")
        return

    print(f"\nMissing records:")
    for old_id, pname, _ in missing_records:
        print(f"  Old ID {str(old_id):>4} | {pname}")

    # Step 6: Insert missing in batches
    print(f"\nInserting {len(missing_records)} missing records into Supabase...")
    batch_size = 50
    inserted_total = failed_total = 0
    ops_only = [obj for (_, _, obj) in missing_records]

    for i in range(0, len(ops_only), batch_size):
        batch = ops_only[i:i+batch_size]
        try:
            supabase_post("admission_forms", batch)
            inserted_total += len(batch)
            print(f"  Inserted batch {i//batch_size + 1}: {len(batch)} records ({inserted_total}/{len(ops_only)} total)")
        except urllib.error.HTTPError as e:
            print(f"  Batch error: {e.read().decode('utf-8')}")
            # Retry one-by-one
            for single in batch:
                try:
                    supabase_post("admission_forms", [single])
                    inserted_total += 1
                except urllib.error.HTTPError as e2:
                    failed_total += 1
                    print(f"    FAILED single (old_id approx {i}): {e2.read().decode('utf-8')[:200]}")

    print("\n" + "=" * 62)
    print("SYNC COMPLETE")
    print("=" * 62)
    print(f"  Inserted successfully : {inserted_total}")
    print(f"  Failed                : {failed_total}")
    print(f"  Pre-existing (safe)   : {already_present}")
    if failed_total == 0:
        print("\nAll missing admission records synced to Supabase successfully!")
    else:
        print(f"\n{failed_total} records failed. Review errors above.")

if __name__ == '__main__':
    main()
