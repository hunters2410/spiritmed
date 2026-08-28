import requests

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
    url = f'{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name,status'
    r = requests.get(url, headers=h)
    data = r.json()
    if not data or not isinstance(data, list):
        break
    sp_patients.extend(data)
    if len(data) < limit:
        break
    offset += limit

suffixed = [p for p in sp_patients if p.get('file_number') and '-' in str(p.get('file_number'))]
print(f'Total patients with suffixed file_numbers in Supabase: {len(suffixed)}')
print('First 10:')
for p in suffixed[:10]:
    print(f"  {p['full_name']} (pno={p['patient_number']}): fn={p['file_number']}")
