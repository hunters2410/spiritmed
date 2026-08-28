import urllib.request, urllib.parse, json, re, time

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}
SQL_FILE = r"database 3\patient (7).sql"

# ══════════════════════════════════════════════════
# Step 1 — Parse old dump: build BOTH maps
#   name_lower  -> list of patient_ids (all occurrences)
#   mysql_id    -> patient_id  (col 0 -> col 12)
# ══════════════════════════════════════════════════
print("Step 1: Parsing patient (7).sql...")
with open(SQL_FILE, encoding="utf-8", errors="replace") as f:
    raw = f.read()

m = re.search(r"INSERT INTO `patient`[^V]*VALUES\s*([\s\S]+);", raw)
if not m:
    print("ERROR: Cannot find INSERT block"); exit(1)
block = m.group(1).strip()

def split_rows(block):
    rows=[]; depth=0; inStr=False; esc=False; cur=""; inRow=False
    for i,ch in enumerate(block):
        if esc: cur+=ch; esc=False; continue
        if ch=="\\" and inStr: cur+=ch; esc=True; continue
        if ch=="'" and not inStr: inStr=True; cur+=ch; continue
        if ch=="'" and inStr:
            if i+1<len(block) and block[i+1]=="'": cur+="''"; continue
            inStr=False; cur+=ch; continue
        if inStr: cur+=ch; continue
        if ch=="(": depth+=1;
        if depth==1 and ch=="(": inRow=True; cur=""; continue
        if ch==")":
            depth-=1
            if depth==0 and inRow: rows.append(cur.strip()); cur=""; inRow=False; continue
        if inRow: cur+=ch
    return rows

def parse_vals(row):
    vals=[]; inStr=False; cur=""
    for i,ch in enumerate(row):
        if ch=="'" and not inStr: inStr=True; continue
        if ch=="'" and inStr:
            if i+1<len(row) and row[i+1]=="'": cur+="'"; continue
            inStr=False; continue
        if inStr: cur+=ch; continue
        if ch==",": vals.append(None if cur.strip() in ("NULL","") else cur.strip()); cur=""; continue
        cur+=ch
    vals.append(None if cur.strip() in ("NULL","") else cur.strip())
    return vals

rows = split_rows(block)
print(f"  Found {len(rows)} rows in old dump")

# name_lower -> list of (mysql_id, patient_id) tuples
name_to_records = {}
mysql_id_to_patient_id = {}

for row in rows:
    v = parse_vals(row)
    if len(v) < 13: continue
    mysql_id   = v[0]   # auto-increment primary key (unique!)
    name       = v[2]   # patient name
    patient_id = v[12]  # original patient_id (NOT unique in old system)
    if name:
        norm = name.strip().lower()
        if norm not in name_to_records:
            name_to_records[norm] = []
        name_to_records[norm].append({"mysql_id": mysql_id, "patient_id": patient_id})
    if mysql_id and patient_id:
        mysql_id_to_patient_id[mysql_id] = patient_id

print(f"  Unique names mapped: {len(name_to_records)}")

# Check how often patient_id is reused
all_pids = [rec["patient_id"] for recs in name_to_records.values() for rec in recs if rec["patient_id"]]
from collections import Counter
pid_counts = Counter(all_pids)
reused = {pid: cnt for pid, cnt in pid_counts.items() if cnt > 1}
print(f"  patient_ids reused across multiple records: {len(reused)}")
print(f"  patient_ids that are unique: {len(pid_counts) - len(reused)}")

