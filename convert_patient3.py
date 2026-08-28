import re
import os
import uuid
from datetime import datetime

INPUT_FILE = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (3).sql"
OUTPUT_FILE = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patients_import.sql"
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

def sql_str(v):
    if v is None or str(v).strip() in ('', 'NULL', 'null'):
        return 'NULL'
    return "'" + str(v).strip().replace("'", "''") + "'"

def parse_date(raw):
    if not raw or str(raw).strip() in ('', 'NULL', 'null'):
        return None
    raw = str(raw).strip()
    
    # Check if raw is a Unix timestamp (like '1689072271')
    if raw.isdigit() and len(raw) == 10:
        try:
            d = datetime.fromtimestamp(int(raw))
            if 1900 <= d.year <= 2026:
                return d.strftime('%Y-%m-%d')
        except:
            pass
        return None

    if re.match(r'^\d{4}-\d{2}-\d{2}$', raw):
        try:
            y = int(raw[:4])
            if 1900 <= y <= 2026: return raw
        except:
            pass
        return None

    for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y', '%m-%d-%Y', '%Y/%m/%d', '%d-%m-%y', '%m/%d/%y']:
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
    if s.startswith('f') or 'female' in s or s == 'fenmale':
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

def clean_nok_relation(rel):
    if not rel:
        return None
    r = str(rel).strip()
    if r.lower() in ('nil', 'nill', 'none', 'no', 'n/a', '-', ''):
        return None
    return r

def clean_allergies(allergies):
    if not allergies:
        return None
    a = str(allergies).strip()
    if a.lower() in ('nil', 'nill', 'none', 'no', 'n/a', '-', ''):
        return None
    return a

def clean_phone(phone):
    if not phone:
        return None
    ph = str(phone).strip()
    # Clean trash entries like '263', '26377', etc.
    if ph in ('263', '26377', 'NULL', 'null', '-', '', '0') or len(ph) < 5:
        return None
    return ph

def clean_email(email_raw, patient_number):
    if not email_raw or str(email_raw).strip() in ('', 'NULL', 'null'):
        return f"patient.{patient_number.lower()}@spiritmed.local"
    e = str(email_raw).strip()
    if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', e) and 'urocare' not in e.lower():
        return e
    return f"patient.{patient_number.lower()}@spiritmed.local"

def clean_medical_aid_name(ma):
    if not ma:
        return None
    m = str(ma).strip().upper()
    if m in ('CASH', 'NIL', 'NONE', 'OTHER', 'NOSTRO', 'NULL', 'DISCOVERY', 'PRESTIGE', 'PLATINUM', 'USD'):
        return None
    # Normalize some common forms
    if m.startswith('CIMAS'): return 'CIMAS'
    if m.startswith('PSMAS'): return 'PSMAS'
    if m.startswith('FML') or m.startswith('FIRST MUTUAL'): return 'First Mutual Health'
    if m.startswith('FLIMAS'): return 'FLIMAS'
    if m.startswith('CELLMED'): return 'Cellmed Health'
    if m.startswith('ALLIANCE'): return 'Alliance Health'
    if m.startswith('BONVIE'): return 'Bonvie Medical Aid'
    if m.startswith('STEWARD'): return 'Steward Health'
    if m.startswith('FBC'): return 'FBC Health'
    if m.startswith('MINERVA'): return 'Minerva'
    if m.startswith('G HEALTH') or m.startswith('GEN H') or m.startswith('GENERATION'): return 'Generation Health'
    
    # Capitalize nicely
    parts = m.split()
    return " ".join([p.capitalize() for p in parts])

def clean_referral_name(ref_name):
    if not ref_name:
        return None
    r = str(ref_name).strip()
    if r.lower() in ('nil', 'nill', 'none', 'no', 'n/a', '-', '', '0'):
        return None
    r = " ".join(r.split())
    if len(r) < 3:
        return None
    return r


def unquote(v):
    if not v:
        return None
    v = v.strip()
    if v.upper() == 'NULL':
        return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    # Unescape MySQL backslash quotes
    v = v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\r', '\r').replace('\\\\', '\\')
    return v

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            # Escape character inside quotes
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

