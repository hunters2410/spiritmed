import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/admission_forms?select=id,patient_id,hospital,procedure_text,procedure_date,plan_bloods,plan_imaging,npo_oral,iv_fluids,medication,other&limit=3",
    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}", "Prefer": "count=exact"}
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    content_range = resp.headers.get("Content-Range")
    print("Admission Forms Count in Supabase:", content_range)
    if data:
        print("\n--- Sample Admission Form ---")
        print("Hospital:", data[0].get('hospital'))
        print("Procedure Text:", data[0].get('procedure_text'))
        print("Procedure Date:", data[0].get('procedure_date'))
        print("Plan Bloods:", data[0].get('plan_bloods'))
        print("Plan Imaging:", data[0].get('plan_imaging'))
        print("NPO/Oral:", data[0].get('npo_oral'))
        print("IV Fluids:", data[0].get('iv_fluids'))
        print("Medication:", data[0].get('medication'))
        print("Other:", data[0].get('other'))
