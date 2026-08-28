import urllib.request, json, re

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

# Get all inactive LEG-format patients
all_patients = []
for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number,full_name,email,status&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    all_patients.extend(batch)
    if len(batch) < 1000: break

leg_inactive = [p for p in all_patients 
                if re.match(r"^[A-Z]+-\d+$", p.get("patient_number","")) 
                and p.get("status") in ("inactive","old_patient","old")]

print(f"LEG-format patients with inactive/old status: {len(leg_inactive)}")
print()
print("Prefix breakdown:")
prefixes = {}
for p in leg_inactive:
    prefix = p["patient_number"].split("-")[0]
    prefixes[prefix] = prefixes.get(prefix,0) + 1
for k, v in sorted(prefixes.items(), key=lambda x: -x[1]):
    print(f"  {k}: {v}")

print()
print(f"{'Patient Number':<18} {'Name':<35} {'Email'[:45]}")
print("-"*95)
for p in sorted(leg_inactive, key=lambda x: x["patient_number"])[:30]:
    print(f"  {p['patient_number']:<16} {p['full_name'][:33]:<35} {p['email'][:43]}")

# Now parse the original patient (7).sql to find matching entries
print()
print("Reading patient (7).sql to find original patient_ids...")
SQL_FILE = r"database 3\patient (7).sql"
with open(SQL_FILE, encoding="utf-8", errors="replace") as f:
    raw = f.read()

# Extract patient_id (col 12) and name (col 2) from each row
# Quick check: does the old dump have any BLEG/LEG/MIG style patient_ids?
leg_in_old = re.findall(r"'([A-Z]{2,5}-\d+)'", raw)
print(f"LEG/MIG/BLEG style IDs found in patient (7).sql: {len(set(leg_in_old))}")
if leg_in_old:
    print("Samples:", list(set(leg_in_old))[:10])
else:
    print("NONE - the old dump only has numeric patient_ids")
    # Show what patient_id col 12 looks like  
    numeric_ids = re.findall(r"'(\d{4,7})'", raw)
    if numeric_ids:
        unique_ids = list(set(numeric_ids))[:10]
        print(f"Sample numeric IDs from dump: {unique_ids}")
