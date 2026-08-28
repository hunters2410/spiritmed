import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

# Test PATCH patient with status: 'inactive' and file_number: null
patient_id = "079860e8-2bee-41eb-bfa9-cc69319d2db7" # patient from user screenshot

payload = json.dumps({
    "status": "inactive",
    "file_number": None
}).encode('utf-8')

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/patients?id=eq.{patient_id}",
    data=payload,
    headers={
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    },
    method="PATCH"
)

try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        print("PATCH SUCCESS! Updated patient:", data)
except Exception as e:
    if hasattr(e, 'read'):
        print("PATCH Error body:", e.read().decode('utf-8'))
    else:
        print("PATCH Error:", e)
