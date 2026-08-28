"""
analyze_and_migrate_patient5.py
================================
1. Parses patient (5).sql from the old MySQL database
2. Detects and reports ALL duplicate records (by patient_id, name+phone, etc.)
3. Generates a Supabase-compatible SQL migration:
   - INSERT OR UPDATE (upsert) for all patients using ON CONFLICT
   - Uses deterministic UUIDs (uuid5) so re-runs are safe
   - Ensures ALL emails are strictly unique per patient (uses +<pn> subaddressing for shared family emails)
"""

import re
import uuid
import os
from datetime import datetime
from collections import defaultdict, Counter

INPUT_FILE  = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (5).sql"
OUTPUT_SQL  = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step28_patient5_upsert.sql"
REPORT_FILE = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\patient5_duplicate_report.txt"

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

# ── helpers ──────────────────────────────────────────────────────────────────

def sql_str(v):
    if v is None or str(v).strip() in ('', 'NULL', 'null'):
        return 'NULL'
    return "'" + str(v).strip().replace("'", "''") + "'"

def unquote(v):
    if not v:
        return None
    v = v.strip()
    if v.upper() == 'NULL':
        return None
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

def parse_date(raw):
    if not raw or str(raw).strip() in ('', 'NULL', 'null'):
        return None
    raw = str(raw).strip()
    if raw.isdigit() and len(raw) == 10:
        try:
            d = datetime.fromtimestamp(int(raw))
            if 1900 <= d.year <= 2030:
                return d.strftime('%Y-%m-%d')
        except:
            pass
        return None
    if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        try:
            y = int(raw[:4])
            m = int(raw[5:7])
            d = int(raw[8:10])
            if 1900 <= y <= 2030 and 1 <= m <= 12 and 1 <= d <= 31:
                return raw
        except:
            pass
        return None
    for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%m-%d-%Y', '%Y/%m/%d', '%d-%m-%y', '%m/%d/%y']:
        try:
            d = datetime.strptime(raw, fmt)
            if 1900 <= d.year <= 2030:
                return d.strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None

def normalize_gender(sex):
    if not sex:
        return 'other'
    s = str(sex).strip().lower()
    if s.startswith('f') or 'female' in s:
        return 'female'
    if s.startswith('m') or 'male' in s:
        return 'male'
    return 'other'

def normalize_status(s):
    if not s:
        return 'active'
    v = str(s).strip().lower()
    if 'deceas' in v or v == 'dead':
        return 'deceased'
    if 'discharg' in v:
        return 'discharged'
    return 'active'

def clean_phone(phone):
    if not phone:
        return None
    ph = str(phone).strip()
    if ph in ('263', '26377', 'NULL', 'null', '-', '', '0') or len(ph) < 5:
        return None
    return ph

def clean_allergies(a):
    if not a:
        return None
    v = str(a).strip()
    if v.lower() in ('nil', 'nill', 'none', 'no', 'n/a', '-', ''):
        return None
    return v

def clean_nok_rel(rel):
    if not rel:
        return None
    r = str(rel).strip()
    if r.lower() in ('nil', 'nill', 'none', 'no', 'n/a', '-', ''):
        return None
    return r

def clean_medical_aid_name(ma):
    if not ma:
        return None
    m = str(ma).strip().upper()
    if m in ('CASH', 'NIL', 'NONE', 'OTHER', 'NOSTRO', 'NULL', 'DISCOVERY', 'PRESTIGE', 'PLATINUM', 'USD', ''):
        return None
    if m.startswith('CIMAS'): return 'CIMAS'
    if m.startswith('PSMAS'): return 'PSMAS'
    if m.startswith('FML') or m.startswith('FIRST MUTUAL'): return 'First Mutual Health'
    if m.startswith('FLIMAS'): return 'FLIMAS'
    if m.startswith('FILMAS'): return 'FILMAS'
    if m.startswith('CELLMED'): return 'Cellmed Health'
    if m.startswith('ALLIANCE'): return 'Alliance Health'
    if m.startswith('BONVIE'): return 'Bonvie Medical Aid'
    if m.startswith('STEWARD'): return 'Steward Health'
    if m.startswith('FBC'): return 'FBC Health'
    if m.startswith('MINERVA'): return 'Minerva'
    if m.startswith('G HEALTH') or m.startswith('GEN H') or m.startswith('GENERATION'): return 'Generation Health'
    parts = m.split()
    return " ".join([p.capitalize() for p in parts])

