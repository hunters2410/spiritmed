"""
update_payments_from_payment10.py
==================================
1. Fetches all patients from Supabase (id, patient_number, file_number, full_name).
2. Parses database/payment (10).sql (all 8,556 payment/billing rows).
3. Resolves patient IDs via:
   - patient_id (mapped from old_id -> patient_number)
   - patient_name (normalized full name match)
   - fallback to unlinked patient UUID if unresolvable
4. Builds bill objects, bill_item objects, and payment objects with deterministic UUIDs.
5. Performs fast bulk upserts to Supabase REST API:
   - /rest/v1/bills?on_conflict=id
   - /rest/v1/bill_items?on_conflict=id
   - /rest/v1/payments?on_conflict=id
6. Recalculates and updates patient outstanding dues.
"""

import requests
import re
import os
import uuid
import sys
from datetime import datetime
from collections import defaultdict

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
FALLBACK_PATIENT_UUID = "00000000-0000-4000-a000-000000000099"
PAYMENT10_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payment (10).sql"
OLD_PATIENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (5).sql"
BATCH_SIZE = 250

# ── helpers ──────────────────────────────────────────────────────────────────

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    return v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\r', '\r').replace('\\\\', '\\')

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

def safe_float(v):
    if not v: return 0.0
    v_str = str(v).strip().replace(',', '')
    try:
        return float(v_str)
    except:
        return 0.0

def parse_date(raw, date_str_raw=None):
    if raw and str(raw).strip().isdigit() and len(str(raw).strip()) == 10:
        try:
            d = datetime.fromtimestamp(int(raw))
            if 1990 <= d.year <= 2030:
                return d.strftime('%Y-%m-%d %H:%M:%S+00')
        except:
            pass

    if date_str_raw and str(date_str_raw).strip() not in ('', 'NULL', 'null'):
        ds = str(date_str_raw).strip()
        for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y']:
            try:
                d = datetime.strptime(ds, fmt)
                if 1990 <= d.year <= 2030:
                    return d.strftime('%Y-%m-%d 00:00:00+00')
            except:
                pass

    return datetime.now().strftime('%Y-%m-%d %H:%M:%S+00')

def normalize_method(dep_type):
    if not dep_type:
        return 'cash'
    dt = str(dep_type).strip().lower()
    if 'card' in dt or 'swipe' in dt:
        return 'card'
    if 'bank' in dt or 'transfer' in dt or 'rtgs' in dt or 'ecocash' in dt:
        return 'bank_transfer'
    if 'med' in dt or 'cimas' in dt or 'psmas' in dt:
        return 'medical_aid'
    return 'cash'

