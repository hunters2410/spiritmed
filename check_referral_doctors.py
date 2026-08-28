import requests

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json"
}

# Test selecting from referral_doctors
r = requests.get(f"{SUPABASE_URL}/rest/v1/referral_doctors?select=*", headers=HEADERS)
print("Select * status:", r.status_code)
if r.status_code == 200:
    data = r.json()
    print(f"Loaded {len(data)} referral doctors.")
    if len(data) > 0:
        print("Sample columns:", list(data[0].keys()))
else:
    print("Error text:", r.text)

r2 = requests.get(f"{SUPABASE_URL}/rest/v1/referral_doctors?select=id,full_name,specialization,phone,email", headers=HEADERS)
print("Select with specialization/phone status:", r2.status_code, r2.text[:200])
