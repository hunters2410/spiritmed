import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/discharge_summaries?select=id,patient_id,reason_for_admission,treatment_summary,discharge_diagnosis,follow_up_instructions,recipient&limit=3",
    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}", "Prefer": "count=exact"}
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    content_range = resp.headers.get("Content-Range")
    print("Discharge Summaries Count in Supabase:", content_range)
    if data:
        print("\n--- Sample Discharge Record ---")
        print("Recipient:", data[0].get('recipient'))
        print("Reason for Admission:", data[0].get('reason_for_admission'))
        print("Treatment Summary:", data[0].get('treatment_summary'))
        print("Discharge Diagnosis:", data[0].get('discharge_diagnosis'))
        print("Follow-up Instructions:", data[0].get('follow_up_instructions'))