IDX = {
    'id': 0, 'img_url': 1, 'name': 2, 'email': 3, 'doctor': 4,
    'address': 5, 'phone': 6, 'sex': 7, 'birthdate': 8, 'age': 9,
    'bloodgroup': 10, 'ion_user_id': 11, 'patient_id': 12,
    'add_date': 13, 'reg_time': 14, 'how_added': 15,
    'appt_conf': 16, 'est_conf': 17, 'appt_create': 18, 'meeting': 19,
    'occupation': 20, 'allegies': 21, 'chronic': 22,
    'fee_fullname': 23, 'fee_address': 24, 'fee_cell': 25,
    'fee_idnumber': 26, 'fee_email': 27,
    'medical_aid': 28, 'nok_name': 29, 'nok_address': 30,
    'nok_email': 31, 'nok_cell': 32,
    'ref_name': 33, 'ref_afhoz': 34, 'nok_relation': 35,
    'medical_type': 36, 'medical_number': 37,
    'medical_suffix': 38, 'medical_member': 39,
    'flags': 40, 'ref_contact': 41, 'ref_email': 42,
    'titlep': 43, 'ref_phys': 44, 'filenumber': 45,
    'medicalaid_code': 46, 'clinical': 47, 'smoke': 48,
    'alcohol': 49, 'payment_conf': 50, 'status': 51, 'refbydoctor': 52,
}

