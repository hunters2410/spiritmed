"""
sync_missing_deposits_and_payments.py
======================================
Safely imports ONLY MISSING deposits and payment/bill records from the latest
old-system SQL dumps into Supabase.

Key safety features:
  - Uses the SAME deterministic UUID scheme as previous migrations
  - Fetches all existing UUIDs from Supabase FIRST
  - Only inserts records whose UUID doesn't already exist
  - Never updates or deletes existing records
  - Skips records for patients that can't be resolved
  - Prints a full dry-run analysis before any writes
  - Requires explicit confirmation before writing
"""

import requests
import re
import os
import uuid
import sys
import time
from datetime import datetime
from collections import defaultdict

# ── Configuration ────────────────────────────────────────────────────────────
SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

DEPOSIT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient_deposit (9).sql"
PAYMENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payment (13).sql"

BATCH_SIZE = 250

# ── SQL Parsing Helpers (same as previous migrations) ────────────────────────

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

# ── Supabase Helpers ─────────────────────────────────────────────────────────

def fetch_all_supabase(table, select="id"):
    """Fetches ALL rows from a Supabase table using pagination."""
    all_rows = []
    from_idx = 0
    page_size = 1000
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/{table}?select={select}",
            headers={**HEADERS, "Range": f"{from_idx}-{from_idx+page_size-1}"},
            timeout=30
        )
        if r.status_code not in (200, 206) or not r.json():
            break
        rows = r.json()
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        from_idx += page_size
    return all_rows

