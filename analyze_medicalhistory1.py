import re
import os
from collections import Counter

MH_SQL      = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\medicalhistory (1).sql"
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

with open(MH_SQL, 'r', encoding='utf-8', errors='replace') as f:
    sql_content = f.read()

tuples = extract_tuples(sql_content, 'medicalhistory')
print(f"Total tuples in medicalhistory (1).sql: {len(tuples)}")

diagnoses_list = set()
complaints_list = set()
investigations_list = set()

for idx, t in enumerate(tuples[:10]):
    cols = [unquote(v) for v in split_values(t)]
    while len(cols) < 45: cols.append(None)
    
    print(f"\n--- Tuple #{idx+1} ---")
    print(f"  ID               : {cols[0]}")
    print(f"  Patient          : {cols[1]}")
    print(f"  Title            : {cols[2]}")
    print(f"  Description      : {cols[3]}")
    print(f"  Patient Name     : {cols[4]}")
    print(f"  Date             : {cols[8]}")
    print(f"  Doctor           : {cols[10]}")
    print(f"  ICD10 Name       : {cols[11]}")
    print(f"  Diagnosis Name   : {cols[17]}")
    print(f"  Complaint Name   : {cols[18]}")
    print(f"  Investigation    : {cols[19]}")
    print(f"  Treatment Plan   : {cols[20]}")

for t in tuples:
    cols = [unquote(v) for v in split_values(t)]
    while len(cols) < 45: cols.append(None)
    
    diag = cols[17] or cols[11] or cols[25]
    comp = cols[18] or cols[26] or cols[2]
    inv  = cols[19] or cols[27]
    
    if diag and diag.strip(): diagnoses_list.add(diag.strip())
    if comp and comp.strip(): complaints_list.add(comp.strip())
    if inv and inv.strip(): investigations_list.add(inv.strip())

print(f"\nUnique Diagnoses Found      : {len(diagnoses_list)}")
print(f"Unique Complaints Found     : {len(complaints_list)}")
print(f"Unique Investigations Found : {len(investigations_list)}")
