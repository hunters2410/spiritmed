"""
compare_and_sync_operations.py
------------------------------
Compares db5/operation (1).sql against the Supabase operation_reports table.
- Fetches all existing operation_report IDs from Supabase
- Parses all records from the SQL source file
- Identifies which records are MISSING in Supabase
- Upserts ONLY the missing records (safe - will NOT overwrite existing data)
"""

import os
import re
import json
import uuid
import html
import urllib.request
import urllib.error
from datetime import datetime

# ── Config ─────────────────────────────────────────────────────────────────────
SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

OPERATION_FILE   = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\db5\operation (1).sql"
BRANCH_ID        = "697a3863-1de7-4615-819c-45b0d7066d67"
DOCTOR_MEKI_UUID = "90a905bc-d22a-4db3-bd43-2c1c6bf488e0"
BASE_UUID        = uuid.uuid5(uuid.NAMESPACE_DNS, "urocare.co.zw")

DRY_RUN = False   # Set True to preview without inserting

# ── Helpers ────────────────────────────────────────────────────────────────────

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

def parse_iso_datetime(add_dt, date_str, raw_date):
    if add_dt and str(add_dt).strip() not in ('0', 'NULL', 'null', ''):
        raw = str(add_dt).strip()
        for fmt in ['%d-%m-%Y %H:%M:%S', '%d/%m/%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S']:
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

def parse_time(raw):
    if not raw or str(raw).strip() in ('0', 'NULL', 'null', ''):
        return None
    raw = str(raw).strip()
    for fmt in ['%I:%M %p', '%H:%M:%S', '%H:%M', '%I:%M%p']:
        try:
            return datetime.strptime(raw, fmt).strftime('%H:%M:%S')
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

def clean_person_or_place(val):
    if not val: return None
    v = clean_html(val)
    if not v or v in ('0', '-', 'NULL', 'null') or v.startswith('<div'): return None
    return v

def supabase_get(url):
    req = urllib.request.Request(
        url,
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8')), resp.headers

def fetch_existing_operation_ids():
    print("Fetching existing operation_report IDs from Supabase...")
    existing_ids = set()
    limit = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/operation_reports?select=id&limit={limit}&offset={offset}"
        data, _ = supabase_get(url)
        for row in data:
            existing_ids.add(row['id'])
        if len(data) < limit:
            break
        offset += limit
    print(f"  Found {len(existing_ids)} existing records in Supabase.")
    return existing_ids

def fetch_all_patients():
    print("Fetching patients from Supabase...")
    patients = []
    limit = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,full_name,phone,file_number&limit={limit}&offset={offset}"
        data, _ = supabase_get(url)
        patients.extend(data)
        if len(data) < limit:
            break
        offset += limit
    print(f"  Loaded {len(patients)} patients.")
    return patients

def create_patient_record(patient_name, phone, address, old_pid):
    pid = str(uuid.uuid5(BASE_UUID, f"patient_created_for_operation:{old_pid or patient_name}"))
    pnum = f"P{str(old_pid).zfill(4)}" if old_pid else f"MIG-{pid[:8]}"
    payload = json.dumps([{
        "id": pid, "branch_id": BRANCH_ID, "patient_number": pnum,
        "full_name": patient_name.strip(),
        "phone": phone if phone and phone != '0' else None,
        "address": address if address and address != '0' else None,
        "status": "active"
    }]).encode('utf-8')
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/patients", data=payload,
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
                 "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=representation"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"  Created missing patient: {patient_name} -> {pid}")
            return pid
    except urllib.error.HTTPError as e:
        print(f"  Error creating patient {patient_name}: {e.read().decode('utf-8')}")
        return pid

