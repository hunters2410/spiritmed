# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, re, time, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H_GET  = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}
H_PATCH = {**H_GET, "Content-Type": "application/json", "Prefer": "return=minimal"}

# ── Real old patients (the ONLY ones that should be 'inactive') ───────────────
REAL_OLD_PATIENTS = {
    "estere chivasa", "matienga kamota", "ayden mazambani",
    "ethan mukudzeyi chikomo", "andrew nemapare", "netty motsi",
    "robinson mshoperi", "ernest zharo", "annie muchafa",
    "fadzai mushipe", "norest chikamba", "gilbert njunga",
    "davina nakai masanga", "stephen chisadza", "goldberg rindayi chimonyo",
    "felix tachiona", "test patient", "daniel shumba",
    "easter tsikwaurere", "lloyd farai dongo", "erina imbayago",
    "ephraim chihota", "ottilia magaya", "stanslous paraffin",
    "ernest kubvoruno", "nqobile dube", "naome uwimbabazi",
    "alex mapfuti", "trevor h spiers", "vimbainashe p chimuti"
}

# ── STEP 1: Parse patient (8).sql ────────────────────────────────────────────
print("STEP 1: Parsing patient (8).sql ...")
with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

# Status mapping
def map_status(raw):
    if raw in ("Alive", "alive", ""): return "active"
    if raw in ("Discharged", "discharged"): return "discharged"
    if raw in ("Deceased", "deceased"): return "deceased"
    return "active"  # NULL / anything else -> active

dump_by_id = {}   # patient_id -> {name, status, file_number, phone}
for line in lines:
    stripped = line.strip()
    if not (stripped.startswith("(") and (stripped.endswith("),") or stripped.endswith(");"))):
        continue
    clean = stripped.rstrip(",;)")
    # Extract patient_id (column 13, 0-indexed 12) and filenumber (column 46, 0-indexed 45)
    # Use regex to extract key fields
    # id, img_url, name, email, doctor, address, phone, sex, birthdate, age, bloodgroup,
    # ion_user_id, patient_id, add_date, ...., filenumber (col46), ..., status (col52)
    
    # Extract patient_id field (13th column = index 12)
    pid_m = re.search(r"'(\d{3,7})',\s*'\d{2}/\d{2}/\d{2}'", clean)
    if not pid_m: continue
    patient_id = pid_m.group(1)
    
    # Extract name (3rd field = index 2) - after id and img_url
    name_m = re.search(r"^\(\d+,\s*(?:NULL|'[^']*'),\s*'([^']*)'", clean)
    name = name_m.group(1) if name_m else ""
    
    # Extract phone (7th field = index 6)
    # Extract filenumber (look for 4-digit zero-padded number like '0001')
    fn_m = re.search(r"'(0\d{3,4})'", clean)
    file_number = fn_m.group(1) if fn_m else None
    
    # Extract status (second-to-last field)
    status_m = re.search(r",\s*(?:NULL|'([^']*)')\s*,\s*(?:NULL|'[^']*')\s*$", clean)
    raw_status = status_m.group(1) if status_m and status_m.group(1) else ""
    status = map_status(raw_status)
    
    dump_by_id[patient_id] = {
        "name": name,
        "status": status,
        "file_number": file_number
    }

print(f"  Parsed {len(dump_by_id)} patients from dump")
status_counts = {}
for v in dump_by_id.values():
    status_counts[v["status"]] = status_counts.get(v["status"], 0) + 1
print(f"  Status distribution: {status_counts}")

# ── STEP 2: Load all Supabase patients ────────────────────────────────────────
print("\nSTEP 2: Loading all Supabase patients ...")
all_pats = []
for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number,full_name,status,file_number&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers=H_GET)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    all_pats.extend(batch)
    if len(batch) < 1000: break
print(f"  Loaded {len(all_pats)} patients from Supabase")

# ── STEP 3: Match and build update list ───────────────────────────────────────
print("\nSTEP 3: Matching patients to dump ...")
updates = []
skipped = 0
for p in all_pats:
    pn = str(p["patient_number"])
    if pn.startswith("LEG-"):
        skipped += 1
        continue
    if pn not in dump_by_id:
        skipped += 1
        continue
    dump_rec = dump_by_id[pn]
    
    # Check if this patient is a real old patient (by name)
    name_lower = (dump_rec["name"] or p["full_name"] or "").lower().strip()
    if name_lower in REAL_OLD_PATIENTS:
        final_status = "inactive"
    else:
        final_status = dump_rec["status"]
    
    updates.append({
        "id": p["id"],
        "patient_number": pn,
        "full_name": dump_rec["name"] or p["full_name"],
        "status": final_status,
        "file_number": dump_rec["file_number"]
    })

print(f"  Patients to update: {len(updates)}")
print(f"  Patients skipped (LEG/unmatched): {skipped}")

# ── STEP 4: Apply updates ─────────────────────────────────────────────────────
print(f"\nSTEP 4: Applying {len(updates)} updates ...")
ok = 0; err = 0; errors = []

for i, upd in enumerate(updates):
    payload = json.dumps({
        "status": upd["status"],
        "full_name": upd["full_name"],
        "file_number": upd["file_number"]
    }).encode()
    url = SUPABASE_URL + "/rest/v1/patients?id=eq." + upd["id"]
    req = urllib.request.Request(url, data=payload, headers=H_PATCH, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            ok += 1
    except urllib.error.HTTPError as e:
        err += 1
        body = e.read().decode()[:80]
        errors.append(f"PN={upd['patient_number']}: HTTP {e.code} - {body}")
    except Exception as e:
        err += 1
        errors.append(f"PN={upd['patient_number']}: {e}")

    if (i+1) % 500 == 0:
        pct = (i+1)/len(updates)*100
        print(f"  Progress: {i+1}/{len(updates)} ({pct:.1f}%)  OK={ok}  Err={err}", flush=True)
    if (i+1) % 50 == 0:
        time.sleep(0.1)

# ── STEP 5: Final report ──────────────────────────────────────────────────────
print()
print("="*60)
print("DONE!")
print(f"  Updated successfully:  {ok}")
print(f"  Errors:                {err}")
print(f"  Skipped (LEG/other):   {skipped}")
if errors:
    print("\nFirst errors:")
    for e in errors[:5]:
        print(f"  {e}")
print("="*60)