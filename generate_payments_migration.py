import re
import os
import uuid
from datetime import datetime

# ─── CONFIGURATION ──────────────────────────────────────────────────────────
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
FALLBACK_PATIENT_UUID = "00000000-0000-4000-a000-000000000099"

BASE_DIR = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database"
PAYMENT_CAT_SQL = os.path.join(BASE_DIR, "payment_category.sql")
PAYMENT_DUMP_SQL = os.path.join(BASE_DIR, "payment (8).sql")
PATIENTS_IMPORT_SQL = os.path.join(BASE_DIR, "import_step3_patients.sql")
OLD_PATIENT_SQL = os.path.join(BASE_DIR, "patient (3).sql")

OUT_PROCEDURES_SQL = os.path.join(BASE_DIR, "import_step21_payment_procedures.sql")
OUT_BILLS_SQL = os.path.join(BASE_DIR, "import_step22_bills.sql")
OUT_ITEMS_SQL = os.path.join(BASE_DIR, "import_step23_bill_items.sql")
OUT_PAYMENTS_SQL = os.path.join(BASE_DIR, "import_step24_payments.sql")
OUT_PATIENT_DUES_SQL = os.path.join(BASE_DIR, "import_step25_update_patient_dues.sql")
# ────────────────────────────────────────────────────────────────────────────

def sql_str(v):
    if v is None or str(v).strip() in ('', 'NULL', 'null'):
        return 'NULL'
    return "'" + str(v).strip().replace("'", "''") + "'"

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

