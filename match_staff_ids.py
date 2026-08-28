import re
import requests

sql_file = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\u819957882_urocaresystem (18).sql"

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

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

with open(sql_file, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

user_tuples = extract_tuples(content, 'users')
old_users = {}
for r in user_tuples:
    cols = [unquote(v) for v in split_values(r)]
    # user id is col 0, username/email/name...
    uid = cols[0]
    # let's find name
    old_users[uid] = cols

r_sb = requests.get(f"{SUPABASE_URL}/rest/v1/users", headers=HEADERS)
sb_users = r_sb.json()

print("Supabase Users:")
for su in sb_users:
    print(f"  {su['id']} | {su['full_name']} | {su['role']}")

print("\nOld Target Users (Staff IDs 3, 6, 7, 9, 10):")
for sid in ['3', '6', '7', '9', '10']:
    if sid in old_users:
        u_cols = old_users[sid]
        print(f"  Staff ID {sid}: {u_cols[1:6]}")
