import requests
import json
import os
import re
from datetime import datetime

# ─── CONFIGURATION ──────────────────────────────────────────────────────────
SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
FALLBACK_PATIENT_UUID = "00000000-0000-4000-a000-000000000099"

BASE_DIR = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database"
PAYMENT_CAT_SQL = os.path.join(BASE_DIR, "payment_category.sql")
PAYMENT_DUMP_SQL = os.path.join(BASE_DIR, "payment (8).sql")
PATIENTS_IMPORT_SQL = os.path.join(BASE_DIR, "import_step3_patients.sql")
OLD_PATIENT_SQL = os.path.join(BASE_DIR, "patient (3).sql")

# Read Service Role Key from .env
SERVICE_ROLE_KEY = ""
if os.path.exists(".env"):
    with open(".env", "r") as f:
        for line in f:
            if "SUPABASE_SERVICE_ROLE_KEY" in line:
                SERVICE_ROLE_KEY = line.split("=")[1].strip()

if not SERVICE_ROLE_KEY:
    raise ValueError("SUPABASE_SERVICE_ROLE_KEY not found in .env!")

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    v = v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\r', '\r').replace('\\\\', '\\')
    return v

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            current += c
            if i + 1 < len(row_str): current += row_str[i+1]; i += 2
            else: i += 1
            continue
        elif c == "'" and not in_q: in_q = True; current += c
        elif c == "'" and in_q:
            if i + 1 < len(row_str) and row_str[i+1] == "'": current += "''"; i += 2; continue
            in_q = False; current += c
        elif c == ',' and not in_q: values.append(current.strip()); current = ''
        else: current += c
        i += 1
    if current.strip(): values.append(current.strip())
    return values

def extract_tuples(sql_content, table_name):
    inserts = [m.start() for m in re.finditer(rf'INSERT INTO `{table_name}`', sql_content, re.IGNORECASE)]
    rows = []
    for start_idx in inserts:
        values_idx = sql_content.find("VALUES", start_idx)
        if values_idx != -1:
            end_semicolon = sql_content.find(";\n", values_idx)
            if end_semicolon == -1: end_semicolon = sql_content.find(";", values_idx)
            block = sql_content[values_idx + 6:end_semicolon]
            depth, s = 0, None
            for i, ch in enumerate(block):
                if ch == '(':
                    if depth == 0: s = i + 1
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0 and s is not None:
                        rows.append(block[s:i])
                        s = None
    return rows

