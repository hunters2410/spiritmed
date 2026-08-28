import requests

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

r = requests.get(f"{SUPABASE_URL}/rest/v1/medicines?limit=1", headers=HEADERS)
print("Medicines status:", r.status_code)
if r.status_code == 200 and r.json():
    print("Columns:", list(r.json()[0].keys()))

r_pi = requests.get(f"{SUPABASE_URL}/rest/v1/prescription_items?limit=1", headers=HEADERS)
print("Prescription items status:", r_pi.status_code)
if r_pi.status_code == 200 and r_pi.json():
    print("Columns:", list(r_pi.json()[0].keys()))
