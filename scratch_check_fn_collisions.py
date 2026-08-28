import requests

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'
headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}', 'Content-Type': 'application/json'}

# Fetch all existing file_numbers from Supabase
print("Fetching all existing file_numbers from Supabase...")
existing_fns = set()
from_idx = 0
page_size = 1000

while True:
    r = requests.get(f'{url}/rest/v1/patients?select=file_number', headers={**headers, 'Range': f'{from_idx}-{from_idx+page_size-1}'})
    if r.status_code not in (200, 206) or not r.json():
        break
    rows = r.json()
    for row in rows:
        fn = row.get('file_number')
        if fn:
            existing_fns.add(str(fn).strip())
    if len(rows) < page_size:
        break
    from_idx += page_size

print(f"Loaded {len(existing_fns)} unique existing file_numbers from Supabase.")

# Test collision check for batch 4
import run_patient5_import
with open(run_patient5_import.SQL_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

import re
patient_insert_pat = re.compile(r'INSERT INTO public\.patients\s*\(.*?\)\s*VALUES\s*(.*?)\nON CONFLICT', re.DOTALL | re.IGNORECASE)

all_tuples = []
for m in patient_insert_pat.finditer(content):
    all_tuples.extend(run_patient5_import.extract_tuples(m.group(1)))

all_rows = [run_patient5_import.parse_patient_row(t) for t in all_tuples if run_patient5_import.parse_patient_row(t)]

colliding_fns = []
for r in all_rows:
    fn = r.get('file_number')
    if fn and str(fn).strip() in existing_fns:
        colliding_fns.append((r['patient_number'], r['full_name'], fn))

print(f"\nTotal rows in import SQL with file_number colliding with existing Supabase file_numbers: {len(colliding_fns)}")
print("Sample colliding file_numbers:", colliding_fns[:10])
