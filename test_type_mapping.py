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

def map_appointment_type(remarks):
    if not remarks:
        return 'consultation'
    r = str(remarks).lower().strip()
    if 'review' in r or 'follow' in r or 'f/u' in r:
        return 'follow_up'
    if 'emergency' in r or 'stat' in r:
        return 'emergency'
    if any(k in r for k in ['spc', 'uroflow', 'procedure', 'change', 'tuc', 'catheter', 'biopsy', 'cysto', 'ultrasound', 'uss', 'psa']):
        return 'procedure'
    if 'new old' in r:
        return 'initial_new_old'
    if any(k in r for k in ['consult', 'n/p', 'new', 'cash', 'cimas', 'psmas', 'first']):
        return 'consultation'
    return 'follow_up'

def map_status(raw_status):
    if not raw_status:
        return 'pending_confirmation'
    st = str(raw_status).strip().lower()
    if 'pending' in st or 'request' in st:
        return 'pending_confirmation'
    if 'treat' in st:
        return 'treated'
    if 'confirm' in st:
        return 'confirmed'
    if 'cancel' in st:
        return 'cancelled'
    if 'complete' in st:
        return 'completed'
    return 'pending_confirmation'

with open(APPOINTMENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
    sql_content = f.read()

tuples = extract_tuples(sql_content, 'appointment')

type_counts = Counter()
status_counts = Counter()

for t in tuples:
    cols = [unquote(v) for v in split_values(t)]
    while len(cols) < 28: cols.append(None)
    
    remarks = cols[7]
    raw_status = cols[11]
    
    app_type = map_appointment_type(remarks)
    st = map_status(raw_status)
    
    type_counts[app_type] += 1
    status_counts[st] += 1

print("=== APPOINTMENT TYPE BREAKDOWN ===")
for k, v in type_counts.most_common():
    print(f"  {k:<20s} : {v:>6d} ({v/len(tuples)*100:.1f}%)")

print("\n=== APPOINTMENT STATUS BREAKDOWN ===")
for k, v in status_counts.most_common():
    print(f"  {k:<20s} : {v:>6d} ({v/len(tuples)*100:.1f}%)")
