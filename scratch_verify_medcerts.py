import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/medical_certificates?select=id,patient_id,date_attended,illness_date,resume_date,period,time_unit,purpose&limit=3",
    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}", "Prefer": "count=exact"}
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    content_range = resp.headers.get("Content-Range")
    print("Medical Certificates Count in Supabase:", content_range)
    if data:
        print("\n--- Sample Medical Certificate ---")
        print("Date Attended:", data[0].get('date_attended'))
        print("Illness Date:", data[0].get('illness_date'))
        print("Resume Date:", data[0].get('resume_date'))
        print("Period:", data[0].get('period'), data[0].get('time_unit'))
        print("Purpose:", data[0].get('purpose'))
