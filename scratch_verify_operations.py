import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/operation_reports?select=id,patient_id,hospital,anaesthetist,assistant,operation_name,procedure_description,post_op_plan&limit=3",
    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}", "Prefer": "count=exact"}
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    content_range = resp.headers.get("Content-Range")
    print("Operation Reports Count in Supabase:", content_range)
    if data:
        print("\n--- Sample Operation Report ---")
        print("Operation Name:", data[0].get('operation_name'))
        print("Hospital:", data[0].get('hospital'))
        print("Anaesthetist:", data[0].get('anaesthetist'))
        print("Assistant:", data[0].get('assistant'))
        print("Procedure Description:\n", data[0].get('procedure_description'))
        print("Post-Op Plan:\n", data[0].get('post_op_plan'))