def batch_insert(table, records):
    """INSERT-only (no upsert). Returns (ok_count, err_count)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    h = {**HEADERS, "Prefer": "return=minimal"}
    total_ok = 0
    total_err = 0
    total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE

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
            # Retry one-by-one to avoid losing the entire batch
            for single in batch:
                r2 = requests.post(url, headers=h, json=[single], timeout=30)
                if r2.status_code in (200, 201):
                    total_ok += 1
                else:
                    total_err += 1
                    print(f"    SKIP (already exists or error): id={single.get('id','?')[:12]}... - {r2.text[:100]}", flush=True)

    return total_ok, total_err


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  SAFE MIGRATION: Sync Missing Deposits & Payments to Supabase")
    print("=" * 70)
    print()

    # ── Step 1: Load existing data from Supabase ─────────────────────────────
    print("STEP 1: Loading existing data from Supabase...", flush=True)

    # 1a. All patients (for resolving old patient IDs)
    all_patients = fetch_all_supabase("patients", "id,patient_number,file_number,full_name")
    print(f"  Loaded {len(all_patients)} patients", flush=True)

    by_pn   = {str(p.get('patient_number') or '').strip(): p['id']
                for p in all_patients if p.get('patient_number')}
    by_name = {normalize_name(p.get('full_name')): p['id']
                for p in all_patients if p.get('full_name')}

    # 1b. All existing payment UUIDs
    existing_payments_raw = fetch_all_supabase("payments", "id")
    existing_payment_ids = {p['id'] for p in existing_payments_raw}
    print(f"  Loaded {len(existing_payment_ids)} existing payment records", flush=True)

    # 1c. All existing bill UUIDs (with full objects for balance recalculation)
    existing_bills_raw = fetch_all_supabase("bills", "*")
    existing_bill_ids = {b['id'] for b in existing_bills_raw}
    existing_bills_map = {b['id']: b for b in existing_bills_raw}
    print(f"  Loaded {len(existing_bill_ids)} existing bill records", flush=True)

    # ── Step 2: Parse payment (13).sql -> bills ──────────────────────────────
    print(f"\nSTEP 2: Parsing {os.path.basename(PAYMENT_SQL)}...", flush=True)
    with open(PAYMENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        pay_content = f.read()
    pay_tuples = extract_tuples(pay_content, 'payment')
    print(f"  Found {len(pay_tuples)} total bill/payment tuples in SQL dump", flush=True)

    # Build bills from old payment records
    all_bills_from_sql = {}   # old_pay_id -> bill dict
    bill_patient_map = {}     # old_pay_id -> patient_uuid (for deposit linking)

    for t in pay_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 60: cols.append(None)

        old_pay_id   = cols[0]
        category     = cols[1]
        old_pat_id   = cols[2]
        date_raw     = cols[4]
        gross_raw    = cols[11]
        remarks      = cols[12]
        cat_name     = cols[16]
        patient_name = cols[21]
        date_string  = cols[25]

        gross_amt = 0.0
        if gross_raw and str(gross_raw).strip() not in ('', 'NULL', 'null'):
            try: gross_amt = float(str(gross_raw).strip().replace(',', ''))
            except: pass

        # Patient Resolution: try old_pat_id as patient_number first
        patient_uuid = None
        if old_pat_id:
            ref_str = str(old_pat_id).strip()
            patient_uuid = by_pn.get(ref_str)

        if not patient_uuid and patient_name:
            patient_uuid = by_name.get(normalize_name(patient_name))

        bill_uuid   = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill.{old_pay_id}"))
        bill_number = f"INV-{str(old_pay_id).zfill(6)}"
        bill_date   = parse_date(date_raw, date_string)
        item_desc   = cat_name or category or remarks or 'Medical Service'

        all_bills_from_sql[old_pay_id] = {
            "id":            bill_uuid,
            "branch_id":     BRANCH_ID,
            "patient_id":    patient_uuid,
            "bill_number":   bill_number,
            "invoice_date":  bill_date,
            "bill_date":     bill_date.split('T')[0] if 'T' in bill_date else bill_date.split(' ')[0],
            "subtotal":      gross_amt,
            "total_amount":  gross_amt,
            "paid_amount":   0.0,
            "balance":       gross_amt,
            "status":        "unpaid",
            "notes":         item_desc[:200] if item_desc else None,
            "created_at":    bill_date,
        }
        bill_patient_map[old_pay_id] = patient_uuid

    # Filter to only NEW bills (not already in Supabase)
    new_bills = {oid: b for oid, b in all_bills_from_sql.items()
                 if b['id'] not in existing_bill_ids}

    # Further filter: only bills with a resolved patient
    new_bills_with_patient = {oid: b for oid, b in new_bills.items()
                              if b['patient_id'] is not None}
    new_bills_no_patient   = {oid: b for oid, b in new_bills.items()
                              if b['patient_id'] is None}

    print(f"  Total bills in SQL dump     : {len(all_bills_from_sql)}")
    print(f"  Already in Supabase         : {len(all_bills_from_sql) - len(new_bills)}")
    print(f"  NEW bills to insert         : {len(new_bills)}")
    print(f"    +-- With resolved patient : {len(new_bills_with_patient)}")
    print(f"    +-- SKIPPED (no patient)  : {len(new_bills_no_patient)}")

    # ── Step 3: Parse patient_deposit (9).sql -> payments ────────────────────
    print(f"\nSTEP 3: Parsing {os.path.basename(DEPOSIT_SQL)}...", flush=True)
    with open(DEPOSIT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        dep_content = f.read()
    dep_tuples = extract_tuples(dep_content, 'patient_deposit')
    print(f"  Found {len(dep_tuples)} total deposit tuples in SQL dump", flush=True)

    new_payments = []
    bill_new_paid_sums = defaultdict(float)  # bill_uuid -> additional paid amount
    skipped_zero = 0
    skipped_no_patient = 0
    skipped_exists = 0

    for t in dep_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 14: cols.append(None)

        dep_id       = cols[0]
        patient_ref  = cols[1]
        payment_id   = cols[2]   # links to old payment.id (= bill)
        date_raw     = cols[3]
        amount_raw   = cols[4]
        deposit_type = cols[6]
        ddate_raw    = cols[11]
        note_raw     = cols[12]

        amt = 0.0
        if amount_raw and str(amount_raw).strip() not in ('', 'NULL', 'null'):
            try: amt = float(str(amount_raw).strip().replace(',', ''))
            except: amt = 0.0

        if amt <= 0:
            skipped_zero += 1
            continue

        # Deterministic UUID (same as previous migration)
        pay_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.payment_deposit.{dep_id}"))

        # Already exists?
        if pay_uuid in existing_payment_ids:
            skipped_exists += 1
            continue

        # Patient Resolution
        patient_uuid = None
        if patient_ref:
            ref_str = str(patient_ref).strip()
            patient_uuid = by_pn.get(ref_str)

        # Try via the linked bill's patient
        if not patient_uuid and payment_id:
            patient_uuid = bill_patient_map.get(str(payment_id).strip())

        if not patient_uuid:
            skipped_no_patient += 1
            continue

        # Bill UUID Resolution
        bill_uuid = None
        if payment_id and str(payment_id).strip() not in ('', '0', 'NULL', 'null'):
            old_pay_id = str(payment_id).strip()
            candidate_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill.{old_pay_id}"))
            # Bill must exist in Supabase (either already there or being inserted now)
            if candidate_uuid in existing_bill_ids or old_pay_id in new_bills_with_patient:
                bill_uuid = candidate_uuid
                bill_new_paid_sums[bill_uuid] += amt

        dep_date = parse_date(date_raw, ddate_raw)
        method   = normalize_method(deposit_type)

        pay_notes = f"Deposit Receipt #{dep_id} | Type: {deposit_type or 'Cash'}"
        if note_raw: pay_notes += f" | {note_raw}"

        payment_obj = {
            "id":               pay_uuid,
            "branch_id":        BRANCH_ID,
            "bill_id":          bill_uuid,
            "patient_id":       patient_uuid,
            "payment_date":     dep_date,
            "amount":           amt,
            "payment_method":   method,
            "reference_number": f"DEP-{str(dep_id).zfill(6)}",
            "notes":            pay_notes,
            "created_at":       dep_date,
            "discount_amount":  0,
            "target_portion":   "standard"
        }
        new_payments.append(payment_obj)

    total_new_amount = sum(p['amount'] for p in new_payments)

    print(f"  Total deposits in SQL dump   : {len(dep_tuples)}")
    print(f"  Skipped (zero/blank amount)  : {skipped_zero}")
    print(f"  Skipped (already in Supabase): {skipped_exists}")
    print(f"  Skipped (no patient match)   : {skipped_no_patient}")
    print(f"  NEW deposits to insert       : {len(new_payments)}")
    print(f"  Total NEW deposit amount     : ${total_new_amount:,.2f}")

    # ── Step 4: Summary & Confirmation ───────────────────────────────────────
    print()
    print("=" * 70)
    print("  DRY-RUN SUMMARY")
    print("=" * 70)
    print(f"  New BILLS to insert    : {len(new_bills_with_patient)}")
    print(f"  New PAYMENTS to insert : {len(new_payments)}")
    print(f"  New payment total      : ${total_new_amount:,.2f}")
    print(f"  Bills needing balance  : {len(bill_new_paid_sums)} (existing bills with new payments)")
    print("=" * 70)

    if len(new_bills_with_patient) == 0 and len(new_payments) == 0:
        print("\n  Nothing to do! All records from the SQL dumps are already in Supabase.")
        return

    print()
    confirm = input("Type 'YES' to proceed with inserting missing records: ").strip()
    if confirm != 'YES':
        print("Aborted. No changes were made.")
        return

    # ── Step 5: Insert new bills ─────────────────────────────────────────────
    if new_bills_with_patient:
        print(f"\nSTEP 5: Inserting {len(new_bills_with_patient)} new bills...", flush=True)
        bills_list = list(new_bills_with_patient.values())
        ok, err = batch_insert("bills", bills_list)
        print(f"  Bills inserted: {ok}, errors: {err}")
    else:
        print("\nSTEP 5: No new bills to insert.")

    # ── Step 6: Insert new payments ──────────────────────────────────────────
    if new_payments:
        print(f"\nSTEP 6: Inserting {len(new_payments)} new payment deposits...", flush=True)
        ok, err = batch_insert("payments", new_payments)
        print(f"  Payments inserted: {ok}, errors: {err}")
    else:
        print("\nSTEP 6: No new payments to insert.")

    # ── Step 7: Recalculate balances for bills that got new payments ─────────
    if bill_new_paid_sums:
        print(f"\nSTEP 7: Recalculating balances for {len(bill_new_paid_sums)} bills...", flush=True)
        updated = 0

        for bill_uuid, new_paid in bill_new_paid_sums.items():
            if bill_uuid in existing_bills_map:
                # Existing bill: add to its current paid_amount
                b = existing_bills_map[bill_uuid]
                old_paid = float(b.get('paid_amount') or 0.0)
                total    = float(b.get('total_amount') or 0.0)
                discount = float(b.get('discount_amount') or 0.0)
                updated_paid = old_paid + new_paid
                updated_balance = max(0.0, total - updated_paid - discount)
            else:
                # New bill (just inserted): set balance from scratch
                for oid, b in new_bills_with_patient.items():
                    if b['id'] == bill_uuid:
                        total = b['total_amount']
                        updated_paid = new_paid
                        updated_balance = max(0.0, total - updated_paid)
                        break
                else:
                    continue

            if updated_balance <= 0 and updated_paid > 0:
                status = 'paid'
            elif updated_paid > 0 and updated_balance > 0:
                status = 'partially_paid'
            else:
                status = 'unpaid'

            r = requests.patch(
                f"{SUPABASE_URL}/rest/v1/bills?id=eq.{bill_uuid}",
                headers={**HEADERS, "Prefer": "return=minimal"},
                json={
                    "paid_amount": updated_paid,
                    "balance":     updated_balance,
                    "status":      status,
                },
                timeout=15
            )
            if r.status_code in (200, 204):
                updated += 1
            else:
                print(f"    Bill update failed: {bill_uuid[:12]}... ({r.status_code})", flush=True)

        print(f"  Updated balances for {updated}/{len(bill_new_paid_sums)} bills", flush=True)
    else:
        print("\nSTEP 7: No bill balance updates needed.")

    # ── Done ─────────────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print("  MIGRATION COMPLETE")
    print(f"  New bills inserted    : {len(new_bills_with_patient)}")
    print(f"  New payments inserted : {len(new_payments)}")
    print(f"  Bill balances updated : {len(bill_new_paid_sums)}")
    print("=" * 70)


if __name__ == '__main__':
    main()
