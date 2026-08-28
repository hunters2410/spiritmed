# -*- coding: utf-8 -*-
"""
FRESH PATIENT IMPORT
1. Delete ALL patients from Supabase
2. Parse patient (8).sql
3. Insert all 8484 patients fresh
4. Set real old patients to inactive at the end
"""
import urllib.request, json, re, time, sys, io, uuid
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H_GET    = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}
H_POST   = {**H_GET, "Content-Type": "application/json", "Prefer": "return=minimal"}
H_DELETE = {**H_GET, "Prefer": "return=minimal"}

REAL_OLD = {
    "estere chivasa","matienga kamota","ayden mazambani","ethan mukudzeyi chikomo",
    "andrew nemapare","netty motsi","robinson mshoperi","ernest zharo","annie muchafa",
    "fadzai mushipe","norest chikamba","gilbert njunga","davina nakai masanga",
    "stephen chisadza","goldberg rindayi chimonyo","felix tachiona","test patient",
    "daniel shumba","easter tsikwaurere","lloyd farai dongo","erina imbayago",
    "ephraim chihota","ottilia magaya","stanslous paraffin","ernest kubvoruno",
    "nqobile dube","naome uwimbabazi","alex mapfuti","trevor h spiers","vimbainashe p chimuti"
}

def map_status(raw):
    if not raw or raw.strip() == "": return "active"
    r = raw.strip()
    if r in ("Alive","alive"): return "active"
    if r in ("Discharged","discharged"): return "discharged"
    if r in ("Deceased","deceased"): return "deceased"
    return "active"

def parse_date(s):
    if not s or s.strip() in ("", "NULL"): return None
    s = s.strip()
    for fmt in ["%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"]:
        try:
            from datetime import datetime
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def parse_row(line):
    """Parse a single MySQL INSERT values row into a list of fields."""
    line = line.strip().rstrip(",;)")
    if not line.startswith("("): return None
    line = line[1:]  # remove leading (
    fields = []
    i = 0
    while i < len(line):
        if line[i:i+4] == "NULL":
            fields.append(None)
            i += 4
            if i < len(line) and line[i] == ",": i += 1
        elif line[i] == "'":
            j = i + 1
            val = []
            while j < len(line):
                if line[j] == "\\" and j+1 < len(line):
                    val.append(line[j+1])
                    j += 2
                elif line[j] == "'":
                    j += 1
                    break
                else:
                    val.append(line[j])
                    j += 1
            fields.append("".join(val))
            i = j
            if i < len(line) and line[i] == ",": i += 1
        elif line[i] in "0123456789-":
            j = i
            while j < len(line) and line[j] not in ",)":
                j += 1
            fields.append(line[i:j])
            i = j
            if i < len(line) and line[i] == ",": i += 1
        else:
            i += 1
    return fields

# ── STEP 0: Get branch_id ─────────────────────────────────────────────────────
print("STEP 0: Getting branch info ...")
url = SUPABASE_URL + "/rest/v1/branches?select=id,name&limit=5"
req = urllib.request.Request(url, headers=H_GET)
with urllib.request.urlopen(req, timeout=15) as r:
    branches = json.loads(r.read())
print(f"  Branches: {branches}")
BRANCH_ID = branches[0]["id"] if branches else None
print(f"  Using branch_id: {BRANCH_ID}")

# ── STEP 1: DELETE all patients ───────────────────────────────────────────────
print("\nSTEP 1: Deleting ALL patients from Supabase ...")
del_url = SUPABASE_URL + "/rest/v1/patients?id=not.is.null"
req = urllib.request.Request(del_url, headers=H_DELETE, method="DELETE")
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print(f"  DELETE response: {r.status}")
except urllib.error.HTTPError as e:
    print(f"  DELETE error: {e.code} - {e.read().decode()[:200]}")

