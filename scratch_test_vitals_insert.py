import urllib.request
import json
import uuid

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

test_id = str(uuid.uuid4())
branch_id = "697a3863-1de7-4615-819c-45b0d7066d67"
doctor_id = "90a905bc-d22a-4db3-bd43-2c1c6bf488e0"

# Fetch 1 patient id
req_p = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/patients?select=id&limit=1",
    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
)
with urllib.request.urlopen(req_p) as resp:
    p_data = json.loads(resp.read().decode('utf-8'))
    patient_id = p_data[0]['id']

payload = json.dumps([{
    "id": test_id,
    "branch_id": branch_id,
    "patient_id": patient_id,
    "recorded_by": doctor_id,
    "temperature": 36.6,
    "blood_pressure_systolic": 120,
    "blood_pressure_diastolic": 80,
    "heart_rate": 72,
    "respiratory_rate": 16,
    "weight": 70,
    "height": 175,
    "oxygen_saturation": 98,
    "notes": "Test vitals notes",
    "recorded_at": "2026-08-09T16:55:00Z"
}]).encode('utf-8')

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/vital_signs",
    data=payload,
    headers={
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        print("VITALS INSERT TEST SUCCESS:", res)
    
    # Delete test record
    req_del = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/vital_signs?id=eq.{test_id}",
        headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
        method="DELETE"
    )
    with urllib.request.urlopen(req_del) as resp:
        print("VITALS DELETE TEST CLEANUP SUCCESS")
except urllib.error.HTTPError as e:
    print("VITALS INSERT TEST ERROR:", e.read().decode('utf-8'))
