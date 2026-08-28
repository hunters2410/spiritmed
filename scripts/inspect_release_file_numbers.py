import requests
import json
from collections import Counter, defaultdict

SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json'
}

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

print(f"Total Supabase patients: {len(sp_patients)}")

active_patients = [p for p in sp_patients if p.get('status') == 'active']
inactive_patients = [p for p in sp_patients if p.get('status') in ('inactive', 'old_patient')]
discharged_patients = [p for p in sp_patients if p.get('status') == 'discharged']
deceased_patients = [p for p in sp_patients if p.get('status') == 'deceased']

print(f"Active patients: {len(active_patients)} (with file_number: {sum(1 for p in active_patients if p.get('file_number'))})")
print(f"Old / Inactive patients: {len(inactive_patients)} (with file_number: {sum(1 for p in inactive_patients if p.get('file_number'))})")
print(f"Discharged patients: {len(discharged_patients)} (with file_number: {sum(1 for p in discharged_patients if p.get('file_number'))})")
print(f"Deceased patients: {len(deceased_patients)} (with file_number: {sum(1 for p in deceased_patients if p.get('file_number'))})")

to_release = [p for p in sp_patients if p.get('status') in ('inactive', 'old_patient', 'discharged', 'deceased') and p.get('file_number')]
print(f"\nTotal patient records to release file numbers from: {len(to_release)}")

# Active file numbers
active_fns = set()
for p in active_patients:
    fn = p.get('file_number')
    if fn:
        active_fns.add(fn.split('-')[0].strip())

# Released file numbers
released_fns = set()
for p in to_release:
    fn = p.get('file_number')
    if fn:
        released_fns.add(fn.split('-')[0].strip())

overlap = released_fns.intersection(active_fns)
print(f"Unique file numbers to be available in pool: {len(released_fns)}")
print(f"Overlap with active patients' file numbers: {len(overlap)}")
if overlap:
    print(f"Sample overlapping file numbers (active patient already has it): {list(overlap)[:10]}")

print("\nSample records to be released:")
for p in to_release[:10]:
    print(f"  {p['full_name']} | Patient #: {p['patient_number']} | Status: {p['status']} | File #: {p['file_number']}")