def gen_patient_number(filenumber, old_id):
    fn = str(filenumber or '').strip()
    if fn and fn not in ('', 'NULL', 'null', '0') and len(fn) <= 10:
        return fn.zfill(4)
    return str(old_id).zfill(4)

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Input file not found: {INPUT_FILE}")
        return

    print("Parsing MySQL inserts...")
    with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
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
                    all_rows.append(block[start:idx])
                    start = None

    print(f"Total rows in MySQL dump: {len(all_rows)}")

    IDX = {
        'id': 0, 'name': 2, 'email': 3, 'address': 5, 'phone': 6,
        'sex': 7, 'birthdate': 8, 'occupation': 20,
        'allegies': 21, 'chronic_medications': 22,
        'patient_id': 12, 'medical_aid': 28,
        'next_of_kin_name': 29, 'next_of_kin_cell': 32,
        'next_of_kin_relation': 35, 'medical_type': 36,
        'medical_number': 37, 'medical_member': 39,
        'titlep': 43, 'filenumber': 45, 'status': 51
    }

    # First pass: identify unique medical aids and referral doctors
    unique_ma_names = set()
    unique_referrals = {} # name -> {contact, email, affiliation}
    parsed_patients = []
    
    for row_str in all_rows:
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 53: cols.append(None)

        name = cols[IDX['name']]
        # Skip placeholder rows
        if not name or not str(name).strip(): continue
        name_clean = str(name).strip()
        if re.match(r'^patient\s+\d+$', name_clean, re.IGNORECASE): continue

        ma_raw = cols[IDX['medical_aid']]
        ma_clean = clean_medical_aid_name(ma_raw)
        if ma_clean:
            unique_ma_names.add(ma_clean)

        # Referral mapping
        ref_name_raw = cols[33] # reffered_name
        ref_name = clean_referral_name(ref_name_raw)
        if ref_name:
            ref_contact = clean_phone(cols[41])
            ref_email = cols[42].strip() if cols[42] and cols[42].strip() not in ('', 'NULL') else None
            ref_afhoz = cols[34].strip() if cols[34] and cols[34].strip() not in ('', 'NULL') else None
            
            if ref_name not in unique_referrals:
                unique_referrals[ref_name] = {
                    'contact': ref_contact,
                    'email': ref_email,
                    'affiliation': ref_afhoz
                }
            else:
                if not unique_referrals[ref_name]['contact'] and ref_contact:
                    unique_referrals[ref_name]['contact'] = ref_contact
                if not unique_referrals[ref_name]['email'] and ref_email:
                    unique_referrals[ref_name]['email'] = ref_email
                if not unique_referrals[ref_name]['affiliation'] and ref_afhoz:
                    unique_referrals[ref_name]['affiliation'] = ref_afhoz

        parsed_patients.append((cols, ma_clean, ref_name))

    # Pre-generate medical aid UUIDs using uuid5 (makes it deterministic and repeatable)
    ma_map = {}
    for name in sorted(list(unique_ma_names)):
        ma_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.medical_aid.{name}"))
        ma_map[name] = ma_uuid

    # Pre-generate referral doctor UUIDs
    ref_map = {}
    for name in sorted(list(unique_referrals.keys())):
        ref_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.referral_doctor.{name}"))
        ref_map[name] = ref_uuid

    print(f"Found {len(ma_map)} unique medical aid providers.")
    print(f"Found {len(ref_map)} unique referral doctors / clinics.")

    # Write output file
    sql_lines = []
    sql_lines.append("-- ==========================================================")
    sql_lines.append("-- SpiritMed Patient Import Script")
    sql_lines.append(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    sql_lines.append(f"-- Total patients: {len(parsed_patients)}")
    sql_lines.append("-- ==========================================================")
    sql_lines.append("")
    sql_lines.append("BEGIN;")
    sql_lines.append("")

    # 1. Insert Medical Aids
    if ma_map:
        sql_lines.append("-- ─── 1. Insert Medical Aids ───")
        sql_lines.append("INSERT INTO public.medical_aids (id, branch_id, name, is_active) VALUES")
        ma_inserts = []
        for name, uid in ma_map.items():
            ma_inserts.append(f"  ('{uid}', '{BRANCH_ID}', {sql_str(name)}, true)")
        sql_lines.append(",\n".join(ma_inserts))
        sql_lines.append("ON CONFLICT (id) DO NOTHING;")
        sql_lines.append("")

    # 2. Insert Referral Doctors
    if ref_map:
        sql_lines.append("-- ─── 2. Insert Referral Doctors ───")
        sql_lines.append("INSERT INTO public.referral_doctors (id, branch_id, full_name, name, contact, email, affiliation, is_active) VALUES")
        ref_inserts = []
        for name, uid in ref_map.items():
            info = unique_referrals[name]
            ref_inserts.append(f"  ('{uid}', '{BRANCH_ID}', {sql_str(name)}, {sql_str(name)}, {sql_str(info['contact'])}, {sql_str(info['email'])}, {sql_str(info['affiliation'])}, true)")
        sql_lines.append(",\n".join(ref_inserts))
        sql_lines.append("ON CONFLICT (id) DO NOTHING;")
        sql_lines.append("")

    # 3. Insert Patients in chunks of 100
    sql_lines.append("-- ─── 3. Insert Patients ───")
    COLS = (
        "  title, full_name, gender, date_of_birth, phone, email, address,\n"
        "  file_number, patient_number, payment_method, medical_aid_id, medical_aid_number,\n"
        "  medical_aid_main_member, allergies, chronic_conditions, status,\n"
        "  next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,\n"
        "  occupation, referral_doctor_id, branch_id, created_at"
    )

    used_pns = set()
    used_fns = set()
    patients_data = []

    for cols, ma_clean, ref_name in parsed_patients:
        old_id = cols[IDX['id']]
        name = cols[IDX['name']].strip()
        email_raw = cols[IDX['email']]
        address = cols[IDX['address']]
        phone = cols[IDX['phone']]
        sex = cols[IDX['sex']]
        birthdate = cols[IDX['birthdate']]
        occupation = cols[IDX['occupation']]
        allegies = cols[IDX['allegies']]
        chronic = cols[IDX['chronic_medications']]
        nok_name = cols[IDX['next_of_kin_name']]
        nok_cell = cols[IDX['next_of_kin_cell']]
        nok_rel = cols[IDX['next_of_kin_relation']]
        med_type = cols[IDX['medical_type']]
        med_num = cols[IDX['medical_number']]
        med_mem = cols[IDX['medical_member']]
        title = cols[IDX['titlep']]
        filenumber = cols[IDX['filenumber']]
        status_raw = cols[IDX['status']]

        # Uniqueness resolution for patient_number (mapping old patient_id to patient_number)
        old_pid = cols[IDX['patient_id']]
        if old_pid and str(old_pid).strip() not in ('', 'NULL', 'null', '0'):
            pn_clean = str(old_pid).strip()
            if pn_clean in used_pns:
                pn_clean = f"MIG-{old_id}"
            used_pns.add(pn_clean)
            pn = pn_clean
        else:
            # Fallback to P + old_id
            pn_clean = f"P{str(old_id).zfill(4)}"
            if pn_clean in used_pns:
                pn_clean = f"MIG-{old_id}"
            used_pns.add(pn_clean)
            pn = pn_clean

        # Uniqueness resolution for file_number
        fn_val = None
        if filenumber and str(filenumber).strip() not in ('', 'NULL', 'null', '0'):
            fn_clean = str(filenumber).strip()
            if fn_clean in used_fns:
                fn_clean = f"{fn_clean}-{old_id}"
            used_fns.add(fn_clean)
            fn_val = fn_clean

        # Normalizations
        gender = normalize_gender(sex)
        dob = parse_date(birthdate)
        status = normalize_status(status_raw)
        
        # Payment Method
        if ma_clean:
            payment_method = 'medical_aid'
            ma_id = ma_map[ma_clean]
        else:
            payment_method = 'cash'
            ma_id = None

        email = clean_email(email_raw, pn)
        phone_clean = clean_phone(phone)
        nok_cell_clean = clean_phone(nok_cell)
        allergies_clean = clean_allergies(allegies)
        nok_rel_clean = clean_nok_relation(nok_rel)
        chronic_clean = str(chronic or '').strip() or None

        ma_id_str = f"'{ma_id}'" if ma_id else "NULL"
        
        ref_id = ref_map[ref_name] if ref_name else None
        ref_id_str = f"'{ref_id}'" if ref_id else "NULL"

        row_val = (
            f"({sql_str(title)}, {sql_str(name)}, '{gender}', "
            f"{sql_str(dob) if dob else 'NULL'}, "
            f"{sql_str(phone_clean)}, {sql_str(email)}, {sql_str(address)}, "
            f"{sql_str(fn_val)}, {sql_str(pn)}, "
            f"'{payment_method}', "
            f"{ma_id_str}, "
            f"{sql_str(med_num)}, {sql_str(med_mem)}, "
            f"{sql_str(allergies_clean)}, {sql_str(chronic_clean)}, "
            f"'{status}', "
            f"{sql_str(nok_name)}, {sql_str(nok_cell_clean)}, {sql_str(nok_rel_clean)}, "
            f"{sql_str(occupation)}, {ref_id_str}, '{BRANCH_ID}', NOW())"
        )
        
        patients_data.append(row_val)

    # Chunk into groups of 100
    chunk_size = 100
    for i in range(0, len(patients_data), chunk_size):
        chunk = patients_data[i:i+chunk_size]
        sql_lines.append("INSERT INTO public.patients (")
        sql_lines.append(COLS)
        sql_lines.append(") VALUES")
        for j, row in enumerate(chunk):
            comma = "," if j < len(chunk) - 1 else ""
            sql_lines.append(f"  {row}{comma}")
        sql_lines.append("ON CONFLICT (patient_number) DO NOTHING;")
        sql_lines.append("")

    sql_lines.append("COMMIT;")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_lines))

    print(f"Generated clean import script at: {OUTPUT_FILE}")
    print(f"Total patients successfully converted: {len(patients_data)}")

if __name__ == '__main__':
    main()
