import requests
import json
import re

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

def fetch_all_supabase():
    sp_patients = []
    limit = 1000
    offset = 0
    while True:
        h = headers.copy()
        h['Range'] = f'{offset}-{offset + limit - 1}'
        url = f'{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,full_name,file_number,status,branch_id'
        r = requests.get(url, headers=h)
        data = r.json()
        if not data or not isinstance(data, list): break
        sp_patients.extend(data)
        if len(data) < limit: break
        offset += limit
    return sp_patients

def main():
    print("Fetching Supabase patients...")
    sp_patients = fetch_all_supabase()
    active_patients = [p for p in sp_patients if p.get('status') == 'active']
    
    print("Parsing patient (9).sql for all legacy file numbers...")
    with open(SQL_FILE, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    insert_pat = re.compile(
        r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
        re.DOTALL | re.IGNORECASE
    )

    sql_fns = {}
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
                    fn = cols[45]
                    status = cols[51]
                    if fn and str(fn).strip() not in ('', 'NULL', 'null', '0', 'None', '-'):
                        clean_fn = str(fn).strip()
                        if clean_fn not in sql_fns:
                            sql_fns[clean_fn] = str(status).strip().lower()

    active_fns = set()
    for p in active_patients:
        fn = p.get('file_number')
        if fn:
            clean_fn = fn.split('-')[0].strip()
            if clean_fn:
                active_fns.add(clean_fn)

    # Build pool entries with uniform keys
    pool_entries = []
    # 1. Active file numbers -> is_occupied = True
    for fn in active_fns:
        pool_entries.append({
            'file_number': fn,
            'is_occupied': True,
            'branch_id': None
        })

    # 2. All released / legacy file numbers -> is_occupied = False
    for fn in sql_fns:
        if fn not in active_fns:
            pool_entries.append({
                'file_number': fn,
                'is_occupied': False,
                'branch_id': None
            })

    print(f"Total entries to upsert into file_number_pool: {len(pool_entries)}")
    print(f"  - Occupied (active patients): {len(active_fns)}")
    print(f"  - Available / Released (for new patients): {len(pool_entries) - len(active_fns)}")

    batch_size = 500
    success = 0
    for i in range(0, len(pool_entries), batch_size):
        batch = pool_entries[i:i+batch_size]
        h_upsert = headers.copy()
        h_upsert['Prefer'] = 'resolution=merge-duplicates'
        r = requests.post(f"{SUPABASE_URL}/rest/v1/file_number_pool", headers=h_upsert, json=batch)
        if r.status_code in (200, 201):
            success += len(batch)
        else:
            print(f"  [ERROR] batch {i}: {r.status_code} - {r.text}")

    print(f"\nSuccessfully upserted {success}/{len(pool_entries)} file numbers into file_number_pool!")

    r_pool = requests.get(f"{SUPABASE_URL}/rest/v1/file_number_pool?select=file_number", headers={**headers, 'Range': '0-0', 'Prefer': 'count=exact'})
    print(f"Total in file_number_pool: {r_pool.headers.get('Content-Range')}")

    r_avail = requests.get(f"{SUPABASE_URL}/rest/v1/file_number_pool?is_occupied=eq.false&select=file_number", headers={**headers, 'Range': '0-0', 'Prefer': 'count=exact'})
    print(f"Available in pool (for new patients): {r_avail.headers.get('Content-Range')}")

    r_occ = requests.get(f"{SUPABASE_URL}/rest/v1/file_number_pool?is_occupied=eq.true&select=file_number", headers={**headers, 'Range': '0-0', 'Prefer': 'count=exact'})
    print(f"Occupied in pool (active patients): {r_occ.headers.get('Content-Range')}")

if __name__ == '__main__':
    main()
