import urllib.request, urllib.parse, json

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
}

# Count by status
url = SUPABASE_URL + "/rest/v1/patients?select=status,patient_number,file_number,email&order=status"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req, timeout=30) as r:
    patients = json.loads(r.read())

status_counts = {}
legacy_counts = {}
legacy_with_file = 0
legacy_sample = []

for p in patients:
    st = p.get("status", "unknown")
    pn = p.get("patient_number", "")
    fn = p.get("file_number")
    em = p.get("email", "")
    
    status_counts[st] = status_counts.get(st, 0) + 1
    
    is_legacy = pn and pn.startswith("legacy.")
    if is_legacy:
        legacy_counts[st] = legacy_counts.get(st, 0) + 1
        if fn:
            legacy_with_file += 1
            if len(legacy_sample) < 5:
                legacy_sample.append({"pn": pn, "fn": fn, "st": st, "em": em[:40]})

print("=== STATUS COUNTS (all patients) ===")
for k, v in sorted(status_counts.items()):
    print(f"  {k}: {v}")

print("\n=== LEGACY PATIENTS (patient_number starts with 'legacy.') ===")
for k, v in sorted(legacy_counts.items()):
    print(f"  {k}: {v}")
print(f"  Legacy patients with file_number set: {legacy_with_file}")

print("\n=== Sample legacy patients that have file_number ===")
for s in legacy_sample:
    print(f"  PN={s['pn'][:35]}  FN={s['fn']}  ST={s['st']}  email={s['em']}")

# Check normal patients (non-legacy) with old_patient / inactive status
inactive_normal = [p for p in patients if p.get("patient_number","") and not p["patient_number"].startswith("legacy.") and p.get("status") in ("inactive","old_patient","old")]
print(f"\n=== Normal (non-legacy) patients with inactive/old_patient status: {len(inactive_normal)} ===")
for p in inactive_normal[:5]:
    print(f"  PN={p['patient_number']}  FN={p.get('file_number')}  ST={p['status']}")
