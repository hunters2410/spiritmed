import re

payment_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payment (8).sql"
old_patient_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (3).sql"
patients_import_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step3_patients.sql"

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

# Read imported patients name map
import_patients_by_name_clean = {}
with open(patients_import_sql, 'r', encoding='utf-8', errors='replace') as f:
    imp_content = f.read()

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
        if full_name:
            # normalize name: remove title, lowercase, strip
            clean_n = " ".join(full_name.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').split())
            import_patients_by_name_clean[clean_n] = (pat_num, full_name)

# Read payment dump
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

unmatched_rows = []
for r in all_pay_rows:
    cols = [unquote(v) for v in split_values(r)]
    while len(cols) < 30: cols.append(None)
    
    pay_patient_ref = cols[2]
    pay_patient_name = cols[21]
    
    # Check clean name match
    name_matched = False
    if pay_patient_name:
        cn = " ".join(pay_patient_name.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').split())
        if cn in import_patients_by_name_clean:
            name_matched = True
            
    if not name_matched and pay_patient_ref not in import_patients_by_name_clean:
        unmatched_rows.append(cols)

print(f"Unmatched after clean name matching: {len(unmatched_rows)}")
print("\nUnmatched details (ID, Ref Patient ID, Patient Name, Date, Amount, Remarks):")
for u in unmatched_rows[:20]:
    print(f"ID: {u[0]} | Ref: {u[2]} | Name: {u[21]} | Date: {u[25]} | Amount: ${u[11]} | Rec: ${u[17]}")
