import re
import os
import requests
import json
from concurrent.futures import ThreadPoolExecutor

SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json'
}

DATABASES_DIR = r'C:\Users\Acer P16\Documents\Spiritmed\hospital update\databases 2'
patient_sql = os.path.join(DATABASES_DIR, "patient (6).sql")

def parse_sql_inserts(file_path, table_name):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    col_names = []
    create_pattern = re.compile(rf"CREATE TABLE\s+(?:`{table_name}`|{table_name})\s*\((.*?)\)\s*ENGINE", re.DOTALL | re.IGNORECASE)
    match = create_pattern.search(content)
    if match:
        table_def = match.group(1)
        for line in table_def.splitlines():
            line_s = line.strip()
            if line_s.startswith('`'):
                col = line_s.split('`')[1]
                col_names.append(col)
    
    rows = []
    lines = content.splitlines()
    in_target_insert = False
    
    for line in lines:
        line_s = line.strip()
        if f"INSERT INTO `{table_name}`" in line_s or f"INSERT INTO {table_name}" in line_s:
            in_target_insert = True
        elif line_s.startswith("INSERT INTO") or line_s.startswith("DROP TABLE") or line_s.startswith("CREATE TABLE"):
            in_target_insert = False

        if in_target_insert or line_s.startswith("("):
            if line_s.startswith("(") and (line_s.endswith("),") or line_s.endswith(");")):
                rows.append(line_s)

    return col_names, rows

def parse_sql_values(tuple_str):
    t_str = tuple_str.strip().rstrip(';,')
    if t_str.startswith('(') and t_str.endswith(')'):
        t_str = t_str[1:-1]
    
    tokens = []
    current = []
    in_quotes = False
    escape = False
    
    i = 0
    n = len(t_str)
    while i < n:
        char = t_str[i]
        if escape:
            current.append(char)
            escape = False
        elif char == '\\':
            escape = True
        elif char == "'":
            in_quotes = not in_quotes
            current.append(char)
        elif char == ',' and not in_quotes:
            val = ''.join(current).strip()
            tokens.append(val)
            current = []
        else:
            current.append(char)
        i += 1
    if current:
        tokens.append(''.join(current).strip())

    cleaned = []
    for tok in tokens:
        if tok.upper() == 'NULL':
            cleaned.append(None)
        elif tok.startswith("'") and tok.endswith("'"):
            val = tok[1:-1].replace("''", "'").replace("\\'", "'").replace("\\\\", "\\")
            cleaned.append(val)
        else:
            try:
                if '.' in tok:
                    cleaned.append(float(tok))
                else:
                    cleaned.append(int(tok))
            except:
                cleaned.append(tok)
    return cleaned

def fetch_all_supabase(table_name, select_cols):
    items = []
    limit = 1000
    offset = 0
    while True:
        h = headers.copy()
        h['Range'] = f"{offset}-{offset + limit - 1}"
        url = f"{SUPABASE_URL}/rest/v1/{table_name}?select={select_cols}"
        resp = requests.get(url, headers=h)
        if resp.status_code not in (200, 206):
            break
        data = resp.json()
        if not data or not isinstance(data, list) or len(data) == 0:
            break
        items.extend(data)
        if len(data) < limit:
            break
        offset += limit
    return items

def patch_null_fn(p_id):
    url = f"{SUPABASE_URL}/rest/v1/patients?id=eq.{p_id}"
    try:
        r = requests.patch(url, headers=headers, json={'file_number': None})
        return r.status_code in (200, 204)
    except:
        return False

def main():
    print("==========================================================")
    print("   SET NULL (NO FILE) FOR PATIENTS WITH NO FILE NUMBER    ")
    print("==========================================================\n")

    p_cols, p_tuples = parse_sql_inserts(patient_sql, "patient")
    fn_idx = p_cols.index('filenumber')
    pid_idx = p_cols.index('patient_id')

    old_by_pid = {}
    for t in p_tuples:
        vals = parse_sql_values(t)
        if len(vals) > fn_idx:
            pid_val = str(vals[pid_idx]).strip() if vals[pid_idx] is not None else ''
            fn_val = str(vals[fn_idx]).strip() if vals[fn_idx] is not None else ''
            if pid_val:
                old_by_pid[pid_val] = fn_val

    sp_patients = fetch_all_supabase("patients", "id,patient_number,file_number,full_name")
    print(f"Loaded {len(sp_patients)} patients from Supabase.")

    ids_to_set_null = []
    for sp_p in sp_patients:
        pno = str(sp_p.get('patient_number')).strip() if sp_p.get('patient_number') else ''
        curr_fn = str(sp_p.get('file_number')).strip() if sp_p.get('file_number') else ''
        
        old_fn = old_by_pid.get(pno)
        # If old_fn was None, empty, 'NULL', 'null', or '0'
        if not old_fn or old_fn.lower() in ('null', 'none', '0', ''):
            if curr_fn:  # currently has patient_number or fallback
                ids_to_set_null.append((sp_p['id'], pno, sp_p['full_name']))

    print(f"Found {len(ids_to_set_null)} patients with NO file number in old system that will be set to NULL (No File).")

    if ids_to_set_null:
        print("Setting file_number = NULL in parallel (30 threads)...")
        with ThreadPoolExecutor(max_workers=30) as executor:
            results = list(executor.map(patch_null_fn, [item[0] for item in ids_to_set_null]))
        print(f"Successfully updated {results.count(True)}/{len(ids_to_set_null)} patient records to NULL (No File).")

    # Verify patient count and missing file numbers in Supabase
    sp_patients_after = fetch_all_supabase("patients", "id,patient_number,file_number,full_name")
    no_file_count = sum(1 for p in sp_patients_after if not p.get('file_number'))
    has_file_count = len(sp_patients_after) - no_file_count

    print("\n--- FINAL STATUS ---")
    print(f"Total Patients: {len(sp_patients_after)}")
    print(f"Patients WITH File Number (Exact legacy numbers): {has_file_count}")
    print(f"Patients WITHOUT File Number (Displays 'NO FILE'): {no_file_count}")

if __name__ == '__main__':
    main()
