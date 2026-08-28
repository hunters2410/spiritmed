import re
import os

PRES_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\pres (1).sql"

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

with open(PRES_SQL, 'r', encoding='utf-8', errors='replace') as f:
    sql_content = f.read()

# Extract column names from CREATE TABLE statement
create_idx = sql_content.find("CREATE TABLE `pres`")
end_create = sql_content.find(") ENGINE=", create_idx)
col_lines = sql_content[create_idx:end_create].split("\n")
col_names = []
for l in col_lines:
    l = l.strip()
    if l.startswith("`"):
        cn = l.split("`")[1]
        col_names.append(cn)

print(f"Extracted {len(col_names)} columns from pres table.")

tuples = extract_tuples(sql_content, 'pres')
print(f"Total tuples in pres (1).sql: {len(tuples)}")

# Inspect sample row
if tuples:
    r0 = [unquote(v) for v in split_values(tuples[0])]
    print("\n--- First Prescription Record ---")
    row_dict = dict(zip(col_names, r0))
    for k, v in row_dict.items():
        if v and str(v).strip() not in ('', 'NULL', 'null'):
            print(f"  {k:25s}: {v}")
