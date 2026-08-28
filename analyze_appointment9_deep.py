import re
from collections import Counter

APPOINTMENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\appointment (9).sql"

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

with open(APPOINTMENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
    sql_content = f.read()

tuples = extract_tuples(sql_content, 'appointment')

remarks_cnt = Counter()
status_cnt = Counter()
visit_desc_cnt = Counter()
reason_cnt = Counter()

for t in tuples:
    cols = [unquote(v) for v in split_values(t)]
    while len(cols) < 28: cols.append(None)
    
    remarks      = cols[7]
    status       = cols[11]
    visit_desc   = cols[21]
    reason       = cols[27]
    
    if remarks: remarks_cnt[remarks.strip()] += 1
    if status: status_cnt[status.strip()] += 1
    if visit_desc: visit_desc_cnt[visit_desc.strip()] += 1
    if reason: reason_cnt[reason.strip()] += 1

print("--- Top 20 Remarks ---")
for k, v in remarks_cnt.most_common(20):
    print(f"  {k}: {v}")

print("\n--- Top 20 Statuses ---")
for k, v in status_cnt.most_common(20):
    print(f"  {k}: {v}")

print("\n--- Top 20 Visit Descriptions ---")
for k, v in visit_desc_cnt.most_common(20):
    print(f"  {k}: {v}")

print("\n--- Top 20 Reasons ---")
for k, v in reason_cnt.most_common(20):
    print(f"  {k}: {v}")