# Verify deletion
time.sleep(2)
url = SUPABASE_URL + "/rest/v1/patients?select=id&limit=1"
req = urllib.request.Request(url, headers={**H_GET, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"})
with urllib.request.urlopen(req, timeout=15) as r:
    cr = r.getheader("Content-Range", "0/?")
    remaining = cr.split("/")[-1]
print(f"  Patients remaining after delete: {remaining}")

# ── STEP 2: Parse patient (8).sql ─────────────────────────────────────────────
print("\nSTEP 2: Parsing patient (8).sql ...")
with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

patients = []
used_file_numbers = set()

for line in lines:
    stripped = line.strip()
    if not (stripped.startswith("(") and (stripped.endswith("),") or stripped.endswith(");"))):
        continue
    fields = parse_row(stripped)
    if not fields or len(fields) < 52: continue
    
    # Column indices (0-based):
    # 0:id 1:img_url 2:name 3:email 4:doctor 5:address 6:phone 7:sex
    # 8:birthdate 9:age 10:bloodgroup 11:ion_user_id 12:patient_id 13:add_date
    # 20:occupation 21:allegies 22:chronic_medications 23:fee_fullname
    # 26:fee_idnumber 28:medical_aid 29:next_of_kin_name 32:next_of_kin_cell
    # 35:next_of_kin_relation 45:filenumber 51:status
    
    name       = (fields[2] or "").strip()
    patient_id = (fields[12] or "").strip()
    phone      = (fields[6] or "").strip()
    sex        = (fields[7] or "").strip()
    birthdate  = parse_date(fields[8])
    bloodgroup = (fields[10] or "").strip() or None
    occupation = (fields[20] or "").strip() or None
    allergies  = (fields[21] or "").strip() or None
    chronic_meds = (fields[22] or "").strip() or None
    national_id  = (fields[26] or "").strip() or None
    medical_aid  = (fields[28] or "").strip() or None
    nok_name     = (fields[29] or "").strip() or None
    nok_phone    = (fields[32] or "").strip() or None
    nok_relation = (fields[35] or "").strip() or None
    raw_fn       = (fields[45] or "").strip()
    address      = (fields[5] or "").strip() or None
    raw_status   = fields[51] if len(fields) > 51 else ""
    
    if not name or not patient_id: continue
    
    # File number: use as-is, but ensure uniqueness
    file_number = raw_fn if raw_fn else None
    if file_number and file_number in used_file_numbers:
        file_number = None  # avoid duplicate
    if file_number:
        used_file_numbers.add(file_number)
    
    # Status
    name_lower = name.lower().strip()
    if name_lower in REAL_OLD:
        status = "inactive"
    else:
        status = map_status(raw_status if isinstance(raw_status, str) else "")
    
    # Generate unique email
    email = f"legacy.{patient_id}@spiritmed.local"
    
    # Gender normalise
    gender = None
    if sex: 
        s = sex.strip().lower()
        if s in ("male","m"): gender = "Male"
        elif s in ("female","f","female"): gender = "Female"
    
    patients.append({
        "patient_number": patient_id,
        "full_name": name,
        "email": email,
        "phone": phone or None,
        "gender": gender,
        "date_of_birth": birthdate,
        "address": address,
        "blood_group": bloodgroup,
        "occupation": occupation,
        "allergies": allergies,
        "chronic_medications": chronic_meds,
        "national_id": national_id,
        "file_number": file_number,
        "status": status,
        "next_of_kin_name": nok_name,
        "next_of_kin_phone": nok_phone,
        "next_of_kin_relationship": nok_relation,
        "branch_id": BRANCH_ID,
        "created_at": "2023-07-11T00:00:00Z"
    })

print(f"  Parsed {len(patients)} patients")
sc = {}
for p in patients: sc[p["status"]] = sc.get(p["status"],0)+1
print(f"  Status distribution: {sc}")

# ── STEP 3: Insert in batches of 100 ─────────────────────────────────────────
print(f"\nSTEP 3: Inserting {len(patients)} patients in batches of 100 ...")
ok = 0; err = 0; errors = []
BATCH = 100

for i in range(0, len(patients), BATCH):
    batch = patients[i:i+BATCH]
    payload = json.dumps(batch).encode("utf-8")
    req = urllib.request.Request(
        SUPABASE_URL + "/rest/v1/patients",
        data=payload, headers=H_POST, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            ok += len(batch)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:120]
        err += len(batch)
        errors.append(f"Batch {i//BATCH+1}: HTTP {e.code} - {body}")
        # Try one-by-one on batch failure
        for p in batch:
            p2 = json.dumps([p]).encode("utf-8")
            req2 = urllib.request.Request(SUPABASE_URL + "/rest/v1/patients", data=p2, headers=H_POST, method="POST")
            try:
                with urllib.request.urlopen(req2, timeout=15) as r2:
                    ok += 1; err -= 1
            except urllib.error.HTTPError as e2:
                body2 = e2.read().decode()[:80]
                errors.append(f"  Single {p['patient_number']}: {e2.code} - {body2}")
            time.sleep(0.05)
    except Exception as ex:
        err += len(batch)
        errors.append(f"Batch {i//BATCH+1}: {ex}")

    if (i // BATCH + 1) % 10 == 0:
        pct = min(100, (i+BATCH)/len(patients)*100)
        print(f"  Progress: {i+BATCH}/{len(patients)} ({pct:.0f}%)  OK={ok}  Err={err}", flush=True)
    time.sleep(0.05)

print()
print("="*60)
print("IMPORT COMPLETE")
print(f"  Inserted OK:  {ok}")
print(f"  Errors:       {err}")
if errors:
    print(f"\nFirst 10 errors:")
    for e in errors[:10]: print(f"  {e}")
print("="*60)