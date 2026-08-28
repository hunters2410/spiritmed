import re
import os
from collections import Counter

PAYMENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\payment (12).sql"
DEPOSIT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\patient_deposit (8).sql"
PATIENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\patient (8).sql"

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

print("=== Analyzing payment (12).sql ===")
with open(PAYMENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
    p_content = f.read()

p_tuples = extract_tuples(p_content, 'payment')
print(f"Total tuples in payment (12).sql: {len(p_tuples)}")

p_total_gross = 0.0
p_total_received = 0.0
p_categories = Counter()
p_statuses = Counter()
p_deposit_types = Counter()

for t in p_tuples:
    cols = [unquote(v) for v in split_values(t)]
    while len(cols) < 60: cols.append(None)
    
    cat          = cols[1]
    gross_str    = cols[11]
    received_str = cols[17] if len(cols) > 17 else None
    dep_type     = cols[18] if len(cols) > 18 else None
    status       = cols[19] if len(cols) > 19 else None
    cat_name     = cols[16] if len(cols) > 16 else None
    
    if gross_str:
        try: p_total_gross += float(gross_str)
        except: pass
    if received_str:
        try: p_total_received += float(received_str)
        except: pass
        
    c_name = cat_name or cat or 'Unknown'
    p_categories[c_name] += 1
    if status: p_statuses[status] += 1
    if dep_type: p_deposit_types[dep_type] += 1

print(f"Total Gross Amount: ${p_total_gross:,.2f}")
print(f"Total Received Amount: ${p_total_received:,.2f}")
print("\nTop Categories/Services:")
for k, v in p_categories.most_common(10):
    print(f"  {k}: {v}")

print("\nStatuses:")
for k, v in p_statuses.most_common():
    print(f"  {k}: {v}")

print("\n=== Analyzing patient_deposit (8).sql ===")
with open(DEPOSIT_SQL, 'r', encoding='utf-8', errors='replace') as f:
    d_content = f.read()

d_tuples = extract_tuples(d_content, 'patient_deposit')
print(f"Total tuples in patient_deposit (8).sql: {len(d_tuples)}")

d_total_amount = 0.0
d_types = Counter()
linked_payment_ids = set()

for t in d_tuples:
    cols = [unquote(v) for v in split_values(t)]
    while len(cols) < 20: cols.append(None)
    
    pay_id     = cols[2]
    amt_str    = cols[4]
    dep_type   = cols[6]
    
    if amt_str:
        try: d_total_amount += float(amt_str)
        except: pass
    if dep_type: d_types[dep_type] += 1
    if pay_id: linked_payment_ids.add(pay_id)

print(f"Total Deposited Amount: ${d_total_amount:,.2f}")
print(f"Unique linked payment IDs in deposits: {len(linked_payment_ids)}")
print("\nDeposit Types:")
for k, v in d_types.most_common():
    print(f"  {k}: {v}")
