import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/",
    headers={
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}"
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        openapi = json.loads(resp.read().decode())
        paths = openapi.get("paths", {})
        found = False
        for path in paths:
            if "create_user_profile" in path or "user" in path:
                print("Found path:", path)
                print("Details:", json.dumps(paths[path], indent=2))
                found = True
        if not found:
            print("No matching RPC found!")
except Exception as e:
    print("Error:", e)
