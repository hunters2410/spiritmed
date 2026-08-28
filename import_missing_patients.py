"""
CORRECT approach to find and import only the 1,263 patients that were
skipped due to duplicate patient_number within the OLD system's data.

How it works:
1. Process all 7930 rows, assigning patient_numbers exactly as before
2. Track which patient_numbers get used first (already imported OK)
3. When a duplicate patient_number is found → that's one of the 1,263 skipped ones
4. Only OUTPUT those skipped ones, using "MIG-{old_id}" as their patient_number
5. Result: no duplicates created, missing patients get unique numbers
"""
import re
from datetime import datetime

INPUT    = r"C:\Users\Acer P16\Downloads\patient (2).sql"
OUT_FILE = r"C:\Users\Acer P16\Downloads\patients_conflicts.sql"
BRANCH   = "697a3863-1de7-4615-819c-45b0d7066d67"


def sql_str(v):
    if v is None or str(v).strip() in ('', 'NULL', 'null'):
        return 'NULL'
    return "'" + str(v).strip().replace("'", "''") + "'"

def parse_date(raw):
    if not raw or str(raw).strip() in ('', 'NULL', 'null'):
        return None
    raw = str(raw).strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        try:
            y = int(raw[:4])
            if 1900 <= y <= 2026:
                return raw
        except:
            pass
        return None
    for fmt in ['%d-%m-%Y','%d/%m/%Y','%m/%d/%Y','%m-%d-%Y','%Y/%m/%d','%d-%m-%y','%m/%d/%y']:
        try:
            d = datetime.strptime(raw, fmt)
            if 1900 <= d.year <= 2026:
                return d.strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None

def normalize_gender(sex):
    if not sex: return 'other'
    s = str(sex).strip().lower()
    if s.startswith('f'): return 'female'
    if s.startswith('m'): return 'male'
    return 'other'

def normalize_payment(med_type):
    if not med_type: return 'cash'
    if 'CASH' in str(med_type).upper(): return 'cash'
    return 'medical_aid'

def normalize_status(s):
    if not s: return 'active'
    v = str(s).strip().lower()
    if 'deceas' in v: return 'deceased'
    if 'discharg' in v: return 'discharged'
    return 'active'

def normalize_email(email_raw, old_id):
    if not email_raw or str(email_raw).strip() in ('', 'NULL'):
        return f"mig.{old_id}@spiritmed.local"
    e = str(email_raw).strip()
    if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', e) and 'urocare' not in e.lower():
        return e
    return f"mig.{old_id}@spiritmed.local"

def gen_patient_number(filenumber, old_id):
    fn = str(filenumber or '').strip()
    if fn and fn not in ('', 'NULL', 'null', '0') and len(fn) <= 10:
        return fn.zfill(4)
    return str(old_id).zfill(4)

def unquote(v):
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("''", "'")
    return v

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == "'" and not in_q: in_q = True; current += c
        elif c == "'" and in_q:
            if i+1 < len(row_str) and row_str[i+1] == "'":
                current += "''"; i += 2; continue
            in_q = False; current += c
        elif c == ',' and not in_q: values.append(current.strip()); current = ''
        else: current += c
        i += 1
    if current.strip(): values.append(current.strip())
    return values