def normalize_name(n):
    if not n: return ''
    return " ".join(n.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').replace('prof.', '').split())

# ── Step 1: Build Patient Lookup Map from Supabase ───────────────────────────

def build_supabase_patient_map():
    print("Fetching all patients from Supabase...", flush=True)
    all_patients = []
    from_idx = 0
    page_size = 1000

    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name",
            headers={**HEADERS, "Range": f"{from_idx}-{from_idx+page_size-1}"},
            timeout=30
        )
        if r.status_code not in (200, 206) or not r.json():
            break
        rows = r.json()
        all_patients.extend(rows)
        if len(rows) < page_size:
            break
        from_idx += page_size

    print(f"Loaded {len(all_patients)} patients from Supabase.", flush=True)

    by_pn   = {}
    by_fn   = {}
    by_name = {}

    for p in all_patients:
        pid  = p['id']
        pn   = str(p.get('patient_number') or '').strip()
        fn   = str(p.get('file_number') or '').strip()
        name = normalize_name(p.get('full_name'))

        if pn: by_pn[pn] = pid
        if fn and fn not in ('0', 'None', 'null'): by_fn[fn] = pid
        if name: by_name[name] = pid

    # Build old_id -> patient_number mapping from patient (5).sql
    old_id_to_pn = {}
    if os.path.exists(OLD_PATIENT_SQL):
        print("Parsing old patient_id mapping from patient (5).sql...", flush=True)
        with open(OLD_PATIENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
            old_p_content = f.read()
        old_rows = extract_tuples(old_p_content, 'patient')
        for r in old_rows:
            cols = [unquote(v) for v in split_values(r)]
            while len(cols) < 53: cols.append(None)
            oid = cols[0]
            pid = cols[12]
            if pid and str(pid).strip() not in ('', 'NULL', 'null', '0'):
                pn = str(pid).strip()
            else:
                pn = f"P{str(oid).zfill(4)}"
            if oid:
                old_id_to_pn[str(oid)] = pn

    return by_pn, by_fn, by_name, old_id_to_pn

# ── Bulk API Poster ──────────────────────────────────────────────────────────

def bulk_upsert(table, records):
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=id"
    h = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    total_ok = 0
    total_err = 0
    total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE

    print(f"Upserting {len(records)} records into {table} ({total_batches} batches)...", flush=True)

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        pct = (min(i + BATCH_SIZE, len(records)) / len(records)) * 100

        r = requests.post(url, headers=h, json=batch, timeout=60)
        if r.status_code in (200, 201):
            total_ok += len(batch)
            print(f"  [{table}] Batch {batch_num:>2}/{total_batches} OK ({total_ok}/{len(records)} = {pct:.0f}%)", flush=True)
        else:
            print(f"  [{table}] Batch {batch_num:>2}/{total_batches} RETRY ({r.status_code}): {r.text[:150]}", flush=True)
            for single in batch:
                r2 = requests.post(url, headers=h, json=[single], timeout=30)
                if r2.status_code in (200, 201):
                    total_ok += 1
                else:
                    total_err += 1
                    print(f"    FAIL: id={single['id']} - {r2.text[:120]}", flush=True)

    print(f"[{table}] Completed: {total_ok} OK, {total_err} errors\n", flush=True)
    return total_ok, total_err

# ── Main Process ─────────────────────────────────────────────────────────────

def main():
    by_pn, by_fn, by_name, old_id_to_pn = build_supabase_patient_map()

    # Ensure fallback patient exists
    print("Checking fallback patient record in Supabase...", flush=True)
    fallback_payload = [{
        "id": FALLBACK_PATIENT_UUID,
        "branch_id": BRANCH_ID,
        "patient_number": "MIG-UNLINKED",
        "full_name": "Unlinked Legacy Patient",
        "file_number": "LEGACY-00",
        "status": "active"
    }]
    r_fb = requests.post(f"{SUPABASE_URL}/rest/v1/patients?on_conflict=id", headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}, json=fallback_payload)
    print(f"Fallback patient status: {r_fb.status_code}", flush=True)

    # Parse payment (10).sql
    print(f"\nParsing {PAYMENT10_SQL}...", flush=True)
    with open(PAYMENT10_SQL, 'r', encoding='utf-8', errors='replace') as f:
        pay_content = f.read()

    pay_rows = extract_tuples(pay_content, 'payment')
    print(f"Found {len(pay_rows)} billing/payment tuples in payment (10).sql\n", flush=True)

    bills_to_upsert    = []
    items_to_upsert    = []
    payments_to_upsert = []

    matched_count  = 0
    fallback_count = 0
    total_gross    = 0.0
    total_paid     = 0.0

    for r in pay_rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 30: cols.append(None)

        old_pay_id      = cols[0]
        pay_patient_ref = cols[2]
        doctor_ref      = cols[3]
        date_raw        = cols[4]
        gross_raw       = cols[11] or cols[5] or '0'
        vat_raw         = cols[6] or '0'
        discount_raw    = cols[9] or '0'
        category_name   = cols[16]
        received_raw    = cols[17] or '0'
        deposit_type    = cols[18] or 'Cash'
        user_ref        = cols[20]
        patient_name    = cols[21]
        doctor_name     = cols[24]
        date_str        = cols[25]
        remarks         = cols[12] or cols[28] or ''

        # Math
        gross    = safe_float(gross_raw)
        tax      = safe_float(vat_raw)
        discount = safe_float(discount_raw)
        paid     = safe_float(received_raw)
        balance  = max(0.0, gross - paid - discount)

        total_gross += gross
        total_paid  += paid

        # Status
        if balance <= 0 and paid > 0:
            status = 'paid'
        elif paid > 0 and balance > 0:
            status = 'partially_paid'
        else:
            status = 'unpaid'

        # Patient Resolution
        patient_uuid = None

        # 1. Match by patient_ref -> old_id_to_pn -> by_pn
        if pay_patient_ref:
            ref_str = str(pay_patient_ref).strip()
            pn = old_id_to_pn.get(ref_str) or ref_str
            patient_uuid = by_pn.get(pn)

        # 2. Match by patient_name
        if not patient_uuid and patient_name:
            cn = normalize_name(patient_name)
            patient_uuid = by_name.get(cn)

        # 3. Fallback
        if not patient_uuid:
            patient_uuid = FALLBACK_PATIENT_UUID
            fallback_count += 1
        else:
            matched_count += 1

        inv_date = parse_date(date_raw, date_str)
        method   = normalize_method(deposit_type)
        bill_num = f"BILL-{str(old_pay_id).zfill(6)}"
        pay_num  = f"PAY-{str(old_pay_id).zfill(6)}"

        bill_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill.{old_pay_id}"))

        note_combined = []
        if remarks: note_combined.append(str(remarks).strip())
        if doctor_name: note_combined.append(f"Doctor: {doctor_name}")
        notes_text = " | ".join(note_combined) if note_combined else None

        # Build Bill Record
        bill_obj = {
            "id":             bill_uuid,
            "branch_id":      BRANCH_ID,
            "patient_id":     patient_uuid,
            "bill_number":    bill_num,
            "invoice_date":   inv_date,
            "due_date":       inv_date,
            "subtotal":       gross,
            "tax_amount":     tax,
            "total_amount":   gross,
            "status":         status,
            "notes":          notes_text,
            "bill_date":      inv_date,
            "paid_amount":    paid,
            "balance":        balance,
            "discount_amount":discount,
            "payment_method": method
        }
        bills_to_upsert.append(bill_obj)

        # Build Bill Items
        if category_name and str(category_name).strip():
            raw_items = str(category_name).strip().split(',')
            for item_idx, raw_item in enumerate(raw_items):
                parts   = raw_item.strip().split('*')
                code_i  = parts[0].strip() if len(parts) > 0 else 'PROC'
                price_i = safe_float(parts[1]) if len(parts) > 1 else gross
                desc_i  = parts[2].strip() if len(parts) > 2 else 'Medical Service'
                qty_i   = safe_float(parts[3]) if len(parts) > 3 else 1.0
                if qty_i <= 0: qty_i = 1.0
                tot_i   = price_i * qty_i

                item_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill_item.{old_pay_id}.{item_idx}"))
                item_obj  = {
                    "id":          item_uuid,
                    "bill_id":     bill_uuid,
                    "description": desc_i,
                    "quantity":    qty_i,
                    "unit_price":  price_i,
                    "total_price": tot_i,
                    "created_at":  inv_date,
                    "code":        code_i
                }
                items_to_upsert.append(item_obj)
        else:
            item_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill_item.{old_pay_id}.0"))
            item_obj  = {
                "id":          item_uuid,
                "bill_id":     bill_uuid,
                "description": "Medical Consultation / Service",
                "quantity":    1.0,
                "unit_price":  gross,
                "total_price": gross,
                "created_at":  inv_date,
                "code":        "MISC"
            }
            items_to_upsert.append(item_obj)

        # Build Payment Record
        if paid > 0:
            payment_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.payment.{old_pay_id}"))
            pay_notes    = f"Payment method: {deposit_type}"
            if notes_text: pay_notes += f" | {notes_text}"
            pay_obj = {
                "id":               payment_uuid,
                "branch_id":        BRANCH_ID,
                "bill_id":          bill_uuid,
                "patient_id":       patient_uuid,
                "payment_date":     inv_date,
                "amount":           paid,
                "payment_method":   method,
                "reference_number": pay_num,
                "notes":            pay_notes,
                "created_at":       inv_date,
                "discount_amount":  discount,
                "target_portion":   "standard"
            }
            payments_to_upsert.append(pay_obj)

    print(f"=== Resolution Summary ===")
    print(f"  Matched to Patients      : {matched_count} / {len(pay_rows)}")
    print(f"  Unlinked (Fallback)      : {fallback_count}")
    print(f"  Total Bills to Upsert    : {len(bills_to_upsert)}")
    print(f"  Total Items to Upsert    : {len(items_to_upsert)}")
    print(f"  Total Payments to Upsert : {len(payments_to_upsert)}")
    print(f"  Total Billing Amount     : ${total_gross:,.2f}")
    print(f"  Total Amount Paid        : ${total_paid:,.2f}\n", flush=True)

    # Upsert Bills
    bulk_upsert("bills", bills_to_upsert)

    # Upsert Bill Items
    bulk_upsert("bill_items", items_to_upsert)

    # Upsert Payments
    bulk_upsert("payments", payments_to_upsert)

    print("=== All Bills, Bill Items, and Payments Upserted Successfully! ===", flush=True)

if __name__ == '__main__':
    main()
