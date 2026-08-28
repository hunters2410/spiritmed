import urllib.request, json, re, time, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H = {"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json", "Prefer": "return=minimal"}
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

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
    if not raw or not raw.strip(): return "active"
    r = raw.strip()
    if r == "Discharged": return "discharged"
    if r == "Deceased": return "deceased"
    return "active"

def parse_date(s):
    if not s or not s.strip(): return None
    from datetime import datetime
    for fmt in ["%d-%m-%Y","%Y-%m-%d","%m/%d/%Y","%d/%m/%Y"]:
        try: return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def parse_row(line):
    line = line.strip().rstrip(",;)")
    if not line.startswith("("): return None
    line = line[1:]
    fields=[]; i=0
    while i < len(line):
        if line[i:i+4]=="NULL":
            fields.append(None); i+=4
            if i<len(line) and line[i]==",": i+=1
        elif line[i]=="'":
            j=i+1; val=[]
            while j<len(line):
                if line[j]=="\\" and j+1<len(line): val.append(line[j+1]); j+=2
                elif line[j]=="'": j+=1; break
                else: val.append(line[j]); j+=1
            fields.append("".join(val)); i=j
            if i<len(line) and line[i]==",": i+=1
        elif line[i] in "0123456789-":
            j=i
            while j<len(line) and line[j] not in ",)": j+=1
            fields.append(line[i:j]); i=j
            if i<len(line) and line[i]==",": i+=1
        else: i+=1
    return fields

# Load existing patient_numbers, file_numbers, emails from DB
print("Loading existing patients from DB...")
existing_pn = set()
existing_fn = set()
existing_email = set()

for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=patient_number,file_number,email&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers={"apikey": KEY, "Authorization": "Bearer "+KEY})
    with urllib.request.urlopen(req, timeout=20) as r:
        batch = json.loads(r.read())
    if not batch: break
    for p in batch:
        if p.get("patient_number"): existing_pn.add(str(p["patient_number"]))
        if p.get("file_number"): existing_fn.add(str(p["file_number"]))
        if p.get("email"): existing_email.add(str(p["email"]))
    if len(batch) < 1000: break

print(f"Already in DB: {len(existing_pn)} patients, {len(existing_fn)} file_numbers, {len(existing_email)} emails")

# Parse dump and build clean missing list
print("Parsing dump...")
with open(r"database 4\patient (8).sql","r",encoding="utf-8",errors="replace") as f:
    lines=f.readlines()

missing = []
for idx, line in enumerate(lines):
    s=line.strip()
    if not (s.startswith("(") and (s.endswith("),") or s.endswith(");"))): continue
    f=parse_row(s)
    if not f or len(f)<52: continue
    name=(f[2] or "").strip(); pid=(f[12] or "").strip()
    if not name or not pid: continue
    if pid in existing_pn: continue  # already in DB

    phone=(f[6] or "").strip() or None
    sex=(f[7] or "").strip()
    dob=parse_date(f[8])
    blood=(f[10] or "").strip() or None
    address=(f[5] or "").strip() or None
    occ=(f[20] or "").strip() or None
    allerg=(f[21] or "").strip() or None
    chronic=(f[22] or "").strip() or None
    id_passport=(f[26] or "").strip() or None
    nok_name=(f[29] or "").strip() or None
    nok_phone=(f[32] or "").strip() or None
    nok_rel=(f[35] or "").strip() or None
    raw_fn=(f[45] or "").strip()
    raw_status=f[51] if len(f)>51 else ""
    smoke=(f[48] or "").strip() or None
    alcohol=(f[49] or "").strip() or None

    # Handle file_number uniqueness
    fn = raw_fn if raw_fn and raw_fn not in existing_fn else None
    if fn: existing_fn.add(fn)

    gender=None
    if sex:
        sl=sex.strip().lower()
        if sl in ("male","m"): gender="Male"
        elif sl in ("female","f"): gender="Female"

    status="inactive" if name.lower().strip() in REAL_OLD else map_status(raw_status if isinstance(raw_status,str) else "")

    # Handle email uniqueness
    base_email = f"legacy.{pid}@spiritmed.local"
    email = base_email
    c = 1
    while email in existing_email:
        email = f"legacy.{pid}.{c}@spiritmed.local"
        c += 1
    existing_email.add(email)

    missing.append({
        "patient_number": pid,
        "full_name": name,
        "email": email,
        "phone": phone,
        "gender": gender,
        "date_of_birth": dob,
        "address": address,
        "blood_group": blood,
        "occupation": occ,
        "allergies": allerg,
        "chronic_medications": chronic,
        "id_passport_number": id_passport,
        "file_number": fn,
        "status": status,
        "next_of_kin_name": nok_name,
        "next_of_kin_phone": nok_phone,
        "next_of_kin_relationship": nok_rel,
        "smoke": smoke,
        "alcohol": alcohol,
        "branch_id": BRANCH_ID,
        "created_at": "2023-07-11T00:00:00Z"
    })

print(f"Missing patients to insert: {len(missing)}")

# Insert in batches of 100
ok=0; err=0; errors=[]
for i in range(0, len(missing), 100):
    batch = missing[i:i+100]
    payload = json.dumps(batch).encode("utf-8")
    req = urllib.request.Request(SUPABASE_URL+"/rest/v1/patients", data=payload, headers=H, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            ok += len(batch)
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        # Retry single
        for p in batch:
            p2 = json.dumps([p]).encode("utf-8")
            req2 = urllib.request.Request(SUPABASE_URL+"/rest/v1/patients", data=p2, headers=H, method="POST")
            try:
                with urllib.request.urlopen(req2, timeout=10) as r2:
                    ok += 1
            except urllib.error.HTTPError as e2:
                err += 1
                b2 = e2.read().decode()[:100]
                errors.append(f"PN={p['patient_number']} FN={p['file_number']}: HTTP {e2.code} - {b2}")
            time.sleep(0.01)
    except Exception as ex:
        err += len(batch)
        errors.append(f"Batch {i//100+1}: {ex}")

    if (i//100 + 1) % 5 == 0 or (i + 100 >= len(missing)):
        print(f"  {min(i+100, len(missing))}/{len(missing)} ({min(i+100, len(missing))/len(missing)*100:.1f}%)  OK={ok}  Err={err}", flush=True)

print("\n" + "="*50)
print(f"INSERT FINISHED: OK={ok}, Errors={err}")
if errors:
    print(f"First 10 errors:")
    for er in errors[:10]:
        print(f"  {er}")

# Verify total count in Supabase
req_cnt = urllib.request.Request(SUPABASE_URL+"/rest/v1/patients?select=id",
    headers={"apikey":KEY,"Authorization":"Bearer "+KEY,"Prefer":"count=exact","Range-Unit":"items","Range":"0-0"})
with urllib.request.urlopen(req_cnt, timeout=15) as r_cnt:
    total_db = r_cnt.getheader("Content-Range","0/?").split("/")[-1]
print(f"FINAL TOTAL PATIENTS IN SUPABASE DATABASE: {total_db}")
print("="*50)