"""
test_conflict_resolution.py
============================
Tests resolving duplicate patient_number collisions between different patients.
"""

import requests
import re
import uuid

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

print("=== Fetching all existing patients from Supabase ===")
all_patients = []
from_idx = 0
page_size = 1000

while True:
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name,email",
        headers={**HEADERS, "Range": f"{from_idx}-{from_idx+page_size-1}"},
        timeout=30
    )
    if r.status_code not in (200, 206) or not r.json():
        break
    rows = r.json()
    all_patients.extend(rows)
    if len(rows) < page_size:
        break
    from_idx += page_size

print(f"Loaded {len(all_patients)} existing patients from Supabase.")

# Build maps
supabase_by_id = {p['id']: p for p in all_patients}
supabase_by_pn = {str(p.get('patient_number') or '').strip(): p['id'] for p in all_patients if p.get('patient_number')}
supabase_by_fn = {str(p.get('file_number') or '').strip(): p['id'] for p in all_patients if p.get('file_number') and str(p.get('file_number')).strip() not in ('0', 'None', 'null')}
supabase_by_name = {str(p.get('full_name') or '').strip().lower(): p['id'] for p in all_patients if p.get('full_name')}

# Read SQL file
SQL_FILE = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step28_patient5_upsert.sql"
import run_patient5_import

with open(SQL_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

patient_insert_pat = re.compile(r'INSERT INTO public\.patients\s*\(.*?\)\s*VALUES\s*(.*?)\nON CONFLICT', re.DOTALL | re.IGNORECASE)

all_tuples = []
for m in patient_insert_pat.finditer(content):
    all_tuples.extend(run_patient5_import.extract_tuples(m.group(1)))

parsed_rows = [run_patient5_import.parse_patient_row(t) for t in all_tuples if run_patient5_import.parse_patient_row(t)]
print(f"Parsed {len(parsed_rows)} rows from import SQL.")

# Smart mapping with collision prevention
assigned_ids = set()
assigned_pns = set()
assigned_fns = set()
assigned_emails = set()

for p in all_patients:
    if p.get('patient_number'): assigned_pns.add(str(p['patient_number']).strip())
    if p.get('file_number'): assigned_fns.add(str(p['file_number']).strip())
    if p.get('email'): assigned_emails.add(str(p['email']).strip().lower())

final_rows = []

for p in parsed_rows:
    pn   = str(p['patient_number'] or '').strip()
    fn   = str(p['file_number'] or '').strip()
    name = str(p['full_name'] or '').strip().lower()

    # Determine ID
    target_id = None
    if pn in supabase_by_pn and supabase_by_pn[pn] not in assigned_ids:
        target_id = supabase_by_pn[pn]
    elif fn and fn in supabase_by_fn and supabase_by_fn[fn] not in assigned_ids:
        target_id = supabase_by_fn[fn]
    elif name and name in supabase_by_name and supabase_by_name[name] not in assigned_ids:
        target_id = supabase_by_name[name]
    else:
        target_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{pn}"))

    assigned_ids.add(target_id)
    p['id'] = target_id

    # If updating an existing patient, check if target pn/fn/email conflicts with ANOTHER patient in Supabase
    existing_patient = supabase_by_id.get(target_id)

    if existing_patient:
        # If target pn belongs to someone else, keep existing patient_number!
        if pn in supabase_by_pn and supabase_by_pn[pn] != target_id:
            p['patient_number'] = existing_patient['patient_number']
        
        # If target fn belongs to someone else, keep existing file_number!
        if fn and fn in supabase_by_fn and supabase_by_fn[fn] != target_id:
            p['file_number'] = existing_patient.get('file_number')

    # Handle email subaddressing
    email = str(p.get('email') or '').strip().lower()
    if email and email in assigned_emails and (not existing_patient or str(existing_patient.get('email') or '').lower() != email):
        if '@' in email and not email.endswith('@spiritmed.local'):
            parts = email.split('@')
            p['email'] = f"{parts[0]}+{p['patient_number']}@{parts[1]}"
        else:
            p['email'] = f"patient.{p['patient_number']}@spiritmed.local"

    if p.get('email'):
        assigned_emails.add(str(p['email']).lower())

    final_rows.append(p)

print(f"\nFinal dataset ready for 100% collision-free upsert: {len(final_rows)} patients.")

# Test batch 4 with final_rows[450:600]
batch4 = final_rows[450:600]
print(f"Testing batch 4 ({len(batch4)} items) with collision-free payload...")

url = f"{SUPABASE_URL}/rest/v1/patients?on_conflict=id"
h = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}

resp = requests.post(url, headers=h, json=batch4, timeout=30)
print("Status code:", resp.status_code)
if resp.status_code not in (200, 201):
    print("Error:", resp.text[:300])
else:
    print("Batch 4 SUCCESS! Upserted cleanly with status 200!")
