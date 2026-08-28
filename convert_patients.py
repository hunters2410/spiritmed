"""
Patient Migration: MySQL (old urocare system) → Supabase
Converts patient (2).sql into a Supabase-compatible INSERT SQL file.
Output: Downloads/patients_supabase.sql
"""

import re
import sys
from datetime import datetime

# ─── CONFIG ─────────────────────────────────────────────────────────────────
INPUT_FILE  = r"C:\Users\Acer P16\Downloads\patient (2).sql"
OUTPUT_FILE = r"C:\Users\Acer P16\Downloads\patients_supabase.sql"

# EDIT THIS: paste your actual branch UUID from Supabase
# Run in Supabase SQL editor:  SELECT id, name FROM branches LIMIT 10;
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
# ────────────────────────────────────────────────────────────────────────────


def sql_str(v):
    """Return SQL-safe quoted string, or NULL."""
    if v is None or str(v).strip() in ('', 'NULL', 'null'):
        return 'NULL'
    return "'" + str(v).strip().replace("'", "''") + "'"


def parse_date(raw):
    """Parse various date formats → ISO yyyy-mm-dd or None."""
    if not raw or str(raw).strip() in ('', 'NULL', 'null'):
        return None
    raw = str(raw).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        # Validate year range
        try:
            y = int(raw[:4])
            if 1900 <= y <= 2026:
                return raw
        except:
            pass
        return None
    formats = [
        '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%m-%d-%Y',
        '%Y/%m/%d', '%d-%m-%y', '%m/%d/%y',
    ]
    for fmt in formats:
        try:
            d = datetime.strptime(raw, fmt)
            if 1900 <= d.year <= 2026:
                return d.strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None


def normalize_gender(sex):
    if not sex:
        return 'other'
    s = str(sex).strip().lower()
    if s.startswith('f'):
        return 'female'
    if s.startswith('m'):
        return 'male'
    return 'other'


def normalize_payment(med_type):
    if not med_type:
        return 'cash'
    m = str(med_type).strip().upper()
    if 'CASH' in m:
        return 'cash'
    # Everything else (CIMAS, PSMAS, FML, MEDICAL AID, etc.) = medical_aid
    return 'medical_aid'


def normalize_status(s):
    if not s:
        return 'active'
    v = str(s).strip().lower()
    if 'deceas' in v or v == 'dead':
        return 'deceased'
    if 'discharg' in v:
        return 'discharged'
    return 'active'


def normalize_email(email_raw, patient_number):
    if not email_raw or str(email_raw).strip() in ('', 'NULL'):
        return f"patient.{patient_number.lower()}@spiritmed.local"
    e = str(email_raw).strip()
    if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', e) and 'urocare' not in e.lower():
        return e
    return f"patient.{patient_number.lower()}@spiritmed.local"


def gen_patient_number(filenumber, old_id):
    fn = str(filenumber or '').strip()
    if fn and fn not in ('', 'NULL', 'null', '0') and len(fn) <= 10:
        return fn.zfill(4)
    return str(old_id).zfill(4)


def unquote(v):
    v = v.strip()
    if v.upper() == 'NULL':
        return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("''", "'")
    return v


def split_values(row_str):
    """Split a raw CSV-like row string respecting single-quoted strings."""
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == "'" and not in_q:
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