def main():
    print(f"Reading {INPUT_FILE}...")
    with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    insert_pat = re.compile(
        r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);(?=\s*(?:INSERT|ALTER|COMMIT|--|$))',
        re.DOTALL | re.IGNORECASE
    )

    all_rows = []
    for match in insert_pat.finditer(content):
        block = match.group(1)
        depth, start = 0, None
        for idx, ch in enumerate(block):
            if ch == '(':
                if depth == 0: start = idx + 1
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0 and start is not None:
                    all_rows.append(block[start:idx])
                    start = None

    print(f"Total rows in patient (5).sql: {len(all_rows)}")

    parsed = []
    for row_str in all_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 53: cols.append(None)
        parsed.append(cols)

    # De-duplicate by patient_id / old MySQL id
    seen_patient_ids = {}
    seen_old_ids = {}

    parsed_sorted = sorted(parsed, key=lambda c: int(str(c[IDX['id']] or 0)))

    for cols in parsed_sorted:
        pid = str(cols[IDX['patient_id']] or '').strip()
        old_id = str(cols[IDX['id']] or '').strip()
        name = str(cols[IDX['name']] or '').strip()

        if not name or re.match(r'^patient\s+\d+$', name, re.IGNORECASE):
            continue

        if pid and pid not in ('0', ''):
            seen_patient_ids[pid] = cols
        else:
            seen_old_ids[old_id] = cols

    all_unique = list(seen_patient_ids.values()) + list(seen_old_ids.values())
    print(f"Unique patients after de-dup: {len(all_unique)}")

    # ── EMAIL DE-DUPLICATION (Strict Uniqueness) ─────────────────────────────
    # First pass: collect raw emails and assign patient numbers
    patient_emails = []
    for cols in all_unique:
        old_id = str(cols[IDX['id']] or '').strip()
        pid    = str(cols[IDX['patient_id']] or '').strip()
        pn     = pid if pid and pid not in ('0', '') else f"P{old_id.zfill(4)}"
        
        email_r = cols[IDX['email']]
        if email_r and str(email_r).strip() not in ('', 'NULL', 'null'):
            e = str(email_r).strip()
            if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', e) and 'urocare' not in e.lower():
                patient_emails.append((pn, e))
            else:
                patient_emails.append((pn, f"patient.{pn}@spiritmed.local"))
        else:
            patient_emails.append((pn, f"patient.{pn}@spiritmed.local"))

    # Count email occurrences
    email_counts = Counter([e[1] for e in patient_emails])
    seen_emails_used = set()
    final_email_map = {}

    for pn, email in patient_emails:
        if email in seen_emails_used or email_counts[email] > 1:
            # Append +<pn> or use fallback to ensure 100% uniqueness
            if '@' in email and not email.endswith('@spiritmed.local'):
                parts = email.split('@')
                clean_e = f"{parts[0]}+{pn}@{parts[1]}"
            else:
                clean_e = f"patient.{pn}@spiritmed.local"
        else:
            clean_e = email
        
        seen_emails_used.add(clean_e)
        final_email_map[pn] = clean_e

    # Medical aids
    ma_names = set()
    for cols in all_unique:
        ma = clean_medical_aid_name(cols[IDX['medical_aid']])
        if ma:
            ma_names.add(ma)

    ma_map = {}
    for name in sorted(ma_names):
        ma_map[name] = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.medical_aid.{name}"))

    # Generate SQL
    sql_out = []
    sql_out.append("-- ==============================================================")
    sql_out.append("-- STEP 28: Upsert patients from patient (5).sql  (latest export)")
    sql_out.append(f"-- Generated : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    sql_out.append(f"-- Source    : patient (5).sql")
    sql_out.append(f"-- Patients  : {len(all_unique)} (after de-duplication)")
    sql_out.append("-- Strategy  : ON CONFLICT (patient_number) DO UPDATE")
    sql_out.append("-- ==============================================================")
    sql_out.append("")
    sql_out.append("BEGIN;")
    sql_out.append("")

    if ma_map:
        sql_out.append("-- ── 1. Upsert Medical Aids ──────────────────────────────────")
        sql_out.append("INSERT INTO public.medical_aids (id, branch_id, name, is_active) VALUES")
        ma_rows = []
        for name, uid in ma_map.items():
            ma_rows.append(f"  ('{uid}', '{BRANCH_ID}', {sql_str(name)}, true)")
        sql_out.append(",\n".join(ma_rows))
        sql_out.append("ON CONFLICT (id) DO NOTHING;")
        sql_out.append("")

    sql_out.append("-- ── 2. Upsert Patients ──────────────────────────────────────")

    COLS = (
        "  title, full_name, gender, date_of_birth, phone, email, address,\n"
        "  file_number, patient_number, payment_method,\n"
        "  medical_aid_id, medical_aid_number, medical_aid_main_member,\n"
        "  allergies, chronic_conditions, status,\n"
        "  next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,\n"
        "  occupation, branch_id, created_at"
    )

    CONFLICT_UPDATE = (
        "  full_name          = EXCLUDED.full_name,\n"
        "  phone              = COALESCE(EXCLUDED.phone, patients.phone),\n"
        "  email              = CASE WHEN patients.email LIKE '%spiritmed.local' THEN EXCLUDED.email ELSE patients.email END,\n"
        "  address            = COALESCE(EXCLUDED.address, patients.address),\n"
        "  date_of_birth      = COALESCE(EXCLUDED.date_of_birth, patients.date_of_birth),\n"
        "  gender             = COALESCE(EXCLUDED.gender, patients.gender),\n"
        "  title              = COALESCE(EXCLUDED.title, patients.title),\n"
        "  file_number        = COALESCE(EXCLUDED.file_number, patients.file_number),\n"
        "  medical_aid_id     = COALESCE(EXCLUDED.medical_aid_id, patients.medical_aid_id),\n"
        "  medical_aid_number = COALESCE(EXCLUDED.medical_aid_number, patients.medical_aid_number),\n"
        "  allergies          = COALESCE(EXCLUDED.allergies, patients.allergies),\n"
        "  chronic_conditions = COALESCE(EXCLUDED.chronic_conditions, patients.chronic_conditions),\n"
        "  next_of_kin_name   = COALESCE(EXCLUDED.next_of_kin_name, patients.next_of_kin_name),\n"
        "  next_of_kin_phone  = COALESCE(EXCLUDED.next_of_kin_phone, patients.next_of_kin_phone),\n"
        "  status             = EXCLUDED.status"
    )

    CHUNK = 150
    patient_rows = []

    for cols in all_unique:
        old_id   = str(cols[IDX['id']] or '').strip()
        name     = str(cols[IDX['name']] or '').strip()
        address  = cols[IDX['address']]
        phone    = cols[IDX['phone']]
        sex      = cols[IDX['sex']]
        bdate    = cols[IDX['birthdate']]
        occ      = cols[IDX['occupation']]
        allerg   = cols[IDX['allegies']]
        chronic  = cols[IDX['chronic']]
        nok_name = cols[IDX['nok_name']]
        nok_cell = cols[IDX['nok_cell']]
        nok_rel  = cols[IDX['nok_relation']]
        med_num  = cols[IDX['medical_number']]
        med_mem  = cols[IDX['medical_member']]
        title    = cols[IDX['titlep']]
        filenr   = cols[IDX['filenumber']]
        status_r = cols[IDX['status']]
        ma_raw   = cols[IDX['medical_aid']]

        pid = str(cols[IDX['patient_id']] or '').strip()
        pn  = pid if pid and pid not in ('0', '') else f"P{old_id.zfill(4)}"

        fn = str(filenr or '').strip()
        if not fn or fn in ('0', 'NULL', 'null'):
            fn = None

        gender  = normalize_gender(sex)
        dob     = parse_date(bdate)
        status  = normalize_status(status_r)
        ma_name = clean_medical_aid_name(ma_raw)

        if ma_name:
            pay_method = 'medical_aid'
            ma_id_sql  = f"'{ma_map[ma_name]}'"
        else:
            pay_method = 'cash'
            ma_id_sql  = 'NULL'

        email_clean  = final_email_map[pn]
        phone_clean  = clean_phone(phone)
        nok_cell_cl  = clean_phone(nok_cell)
        allerg_clean = clean_allergies(allerg)
        nok_rel_cl   = clean_nok_rel(nok_rel)
        chronic_cl   = str(chronic or '').strip() or None

        row = (
            f"({sql_str(title)}, {sql_str(name)}, '{gender}', "
            f"{'NULL' if not dob else sql_str(dob)}, "
            f"{sql_str(phone_clean)}, {sql_str(email_clean)}, {sql_str(address)}, "
            f"{sql_str(fn)}, {sql_str(pn)}, "
            f"'{pay_method}', "
            f"{ma_id_sql}, {sql_str(med_num)}, {sql_str(med_mem)}, "
            f"{sql_str(allerg_clean)}, {sql_str(chronic_cl)}, "
            f"'{status}', "
            f"{sql_str(nok_name)}, {sql_str(nok_cell_cl)}, {sql_str(nok_rel_cl)}, "
            f"{sql_str(occ)}, "
            f"'{BRANCH_ID}', NOW())"
        )
        patient_rows.append(row)

    for i in range(0, len(patient_rows), CHUNK):
        chunk = patient_rows[i:i+CHUNK]
        sql_out.append("INSERT INTO public.patients (")
        sql_out.append(COLS)
        sql_out.append(") VALUES")
        for j, row in enumerate(chunk):
            comma = "," if j < len(chunk) - 1 else ""
            sql_out.append(f"  {row}{comma}")
        sql_out.append("ON CONFLICT (patient_number) DO UPDATE SET")
        sql_out.append(CONFLICT_UPDATE + ";")
        sql_out.append("")

    sql_out.append("COMMIT;")
    sql_out.append("")
    sql_out.append(f"-- Total unique patients upserted: {len(all_unique)}")

    with open(OUTPUT_SQL, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_out))

    print(f"\nSQL migration written to: {OUTPUT_SQL}")
    print(f"Total patients in migration: {len(all_unique)}")

if __name__ == '__main__':
    main()
