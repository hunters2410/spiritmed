import requests
import re
import os
import uuid
import sys
from datetime import datetime
from collections import defaultdict, Counter

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

BRANCH_ID  = "697a3863-1de7-4615-819c-45b0d7066d67"
PAYMENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\payment (12).sql"
DEPOSIT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\patient_deposit (8).sql"
PATIENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\patient (8).sql"
BATCH_SIZE  = 500

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

def main():
    print("Loading patients from Supabase...", flush=True)
    all_patients = []
    from_idx = 0
    page_size = 1000
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name",
            headers={**HEADERS, "Range": f"{from_idx}-{from_idx+page_size-1}"},
            timeout=30
        )
        if r.status_code not in (200, 206) or not r.json(): break
        rows = r.json()
        all_patients.extend(rows)
        if len(rows) < page_size: break
        from_idx += page_size

    print(f"Loaded {len(all_patients)} patients from Supabase.", flush=True)

    by_pn   = {str(p.get('patient_number') or '').strip(): p['id'] for p in all_patients if p.get('patient_number')}
    by_fn   = {str(p.get('file_number') or '').strip(): p['id'] for p in all_patients if p.get('file_number') and str(p.get('file_number')).strip() not in ('0', 'None', 'null')}
    by_name = {normalize_name(p.get('full_name')): p['id'] for p in all_patients if p.get('full_name')}

    # Load old patient id mapping from patient (8).sql
    old_id_to_pn = {}
    if os.path.exists(PATIENT_SQL):
        with open(PATIENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
            old_p_content = f.read()
        old_rows = extract_tuples(old_p_content, 'patient')
        for r in old_rows:
            cols = [unquote(v) for v in split_values(r)]
            while len(cols) < 13: cols.append(None)
            oid = cols[0]
            pid = cols[12]
            if pid and str(pid).strip() not in ('', 'NULL', 'null', '0'):
                pn = str(pid).strip()
            else:
                pn = f"P{str(oid).zfill(4)}"
            if oid:
                old_id_to_pn[str(oid)] = pn

    # 1. Parse payment (12).sql into bills_map
    print(f"\nParsing {PAYMENT_SQL}...", flush=True)
    with open(PAYMENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        p_content = f.read()
    p_tuples = extract_tuples(p_content, 'payment')
    print(f"Found {len(p_tuples)} tuples in payment (12).sql", flush=True)

    bills_map = {}
    bill_matched = 0
    bill_unmatched = 0

    for t in p_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 60: cols.append(None)

        old_pay_id  = cols[0]
        category    = cols[1]
        old_pat_id  = cols[2]
        date_raw    = cols[4]
        gross_raw   = cols[11]
        remarks     = cols[12]
        cat_name    = cols[16]
        patient_name= cols[21]

        gross_amt = 0.0
        if gross_raw and str(gross_raw).strip() not in ('', 'NULL', 'null'):
            try: gross_amt = float(gross_raw)
            except: pass

        # Patient UUID Resolution
        patient_uuid = None
        if old_pat_id:
            ref_str = str(old_pat_id).strip()
            pn = old_id_to_pn.get(ref_str) or ref_str
            patient_uuid = by_pn.get(pn)

        if not patient_uuid and patient_name:
            patient_uuid = by_name.get(normalize_name(patient_name))

        if not patient_uuid:
            patient_uuid = None
            bill_unmatched += 1
        else:
            bill_matched += 1

        bill_uuid   = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill.{old_pay_id}"))
        bill_number = f"INV-{str(old_pay_id).zfill(6)}"
        bill_date   = parse_date(date_raw)

        item_desc = cat_name or category or remarks or 'Medical Service'

        bills_map[old_pay_id] = {
            "id":                 bill_uuid,
            "branch_id":          BRANCH_ID,
            "patient_id":         patient_uuid,
            "bill_number":        bill_number,
            "invoice_date":       bill_date,
            "bill_date":          bill_date.split('T')[0] if 'T' in bill_date else bill_date.split(' ')[0],
            "subtotal":           gross_amt,
            "total_amount":       gross_amt,
            "paid_amount":        0.0,
            "balance":            gross_amt,
            "status":             "unpaid",
            "notes":              item_desc[:200] if item_desc else None,
            "created_at":         bill_date,
            "old_pay_id":         old_pay_id
        }

    # 2. Parse patient_deposit (8).sql into payments
    print(f"\nParsing {DEPOSIT_SQL}...", flush=True)
    with open(DEPOSIT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        d_content = f.read()
    d_tuples = extract_tuples(d_content, 'patient_deposit')
    print(f"Found {len(d_tuples)} tuples in patient_deposit (8).sql", flush=True)

    payments_to_import = []
    bill_paid_sums = defaultdict(float)

    for t in d_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 20: cols.append(None)

        dep_id       = cols[0]
        patient_ref  = cols[1]
        old_pay_id   = cols[2]
        date_raw     = cols[3]
        amt_raw      = cols[4]
        deposit_type = cols[6]
        ddate_raw    = cols[11]
        note_raw     = cols[12]

        amt = 0.0
        if amt_raw and str(amt_raw).strip() not in ('', 'NULL', 'null'):
            try: amt = float(amt_raw)
            except: pass

        if amt <= 0:
            continue

        patient_uuid = None
        if patient_ref:
            ref_str = str(patient_ref).strip()
            pn = old_id_to_pn.get(ref_str) or ref_str
            patient_uuid = by_pn.get(pn)

        bill_uuid = None
        if old_pay_id and old_pay_id in bills_map:
            bill_uuid = bills_map[old_pay_id]['id']
            if not patient_uuid:
                patient_uuid = bills_map[old_pay_id]['patient_id']
            bill_paid_sums[old_pay_id] += amt

        pay_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.payment_deposit.{dep_id}"))
        pay_date = parse_date(date_raw, ddate_raw)
        method   = normalize_method(deposit_type)

        payments_to_import.append({
            "id":             pay_uuid,
            "branch_id":      BRANCH_ID,
            "bill_id":        bill_uuid,
            "patient_id":     patient_uuid,
            "payment_date":   pay_date,
            "amount":         amt,
            "payment_method": method,
            "notes":          f"Deposit Receipt #{dep_id}" + (f" - {note_raw}" if note_raw else ""),
            "created_at":     pay_date
        })

    # 3. Recalculate bill paid_amount, balance, status
    bills_to_import = []
    paid_count = 0
    partial_count = 0
    unpaid_count = 0

    for old_pay_id, b in bills_map.items():
        pd = bill_paid_sums.get(old_pay_id, 0.0)
        b['paid_amount'] = pd
        b['balance'] = max(0.0, b['total_amount'] - pd)
        if pd >= b['total_amount'] and b['total_amount'] > 0:
            b['status'] = 'paid'
            paid_count += 1
        elif pd > 0:
            b['status'] = 'partially_paid'
            partial_count += 1
        else:
            b['status'] = 'unpaid'
            unpaid_count += 1

        bills_to_import.append({
            "id":           b["id"],
            "branch_id":    b["branch_id"],
            "patient_id":   b["patient_id"],
            "bill_number":  b["bill_number"],
            "invoice_date": b["invoice_date"],
            "bill_date":    b["bill_date"],
            "subtotal":     b["subtotal"],
            "total_amount": b["total_amount"],
            "paid_amount":  b["paid_amount"],
            "balance":      b["balance"],
            "status":       b["status"],
            "notes":        b["notes"],
            "created_at":   b["created_at"]
        })

    print(f"\nBills Summary: Total={len(bills_to_import)} (Paid={paid_count}, Partially Paid={partial_count}, Unpaid={unpaid_count})")
    print(f"Payments Summary: Total={len(payments_to_import)}")

    # 4. CLEAR PAYMENTS AND BILLS IN SUPABASE
    print("\n--- Clearing payments table in Supabase ---", flush=True)
    del_p = requests.delete(f"{SUPABASE_URL}/rest/v1/payments?id=neq.00000000-0000-0000-0000-000000000000", headers=HEADERS, timeout=30)
    print("Delete payments status:", del_p.status_code)

    print("--- Clearing bills table in Supabase ---", flush=True)
    del_b = requests.delete(f"{SUPABASE_URL}/rest/v1/bills?id=neq.00000000-0000-0000-0000-000000000000", headers=HEADERS, timeout=30)
    print("Delete bills status:", del_b.status_code)

    # 5. BATCH INSERT BILLS
    print(f"\nBatch inserting {len(bills_to_import)} bills...", flush=True)
    inserted_bills = 0
    for i in range(0, len(bills_to_import), BATCH_SIZE):
        batch = bills_to_import[i:i+BATCH_SIZE]
        ins_r = requests.post(f"{SUPABASE_URL}/rest/v1/bills", headers=HEADERS, json=batch, timeout=60)
        if ins_r.status_code in (200, 201):
            inserted_bills += len(batch)
            print(f"  Inserted {inserted_bills}/{len(bills_to_import)} bills...")
        else:
            print(f"  Bills Batch error: {ins_r.status_code} - {ins_r.text[:200]}")

    # 6. BATCH INSERT PAYMENTS
    print(f"\nBatch inserting {len(payments_to_import)} payments...", flush=True)
    inserted_payments = 0
    for i in range(0, len(payments_to_import), BATCH_SIZE):
        batch = payments_to_import[i:i+BATCH_SIZE]
        ins_r = requests.post(f"{SUPABASE_URL}/rest/v1/payments", headers=HEADERS, json=batch, timeout=60)
        if ins_r.status_code in (200, 201):
            inserted_payments += len(batch)
            print(f"  Inserted {inserted_payments}/{len(payments_to_import)} payments...")
        else:
            print(f"  Payments Batch error: {ins_r.status_code} - {ins_r.text[:200]}")

    print(f"\nSUCCESS! Imported {inserted_bills} bills and {inserted_payments} payment deposit receipts.")

if __name__ == '__main__':
    main()
