import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

def fetch_sample(table):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}?select=*&limit=2",
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}"
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"Sample from {table}:", json.dumps(data, indent=2))
    except urllib.error.HTTPError as e:
        print(f"Error fetching {table}:", e.read().decode('utf-8'))

fetch_sample("patients")
fetch_sample("branches")
fetch_sample("users")
fetch_sample("medical_reports")
