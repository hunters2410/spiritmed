import urllib.request, json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

url = f"{SUPABASE_URL}/storage/v1/object/list/patient-files"
req = urllib.request.Request(url, data=json.dumps({"prefix": "", "limit": 1000, "offset": 0}).encode("utf-8"),
                            headers={"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json"})

with urllib.request.urlopen(req, timeout=15) as r:
    files = json.loads(r.read())
    print(f"Total files in storage bucket 'patient-files': {len(files)}")
    print("\nAll files in bucket:")
    for f in files:
        if isinstance(f, dict):
            print(" ", f.get("name"))
        else:
            print(" ", f)