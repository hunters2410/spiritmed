# -*- coding: utf-8 -*-
import urllib.request, json, re, time, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H_GET  = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}
H_POST = {**H_GET, "Content-Type": "application/json", "Prefer": "return=minimal"}
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
        if line[i:i+4]=="NULL": fields.append(None); i+=4; (i<len(line) and line[i]==",") and (i:=i+1)
        elif line[i]=="'":
            j=i+1; val=[]
            while j<len(line):
                if line[j]=="\\" and j+1<len(line): val.append(line[j+1]); j+=2
                elif line[j]=="'": j+=1; break
                else: val.append(line[j]); j+=1
            fields.append("".join(val)); i=j
            (i<len(line) and line[i]==",") and (i:=i+1)
        elif line[i] in "0123456789-":
            j=i
            while j<len(line) and line[j] not in ",)": j+=1
            fields.append(line[i:j]); i=j
            (i<len(line) and line[i]==",") and (i:=i+1)
        else: i+=1
    return fields

# Verify table is empty
url = SUPABASE_URL + "/rest/v1/patients?select=id&limit=1"
req = urllib.request.Request(url, headers={**H_GET,"Prefer":"count=exact","Range-Unit":"items","Range":"0-0"})
with urllib.request.urlopen(req,timeout=15) as r:
    cr = r.getheader("Content-Range","0/?"); cnt = cr.split("/")[-1]
print(f"Patients in table before import: {cnt}")
if cnt not in ("0","*",""):
    print(f"WARNING: Table has {cnt} patients - proceeding anyway (table was truncated)")

# Parse dump
print("Parsing patient (8).sql ...")
with open(r"database 4\patient (8).sql","r",encoding="utf-8",errors="replace") as f:
    lines=f.readlines()

patients=[]; used_fn=set(); used_emails=set()
for line in lines:
    s=line.strip()
    if not (s.startswith("(") and (s.endswith("),") or s.endswith(");"))): continue
    f=parse_row(s)
    if not f or len(f)<52: continue
    name=(f[2] or "").strip(); pid=(f[12] or "").strip()
    if not name or not pid: continue
    phone=(f[6] or "").strip() or None
    sex=(f[7] or "").strip()
    dob=parse_date(f[8])
    blood=(f[10] or "").strip() or None
    address=(f[5] or "").strip() or None
    occ=(f[20] or "").strip() or None
    allerg=(f[21] or "").strip() or None
    chronic=(f[22] or "").strip() or None
    nat_id=(f[26] or "").strip() or None
    nok_name=(f[29] or "").strip() or None
    nok_phone=(f[32] or "").strip() or None
    nok_rel=(f[35] or "").strip() or None
    raw_fn=(f[45] or "").strip()
    raw_status=f[51] if len(f)>51 else ""
    fn=raw_fn if raw_fn and raw_fn not in used_fn else None
    if fn: used_fn.add(fn)
    gender=None
    if sex:
        sl=sex.strip().lower()
        if sl in ("male","m"): gender="Male"
        elif sl in ("female","f"): gender="Female"
    status="inactive" if name.lower().strip() in REAL_OLD else map_status(raw_status if isinstance(raw_status,str) else "")
    email=f"legacy.{pid}@spiritmed.local"
    if email in used_emails: email=f"legacy.{pid}.{len(patients)}@spiritmed.local"
    used_emails.add(email)
    patients.append({"patient_number":pid,"full_name":name,"email":email,"phone":phone,
        "gender":gender,"date_of_birth":dob,"address":address,"blood_group":blood,
        "occupation":occ,"allergies":allerg,"chronic_medications":chronic,
        "national_id":nat_id,"file_number":fn,"status":status,
        "next_of_kin_name":nok_name,"next_of_kin_phone":nok_phone,
        "next_of_kin_relationship":nok_rel,"branch_id":BRANCH_ID,
        "created_at":"2023-07-11T00:00:00Z"})

sc={}
for p in patients: sc[p["status"]]=sc.get(p["status"],0)+1
print(f"Parsed {len(patients)} patients  |  {sc}")

# Insert in batches of 200
print(f"Inserting {len(patients)} patients in batches of 200 ...")
ok=0; err=0; errors=[]
for i in range(0,len(patients),200):
    batch=patients[i:i+200]
    payload=json.dumps(batch).encode("utf-8")
    req=urllib.request.Request(SUPABASE_URL+"/rest/v1/patients",data=payload,headers=H_POST,method="POST")
    try:
        with urllib.request.urlopen(req,timeout=30) as r: ok+=len(batch)
    except urllib.error.HTTPError as e:
        body=e.read().decode()[:150]; err+=len(batch)
        errors.append(f"Batch {i//200+1}: {e.code} - {body}")
        # retry one-by-one
        err-=len(batch)
        for p in batch:
            p2=json.dumps([p]).encode("utf-8")
            req2=urllib.request.Request(SUPABASE_URL+"/rest/v1/patients",data=p2,headers=H_POST,method="POST")
            try:
                with urllib.request.urlopen(req2,timeout=15) as r2: ok+=1
            except urllib.error.HTTPError as e2:
                err+=1; errors.append(f"  {p['patient_number']}: {e2.code} - {e2.read().decode()[:60]}")
            time.sleep(0.03)
    except Exception as ex:
        err+=len(batch); errors.append(f"Batch {i//200+1}: {ex}")
    if (i//200+1)%5==0:
        print(f"  {i+len(batch)}/{len(patients)} ({(i+len(batch))/len(patients)*100:.0f}%)  OK={ok}  Err={err}",flush=True)
    time.sleep(0.02)

print(f"\n{'='*50}")
print(f"DONE!  OK={ok}  Errors={err}")
if errors: 
    print("First errors:")
    for e in errors[:5]: print(f"  {e}")
print("="*50)