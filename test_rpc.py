import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

# Let's test calling create_user_profile with valid string p_phone
payload = {
    "p_user_id": "00000000-0000-0000-0000-000000000000",
    "p_email": "test@test.com",
    "p_full_name": "Test User",
    "p_phone": "",
    "p_role": "nurse",
    "p_branch_id": None
}

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/rpc/create_user_profile",
    data=json.dumps(payload).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}"
    },
    method="POST"
)

try:
    with urllib.request.urlopen(req) as resp:
        print("Response:", resp.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.read().decode())
except Exception as e:
    print("Error:", e)