def main():
    print(f"Reading: {INPUT_FILE}")
    with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Extract all rows from INSERT blocks
    insert_pat = re.compile(
        r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
        re.DOTALL | re.IGNORECASE
    )

    all_rows = []
    for match in insert_pat.finditer(content):
        block = match.group(1)
        depth, start = 0, None
        for idx, ch in enumerate(block):
            if ch == '(':
                if depth == 0:
                    start = idx + 1
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0 and start is not None:
                    all_rows.append(block[start:idx])
                    start = None

    print(f"Found {len(all_rows)} rows.")
    if not all_rows:
        print("No rows found — check input file.")
        sys.exit(1)

    # Column index map (matches INSERT column order in the dump)
    IDX = {
        'id': 0, 'name': 2, 'email': 3, 'address': 5, 'phone': 6,
        'sex': 7, 'birthdate': 8, 'occupation': 20,
        'allegies': 21, 'chronic_medications': 22,
        'next_of_kin_name': 29, 'next_of_kin_cell': 32,
        'next_of_kin_relation': 35, 'medical_type': 36,
        'medical_number': 37, 'medical_member': 39,
        'titlep': 43, 'filenumber': 45, 'status': 51,
    }

    lines = []
    lines.append("-- ============================================================")
    lines.append("-- Patient Migration: Old Urocare System → SpiritMed Supabase")
    lines.append(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"-- Total source rows: {len(all_rows)}")
    lines.append("-- ============================================================")
    lines.append("--")
    lines.append("-- BEFORE RUNNING:")
    lines.append("-- 1. In Supabase SQL editor, run:  SELECT id, name FROM branches LIMIT 10;")
    lines.append("-- 2. Copy your branch UUID and paste it below (replace REPLACE_WITH_YOUR_BRANCH_UUID)")
    lines.append("-- 3. Run Ctrl+H in this file to replace REPLACE_WITH_YOUR_BRANCH_UUID")
    lines.append("-- 4. Then run this SQL in Supabase SQL editor")
    lines.append("--")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")

    imported, skipped = 0, 0
    chunk, CHUNK_SIZE = [], 100

    COLS = (
        "  title, full_name, gender, date_of_birth, phone, email, address,\n"
        "  file_number, patient_number, payment_method, medical_aid_number,\n"
        "  medical_aid_main_member, allergies, chronic_conditions, status,\n"
        "  next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,\n"
        "  occupation, branch_id, created_at"
    )

    def flush(rows):
        if not rows:
            return
        lines.append("INSERT INTO patients (")
        lines.append(COLS)
        lines.append(") VALUES")
        for j, r in enumerate(rows):
            comma = ',' if j < len(rows) - 1 else ''
            lines.append(f"  {r}{comma}")
        lines.append(";")
        lines.append("")

    for i, row_str in enumerate(all_rows):
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 53:
            cols.append(None)

        old_id     = cols[IDX['id']]
        name       = cols[IDX['name']]
        email_raw  = cols[IDX['email']]
        address    = cols[IDX['address']]
        phone      = cols[IDX['phone']]
        sex        = cols[IDX['sex']]
        birthdate  = cols[IDX['birthdate']]
        occupation = cols[IDX['occupation']]
        allegies   = cols[IDX['allegies']]
        chronic    = cols[IDX['chronic_medications']]
        nok_name   = cols[IDX['next_of_kin_name']]
        nok_cell   = cols[IDX['next_of_kin_cell']]
        nok_rel    = cols[IDX['next_of_kin_relation']]
        med_type   = cols[IDX['medical_type']]
        med_num    = cols[IDX['medical_number']]
        med_mem    = cols[IDX['medical_member']]
        title      = cols[IDX['titlep']]
        filenumber = cols[IDX['filenumber']]
        status_raw = cols[IDX['status']]

        # Skip blank placeholder rows
        if not name or not str(name).strip():
            skipped += 1; continue
        name_clean = str(name).strip()
        if re.match(r'^patient\s+\d+$', name_clean, re.IGNORECASE):
            skipped += 1; continue

        patient_number = gen_patient_number(filenumber, old_id)
        email          = normalize_email(email_raw, patient_number)
        dob            = parse_date(birthdate)
        gender         = normalize_gender(sex)
        payment_method = normalize_payment(med_type)
        status         = normalize_status(status_raw)

        # Clean obviously invalid phone numbers
        ph = str(phone or '').strip()
        phone_clean = ph if ph not in ('263', '26377', '', 'NULL', '-', 'null') and len(ph) > 4 else None

        # Normalize allegies → allergies (fix old typo)
        allergies = str(allegies or '').strip()
        if allergies.lower() in ('nil', 'nill', 'none', 'no', 'n/a', ''):
            allergies = None

        chronic_clean = str(chronic or '').strip() or None

        row_sql = (
            f"({sql_str(title)}, {sql_str(name_clean)}, '{gender}', "
            f"{sql_str(dob) if dob else 'NULL'}, "
            f"{sql_str(phone_clean)}, {sql_str(email)}, {sql_str(address)}, "
            f"{sql_str(filenumber)}, {sql_str(patient_number)}, "
            f"'{payment_method}', {sql_str(med_num)}, "
            f"{sql_str(med_mem)}, {sql_str(allergies)}, {sql_str(chronic_clean)}, "
            f"'{status}', "
            f"{sql_str(nok_name)}, {sql_str(nok_cell)}, {sql_str(nok_rel)}, "
            f"{sql_str(occupation)}, '{BRANCH_ID}', NOW())"
        )

        chunk.append(row_sql)
        imported += 1

        if len(chunk) >= CHUNK_SIZE:
            flush(chunk)
            chunk = []

    flush(chunk)

    lines.append("COMMIT;")
    lines.append("")
    lines.append(f"-- OK: {imported} patients inserted, {skipped} placeholder rows skipped.")

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"\n{'='*55}")
    print(f"  OK   {imported} patients converted")
    print(f"  SKIP {skipped} placeholder rows skipped")
    print(f"  OUT  {OUTPUT_FILE}")
    print(f"{'='*55}")
    print(f"\nNext steps:")
    print(f"  1. Open Supabase SQL editor")
    print(f"     Run:  SELECT id, name FROM branches LIMIT 10;")
    print(f"  2. Copy your branch UUID")
    print(f"  3. Open the output file")
    print(f"     Ctrl+H: replace REPLACE_WITH_YOUR_BRANCH_UUID with your UUID")
    print(f"  4. Paste the SQL into Supabase SQL editor and run it")


if __name__ == '__main__':
    main()
