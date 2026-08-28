import urllib.request, urllib.parse, json

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
    "Range-Unit": "items",
    "Prefer": "count=exact",
}

# Paginate to get all patients
all_patients = []
page_size = 1000
offset = 0
while True:
    url = SUPABASE_URL + f"/rest/v1/patients?select=status,patient_number,file_number,email&limit={page_size}&offset={offset}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch:
        break
    all_patients.extend(batch)
    print(f"  Loaded {len(all_patients)} so far...")
    if len(batch) < page_size:
        break
    offset += page_size

print(f"\nTotal patients in Supabase: {len(all_patients)}")

status_counts = {}
legacy_by_status = {}
legacy_with_file = []
old_patient_normal = []

for p in all_patients:
    st = p.get("status", "unknown")
    pn = p.get("patient_number", "") or ""
    fn = p.get("file_number")
    em = p.get("email", "") or ""
    status_counts[st] = status_counts.get(st, 0) + 1
    
    is_legacy = pn.startswith("legacy.")
    if is_legacy:
        legacy_by_status[st] = legacy_by_status.get(st, 0) + 1
        if fn:
            legacy_with_file.append({"pn": pn[:40], "fn": fn, "st": st})
    elif st in ("inactive","old_patient","old"):
        old_patient_normal.append({"pn": pn, "fn": fn, "st": st})

print("\n=== STATUS COUNTS ===")
for k,v in sorted(status_counts.items()):
    print(f"  {k}: {v}")

print("\n=== LEGACY PATIENTS by status ===")
for k,v in sorted(legacy_by_status.items()):
    print(f"  {k}: {v}")
print(f"  Legacy with file_number set: {len(legacy_with_file)}")
if legacy_with_file:
    print("  Samples:", legacy_with_file[:3])

print(f"\n=== Non-legacy patients with inactive/old_patient status: {len(old_patient_normal)} ===")
for p in old_patient_normal[:5]:
    print(f"  PN={p['pn']}  FN={p['fn']}  ST={p['st']}")
