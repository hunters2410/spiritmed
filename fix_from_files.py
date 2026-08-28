import urllib.request, urllib.parse, json, re, time

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

def extract_patient_id_from_filename(fname):
    """
    Filenames like: Vimbainashe_P_Chimuti_747524_CT_Imaging_2pg_20260808.pdf
    The patient_id is a 4-7 digit number between name parts and document type.
    We skip: timestamps (10+ digits), dates (8 digits like 20260808), page counts (1-3 digits).
    """
    nums = re.findall(r"_(\d+)_", fname)
    for n in nums:
        if 4 <= len(n) <= 7:
            # Skip if it looks like a date (starts with 202 or 201)
            if n.startswith("202") or n.startswith("201"): continue
            return n
    return None

# Step 1: Get ALL files, paginate
print("Step 1: Loading all patient files...")
all_files = []
for offset in range(0, 50000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patient_files?select=patient_id,file_name,title,file_url&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    all_files.extend(batch)
    if len(batch) < 1000: break
print(f"  Total files: {len(all_files)}")

# Step 2: Build patient_uuid -> set of extracted IDs from filenames
patient_id_from_files = {}  # uuid -> set of extracted patient_numbers
for f in all_files:
    uuid = f.get("patient_id")
    fname = f.get("file_name","") or f.get("title","")
    if not uuid or not fname: continue
    extracted = extract_patient_id_from_filename(str(fname))
    if extracted:
        if uuid not in patient_id_from_files:
            patient_id_from_files[uuid] = set()
        patient_id_from_files[uuid].add(extracted)

print(f"  Patients with ID found in filename: {len(patient_id_from_files)}")
# Show samples
for uuid, ids in list(patient_id_from_files.items())[:5]:
    print(f"    UUID ...{uuid[-8:]} -> extracted IDs: {ids}")

# Step 3: Load all inactive/old patients
print("\nStep 2: Loading inactive/old patients from Supabase...")
inactive = []
for offset in range(0, 10000, 1000):
    url = (SUPABASE_URL
           + "/rest/v1/patients?select=id,patient_number,full_name,status"
           + "&status=in.(inactive,old_patient,old)"
           + f"&limit=1000&offset={offset}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    inactive.extend(batch)
    if len(batch) < 1000: break
print(f"  Total inactive/old patients: {len(inactive)}")

# Build set of all current patient_numbers in Supabase to detect conflicts
print("  Loading all current patient_numbers...")
all_pns = set()
for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    for p in batch: all_pns.add((p["patient_number"], p["id"]))
    if len(batch) < 1000: break
all_pn_set = {pn for pn,_ in all_pns}

# Step 4: Match inactive patients to file-extracted IDs
print("\nStep 3: Matching patients...")
can_fix = []
already_ok = []
has_conflict = []
no_file_id = []

for p in inactive:
    uuid = p["id"]
    cur_pn = p["patient_number"]
    extracted_ids = patient_id_from_files.get(uuid, set())
    
    if not extracted_ids:
        no_file_id.append(p)
        continue
    
    # Pick best ID: prefer one that matches current OR is not conflicting
    if cur_pn in extracted_ids:
        already_ok.append((p, cur_pn))
        continue
    
    # Try each extracted ID
    fixed = False
    for eid in sorted(extracted_ids):
        if eid not in all_pn_set:
            can_fix.append((p, eid))
            fixed = True
            break
        # Check if it belongs to THIS patient already
        this_pat_pns = {pn for pn,pid in all_pns if pid == uuid}
        if eid in this_pat_pns:
            already_ok.append((p, eid))
            fixed = True
            break
    if not fixed and not any(eid not in all_pn_set for eid in extracted_ids):
        has_conflict.append((p, extracted_ids))

print(f"\n{'='*60}")
print(f"MATCH RESULTS")
print(f"{'='*60}")
print(f"  Already correct (file ID = current pn)  : {len(already_ok)}")
print(f"  Can safely fix from file ID              : {len(can_fix)}")
print(f"  Conflict (file ID taken by someone else) : {len(has_conflict)}")
print(f"  No informative filename found            : {len(no_file_id)}")
print(f"{'='*60}")

if can_fix:
    print(f"\nSample fixes (first 20):")
    print(f"  {'Current pn':<16} -> {'File-extracted ID':<16} {'Name'}")
    print("  " + "-"*60)
    for p, new_id in can_fix[:20]:
        print(f"  {p['patient_number']:<16} -> {new_id:<16} {p['full_name'][:30]}")

if has_conflict:
    print(f"\nConflicts (first 5):")
    for p, ids in has_conflict[:5]:
        print(f"  {p['patient_number']:<16} Name: {p['full_name'][:25]:<27} File IDs: {ids}")

# Step 5: Apply fixes
if can_fix:
    print(f"\nStep 4: Applying {len(can_fix)} fixes...")
    PATCH_H = {**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"}
    ok=0; err=0; errors=[]
    
    for p, new_id in can_fix:
        payload = json.dumps({"patient_number": new_id}).encode()
        url = SUPABASE_URL + "/rest/v1/patients?id=eq." + p["id"]
        req = urllib.request.Request(url, data=payload, headers=PATCH_H, method="PATCH")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                ok += 1
        except urllib.error.HTTPError as e:
            err += 1
            errors.append(f"{p['patient_number']} -> {new_id}: {e.read().decode()[:60]}")
        
        if (ok+err) % 10 == 0 and (ok+err) > 0:
            print(f"  Progress {ok+err}/{len(can_fix)}  OK={ok}  Err={err}", flush=True)
        time.sleep(0.05)
    
    print(f"\n{'='*60}")
    print(f"DONE!")
    print(f"  Fixed patient_numbers: {ok}")
    print(f"  Errors              : {err}")
    print(f"{'='*60}")
    if errors: [print(" ", e) for e in errors[:5]]
else:
    print("\nNothing to fix from file IDs.")
