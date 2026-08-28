import csv, os, sys, io, urllib.request, json, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H = {"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json", "Prefer": "return=minimal"}
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

# 1. Fetch all patients from Supabase
print("Loading patients from Supabase...")
patient_by_pid = {}
patient_by_name = {}

for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number,full_name,file_number&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers={"apikey": KEY, "Authorization": "Bearer "+KEY})
    with urllib.request.urlopen(req, timeout=20) as r:
        batch = json.loads(r.read())
    if not batch: break
    for p in batch:
        if p.get("patient_number"):
            patient_by_pid[str(p["patient_number"])] = p
        if p.get("full_name"):
            patient_by_name[str(p["full_name"]).lower().strip()] = p
    if len(batch) < 1000: break

# 2. Fetch all storage subfolders and their files
def list_objects(prefix=""):
    url = f"{SUPABASE_URL}/storage/v1/object/list/patient-files"
    payload = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return []

root_items = list_objects("")
storage_folders = {} # folder_uuid -> list of file dicts

for item in root_items:
    if not isinstance(item, dict): continue
    fname = item.get("name")
    if item.get("metadata") is None: # folder
        sub = list_objects(fname + "/")
        f_list = []
        for s in sub:
            if isinstance(s, dict) and s.get("metadata") is not None:
                sname = s.get("name")
                m = re.match(r'^(\d{13})_', sname)
                ts = int(m.group(1)) if m else 0
                f_list.append({
                    "full_path": f"{fname}/{sname}",
                    "file_name": sname,
                    "clean_title": re.sub(r'^\d+_', '', sname),
                    "ts": ts,
                    "size": s.get("metadata", {}).get("size") or 245760
                })
        # sort files in folder by timestamp
        f_list.sort(key=lambda x: x["ts"])
        min_ts = min([f["ts"] for f in f_list if f["ts"] > 0], default=0)
        storage_folders[fname] = {
            "files": f_list,
            "min_ts": min_ts
        }

print(f"Loaded {len(storage_folders)} folders from storage")

# 3. Read CSV
csv_path = r"c:\Users\Acer P16\Downloads\patient_files_2026-08-09 (2).csv"
if not os.path.exists(csv_path):
    csv_path = r"c:\Users\Acer P16\Desktop\patient_files_2026-08-09 (2).csv"

with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.reader(f)
    csv_rows = list(reader)[1:]

# Group CSV rows by patient
csv_patients = []
seen = set()
for r in csv_rows:
    if len(r) < 5: continue
    pid = str(r[0]).strip()
    pname = str(r[2]).strip()
    key = (pid, pname)
    if key not in seen:
        seen.add(key)
        csv_patients.append({"pid": pid, "pname": pname, "csv_files": []})
    for p in csv_patients:
        if p["pid"] == pid and p["pname"] == pname:
            p["csv_files"].append({
                "title": str(r[3]).strip(),
                "filename": str(r[4]).strip(),
                "type": str(r[5]).strip() if len(r)>5 else "application/pdf",
                "size_kb": str(r[6]).strip() if len(r)>6 else "240",
                "upload_date": str(r[7]).strip() if len(r)>7 else "2026-08-09"
            })
            break

print(f"Loaded {len(csv_patients)} distinct patients from CSV")

# 4. Perform precise matching folder -> patient
folder_to_patient = {} # folder_uuid -> patient_obj

# Step A: Match explicit filenames
for p in csv_patients:
    pid = p["pid"]
    pname = p["pname"]
    pobj = patient_by_pid.get(pid) or patient_by_name.get(pname.lower().strip())
    if not pobj: continue

    matched_folder = None
    for fname, fdata in storage_folders.items():
        if fname in folder_to_patient: continue
        for fo in fdata["files"]:
            fn = fo["file_name"].lower()
            if pid in fn or pname.lower().replace(" ","_") in fn:
                matched_folder = fname
                break
        if matched_folder: break
    if matched_folder:
        folder_to_patient[matched_folder] = pobj
        print(f"[EXPLICIT MATCH] Folder '{matched_folder}' -> Patient '{pobj['full_name']}' (PN: {pobj['patient_number']})")

