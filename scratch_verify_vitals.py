import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/vital_signs?select=id,patient_id,blood_pressure_systolic,blood_pressure_diastolic,heart_rate,temperature,oxygen_saturation,weight,height,notes,recorded_at&limit=3",
    headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}", "Prefer": "count=exact"}
)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    content_range = resp.headers.get("Content-Range")
    print("Vital Signs Count in Supabase:", content_range)
    if data:
        print("\n--- Sample Vital Signs Record ---")
        print("BP Systolic/Diastolic:", f"{data[0].get('blood_pressure_systolic')}/{data[0].get('blood_pressure_diastolic')}")
        print("Heart Rate:", data[0].get('heart_rate'))
        print("Temperature:", data[0].get('temperature'))
        print("SpO2:", data[0].get('oxygen_saturation'))
        print("Weight/Height:", f"{data[0].get('weight')}kg / {data[0].get('height')}cm")
        print("Notes:", data[0].get('notes'))
        print("Recorded At:", data[0].get('recorded_at'))
