import urllib.request, urllib.parse, json, re, time

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}
SQL_FILE = r"database 3\patient (7).sql"

# ── Step 1: Parse the original SQL dump - build name -> patient_id map ──────────
print("Parsing patient (7).sql...")
with open(SQL_FILE, encoding="utf-8", errors="replace") as f:
    raw = f.read()

# Find INSERT block
m = re.search(r"INSERT INTO `patient`[^V]*VALUES\s*([\s\S]+);", raw)
if not m:
    print("ERROR: Could not find INSERT block"); exit(1)
block = m.group(1).strip()

def split_rows(block):
    rows = []; depth=0; inStr=False; escaped=False; cur=""; inRow=False
    for i, ch in enumerate(block):
        if escaped: cur+=ch; escaped=False; continue
        if ch=="\\" and inStr: cur+=ch; escaped=True; continue
        if ch=="'" and not inStr: inStr=True; cur+=ch; continue
        if ch=="'" and inStr:
            if i+1<len(block) and block[i+1]=="'": cur+="''"; continue
            inStr=False; cur+=ch; continue
        if inStr: cur+=ch; continue
        if ch=="(": 
            depth+=1
            if depth==1: inRow=True; cur=""; continue
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
        if ch==",": vals.append(None if cur.strip()=="NULL" else cur.strip()); cur=""; continue
        cur+=ch
    vals.append(None if cur.strip()=="NULL" else cur.strip())
    return vals

# Build name -> original patient_id map (col 12)
# Also build id map for exact matching
old_name_to_id = {}  # normalized_name -> patient_id
rows = split_rows(block)
print(f"Found {len(rows)} rows in old dump")

for row in rows:
    v = parse_vals(row)
    if len(v) < 13: continue
    name = v[2]  # col index 2 = name
    patient_id = v[12]  # col index 12 = patient_id
    if name and patient_id:
        norm = name.strip().lower()
        old_name_to_id[norm] = patient_id

print(f"Mapped {len(old_name_to_id)} name -> patient_id entries from old dump")

# ── Step 2: Get all LEG- patients from Supabase ────────────────────────────────
print("\nFetching LEG-format patients from Supabase...")
all_p = []
for offset in range(0, 5000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number,full_name,email,status&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    all_p.extend(batch)
    if len(batch)<1000: break

leg_patients = [p for p in all_p if re.match(r"^LEG-\d+$", p.get("patient_number",""))]
print(f"LEG-format patients: {len(leg_patients)}")

# ── Step 3: Match each LEG patient to original patient_id by name ──────────────
matched = []
unmatched = []

for p in leg_patients:
    name_norm = p["full_name"].strip().lower()
    orig_id = old_name_to_id.get(name_norm)
    if orig_id:
        matched.append((p, orig_id))
    else:
        # Try partial match (first word of name)
        first_word = name_norm.split()[0] if name_norm else ""
        candidates = [(k, v) for k, v in old_name_to_id.items() if k.startswith(first_word) and len(first_word) > 3]
        if len(candidates) == 1:
            matched.append((p, candidates[0][1]))
        else:
            unmatched.append(p)

print(f"\nMatched to original patient_id: {len(matched)}")
print(f"Could not match: {len(unmatched)}")

if unmatched:
    print("\nUnmatched (first 10):")
    for p in unmatched[:10]:
        print(f"  LEG={p['patient_number']} | Name: {p['full_name']}")

# ── Step 4: Show what we will fix ──────────────────────────────────────────────
print("\nSample fixes (first 15):")
print(f"{'Current (LEG)':<15} {'Original ID':<15} {'Name'}")
print("-"*60)
for p, orig in matched[:15]:
    print(f"  {p['patient_number']:<13} -> {orig:<13} {p['full_name']}")

# ── Step 5: Apply fixes ────────────────────────────────────────────────────────
PATCH_HEADERS = dict(HEADERS)
PATCH_HEADERS["Content-Type"] = "application/json"
PATCH_HEADERS["Prefer"] = "return=minimal"

print(f"\nApplying {len(matched)} patient_number fixes...")
ok=0; err=0; conflict=0; errors=[]

for p, orig_id in matched:
    # Check for conflict - does a patient with this orig_id already exist?
    check_url = SUPABASE_URL + "/rest/v1/patients?select=id,full_name&patient_number=eq." + urllib.parse.quote(orig_id)
    req = urllib.request.Request(check_url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        existing = json.loads(r.read())
    
    if existing and existing[0]["id"] != p["id"]:
        conflict += 1
        errors.append(f"CONFLICT: {p['patient_number']} -> {orig_id} already used by {existing[0]['full_name']}")
        continue
    
    # Safe to update
    payload = json.dumps({"patient_number": orig_id}).encode()
    patch_url = SUPABASE_URL + "/rest/v1/patients?id=eq." + p["id"]
    req2 = urllib.request.Request(patch_url, data=payload, headers=PATCH_HEADERS, method="PATCH")
    try:
        with urllib.request.urlopen(req2, timeout=15) as r:
            ok += 1
    except urllib.error.HTTPError as e:
        err += 1
        errors.append(f"HTTP {e.code} for {p['patient_number']}: {e.read().decode()[:80]}")
    
    if (ok+err+conflict) % 50 == 0:
        print(f"  Progress: {ok+err+conflict}/{len(matched)}  OK={ok} Conflicts={conflict} Err={err}", flush=True)
    time.sleep(0.05)

print()
print("="*55)
print("DONE!")
print(f"  Successfully updated patient_number: {ok}")
print(f"  Conflicts (ID already in use)      : {conflict}")
print(f"  Errors                             : {err}")
print(f"  Unmatched (no name match in dump)  : {len(unmatched)}")
print("="*55)

if errors[:10]:
    print("\nFirst errors/conflicts:")
    for e in errors[:10]:
        print(" ", e)
