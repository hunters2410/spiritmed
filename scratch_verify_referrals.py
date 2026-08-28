import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/referral_forms?select=id,patient_id,recipient,reason_for_referral,background_history,treatment_done&limit=3",
    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}", "Prefer": "count=exact"}
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    content_range = resp.headers.get("Content-Range")
    print("Referral Forms Count in Supabase:", content_range)
    if data:
        print("\n--- Sample Referral Form ---")
        print("Recipient:", data[0].get('recipient'))
        print("Reason for Referral:", data[0].get('reason_for_referral'))
        print("Background History:", data[0].get('background_history'))
        print("Treatment Done:", data[0].get('treatment_done'))
