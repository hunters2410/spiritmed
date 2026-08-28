import urllib.request, json

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

# 1. Check files table structure - get first few rows
print("=== patient_files table sample ===")
url = SUPABASE_URL + "/rest/v1/patient_files?limit=5"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req, timeout=30) as r:
    rows = json.loads(r.read())

if rows:
    print("Columns:", list(rows[0].keys()))
    for row in rows:
        print(row)
else:
    print("No rows in patient_files")

# 2. Get files for inactive/old patients (join with patients table)
print("\n=== Files for inactive/old patients ===")
url = (SUPABASE_URL
       + "/rest/v1/patient_files"
       + "?select=*,patients!inner(id,patient_number,full_name,status)"
       + "&patients.status=in.(inactive,old_patient,old)"
       + "&limit=30")
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req, timeout=30) as r:
    files = json.loads(r.read())
print(f"Files linked to inactive patients: {len(files)}")
for f in files[:15]:
    pat = f.get("patients", {})
    fname = f.get("file_name") or f.get("filename") or f.get("name") or f.get("original_name") or ""
    print(f"  Patient: {pat.get('full_name','?')[:30]:<32} "
          f"patient_number: {pat.get('patient_number','?'):<12} "
          f"file: {str(fname)[:50]}")
