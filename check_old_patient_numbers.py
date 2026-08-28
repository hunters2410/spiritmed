import urllib.request, json, re

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

# Get sample of inactive patients with their patient_numbers
url = SUPABASE_URL + "/rest/v1/patients?select=patient_number,full_name,email,status&status=in.(inactive,old_patient,old)&limit=30"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req, timeout=30) as r:
    patients = json.loads(r.read())

print("=== Sample of inactive/old patients in Supabase ===")
print(f"{'patient_number':<20} {'full_name':<30} {'email'[:40]}")
print("-" * 80)
for p in patients:
    pn = p.get("patient_number","")
    name = p.get("full_name","")[:28]
    em = p.get("email","")[:38]
    print(f"{pn:<20} {name:<30} {em}")

# Show pattern breakdown
patterns = {}
for p in patients:
    pn = p.get("patient_number","")
    if re.match(r"^\d+$", pn):
        pat = "numeric_only"
    elif re.match(r"^[A-Z]+-\d+$", pn):
        pat = "PREFIX-XXXXXX"
    elif pn.startswith("legacy."):
        pat = "legacy.xxx"
    else:
        pat = "other: " + pn[:15]
    patterns[pat] = patterns.get(pat, 0) + 1

print("\n=== patient_number patterns in sample ===")
for k, v in sorted(patterns.items()):
    print(f"  {k}: {v}")
