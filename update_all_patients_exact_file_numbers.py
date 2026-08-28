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

def main():
    print("==========================================================")
    print("      UPDATE ALL PATIENT FILE NUMBERS FROM OLD SYSTEM     ")
    print("==========================================================\n")

    p_cols, p_tuples = parse_sql_inserts(patient_sql, "patient")
    fn_idx = p_cols.index('filenumber')
    pid_idx = p_cols.index('patient_id')
    name_idx = p_cols.index('name')
    id_idx = p_cols.index('id')

    # Index old patients by patient_id AND by id
    old_by_pid = {}
    for t in p_tuples:
        vals = parse_sql_values(t)
        if len(vals) > fn_idx:
            pid_val = str(vals[pid_idx]).strip() if vals[pid_idx] is not None else ''
            fn_val = str(vals[fn_idx]).strip() if vals[fn_idx] is not None else ''
            name_val = str(vals[name_idx]).strip() if vals[name_idx] is not None else ''
            id_val = str(vals[id_idx]).strip() if vals[id_idx] is not None else ''

            p_obj = {
                'id': id_val,
                'patient_id': pid_val,
                'filenumber': fn_val,
                'name': name_val
            }
            if pid_val:
                old_by_pid[pid_val] = p_obj

    print(f"Parsed {len(old_by_pid)} patients from patient (6).sql indexed by patient_id.")

    sp_patients = fetch_all_supabase("patients", "id,patient_number,file_number,full_name")
    print(f"Loaded {len(sp_patients)} patients from Supabase.")

    # Track assigned file_numbers to avoid 409 collisions
    assigned_file_numbers = set()

    # Step A: First, assign exact filenumbers to patients whose filenumber is unique
    # Or build target_fn for each patient
    patch_tasks = []
    
    for sp_p in sp_patients:
        p_id = sp_p['id']
        pno = str(sp_p.get('patient_number')).strip() if sp_p.get('patient_number') else ''
        old_p = old_by_pid.get(pno)

        target_fn = None
        if old_p:
            fn = old_p['filenumber']
            if fn and fn.lower() not in ('null', 'none', ''):
                target_fn = fn

        if not target_fn:
            target_fn = pno if pno else p_id[:8]

        patch_tasks.append({
            'id': p_id,
            'pno': pno,
            'name': sp_p['full_name'],
            'current_fn': sp_p.get('file_number'),
            'target_fn': target_fn
        })

    # Sort tasks so exact real filenumbers get assigned first before fallbacks
    # Prioritize specific known patients like Sydney Kwambana (4467 -> 1606)
    def priority(t):
        if t['pno'] == '4467': return 0  # Sydney Kwambana
        if t['target_fn'] and t['target_fn'] != t['pno']: return 1
        return 2

    patch_tasks.sort(key=priority)

    # First, temporarily clear file_numbers or assign unique target file numbers
    # We can assign `target_fn` and if 409 happens, append `-2`, `-3`
    def apply_patch(t):
        p_id = t['id']
        base_fn = t['target_fn']
        current_fn = t['current_fn']

        if current_fn == base_fn:
            return True, current_fn

        # Try base_fn
        candidate_fn = base_fn
        suffix_counter = 1
        
        while True:
            r = requests.patch(
                f"{SUPABASE_URL}/rest/v1/patients?id=eq.{p_id}",
                headers=headers,
                json={'file_number': candidate_fn}
            )
            if r.status_code in (200, 204):
                return True, candidate_fn
            elif r.status_code == 409:
                # Collision: append suffix (e.g. 1606-2)
                suffix_counter += 1
                candidate_fn = f"{base_fn}-{suffix_counter}"
                if suffix_counter > 20:
                    return False, None
            else:
                return False, None

    print("\nUpdating patient file_numbers in Supabase (30 threads)...")
    success_count = 0
    with ThreadPoolExecutor(max_workers=30) as executor:
        results = list(executor.map(apply_patch, patch_tasks))

    for ok, fn in results:
        if ok: success_count += 1

    print(f"\nSuccessfully updated {success_count}/{len(patch_tasks)} patient file numbers!")

    # Verify Sydney Kwambana specifically
    r_sydney = requests.get(f"{SUPABASE_URL}/rest/v1/patients?patient_number=eq.4467&select=id,patient_number,file_number,full_name", headers=headers)
    print("\nVerification for Sydney Kwambana in Supabase:")
    print(json.dumps(r_sydney.json(), indent=2))

if __name__ == '__main__':
    main()