def build_patient_map():
    patient_pn_to_uuid = {}
    patient_name_to_uuid = {}
    
    # 1. Map old_id -> patient_number using patient (3).sql logic
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

    # 2. Map patient_number -> UUID using import_step3_patients.sql
    if os.path.exists(PATIENTS_IMPORT_SQL):
        with open(PATIENTS_IMPORT_SQL, 'r', encoding='utf-8', errors='replace') as f:
            imp_content = f.read()
        
        # Parse INSERT tuples in import_step3_patients.sql
        imp_rows = []
        depth, s = 0, None
        for i, ch in enumerate(imp_content):
            if ch == '(':
                if depth == 0: s = i + 1
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0 and s is not None:
                    imp_rows.append(imp_content[s:i])
                    s = None
        
        for r in imp_rows:
            cols = [unquote(v) for v in split_values(r)]
            if len(cols) >= 10:
                full_name = cols[1]
                pn = cols[8]
                if pn:
                    p_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{pn}"))
                    patient_pn_to_uuid[str(pn)] = p_uuid
                if full_name:
                    cn = " ".join(full_name.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').split())
                    p_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{pn}")) if pn else None
                    if p_uuid:
                        patient_name_to_uuid[cn] = p_uuid

    return old_id_to_pn, patient_pn_to_uuid, patient_name_to_uuid

def run():
    print("Building patient UUID map...")
    old_id_to_pn, patient_pn_to_uuid, patient_name_to_uuid = build_patient_map()
    print(f"Indexed {len(patient_pn_to_uuid)} patient_number UUID mappings.")

    # ─── 1. GENERATE PAYMENT PROCEDURES (payment_category.sql) ─────────────
    print(f"\nProcessing {PAYMENT_CAT_SQL}...")
    with open(PAYMENT_CAT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        cat_content = f.read()

    cat_rows = extract_tuples(cat_content, 'payment_category')
    print(f"Found {len(cat_rows)} procedures in payment_category.sql")

    proc_inserts = []
    for r in cat_rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 8: cols.append(None)
        cat_id = cols[0]
        name = cols[1] or 'Unspecified Procedure'
        price = safe_float(cols[3])
        cat_type = cols[4] or 'general'
        code = cols[7] or str(cat_id)

        proc_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.procedure.{code}"))
        proc_inserts.append(
            f"  ('{proc_uuid}', '{BRANCH_ID}', {sql_str(code)}, {sql_str(name)}, {price}, {sql_str(cat_type)}, NOW(), NOW())"
        )

    with open(OUT_PROCEDURES_SQL, 'w', encoding='utf-8') as f:
        f.write("-- ==========================================================\n")
        f.write("-- SpiritMed Payment Procedures Migration\n")
        f.write(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"-- Total procedures: {len(proc_inserts)}\n")
        f.write("-- ==========================================================\n\n")
        f.write("BEGIN;\n\n")
        f.write("INSERT INTO public.payment_procedures (id, branch_id, code, name, price, category, created_at, updated_at) VALUES\n")
        f.write(",\n".join(proc_inserts))
        f.write("\nON CONFLICT (id) DO NOTHING;\n\n")
        f.write("COMMIT;\n")

    print(f"Wrote {OUT_PROCEDURES_SQL}")

    # ─── 2. GENERATE BILLS, BILL ITEMS, PAYMENTS (payment (8).sql) ─────────
    print(f"\nProcessing {PAYMENT_DUMP_SQL}...")
    with open(PAYMENT_DUMP_SQL, 'r', encoding='utf-8', errors='replace') as f:
        pay_content = f.read()

    pay_rows = extract_tuples(pay_content, 'payment')
    print(f"Found {len(pay_rows)} billing/payment records in payment (8).sql")

    bill_statements = []
    item_statements = []
    payment_statements = []

    matched_count = 0
    fallback_count = 0

    total_gross_sum = 0.0
    total_paid_sum = 0.0
    total_due_sum = 0.0

    for r in pay_rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 30: cols.append(None)

        old_pay_id = cols[0]
        pay_patient_ref = cols[2]
        doctor_ref = cols[3]
        date_raw = cols[4]
        gross_raw = cols[11] or cols[5] or '0'
        vat_raw = cols[6] or '0'
        discount_raw = cols[9] or '0'
        category_name = cols[16] # item list string
        received_raw = cols[17] or '0'
        deposit_type = cols[18] or 'Cash'
        user_ref = cols[20]
        patient_name = cols[21]
        doctor_name = cols[24]
        date_str = cols[25]
        remarks = cols[12] or cols[28] or ''

        # Financial Math
        gross = safe_float(gross_raw)
        tax = safe_float(vat_raw)
        discount = safe_float(discount_raw)
        paid = safe_float(received_raw)
        balance = max(0.0, gross - paid - discount)

        total_gross_sum += gross
        total_paid_sum += paid
        total_due_sum += balance

        # Status Derivation
        if balance <= 0 and paid > 0:
            status = 'paid'
        elif paid > 0 and balance > 0:
            status = 'partially_paid'
        else:
            status = 'unpaid'

        # Patient UUID Resolution
        patient_uuid = None
        if pay_patient_ref:
            pn = old_id_to_pn.get(str(pay_patient_ref)) or str(pay_patient_ref)
            patient_uuid = patient_pn_to_uuid.get(pn)

        if not patient_uuid and patient_name:
            cn = " ".join(patient_name.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').split())
            patient_uuid = patient_name_to_uuid.get(cn)

        if not patient_uuid:
            patient_uuid = FALLBACK_PATIENT_UUID
            fallback_count += 1
        else:
            matched_count += 1

        # Dates & Methods
        inv_date = parse_date(date_raw, date_str)
        method = normalize_method(deposit_type)
        bill_num = f"BILL-{str(old_pay_id).zfill(6)}"
        pay_num = f"PAY-{str(old_pay_id).zfill(6)}"

        bill_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill.{old_pay_id}"))

        note_combined = []
        if remarks: note_combined.append(str(remarks).strip())
        if doctor_name: note_combined.append(f"Doctor: {doctor_name}")
        notes_text = " | ".join(note_combined) if note_combined else None

        # Build Bill Insert Row
        bill_statements.append(
            f"  ('{bill_uuid}', '{BRANCH_ID}', '{patient_uuid}', '{bill_num}', '{inv_date}', '{inv_date}', "
            f"{gross}, {tax}, {gross}, '{status}', {sql_str(notes_text)}, '{inv_date}', {paid}, {balance}, "
            f"{discount}, '{method}')"
        )

        # Build Bill Items Rows
        if category_name and str(category_name).strip():
            # category_name format: code*price*description*qty,code*price*description*qty
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
                item_statements.append(
                    f"  ('{item_uuid}', '{bill_uuid}', {sql_str(desc_i)}, {qty_i}, {price_i}, {tot_i}, '{inv_date}', {sql_str(code_i)})"
                )
        else:
            item_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.bill_item.{old_pay_id}.0"))
            item_statements.append(
                f"  ('{item_uuid}', '{bill_uuid}', 'Medical Consultation / Service', 1, {gross}, {gross}, '{inv_date}', 'MISC')"
            )

        # Build Payments Insert Row (if paid > 0)
        if paid > 0:
            payment_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.payment.{old_pay_id}"))
            pay_notes = f"Payment method: {deposit_type}"
            if notes_text: pay_notes += f" | {notes_text}"
            payment_statements.append(
                f"  ('{payment_uuid}', '{BRANCH_ID}', '{bill_uuid}', '{patient_uuid}', '{inv_date}', {paid}, '{method}', "
                f"'{pay_num}', {sql_str(pay_notes)}, '{inv_date}')"
            )

    print(f"\n--- MATCHING SUMMARY ---")
    print(f"Matched to patients: {matched_count} / {len(pay_rows)}")
    print(f"Fallback patient assigned: {fallback_count}")
    print(f"Total Gross Billing: ${total_gross_sum:,.2f}")
    print(f"Total Paid Amount: ${total_paid_sum:,.2f}")
    print(f"Total Outstanding Dues: ${total_due_sum:,.2f}")

    # Write import_step22_bills.sql
    with open(OUT_BILLS_SQL, 'w', encoding='utf-8') as f:
        f.write("-- ==========================================================\n")
        f.write("-- SpiritMed Bills Migration\n")
        f.write(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"-- Total bills: {len(bill_statements)}\n")
        f.write("-- ==========================================================\n\n")
        f.write("BEGIN;\n\n")
        f.write("-- Insert Fallback Patient record for legacy unlinked bills\n")
        f.write(f"INSERT INTO public.patients (id, branch_id, patient_number, full_name, file_number, status) VALUES\n")
        f.write(f"  ('{FALLBACK_PATIENT_UUID}', '{BRANCH_ID}', 'MIG-UNLINKED', 'Unlinked Legacy Patient', 'LEGACY-00', 'active')\n")
        f.write("ON CONFLICT (id) DO NOTHING;\n\n")

        # Chunk in blocks of 500
        chunk_size = 500
        for i in range(0, len(bill_statements), chunk_size):
            f.write("INSERT INTO public.bills (\n")
            f.write("  id, branch_id, patient_id, bill_number, invoice_date, due_date,\n")
            f.write("  subtotal, tax_amount, total_amount, status, notes, bill_date, paid_amount, balance,\n")
            f.write("  discount_amount, payment_method\n")
            f.write(") VALUES\n")
            f.write(",\n".join(bill_statements[i:i+chunk_size]))
            f.write("\nON CONFLICT (id) DO NOTHING;\n\n")

        f.write("COMMIT;\n")

    print(f"Wrote {OUT_BILLS_SQL}")

    # Write import_step23_bill_items.sql
    with open(OUT_ITEMS_SQL, 'w', encoding='utf-8') as f:
        f.write("-- ==========================================================\n")
        f.write("-- SpiritMed Bill Items Migration\n")
        f.write(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"-- Total items: {len(item_statements)}\n")
        f.write("-- ==========================================================\n\n")
        f.write("BEGIN;\n\n")

        chunk_size = 500
        for i in range(0, len(item_statements), chunk_size):
            f.write("INSERT INTO public.bill_items (\n")
            f.write("  id, bill_id, description, quantity, unit_price, total_price, created_at, code\n")
            f.write(") VALUES\n")
            f.write(",\n".join(item_statements[i:i+chunk_size]))
            f.write("\nON CONFLICT (id) DO NOTHING;\n\n")

        f.write("COMMIT;\n")

    print(f"Wrote {OUT_ITEMS_SQL}")

    # Write import_step24_payments.sql
    with open(OUT_PAYMENTS_SQL, 'w', encoding='utf-8') as f:
        f.write("-- ==========================================================\n")
        f.write("-- SpiritMed Payments Migration\n")
        f.write(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"-- Total payments: {len(payment_statements)}\n")
        f.write("-- ==========================================================\n\n")
        f.write("BEGIN;\n\n")

        chunk_size = 500
        for i in range(0, len(payment_statements), chunk_size):
            f.write("INSERT INTO public.payments (\n")
            f.write("  id, branch_id, bill_id, patient_id, payment_date, amount, payment_method,\n")
            f.write("  reference_number, notes, created_at\n")
            f.write(") VALUES\n")
            f.write(",\n".join(payment_statements[i:i+chunk_size]))
            f.write("\nON CONFLICT (id) DO NOTHING;\n\n")

        f.write("COMMIT;\n")

    print(f"Wrote {OUT_PAYMENTS_SQL}")

    # Write import_step25_update_patient_dues.sql
    with open(OUT_PATIENT_DUES_SQL, 'w', encoding='utf-8') as f:
        f.write("-- ==========================================================\n")
        f.write("-- SpiritMed Update Patient Dues Column Migration\n")
        f.write(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("-- ==========================================================\n\n")
        f.write("BEGIN;\n\n")
        f.write("-- 1. Ensure outstanding_balance column exists on patients table\n")
        f.write("ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC DEFAULT 0;\n\n")
        f.write("-- 2. Update patient cumulative outstanding dues from bills\n")
        f.write("UPDATE public.patients p\n")
        f.write("SET outstanding_balance = COALESCE(b.total_due, 0)\n")
        f.write("FROM (\n")
        f.write("  SELECT patient_id, SUM(balance) AS total_due\n")
        f.write("  FROM public.bills\n")
        f.write("  WHERE balance > 0\n")
        f.write("  GROUP BY patient_id\n")
        f.write(") b\n")
        f.write("WHERE p.id = b.patient_id;\n\n")
        f.write("COMMIT;\n")

    print(f"Wrote {OUT_PATIENT_DUES_SQL}")

if __name__ == '__main__':
    run()
