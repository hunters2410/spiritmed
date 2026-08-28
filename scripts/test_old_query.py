import requests

SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json'
}

r = requests.get(f'{SUPABASE_URL}/rest/v1/patients?status=in.(inactive,old_patient,old)&select=id,patient_number,full_name,status,created_at', headers={**headers, 'Range': '0-5', 'Prefer': 'count=exact'})
print('Count of Old / Archived patients in Supabase:', r.headers.get('Content-Range'))
print('Sample Old Patients in Supabase:')
for p in r.json():
    print(f"  {p['full_name']} (PNO: {p['patient_number']}) - Status: {p['status']}")
