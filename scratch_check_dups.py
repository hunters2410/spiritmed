import re
from collections import Counter
import requests

with open(r'database/import_step28_patient5_upsert.sql', 'r', encoding='utf-8') as f:
    content = f.read()

patient_insert_pat = re.compile(r'INSERT INTO public\.patients\s*\(.*?\)\s*VALUES\s*(.*?)\nON CONFLICT', re.DOTALL | re.IGNORECASE)

tuples = []
for m in patient_insert_pat.finditer(content):
    block = m.group(1)
    depth, start = 0, None
    for i, ch in enumerate(block):
        if ch == '(':
            if depth == 0: start = i + 1
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0 and start is not None:
                tuples.append(block[start:i])
                start = None

def split_sql_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            current += c
            if i + 1 < len(row_str):
                current += row_str[i+1]; i += 2
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

emails = []
for t in tuples:
    cols = split_sql_values(t)
    e = cols[5].strip("'") if cols[5] != 'NULL' else None
    if e:
        emails.append((e, cols[1].strip("'"), cols[8].strip("'")))

counts = Counter([x[0] for x in emails])
dups = {k for k, v in counts.items() if v > 1}

print("=== Duplicate Emails in SQL File ===")
for e, name, pn in emails:
    if e in dups:
        print(f"Email: {e:<35} Name: {name:<30} PN: {pn}")
