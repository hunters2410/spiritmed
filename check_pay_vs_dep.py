import requests

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'
headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}', 'Content-Type': 'application/json'}

# Fetch counts of PAY- vs DEP-
r_pay = requests.get(f'{url}/rest/v1/payments?reference_number=like.PAY-*&select=count', headers={**headers, 'Prefer': 'count=exact'})
pay_count = r_pay.headers.get('content-range', 'N/A')

r_dep = requests.get(f'{url}/rest/v1/payments?reference_number=like.DEP-*&select=count', headers={**headers, 'Prefer': 'count=exact'})
dep_count = r_dep.headers.get('content-range', 'N/A')

print(f"PAY- (invoice summary payments) count: {pay_count}")
print(f"DEP- (itemized deposit receipts) count: {dep_count}")

# Check Fidelis Disderio Marimo
pid = '1748fbd8-b132-5446-9fa8-da5ed22c3198'
r_fidelis = requests.get(f'{url}/rest/v1/payments?patient_id=eq.{pid}&select=id,reference_number,amount,notes', headers=headers)
print("\nFidelis Disderio Marimo current payments:")
for p in r_fidelis.json():
    print('  ', p)
