import re

payment_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payment (8).sql"
old_patient_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (3).sql"
patients_import_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step3_patients.sql"

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"): v = v[1:-1]
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

# Build map from old patient dump (patient 3.sql)
# old_id -> patient_id (col 12) / patient_number
old_id_to_pn = {}
old_id_to_name = {}

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
                cols = [unquote(v) for v in split_values(block[s:i])]
                while len(cols) < 53: cols.append(None)
                oid = cols[0]
                name = cols[2]
                pid = cols[12]
                fn = cols[45]
                
                # In convert_patient3.py:
                # if old_pid is valid -> pn = old_pid
                # else -> pn = P + zfill(old_id, 4)
                if pid and str(pid).strip() not in ('', 'NULL', 'null', '0'):
                    pn = str(pid).strip()
                else:
                    pn = f"P{str(oid).zfill(4)}"
                
                if oid:
                    old_id_to_pn[str(oid)] = pn
                    old_id_to_name[str(oid)] = name
                s = None

print(f"Mapped {len(old_id_to_pn)} old patient IDs to patient_numbers.")

# Now check how many old_id_to_pn exist in import_step3_patients.sql
imp_pns = set()
with open(patients_import_sql, 'r', encoding='utf-8', errors='replace') as f:
    imp_content = f.read()

depth, s = 0, None
for i, ch in enumerate(imp_content):
    if ch == '(':
        if depth == 0: s = i + 1
        depth += 1
    elif ch == ')':
        depth -= 1
        if depth == 0 and s is not None:
            cols = [unquote(v) for v in split_values(imp_content[s:i])]
            if len(cols) >= 10:
                pn = cols[8]
                if pn: imp_pns.add(pn)
            s = None

print(f"Total patient_numbers in import_step3_patients.sql: {len(imp_pns)}")

# Check payment (8).sql
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

found_in_imp = 0
not_found_in_imp = 0

for r in all_pay_rows:
    cols = [unquote(v) for v in split_values(r)]
    while len(cols) < 30: cols.append(None)
    pay_patient_ref = cols[2] # e.g. '5102'
    
    if not pay_patient_ref:
        not_found_in_imp += 1
        continue
        
    pn = old_id_to_pn.get(str(pay_patient_ref)) or str(pay_patient_ref)
    if pn in imp_pns:
        found_in_imp += 1
    else:
        not_found_in_imp += 1

print(f"\nPayment rows directly resolveable to imported patient_number: {found_in_imp} / {len(all_pay_rows)} ({found_in_imp/len(all_pay_rows)*100:.2f}%)")
print(f"Unresolvable rows: {not_found_in_imp}")
