import urllib.request, json, re

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

# Get ALL patients - paginate
all_patients = []
for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number,full_name,email,status&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    all_patients.extend(batch)
    if len(batch) < 1000: break

print(f"Total patients in Supabase: {len(all_patients)}")

# Split by pattern
leg_patients = [p for p in all_patients if re.match(r"^[A-Z]+-\d+$", p.get("patient_number",""))]
numeric_patients = [p for p in all_patients if re.match(r"^\d+$", p.get("patient_number",""))]
legacy_dot = [p for p in all_patients if (p.get("patient_number","") or "").startswith("legacy.")]
other = [p for p in all_patients if p not in leg_patients and p not in numeric_patients and p not in legacy_dot]

print(f"\npatient_number patterns:")
print(f"  LEG-/BLEG-/ALEG- format : {len(leg_patients)}")
print(f"  Pure numeric (from old DB): {len(numeric_patients)}")
print(f"  legacy.xxx format        : {len(legacy_dot)}")
print(f"  Other                    : {len(other)}")

if other:
    print("  Other samples:", [p.get("patient_number") for p in other[:5]])

# Status breakdown for LEG- patients
if leg_patients:
    leg_statuses = {}
    for p in leg_patients:
        s = p.get("status","?")
        leg_statuses[s] = leg_statuses.get(s,0) + 1
    print(f"\nLEG-format patient statuses: {leg_statuses}")
    print(f"\nFirst 10 LEG-format patients:")
    for p in leg_patients[:10]:
        print(f"  {p['patient_number']:<15} {p['full_name'][:30]:<32} {p['status']:<12} {p['email'][:40]}")

# For legacy. patients
if legacy_dot:
    ld_statuses = {}
    for p in legacy_dot:
        s = p.get("status","?")
        ld_statuses[s] = ld_statuses.get(s,0) + 1
    print(f"\nlegacy.xxx patient statuses: {ld_statuses}")
    print(f"\nFirst 10 legacy.xxx patients:")
    for p in legacy_dot[:10]:
        print(f"  {p['patient_number'][:30]:<32} {p['full_name'][:30]:<32} {p['status']:<12}")
