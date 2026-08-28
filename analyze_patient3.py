import re
import os
from datetime import datetime

INPUT_FILE = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (3).sql"

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

def gen_patient_number(filenumber, old_id):
    fn = str(filenumber or '').strip()
    if fn and fn not in ('', 'NULL', 'null', '0') and len(fn) <= 10:
        return fn.zfill(4)
    return str(old_id).zfill(4)

def analyze():
    if not os.path.exists(INPUT_FILE):
        print(f"File not found: {INPUT_FILE}")
        return

    print("Analyzing patient (3).sql...")
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
                    all_rows.append(block[start:idx]); start = None

    print(f"Total SQL rows found: {len(all_rows)}")
    
    IDX = {
        'id': 0, 'name': 2, 'email': 3, 'address': 5, 'phone': 6,
        'sex': 7, 'birthdate': 8, 'filenumber': 45, 'status': 51
    }

    patient_numbers = {}
    valid_count = 0
    placeholder_count = 0
    genders = {}
    statuses = {}
    empty_fields = {'email': 0, 'phone': 0, 'dob': 0, 'address': 0}

    for idx, row_str in enumerate(all_rows):
        cols = [unquote(v) for v in split_values(row_str)]
        while len(cols) < 53: cols.append(None)

        old_id = cols[IDX['id']]
        name = cols[IDX['name']]
        email = cols[IDX['email']]
        phone = cols[IDX['phone']]
        sex = cols[IDX['sex']]
        dob = cols[IDX['birthdate']]
        address = cols[IDX['address']]
        filenumber = cols[IDX['filenumber']]
        status = cols[IDX['status']]

        # Check placeholder
        if not name or not str(name).strip():
            placeholder_count += 1
            continue
        name_clean = str(name).strip()
        if re.match(r'^patient\s+\d+$', name_clean, re.IGNORECASE):
            placeholder_count += 1
            continue

        valid_count += 1
        pn = gen_patient_number(filenumber, old_id)
        if pn in patient_numbers:
            patient_numbers[pn].append(old_id)
        else:
            patient_numbers[pn] = [old_id]

        genders[sex] = genders.get(sex, 0) + 1
        statuses[status] = statuses.get(status, 0) + 1

        if not email or email.strip() in ('', 'NULL'): empty_fields['email'] += 1
        if not phone or phone.strip() in ('', 'NULL'): empty_fields['phone'] += 1
        if not dob or dob.strip() in ('', 'NULL'): empty_fields['dob'] += 1
        if not address or address.strip() in ('', 'NULL'): empty_fields['address'] += 1

    duplicate_count = sum(len(ids) - 1 for ids in patient_numbers.values() if len(ids) > 1)
    unique_pn_count = len(patient_numbers)

    print("\n--- Summary ---")
    print(f"Placeholder / empty rows skipped: {placeholder_count}")
    print(f"Valid patient rows: {valid_count}")
    print(f"Unique patient numbers generated: {unique_pn_count}")
    print(f"Conflicts (duplicate patient numbers): {duplicate_count}")
    
    print("\n--- Gender Breakdown ---")
    for g, cnt in genders.items():
        print(f"  {g or 'NULL'}: {cnt}")

    print("\n--- Status Breakdown ---")
    for s, cnt in statuses.items():
        print(f"  {s or 'NULL'}: {cnt}")

    print("\n--- Missing Fields Breakdown ---")
    for fld, cnt in empty_fields.items():
        print(f"  No {fld}: {cnt} ({cnt/valid_count*100:.1f}%)")

if __name__ == '__main__':
    analyze()