def fetch_all_patients():
    patients = []
    offset = 0
    limit = 1000
    while True:
        h = {
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Range": f"{offset}-{offset+limit-1}"
        }
        res = requests.get(f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,full_name", headers=h)
        if res.status_code in (200, 206):
            data = res.json()
            if not data:
                break
            patients.extend(data)
            if len(data) < limit:
                break
            offset += limit
        else:
            print(f"[ERROR] Failed fetching patients offset {offset}: HTTP {res.status_code} {res.text}")
            break
    return patients

def post_batch(table_name, items, batch_size=500):
    total = len(items)
    print(f"Uploading {total} records to 'public.{table_name}'...")
    uploaded = 0
    for i in range(0, total, batch_size):
        chunk = items[i:i+batch_size]
        res = requests.post(f"{SUPABASE_URL}/rest/v1/{table_name}", headers=HEADERS, json=chunk)
        if res.status_code in (200, 201, 204):
            uploaded += len(chunk)
            print(f"  [{table_name}] Progress: {uploaded}/{total} uploaded successfully.")
        else:
            print(f"  [ERROR] Uploading to {table_name}: HTTP {res.status_code} - {res.text[:300]}")
            # If batch fails due to single row conflict, try row by row
            print(f"  Retrying batch of {len(chunk)} row-by-row...")
            row_success = 0
            for row in chunk:
                r_res = requests.post(f"{SUPABASE_URL}/rest/v1/{table_name}", headers=HEADERS, json=[row])
                if r_res.status_code in (200, 201, 204):
                    row_success += 1
                else:
                    print(f"    [ROW ERROR] {r_res.status_code} - {r_res.text[:200]}")
            uploaded += row_success
            print(f"  [{table_name}] Row-by-row uploaded {row_success}/{len(chunk)}")

    print(f"[SUCCESS] Finished uploading {table_name} ({uploaded}/{total} rows).\n")

def run_import():
    import uuid

    print("==========================================================")
    print("STARTING DIRECT SUPABASE MIGRATION IMPORT")
    print("==========================================================\n")

    # ─── 0. FETCH EXISTING PATIENTS FROM SUPABASE ────────────────────────────
    print("Fetching ALL existing patients from Supabase...")
    existing_patients = fetch_all_patients()
    print(f"Fetched {len(existing_patients)} existing patients from Supabase.")

    patient_pn_map = {}
    patient_name_map = {}

    for p in existing_patients:
        p_id = p['id']
        pn = p.get('patient_number')
        fn = p.get('full_name')
        if pn:
            patient_pn_map[str(pn)] = p_id
        if fn:
            cn = " ".join(fn.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').split())
            patient_name_map[cn] = p_id

    # Also check old_id mapping from patient (3).sql
    old_id_to_pn = {}
    if os.path.exists(OLD_PATIENT_SQL):
        with open(OLD_PATIENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
            old_p_content = f.read()
        old_rows = extract_tuples(old_p_content, 'patient')
        for r in old_rows:
            cols = [unquote(v) for v in split_values(r)]
            while len(cols) < 53: cols.append(None)
            oid = cols[0]
            pid = cols[12]
            pn = str(pid).strip() if (pid and str(pid).strip() not in ('', 'NULL', 'null', '0')) else f"P{str(oid).zfill(4)}"
            if oid: old_id_to_pn[str(oid)] = pn

    # ─── 1. UPLOAD PAYMENT PROCEDURES ────────────────────────────────────────
    print("Preparing 166 Payment Procedures from payment_category.sql...")
    with open(PAYMENT_CAT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        cat_content = f.read()
    cat_rows = extract_tuples(cat_content, 'payment_category')

    proc_items = []
    seen_proc_ids = set()
    for r in cat_rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 8: cols.append(None)
        cat_id = cols[0]
        name = cols[1] or 'Unspecified Procedure'
        try: price = float(cols[3] or 0)
        except: price = 0.0
        cat_type = cols[4] or 'general'
        code = cols[7] or str(cat_id)
        proc_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.procedure.{code}"))

        if proc_uuid not in seen_proc_ids:
            seen_proc_ids.add(proc_uuid)
            proc_items.append({
                "id": proc_uuid,
                "branch_id": BRANCH_ID,
                "code": str(code),
                "name": str(name),
                "price": price,
                "category": str(cat_type)
            })

    post_batch("payment_procedures", proc_items)

    # ─── 2. UPLOAD FALLBACK PATIENT RECORD ──────────────────────────────────
    fallback_patient = [{
        "id": FALLBACK_PATIENT_UUID,
        "branch_id": BRANCH_ID,
        "patient_number": "MIG-UNLINKED",
        "full_name": "Unlinked Legacy Patient",
        "file_number": "LEGACY-00",
        "status": "active"
    }]
    print("Ensuring fallback patient record exists...")
    res = requests.post(f"{SUPABASE_URL}/rest/v1/patients", headers=HEADERS, json=fallback_patient)
    if res.status_code in (200, 201, 204):
        print("Fallback patient created/verified.\n")
    else:
        print(f"Note on fallback patient: {res.status_code} - {res.text[:200]}\n")

    # ─── 3. PARSE PAYMENTS (payment (8).sql) FOR BILLS, ITEMS, PAYMENTS ─────
    print(f"Parsing {PAYMENT_DUMP_SQL}...")
    with open(PAYMENT_DUMP_SQL, 'r', encoding='utf-8', errors='replace') as f:
        pay_content = f.read()
    pay_rows = extract_tuples(pay_content, 'payment')

    bills_items = []
    line_items = []
    payment_items = []

    patient_dues = {} # patient_uuid -> sum(balance)

    def safe_float(v):
        if not v: return 0.0
        try: return float(str(v).strip().replace(',', ''))
        except: return 0.0

    def parse_date(raw, date_str_raw=None):
        if raw and str(raw).strip().isdigit() and len(str(raw).strip()) == 10:
            try:
                d = datetime.fromtimestamp(int(raw))
                if 1990 <= d.year <= 2030: return d.strftime('%Y-%m-%d %H:%M:%S+00')
            except: pass
        if date_str_raw and str(date_str_raw).strip() not in ('', 'NULL', 'null'):
            ds = str(date_str_raw).strip()
            for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y']:
                try:
                    d = datetime.strptime(ds, fmt)
                    if 1990 <= d.year <= 2030: return d.strftime('%Y-%m-%d 00:00:00+00')
                except: pass
        return datetime.now().strftime('%Y-%m-%d %H:%M:%S+00')

    def normalize_method(dep_type):
        if not dep_type: return 'cash'
        dt = str(dep_type).strip().lower()
        if 'card' in dt or 'swipe' in dt: return 'card'
        if 'bank' in dt or 'transfer' in dt or 'rtgs' in dt or 'ecocash' in dt: return 'bank_transfer'
        if 'med' in dt or 'cimas' in dt or 'psmas' in dt: return 'medical_aid'
        return 'cash'

    for r in pay_rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 30: cols.append(None)

        old_pay_id = cols[0]
        pay_patient_ref = cols[2]
        date_raw = cols[4]
        gross = safe_float(cols[11] or cols[5] or 0)
        tax = safe_float(cols[6] or 0)
        discount = safe_float(cols[9] or 0)
        category_name = cols[16]
        paid = safe_float(cols[17] or 0)
        deposit_type = cols[18] or 'Cash'
        patient_name = cols[21]
        doctor_name = cols[24]
        date_str = cols[25]
        remarks = cols[12] or cols[28] or ''

        balance = max(0.0, gross - paid - discount)
        status = 'paid' if (balance <= 0 and paid > 0) else ('partially_paid' if paid > 0 else 'unpaid')

        # Resolve patient UUID
        patient_uuid = None
        if pay_patient_ref:
            pn = old_id_to_pn.get(str(pay_patient_ref)) or str(pay_patient_ref)
            patient_uuid = patient_pn_map.get(pn)

        if not patient_uuid and patient_name:
            cn = " ".join(patient_name.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').split())
            patient_uuid = patient_name_map.get(cn)

        if not patient_uuid:
            patient_uuid = FALLBACK_PATIENT_UUID

        # Accumulate patient dues
        if balance > 0:
            patient_dues[patient_uuid] = patient_dues.get(patient_uuid, 0.0) + balance

        inv_date = parse_date(date_raw, date_str)
        method = normalize_method(deposit_type)
        bill_num = f"BILL-{str(old_pay_id).zfill(6)}"
        pay_num = f"PAY-{str(old_pay_id).zfill(6)}"
        bill_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill.{old_pay_id}"))

        note_combined = []
        if remarks: note_combined.append(str(remarks).strip())
        if doctor_name: note_combined.append(f"Doctor: {doctor_name}")
        notes_text = " | ".join(note_combined) if note_combined else None

        # Bill Item
        bills_items.append({
            "id": bill_uuid,
            "branch_id": BRANCH_ID,
            "patient_id": patient_uuid,
            "bill_number": bill_num,
            "invoice_date": inv_date,
            "due_date": inv_date,
            "subtotal": gross,
            "tax_amount": tax,
            "total_amount": gross,
            "status": status,
            "notes": notes_text,
            "bill_date": inv_date[:10],
            "paid_amount": paid,
            "balance": balance,
            "discount_amount": discount,
            "payment_method": method
        })

        # Bill Line Items
        if category_name and str(category_name).strip():
            raw_items = str(category_name).strip().split(',')
            for item_idx, raw_item in enumerate(raw_items):
                parts = raw_item.strip().split('*')
                code_i = parts[0].strip() if len(parts) > 0 else 'PROC'
                price_i = safe_float(parts[1]) if len(parts) > 1 else gross
                desc_i = parts[2].strip() if len(parts) > 2 else 'Medical Service'
                qty_i = safe_float(parts[3]) if len(parts) > 3 else 1.0
                if qty_i <= 0: qty_i = 1.0
                tot_i = price_i * qty_i

                item_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill_item.{old_pay_id}.{item_idx}"))
                line_items.append({
                    "id": item_uuid,
                    "bill_id": bill_uuid,
                    "code": str(code_i),
                    "description": str(desc_i),
                    "quantity": qty_i,
                    "unit_price": price_i,
                    "total_price": tot_i,
                    "created_at": inv_date
                })
        else:
            item_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill_item.{old_pay_id}.0"))
            line_items.append({
                "id": item_uuid,
                "bill_id": bill_uuid,
                "code": "MISC",
                "description": "Medical Consultation / Service",
                "quantity": 1.0,
                "unit_price": gross,
                "total_price": gross,
                "created_at": inv_date
            })

        # Payment Item
        if paid > 0:
            payment_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.payment.{old_pay_id}"))
            pay_notes = f"Payment method: {deposit_type}"
            if notes_text: pay_notes += f" | {notes_text}"
            payment_items.append({
                "id": payment_uuid,
                "branch_id": BRANCH_ID,
                "bill_id": bill_uuid,
                "patient_id": patient_uuid,
                "payment_date": inv_date,
                "amount": paid,
                "payment_method": method,
                "reference_number": pay_num,
                "notes": pay_notes,
                "created_at": inv_date
            })

    # Upload Bills
    post_batch("bills", bills_items)

    # Upload Bill Line Items
    post_batch("bill_items", line_items)

    # Upload Payments
    post_batch("payments", payment_items)

    # ─── 4. UPDATE PATIENT DUES (outstanding_balance) ────────────────────────
    print(f"Updating outstanding_balance for {len(patient_dues)} patients with outstanding dues...")
    patch_headers = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

    updated_patients = 0
    for p_id, due_amt in patient_dues.items():
        res = requests.patch(
            f"{SUPABASE_URL}/rest/v1/patients?id=eq.{p_id}",
            headers=patch_headers,
            json={"outstanding_balance": round(due_amt, 2)}
        )
        if res.status_code in (200, 204):
            updated_patients += 1
            if updated_patients % 200 == 0 or updated_patients == len(patient_dues):
                print(f"  [patients.outstanding_balance] Updated {updated_patients}/{len(patient_dues)} patients...")
        else:
            print(f"  Note updating patient {p_id}: {res.status_code} - {res.text[:200]}")

    print("\n==========================================================")
    print("[SUCCESS] MIGRATION IMPORT COMPLETED SUCCESSFULLY!")
    print("==========================================================")

if __name__ == '__main__':
    run_import()
