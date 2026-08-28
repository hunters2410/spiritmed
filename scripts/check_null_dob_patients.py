import re
import os
import requests
import json
from collections import Counter

SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json'
}

SQL_FILE = r'C:\Users\Acer P16\Documents\Spiritmed\hospital update\db2\patient (9).sql'

def unquote(v):
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("\\'", "'").replace("''", "'").replace("\\\\", "\\")
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

with open(SQL_FILE, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

insert_pat = re.compile(
    r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
    re.DOTALL | re.IGNORECASE
)

sql_by_pid = {}
sql_by_name = {}

for match in insert_pat.finditer(content):
    block = match.group(1)
    depth, start = 0, None
    for idx, ch in enumerate(block):
        if ch == '(':
            if depth == 0: start = idx + 1
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0 and start is not None:
                row_str = block[start:idx]
                cols = [unquote(v) for v in split_values(row_str)]
                while len(cols) < 53: cols.append(None)
                
                sql_id = cols[0]
                name = cols[2]
                birthdate = cols[8]
                age = cols[9]
                pid = cols[12]
                
                obj = {
                    'sql_id': sql_id,
                    'name': name,
                    'birthdate': birthdate,
                    'age': age,
                    'pid': pid
                }
                if pid: sql_by_pid[str(pid).strip()] = obj
                if name: sql_by_name[str(name).strip().lower()] = obj

sp_patients = []
limit = 1000
offset = 0
while True:
    h = headers.copy()
    h['Range'] = f'{offset}-{offset + limit - 1}'
    url = f'{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name,date_of_birth,status,created_at'
    r = requests.get(url, headers=h)
    data = r.json()
    if not data or not isinstance(data, list): break
    sp_patients.extend(data)
    if len(data) < limit: break
    offset += limit

sp_null_dob = [p for p in sp_patients if not p.get('date_of_birth')]
print(f'Total Supabase patients with NULL date_of_birth: {len(sp_null_dob)}')

has_sql_birthdate = []
has_sql_age_only = []
has_neither_in_sql = []
not_in_sql = []

for sp_p in sp_null_dob:
    pno = str(sp_p.get('patient_number') or '').strip()
    name = str(sp_p.get('full_name') or '').strip().lower()
    
    sql_obj = sql_by_pid.get(pno) or sql_by_name.get(name)
    if sql_obj:
        bd = sql_obj['birthdate']
        ag = sql_obj['age']
        bd_clean = str(bd).strip() if bd and str(bd).strip().lower() not in ('null', 'none', '0', '0000-00-00', '00-00-0000', 'n/a', '-', '') else None
        ag_clean = str(ag).strip() if ag and str(ag).strip().lower() not in ('null', 'none', '0', '') else None
        
        if bd_clean:
            has_sql_birthdate.append((sp_p, sql_obj))
        elif ag_clean:
            has_sql_age_only.append((sp_p, sql_obj))
        else:
            has_neither_in_sql.append((sp_p, sql_obj))
    else:
        not_in_sql.append(sp_p)

print(f'\nBreakdown of the {len(sp_null_dob)} Supabase patients with NULL DOB:')
print(f'  - Found in SQL with non-empty birthdate: {len(has_sql_birthdate)}')
print(f'  - Found in SQL with age only (no birthdate): {len(has_sql_age_only)}')
print(f'  - Found in SQL with neither birthdate nor age: {len(has_sql_neither := has_neither_in_sql)}')
print(f'  - Not found in SQL: {len(not_in_sql)}')

if has_sql_birthdate:
    print('\nSamples with birthdate in SQL (first 20):')
    for sp_p, sql_obj in has_sql_birthdate[:20]:
        print(f"  SP: name='{sp_p['full_name']}', pno={sp_p['patient_number']} | SQL: birthdate='{sql_obj['birthdate']}', age='{sql_obj['age']}'")

if has_sql_age_only:
    print('\nSamples with age only in SQL (first 10):')
    for sp_p, sql_obj in has_sql_age_only[:10]:
        print(f"  SP: name='{sp_p['full_name']}', pno={sp_p['patient_number']} | SQL: age='{sql_obj['age']}'")
