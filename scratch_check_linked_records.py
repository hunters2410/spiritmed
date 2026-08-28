import requests

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'
headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}', 'Content-Type': 'application/json'}

# Fetch 10 placeholder patients
r = requests.get(f'{url}/rest/v1/patients?full_name=ilike.*PATIENT*&select=id,full_name,patient_number,file_number&limit=10', headers=headers)
patients = r.json()

for p in patients:
    pid = p['id']
    fn = p['file_number']
    
    # Check appointments by patient_id
    r_app = requests.get(f'{url}/rest/v1/appointments?patient_id=eq.{pid}&select=id', headers=headers)
    app_count = len(r_app.json()) if r_app.status_code == 200 else 0
    
    # Check consultations
    r_con = requests.get(f'{url}/rest/v1/consultations?patient_id=eq.{pid}&select=id', headers=headers)
    con_count = len(r_con.json()) if r_con.status_code == 200 else 0

    # Check payments
    r_pay = requests.get(f'{url}/rest/v1/payments?patient_id=eq.{pid}&select=id', headers=headers)
    pay_count = len(r_pay.json()) if r_pay.status_code == 200 else 0
    
    name = p['full_name']
    pno = p['patient_number']
    print(f"Patient '{name}' (PN: {pno}, FN: {fn}) -> Appointments: {app_count}, Consultations: {con_count}, Payments: {pay_count}")
