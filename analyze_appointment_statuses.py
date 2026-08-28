import re
from collections import Counter

sql_file = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\appointment (6).sql"

with open(sql_file, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

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

tuples = extract_tuples(content, 'appointment')
print(f"Extracted {len(tuples)} tuples")

status_counter = Counter()
request_counter = Counter()
remarks_counter = Counter()

for t in tuples:
    cols = [unquote(v) for v in split_values(t)]
    if len(cols) > 11:
        st = str(cols[11]).strip() if cols[11] is not None else 'NULL'
        status_counter[st] += 1
    if len(cols) > 13:
        req = str(cols[13]).strip() if cols[13] is not None else 'NULL'
        request_counter[req] += 1
    if len(cols) > 7:
        rem = str(cols[7]).strip() if cols[7] is not None else 'NULL'
        remarks_counter[rem] += 1

print("\n=== Column 11 (`status`) Distinct Values ===")
for st, count in status_counter.most_common():
    print(f"  {count:>6d} : '{st}'")

print("\n=== Column 13 (`request`) Distinct Values ===")
for req, count in request_counter.most_common(10):
    print(f"  {count:>6d} : '{req}'")

print("\n=== Column 7 (`remarks`) Top Values ===")
for rem, count in remarks_counter.most_common(10):
    print(f"  {count:>6d} : '{rem}'")
