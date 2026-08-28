import requests
import run_patient5_import

SQL_FILE = run_patient5_import.SQL_FILE
print("Reading SQL file...")
with open(SQL_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

import re
patient_insert_pat = re.compile(r'INSERT INTO public\.patients\s*\(.*?\)\s*VALUES\s*(.*?)\nON CONFLICT', re.DOTALL | re.IGNORECASE)

all_tuples = []
for m in patient_insert_pat.finditer(content):
    all_tuples.extend(run_patient5_import.extract_tuples(m.group(1)))

all_rows = []
for t in all_tuples:
    row = run_patient5_import.parse_patient_row(t)
    if row:
        all_rows.append(row)

batch4 = all_rows[450:600]
print(f"Testing batch 4 ({len(batch4)} items)...")

resp = run_patient5_import.upsert("patients", batch4, "patient_number")
print("Status code:", resp.status_code)
print("Response headers:", resp.headers)
print("Response text:", resp.text[:500])