def main():
    print("=" * 60)
    print("OPERATION REPORTS: Compare & Sync")
    print(f"Source file: {OPERATION_FILE}")
    print(f"DRY RUN   : {DRY_RUN}")
    print("=" * 60)

    existing_ids = fetch_existing_operation_ids()

    db_patients = fetch_all_patients()
    by_pn, by_fn, by_exact, by_norm, by_fl, by_phone = {}, {}, {}, {}, {}, {}
    for p in db_patients:
        pid, pn, fn, name, phone = p['id'], p.get('patient_number'), p.get('file_number'), p.get('full_name'), p.get('phone')
        if pn: by_pn[str(pn).strip()] = pid
        if fn: by_fn[str(fn).strip()] = pid
        if name:
            by_exact[str(name).strip().lower()] = pid
            nn = normalize_name(name)
            if nn: by_norm[nn] = pid
            flk = first_last_key(name)
            if flk: by_fl[flk] = pid
        if phone:
            cp = clean_phone(phone)
            if cp: by_phone[cp] = pid

    print(f"\nParsing SQL file...")
    with open(OPERATION_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    rows = extract_all_rows_robust(content, 'operation')
    print(f"  Found {len(rows)} total operation rows in SQL file.")

    missing_records = []
    skipped = already_present = no_patient = 0

    print("Comparing records...")
    for r in rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 31: cols.append(None)

        old_op_id = cols[0]
        old_pid   = cols[2]
        raw_date  = cols[4]
        pname     = cols[8]
        pphone    = cols[9]
        paddr     = cols[10]
        date_str  = cols[12]
        proc_name = cols[13]
        desc      = cols[14]
        add_dt    = cols[15]
        hosp_raw  = cols[16]
        futime    = cols[17]
        fudate    = cols[18]
        op_plan   = cols[19]
        anaes_raw = cols[20]
        anaes_r2  = cols[21]
        asst_raw  = cols[22]
        datedone  = cols[23]
        hosp_name = cols[24]
        remarks   = cols[25]
        anaes_nm  = cols[26]
        asst_nm   = cols[27]
        op_proc   = cols[28]
        op_proc_nm = cols[29]

        if not pname or str(pname).strip() in ('0', 'NULL', 'null', ''):
            skipped += 1
            continue

        op_uuid = str(uuid.uuid5(BASE_UUID, f"operation_report_old_id:{old_op_id}"))

        if op_uuid in existing_ids:
            already_present += 1
            continue

        # Missing — resolve patient
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
            if not DRY_RUN:
                patient_uuid = create_patient_record(pname, pphone, paddr, old_pid)
                if patient_uuid:
                    by_exact[str(pname).strip().lower()] = patient_uuid
            else:
                patient_uuid = f"WOULD-CREATE-{pname}"

        if not patient_uuid:
            no_patient += 1
            print(f"  [SKIP] Old ID {old_op_id} ({pname}): patient not resolvable")
            continue

        created_at_iso, _ = parse_iso_datetime(add_dt, date_str, raw_date)
        op_name = clean_html(op_proc_nm or proc_name or op_proc or "Operation Report")

        op_obj = {
            "id": op_uuid,
            "branch_id": BRANCH_ID,
            "patient_id": patient_uuid,
            "surgeon_id": DOCTOR_MEKI_UUID,
            "operation_date": created_at_iso,
            "operation_name": op_name if op_name else "Operation Report",
            "procedure_text": clean_html(proc_name or op_proc_nm or op_proc or ""),
            "procedure_description": clean_html(desc or op_proc or ""),
            "post_op_plan": clean_html(op_plan),
            "hospital": clean_person_or_place(hosp_name) or clean_person_or_place(hosp_raw),
            "anaesthetist": clean_person_or_place(anaes_nm) or clean_person_or_place(anaes_r2),
            "assistant": clean_person_or_place(asst_nm) or clean_person_or_place(asst_raw),
            "anaesthesia_type": clean_person_or_place(anaes_raw),
            "follow_up_date": parse_date(fudate),
            "follow_up_time": parse_time(futime),
            "created_at": created_at_iso
        }
        missing_records.append((old_op_id, pname, op_obj))

    print("\n" + "=" * 60)
    print("COMPARISON RESULTS")
    print("=" * 60)
    print(f"  Total SQL rows parsed     : {len(rows)}")
    print(f"  Already in Supabase       : {already_present}")
    print(f"  Missing (to be inserted)  : {len(missing_records)}")
    print(f"  Skipped (no name/invalid) : {skipped}")
    print(f"  Skipped (no patient found): {no_patient}")

    if not missing_records:
        print("\n✅ All operation records are already in Supabase. Nothing to do!")
        return

    print(f"\nMissing records:")
    for old_id, pname, _ in missing_records:
        print(f"  Old ID {str(old_id):>4} | {pname}")

    if DRY_RUN:
        print(f"\n[DRY RUN] Set DRY_RUN=False to perform the actual insert.")
        return

    print(f"\nInserting {len(missing_records)} missing records...")
    batch_size = 50
    inserted_total = failed_total = 0
    ops_only = [obj for (_, _, obj) in missing_records]

    for i in range(0, len(ops_only), batch_size):
        batch = ops_only[i:i+batch_size]
        payload = json.dumps(batch).encode('utf-8')
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/operation_reports", data=payload,
            headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
                     "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as resp:
                inserted_total += len(batch)
                print(f"  Inserted batch {i//batch_size + 1}: {len(batch)} records ({inserted_total}/{len(ops_only)} total)")
        except urllib.error.HTTPError as e:
            print(f"  Batch error: {e.read().decode('utf-8')}")
            # Retry one-by-one to isolate bad records
            for single in batch:
                single_pl = json.dumps([single]).encode('utf-8')
                req2 = urllib.request.Request(
                    f"{SUPABASE_URL}/rest/v1/operation_reports", data=single_pl,
                    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
                             "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"},
                    method="POST"
                )
                try:
                    with urllib.request.urlopen(req2) as r2:
                        inserted_total += 1
                except urllib.error.HTTPError as e2:
                    failed_total += 1
                    print(f"    FAILED: {e2.read().decode('utf-8')[:200]}")

    print("\n" + "=" * 60)
    print("SYNC COMPLETE")
    print("=" * 60)
    print(f"  Inserted successfully : {inserted_total}")
    print(f"  Failed                : {failed_total}")
    print(f"  Pre-existing (safe)   : {already_present}")
    if failed_total == 0:
        print("\n✅ All missing operation records synced to Supabase!")
    else:
        print(f"\n⚠️  {failed_total} records failed. Review errors above.")

if __name__ == '__main__':
    main()