# ══════════════════════════════════════════════════
# Step 2 — Get all inactive/old patients from Supabase
# ══════════════════════════════════════════════════
print("\nStep 2: Fetching inactive/old patients from Supabase...")
inactive_patients = []
for offset in range(0, 10000, 1000):
    url = (SUPABASE_URL
           + f"/rest/v1/patients?select=id,patient_number,full_name,email,status"
           + f"&status=in.(inactive,old_patient,old)&limit=1000&offset={offset}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    inactive_patients.extend(batch)
    if len(batch) < 1000: break

print(f"  Found {len(inactive_patients)} inactive/old patients in Supabase")

# Also build a set of all patient_numbers currently in Supabase
print("  Loading all existing patient_numbers...")
all_supabase_pns = set()
for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=patient_number&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    for p in batch:
        if p.get("patient_number"):
            all_supabase_pns.add(p["patient_number"])
    if len(batch) < 1000: break
print(f"  Total unique patient_numbers in Supabase: {len(all_supabase_pns)}")

# ══════════════════════════════════════════════════
# Step 3 — Match each inactive patient to old dump
# ══════════════════════════════════════════════════
print("\nStep 3: Matching inactive patients to old dump by name...")

results = {
    "already_correct":    [],  # patient_number matches old patient_id
    "can_fix":            [],  # found unique match, patient_id not conflicting
    "conflict":           [],  # patient_id found but already in Supabase under diff patient
    "not_in_dump":        [],  # name not found in old dump at all
    "ambiguous":          [],  # name found but patient_id not unique
}

for p in inactive_patients:
    norm = p["full_name"].strip().lower()
    records = name_to_records.get(norm, [])
    
    if not records:
        results["not_in_dump"].append(p)
        continue
    
    # Get all unique patient_ids for this name
    pids = list(set(r["patient_id"] for r in records if r["patient_id"]))
    
    if not pids:
        results["not_in_dump"].append(p)
        continue
    
    # Check if current patient_number already matches any of the old patient_ids
    if p["patient_number"] in pids:
        results["already_correct"].append((p, p["patient_number"]))
        continue
    
    # Try each possible patient_id - prefer unique ones first
    fixed = False
    for pid in pids:
        if pid not in all_supabase_pns:
            # This patient_id is not used by anyone in Supabase — safe to assign
            results["can_fix"].append((p, pid))
            fixed = True
            break
        elif pid in all_supabase_pns:
            # Check if it belongs to THIS patient already
            pass
    
    if not fixed:
        # All found patient_ids are taken by others
        results["conflict"].append((p, pids))

# ══════════════════════════════════════════════════
# Step 4 — Report findings
# ══════════════════════════════════════════════════
print("\n" + "="*60)
print("AUDIT RESULTS")
print("="*60)
print(f"  Already have correct patient_id  : {len(results['already_correct'])}")
print(f"  Can fix (safe, no conflict)      : {len(results['can_fix'])}")
print(f"  Conflict (ID already used)       : {len(results['conflict'])}")
print(f"  Not found in old dump at all     : {len(results['not_in_dump'])}")
print("="*60)

print(f"\nSample CAN FIX (first 20):")
print(f"{'Current pn':<16} {'New (orig) ID':<16} {'Name'}")
print("-"*60)
for p, new_id in results["can_fix"][:20]:
    print(f"  {p['patient_number']:<14} -> {new_id:<14} {p['full_name'][:30]}")

# ══════════════════════════════════════════════════
# Step 5 — Apply safe fixes
# ══════════════════════════════════════════════════
print(f"\nStep 5: Applying {len(results['can_fix'])} safe fixes...")

PATCH_HEADERS = {**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"}
ok=0; err=0; errors=[]

for p, new_id in results["can_fix"]:
    payload = json.dumps({"patient_number": new_id}).encode()
    url = SUPABASE_URL + "/rest/v1/patients?id=eq." + p["id"]
    req = urllib.request.Request(url, data=payload, headers=PATCH_HEADERS, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            ok += 1
    except urllib.error.HTTPError as e:
        err += 1
        errors.append(f"{p['patient_number']} -> {new_id}: HTTP {e.code} {e.read().decode()[:60]}")
    
    if (ok+err) % 20 == 0 and (ok+err) > 0:
        print(f"  Progress: {ok+err}/{len(results['can_fix'])}  OK={ok}  Err={err}", flush=True)
    time.sleep(0.05)

print()
print("="*60)
print("FIX COMPLETE")
print(f"  Updated patient_number           : {ok}")
print(f"  Errors                           : {err}")
print(f"  Skipped (conflicts, need review) : {len(results['conflict'])}")
print(f"  Skipped (not in old dump)        : {len(results['not_in_dump'])}")
print("="*60)

if errors:
    print("\nErrors:")
    for e in errors[:5]: print(" ", e)