with open(INPUT, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

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
            if depth == 0: start = idx + 1
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0 and start is not None:
                all_rows.append(block[start:idx]); start = None

print(f"Source rows: {len(all_rows)}")

IDX = {
    'id':0,'name':2,'email':3,'address':5,'phone':6,
    'sex':7,'birthdate':8,'occupation':20,
    'allegies':21,'chronic_medications':22,
    'next_of_kin_name':29,'next_of_kin_cell':32,
    'next_of_kin_relation':35,'medical_type':36,
    'medical_number':37,'medical_member':39,
    'titlep':43,'filenumber':45,'status':51,
}

COLS = """  title, full_name, gender, date_of_birth, phone, email, address,
  file_number, patient_number, payment_method, medical_aid_number,
  medical_aid_main_member, allergies, chronic_conditions, status,
  next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
  occupation, branch_id, created_at"""

used_numbers = set()   # patient_numbers already assigned (= already in DB)
conflict_rows = []     # rows that had duplicate patient_numbers (= skipped in first import)
placeholder_skip = 0

for row_str in all_rows:
    cols = [unquote(v) for v in split_values(row_str)]
    while len(cols) < 53: cols.append(None)

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

    # Skip placeholders
    if not name or not str(name).strip(): placeholder_skip += 1; continue
    name_clean = str(name).strip()
    if re.match(r'^patient\s+\d+$', name_clean, re.IGNORECASE): placeholder_skip += 1; continue

    # Generate original patient_number (same logic as first import)
    original_pn = gen_patient_number(filenumber, old_id)

    if original_pn in used_numbers:
        # This is one of the 1,263 that got skipped in the first import!
        # Use MIG-{old_id} as their new unique patient_number
        new_pn = f"MIG-{old_id}"
        email  = normalize_email(email_raw, old_id)
        dob    = parse_date(birthdate)
        gender = normalize_gender(sex)
        pay    = normalize_payment(med_type)
        status = normalize_status(status_raw)
        ph     = str(phone or '').strip()
        phone_c = ph if ph not in ('263','26377','','NULL','-','null') and len(ph) > 4 else None
        allerg  = str(allegies or '').strip()
        if allerg.lower() in ('nil','nill','none','no','n/a',''): allerg = None
        chron_c = str(chronic or '').strip() or None

        row_sql = (
            f"({sql_str(title)}, {sql_str(name_clean)}, '{gender}', "
            f"{sql_str(dob) if dob else 'NULL'}, "
            f"{sql_str(phone_c)}, {sql_str(email)}, {sql_str(address)}, "
            f"NULL, '{new_pn}', "
            f"'{pay}', {sql_str(med_num)}, "
            f"{sql_str(med_mem)}, {sql_str(allerg)}, {sql_str(chron_c)}, "
            f"'{status}', "
            f"{sql_str(nok_name)}, {sql_str(nok_cell)}, {sql_str(nok_rel)}, "
            f"{sql_str(occupation)}, '{BRANCH}', NOW())"
        )
        conflict_rows.append((original_pn, new_pn, name_clean, row_sql))
    else:
        used_numbers.add(original_pn)

print(f"Placeholder rows skipped: {placeholder_skip}")
print(f"Successfully assigned (already in DB): {len(used_numbers)}")
print(f"Conflict rows to re-import with MIG- numbers: {len(conflict_rows)}")
print("")

# Write output SQL
out = []
out.append("-- Re-import of 1,263 patients skipped due to duplicate patient_number")
out.append("-- These are assigned MIG-{old_id} patient numbers")
out.append(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
out.append(f"-- Branch: {BRANCH}")
out.append("")
out.append("BEGIN;")
out.append("")

rows_only = [r[3] for r in conflict_rows]
SUB = 200
for i in range(0, len(rows_only), SUB):
    sub = rows_only[i:i+SUB]
    out.append("INSERT INTO patients (")
    out.append(COLS)
    out.append(") VALUES")
    for j, row in enumerate(sub):
        comma = ',' if j < len(sub) - 1 else ''
        out.append(f"  {row}{comma}")
    out.append("ON CONFLICT (patient_number) DO NOTHING;")
    out.append("")

out.append("COMMIT;")
out.append(f"-- Total: {len(conflict_rows)} patients re-imported with MIG- patient numbers")

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))

size_kb = len('\n'.join(out).encode('utf-8')) / 1024
print(f"Output file: {OUT_FILE} ({size_kb:.0f} KB)")
print("")
print("Run patients_conflicts.sql in Supabase SQL Editor.")
print("After running, verify total with:")
print(f"  SELECT COUNT(*) FROM patients WHERE branch_id = '{BRANCH}';")
print(f"  Expected: 6667 + {len(conflict_rows)} = {6667 + len(conflict_rows)}")
