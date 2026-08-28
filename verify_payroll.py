import requests

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'
headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}', 'Content-Type': 'application/json'}

r = requests.get(f'{url}/rest/v1/payroll?select=*', headers=headers)
data = r.json()
print("Data type:", type(data))
print("Total rows:", len(data) if isinstance(data, list) else data)
if isinstance(data, list) and data:
    print("Sample row:", data[0])
