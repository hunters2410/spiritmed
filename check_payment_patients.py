import re

payment_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payment (8).sql"
patients_import_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step3_patients.sql"
old_patient_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (3).sql"

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

# 1. Read old patient mapping (id -> patient_id, filenumber, name, phone)
old_patients_by_id = {}
old_patients_by_pid = {}
old_patients_by_fn = {}

with open(old_patient_sql, 'r', encoding='utf-8', errors='replace') as f:
    old_p_content = f.read()

insert_pat = re.compile(r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)', re.DOTALL | re.IGNORECASE)
for match in insert_pat.finditer(old_p_content):
    block = match.group(1)
    depth, s = 0, None
    for i, ch in enumerate(block):
        if ch == '(':
            if depth == 0: s = i + 1
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0 and s is not None:
                row_str = block[s:i]
                cols = [unquote(v) for v in split_values(row_str)]
                while len(cols) < 53: cols.append(None)
                
                oid = cols[0]
                name = cols[2]
                pid = cols[12]
                fn = cols[45]
                phone = cols[6]
                
                info = {'old_id': oid, 'patient_id': pid, 'filenumber': fn, 'name': name, 'phone': phone}
                if oid: old_patients_by_id[str(oid)] = info
                if pid: old_patients_by_pid[str(pid)] = info
                if fn: old_patients_by_fn[str(fn)] = info
                s = None

print(f"Old patients index created: {len(old_patients_by_id)} by id, {len(old_patients_by_pid)} by pid, {len(old_patients_by_fn)} by fn")

# 2. Read imported patients SQL (import_step3_patients.sql)
import_patients_by_pn = {}
import_patients_by_fn = {}
import_patients_by_name = {}

with open(patients_import_sql, 'r', encoding='utf-8', errors='replace') as f:
    imp_content = f.read()

# Extract tuples from import_step3_patients.sql
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
        file_num = cols[7]
        pat_num = cols[8]
        
        info = {'full_name': full_name, 'file_number': file_num, 'patient_number': pat_num}
        if pat_num: import_patients_by_pn[str(pat_num)] = info
        if file_num: import_patients_by_fn[str(file_num)] = info
        if full_name: import_patients_by_name[str(full_name).strip().lower()] = info

print(f"Imported patients index created: {len(import_patients_by_pn)} by patient_number, {len(import_patients_by_fn)} by file_number")

# 3. Read payment (8).sql and check patient matches
with open(payment_sql, 'r', encoding='utf-8', errors='replace') as f:
    pay_content = f.read()

inserts = [m.start() for m in re.finditer(r'INSERT INTO `payment`', pay_content, re.IGNORECASE)]
all_pay_rows = []
for start_idx in inserts:
    values_idx = pay_content.find("VALUES", start_idx)
    if values_idx != -1:
        end_semicolon = pay_content.find(";\n", values_idx)
        if end_semicolon == -1: end_semicolon = pay_content.find(";", values_idx)
        block = pay_content[values_idx + 6:end_semicolon]
        depth, s = 0, None
        for i, ch in enumerate(block):
            if ch == '(':
                if depth == 0: s = i + 1
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0 and s is not None:
                    all_pay_rows.append(block[s:i])
                    s = None

print(f"Loaded {len(all_pay_rows)} payment records from payment (8).sql")

matched_direct_pn = 0
matched_via_old_id = 0
matched_via_fn = 0
matched_via_name = 0
unmatched = 0

sample_unmatched = []

for r in all_pay_rows:
    cols = [unquote(v) for v in split_values(r)]
    while len(cols) < 30: cols.append(None)
    
    pay_patient_ref = cols[2] # e.g. '5102'
    pay_patient_name = cols[21] # e.g. 'Cicilia Shoriwa'
    
    if not pay_patient_ref and not pay_patient_name:
        unmatched += 1
        continue
        
    ref_str = str(pay_patient_ref).strip() if pay_patient_ref else ''
    
    # Try Direct Match on patient_number
    if ref_str in import_patients_by_pn:
        matched_direct_pn += 1
        continue
        
    # Try match via old patient dictionary (id / patient_id / fn)
    old_p_info = old_patients_by_id.get(ref_str) or old_patients_by_pid.get(ref_str) or old_patients_by_fn.get(ref_str)
    if old_p_info:
        # Check if old_p_info's patient_id or fn or name is in imported patients
        pid = old_p_info.get('patient_id')
        fn = old_p_info.get('filenumber')
        nm = str(old_p_info.get('name') or '').strip().lower()
        
        if pid and str(pid) in import_patients_by_pn:
            matched_via_old_id += 1
            continue
        elif fn and str(fn) in import_patients_by_fn:
            matched_via_fn += 1
            continue
        elif nm and nm in import_patients_by_name:
            matched_via_name += 1
            continue
            
    # Try name match from payment record itself
    if pay_patient_name and str(pay_patient_name).strip().lower() in import_patients_by_name:
        matched_via_name += 1
        continue
        
    unmatched += 1
    if len(sample_unmatched) < 10:
        sample_unmatched.append((pay_patient_ref, pay_patient_name))

print("\n--- PATIENT MATCHING RESULTS ---")
print(f"Matched directly by patient_number: {matched_direct_pn}")
print(f"Matched via old ID / patient_id mapping: {matched_via_old_id}")
print(f"Matched via file_number: {matched_via_fn}")
print(f"Matched via patient name: {matched_via_name}")
print(f"Total Matched: {matched_direct_pn + matched_via_old_id + matched_via_fn + matched_via_name} / {len(all_pay_rows)}")
print(f"Unmatched records: {unmatched}")
if sample_unmatched:
    print("\nSample unmatched payments (ref, name):", sample_unmatched)
