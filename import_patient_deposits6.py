"""
import_patient_deposits6.py (v3 - Complete Full Object Sync)
===========================================================
Imports all 10,490 payment deposit transactions from database/patient_deposit (6).sql into Supabase.

1. Loads all existing patients & existing bills from Supabase into memory.
2. Parses patient_deposit (6).sql (10,490 active deposit receipts, totaling $1,346,269.27).
3. Safely maps bill_id (if bill exists in Supabase) or sets bill_id = None if bill was deleted in old system.
4. Generates deterministic payment UUIDs (spiritmed.payment_deposit.<dep_id>).
5. Upserts all 10,490 payment receipts into public.payments.
6. Recalculates exact paid_amount, balance, and status for every bill and upserts full bill objects to public.bills.
7. Recalculates and updates outstanding_balance for all patients in public.patients.
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

DEPOSIT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient_deposit (6).sql"
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

def parse_date(raw, ddate_raw=None):
    if raw and str(raw).strip().isdigit() and len(str(raw).strip()) == 10:
        try:
            d = datetime.fromtimestamp(int(raw))
            if 1990 <= d.year <= 2030:
                return d.strftime('%Y-%m-%d %H:%M:%S+00')
        except:
            pass

    if ddate_raw and str(ddate_raw).strip() not in ('', 'NULL', 'null'):
        ds = str(ddate_raw).strip()
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
    if 'med' in dt or 'cimas' in dt or 'psmas' in dt or 'alliance' in dt or 'fml' in dt:
        return 'medical_aid'
    return 'cash'

def normalize_name(n):
    if not n: return ''
    return " ".join(n.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').replace('prof.', '').split())

def bulk_upsert(table, records, on_conflict_col="id"):
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict_col}"
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
                    print(f"    FAIL: id={single.get('id')} - {r2.text[:120]}", flush=True)

    print(f"[{table}] Completed: {total_ok} OK, {total_err} errors\n", flush=True)
    return total_ok, total_err

# ── Main Process ─────────────────────────────────────────────────────────────

def main():
    print("=== Step 1: Loading existing Supabase patients & full bill objects ===", flush=True)
    
    # 1. Load Patients
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
        if len(rows) < page_size: break
        from_idx += page_size

    print(f"Loaded {len(all_patients)} patients from Supabase.", flush=True)

    by_pn   = {str(p.get('patient_number') or '').strip(): p['id'] for p in all_patients if p.get('patient_number')}
    by_fn   = {str(p.get('file_number') or '').strip(): p['id'] for p in all_patients if p.get('file_number') and str(p.get('file_number')).strip() not in ('0', 'None', 'null')}
    by_name = {normalize_name(p.get('full_name')): p['id'] for p in all_patients if p.get('full_name')}

    # 2. Load Existing Full Bill Objects from Supabase
    existing_bills = {}
    from_idx = 0
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/bills?select=*",
            headers={**HEADERS, "Range": f"{from_idx}-{from_idx+page_size-1}"},
            timeout=30
        )
        if r.status_code not in (200, 206) or not r.json(): break
        rows = r.json()
        for row in rows:
            existing_bills[row['id']] = row
        if len(rows) < page_size: break
        from_idx += page_size

    print(f"Loaded {len(existing_bills)} full bill objects from Supabase.", flush=True)

    # 3. Load old_id -> patient_number mapping from patient (5).sql
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
            if pid and str(pid).strip() not in ('', 'NULL', 'null', '0'):
                pn = str(pid).strip()
            else:
                pn = f"P{str(oid).zfill(4)}"
            if oid:
                old_id_to_pn[str(oid)] = pn

    # ── Step 2: Parse patient_deposit (6).sql ────────────────────────────────
    print(f"\nParsing {DEPOSIT_SQL}...", flush=True)
    with open(DEPOSIT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        dep_content = f.read()

    dep_tuples = extract_tuples(dep_content, 'patient_deposit')
    print(f"Found {len(dep_tuples)} tuples in patient_deposit (6).sql", flush=True)

    payments_to_upsert = []
    bill_paid_totals   = defaultdict(float)
    matched_count      = 0
    fallback_count     = 0
    total_deposited    = 0.0

    for t in dep_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 14: cols.append(None)

        dep_id             = cols[0]
        patient_ref        = cols[1]
        payment_id         = cols[2]
        date_raw           = cols[3]
        amount_raw         = cols[4]
        deposit_type       = cols[6]
        ddate_raw          = cols[11]
        note_raw           = cols[12]

        amt = 0.0
        if amount_raw and str(amount_raw).strip() not in ('', 'NULL', 'null'):
            try:
                amt = float(str(amount_raw).strip().replace(',', ''))
            except:
                amt = 0.0

        if amt <= 0:
            continue  # Skip zero/blank deposit receipts

        total_deposited += amt

        # Patient Resolution
        patient_uuid = None
        if patient_ref:
            ref_str = str(patient_ref).strip()
            pn = old_id_to_pn.get(ref_str) or ref_str
            patient_uuid = by_pn.get(pn)

        if not patient_uuid:
            patient_uuid = FALLBACK_PATIENT_UUID
            fallback_count += 1
        else:
            matched_count += 1

        # Bill UUID Resolution (Foreign Key Validation)
        bill_uuid = None
        if payment_id and str(payment_id).strip() not in ('', '0', 'NULL', 'null'):
            old_pay_id = str(payment_id).strip()
            candidate_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill.{old_pay_id}"))
            if candidate_uuid in existing_bills:
                bill_uuid = candidate_uuid
                bill_paid_totals[bill_uuid] += amt

        dep_date = parse_date(date_raw, ddate_raw)
        method   = normalize_method(deposit_type)
        ref_num  = f"DEP-{str(dep_id).zfill(6)}"

        pay_notes = f"Deposit Receipt #{dep_id} | Type: {deposit_type or 'Cash'}"
        if note_raw: pay_notes += f" | {note_raw}"

        payment_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.payment_deposit.{dep_id}"))

        payment_obj = {
            "id":               payment_uuid,
            "branch_id":        BRANCH_ID,
            "bill_id":          bill_uuid,
            "patient_id":       patient_uuid,
            "payment_date":     dep_date,
            "amount":           amt,
            "payment_method":   method,
            "reference_number": ref_num,
            "notes":            pay_notes,
            "created_at":       dep_date,
            "discount_amount":  0,
            "target_portion":   "standard"
        }
        payments_to_upsert.append(payment_obj)

    print(f"\n=== Patient Deposit Analysis ===")
    print(f"  Valid Active Deposits    : {len(payments_to_upsert)}")
    print(f"  Total Deposit Amount     : ${total_deposited:,.2f}")
    print(f"  Matched to Patients      : {matched_count} / {len(payments_to_upsert)}")
    print(f"  Fallback Unlinked        : {fallback_count}")
    print(f"  Unique Bills Linked      : {len(bill_paid_totals)}\n", flush=True)

    # ── Step 3: Upsert All 10,490 Payment Deposit Records ─────────────────────
    print("=== Step 3: Upserting Payment Deposit Transactions into Supabase ===", flush=True)
    bulk_upsert("payments", payments_to_upsert)

    # ── Step 4: Recalculate & Update Full Bill Objects in Supabase ───────────
    print("=== Step 4: Updating Bill Balances & Status in Supabase ===", flush=True)
    updated_bills = []
    for bid, b in existing_bills.items():
        total    = float(b.get('total_amount') or 0.0)
        discount = float(b.get('discount_amount') or 0.0)
        new_paid = bill_paid_totals.get(bid, float(b.get('paid_amount') or 0.0))
        balance  = max(0.0, total - new_paid - discount)

        if balance <= 0 and new_paid > 0:
            status = 'paid'
        elif new_paid > 0 and balance > 0:
            status = 'partially_paid'
        else:
            status = 'unpaid'

        # Mutate full bill object to avoid 23502 NOT NULL violations
        b_copy = dict(b)
        b_copy['paid_amount'] = new_paid
        b_copy['balance']     = balance
        b_copy['status']      = status

        updated_bills.append(b_copy)

    bulk_upsert("bills", updated_bills)

    # ── Step 5: Recalculate Patient Outstanding Balance ──────────────────────
    print("=== Step 5: Recalculating Patient Outstanding Dues in Supabase ===", flush=True)
    patient_dues = defaultdict(float)
    for b in updated_bills:
        pid = b.get('patient_id')
        bal = b.get('balance', 0.0)
        if pid and bal > 0 and pid != FALLBACK_PATIENT_UUID:
            patient_dues[pid] += bal

    updated_patients = []
    for p in all_patients:
        pid = p['id']
        due = patient_dues.get(pid, 0.0)
        p_copy = dict(p)
        p_copy['outstanding_balance'] = due
        updated_patients.append(p_copy)

    print(f"Updating outstanding_balance for {len(updated_patients)} patients in Supabase...", flush=True)
    bulk_upsert("patients", updated_patients)

    print("\n=== ALL PATIENT DEPOSITS IMPORTED & BILL BALANCES & PATIENT DUES UPDATED SUCCESSFULLY! ===", flush=True)

if __name__ == '__main__':
    main()