# Step B: Match chronological sequence for remaining folders
unmatched_folders = [f for f in sorted(storage_folders.keys(), key=lambda k: storage_folders[k]["min_ts"]) if f not in folder_to_patient]
unmatched_csv_patients = [p for p in csv_patients if (patient_by_pid.get(p["pid"]) or patient_by_name.get(p["pname"].lower().strip())) not in folder_to_patient.values()]

print(f"\nUnmatched folders: {len(unmatched_folders)}, Unmatched CSV patients: {len(unmatched_csv_patients)}")

for f_name, p_info in zip(unmatched_folders, unmatched_csv_patients):
    pobj = patient_by_pid.get(p_info["pid"]) or patient_by_name.get(p_info["pname"].lower().strip())
    if pobj:
        folder_to_patient[f_name] = pobj
        print(f"[SEQUENCE MATCH] Folder '{f_name}' -> Patient '{pobj['full_name']}' (PN: {pobj['patient_number']})")

print(f"\nTotal folders mapped to patients: {len(folder_to_patient)} / {len(storage_folders)}")

# 5. Build database records to insert
db_records = []
for folder_name, pobj in folder_to_patient.items():
    f_list = storage_folders[folder_name]["files"]
    for fo in f_list:
        clean_title = fo["clean_title"].replace("_", " ")
        # Format title cleanly (e.g., "Patient Information Sheet.pdf" -> "Patient Information Sheet")
        display_title = re.sub(r'\.pdf$', '', clean_title, flags=re.IGNORECASE)
        file_url = f"{SUPABASE_URL}/storage/v1/object/public/patient-files/{fo['full_path']}"
        
        file_type = "application/pdf"
        if fo["file_name"].lower().endswith(('.jpg','.jpeg','.png')):
            file_type = "image/jpeg"
            
        db_records.append({
            "branch_id": BRANCH_ID,
            "patient_id": pobj["id"],
            "title": display_title,
            "file_name": fo["file_name"],
            "file_type": file_type,
            "file_url": file_url,
            "file_size": fo["size"] or 245760,
            "upload_date": "2026-08-09",
            "created_at": "2026-08-09T00:00:00Z"
        })

print(f"\nTotal DB records to insert: {len(db_records)}")

# 6. Truncate patient_files table & re-insert cleanly
print("\nTruncating patient_files table in Supabase...")
del_req = urllib.request.Request(SUPABASE_URL + "/rest/v1/patient_files?id=not.is.null",
                                 headers={"apikey": KEY, "Authorization": "Bearer "+KEY, "Prefer": "return=minimal"},
                                 method="DELETE")
try:
    with urllib.request.urlopen(del_req, timeout=15) as r:
        print("  Truncate response status:", r.status)
except Exception as ex:
    print("  Truncate error:", ex)

# Batch insert clean records
print(f"Inserting {len(db_records)} records into patient_files table...")
payload = json.dumps(db_records).encode("utf-8")
ins_req = urllib.request.Request(SUPABASE_URL + "/rest/v1/patient_files", data=payload, headers=H, method="POST")
try:
    with urllib.request.urlopen(ins_req, timeout=15) as r:
        print("  INSERT SUCCESS! Status:", r.status)
except urllib.error.HTTPError as e:
    print("  INSERT HTTP Error:", e.code, e.read().decode()[:300])

# Verify count
req_cnt = urllib.request.Request(SUPABASE_URL+"/rest/v1/patient_files?select=id",
    headers={"apikey":KEY,"Authorization":"Bearer "+KEY,"Prefer":"count=exact","Range-Unit":"items","Range":"0-0"})
with urllib.request.urlopen(req_cnt, timeout=15) as r_cnt:
    total_pf = r_cnt.getheader("Content-Range","0/?").split("/")[-1]
print(f"\nFINAL TOTAL RECORDS IN PATIENT_FILES TABLE: {total_pf}")
