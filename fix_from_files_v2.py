import urllib.request, urllib.parse, json, re, time

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

# ── Step 1: Get ALL files joined with patient data ─────────────────────────────
print("Step 1: Loading all patient_files joined with patients...")
all_files = []
for offset in range(0, 50000, 1000):
    url = (SUPABASE_URL
           + "/rest/v1/patient_files"
           + "?select=id,patient_id,file_name,title,file_url,"
           + "patients(id,patient_number,full_name,status)"
           + f"&limit=1000&offset={offset}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    all_files.extend(batch)
    if len(batch) < 1000: break

print(f"  Total files: {len(all_files)}")

# ── Step 2: Build patient_uuid -> best patient_id from all sources ─────────────
# Source A: patient_number in patients table (current, may be LEG-)
# Source B: numeric ID embedded in filename like Name_XXXXXX_DocType.pdf
# Source C: numeric ID from file_url path

def extract_id_from_text(text):
    """Extract 4-7 digit number that isn't a year/timestamp."""
    nums = re.findall(r"[_\-](\d{4,7})[_\-\.]", str(text))
    for n in nums:
        if n.startswith("202") or n.startswith("201") or n.startswith("200"): continue
        return n
    return None

# Group files by patient UUID
from collections import defaultdict
patient_files_map = defaultdict(list)
for f in all_files:
    pat = f.get("patients")
    if not pat: continue
    uuid = pat["id"]
    patient_files_map[uuid].append(f)

print(f"  Unique patients with files: {len(patient_files_map)}")

# ── Step 3: For each patient with files, find the best patient_number ──────────
print("\nStep 2: Analysing patient IDs from files...")
print(f"\n{'Patient Name':<35} {'Current pn':<16} {'ID from filename':<18} {'Status':<12}")
print("-"*85)

needs_fix = []
already_ok = []

for uuid, files in patient_files_map.items():
    pat = files[0]["patients"]
    cur_pn = pat["patient_number"]
    name   = pat["full_name"]
    status = pat["status"]

    # Find patient_id from filename
    id_from_file = None
    for f in files:
        fname = f.get("file_name","") or f.get("title","") or ""
        url_  = f.get("file_url","") or ""
        # Try filename first
        extracted = extract_id_from_text(fname)
        if not extracted:
            # Try the URL path (after UUID folder)
            url_path = url_.split(uuid)[-1] if uuid in url_ else ""
            extracted = extract_id_from_text(url_path)
        if extracted:
            id_from_file = extracted
            break

    flag = "✓ ok" if not id_from_file or id_from_file == cur_pn else "⚠ MISMATCH"
    print(f"  {name:<33} {cur_pn:<16} {str(id_from_file):<18} {flag}")

    if id_from_file and id_from_file != cur_pn:
        needs_fix.append({
            "id": uuid,
            "current_pn": cur_pn,
            "correct_pn": id_from_file,
            "name": name,
            "status": status
        })
    else:
        already_ok.append(pat)

print(f"\n  Already correct: {len(already_ok)}")
print(f"  Needs fix      : {len(needs_fix)}")

# ── Step 4: Load all current patient_numbers to check conflicts ────────────────
if needs_fix:
    print("\nStep 3: Checking for conflicts...")
    all_pns = {}  # patient_number -> patient_id
    for offset in range(0, 15000, 1000):
        url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number&limit=1000&offset={offset}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.loads(r.read())
        if not batch: break
        for p in batch:
            if p.get("patient_number"):
                all_pns[p["patient_number"]] = p["id"]
        if len(batch) < 1000: break

    safe_fixes = []
    conflicts = []
    for fix in needs_fix:
        new_pn = fix["correct_pn"]
        if new_pn not in all_pns:
            safe_fixes.append(fix)
        elif all_pns[new_pn] == fix["id"]:
            # Already belongs to this patient somehow - skip
            pass
        else:
            conflicts.append(fix)

    print(f"  Safe to fix: {len(safe_fixes)}")
    print(f"  Conflicts  : {len(conflicts)}")

    if conflicts:
        print("\n  Conflicts (ID already used by another patient):")
        for c in conflicts:
            print(f"    {c['name']}: {c['current_pn']} -> {c['correct_pn']} (taken)")

    if safe_fixes:
        print(f"\nStep 4: Applying {len(safe_fixes)} safe fixes...")
        PATCH_H = {**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"}
        ok=0; err=0
        for fix in safe_fixes:
            payload = json.dumps({"patient_number": fix["correct_pn"]}).encode()
            url = SUPABASE_URL + "/rest/v1/patients?id=eq." + fix["id"]
            req = urllib.request.Request(url, data=payload, headers=PATCH_H, method="PATCH")
            try:
                with urllib.request.urlopen(req, timeout=15) as r:
                    ok += 1
                print(f"  ✓ Fixed: {fix['name']} | {fix['current_pn']} -> {fix['correct_pn']}")
            except urllib.error.HTTPError as e:
                err += 1
                print(f"  ✗ Error: {fix['name']}: {e.code} {e.read().decode()[:60]}")
            time.sleep(0.05)

        print(f"\n{'='*55}")
        print(f"DONE! Fixed: {ok}  Errors: {err}")
        print(f"{'='*55}")
    else:
        print("\nNo safe fixes available from file data.")
else:
    print("\nAll patients with files already have correct patient_numbers!")
