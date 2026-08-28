import csv, os, sys, io, urllib.request, json, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

# 1. Fetch storage contents
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
storage_folders = {} # folder_name -> list of physical file objects [{name, path, clean_title}]

for item in root_items:
    if not isinstance(item, dict): continue
    fname = item.get("name")
    if item.get("metadata") is None: # folder
        sub = list_objects(fname + "/")
        files_info = []
        for s in sub:
            if isinstance(s, dict) and s.get("metadata") is not None:
                files_info.append({
                    "full_path": f"{fname}/{s.get('name')}",
                    "file_name": s.get("name"),
                    "created_at": s.get("created_at") or s.get("metadata", {}).get("lastModified")
                })
        storage_folders[fname] = files_info

print(f"Total subfolders in storage: {len(storage_folders)}")
total_physical_files = sum(len(v) for v in storage_folders.values())
print(f"Total physical files in storage subfolders: {total_physical_files}")

# Read CSV
csv_path = r"c:\Users\Acer P16\Downloads\patient_files_2026-08-09 (2).csv"
if not os.path.exists(csv_path):
    csv_path = r"c:\Users\Acer P16\Desktop\patient_files_2026-08-09 (2).csv"

with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.reader(f)
    csv_rows = list(reader)[1:]

# Group CSV rows by (Patient ID, Patient Name)
patients_csv = {} # (pid, pname) -> list of csv_row_dicts
for r in csv_rows:
    if len(r) < 5: continue
    pid = str(r[0]).strip()
    pname = str(r[2]).strip()
    key = (pid, pname)
    if key not in patients_csv: patients_csv[key] = []
    patients_csv[key].append({
        "title": str(r[3]).strip(),
        "filename": str(r[4]).strip(),
        "filetype": str(r[5]).strip() if len(r) > 5 else "application/pdf",
        "size_kb": str(r[6]).strip() if len(r) > 6 else "240",
        "upload_date": str(r[7]).strip() if len(r) > 7 else "2026-08-09"
    })

print(f"\nTotal distinct patients in CSV: {len(patients_csv)}")

# Try to match each (pid, pname) in CSV to one storage_folder!
folder_to_patient = {}
used_folders = set()

# Strategy 1: Explicit filename match inside folder
for key, csv_files in patients_csv.items():
    pid, pname = key
    matched_folder = None
    
    for fname, f_list in storage_folders.items():
        if fname in used_folders: continue
        # Check if any file in f_list has pid or pname
        for fo in f_list:
            fn_lower = fo["file_name"].lower()
            if pid in fn_lower or pname.lower().replace(" ","_") in fn_lower or pname.lower() in fn_lower:
                matched_folder = fname
                break
        if matched_folder: break
    
    if matched_folder:
        folder_to_patient[key] = matched_folder
        used_folders.add(matched_folder)
        print(f"MATCH (EXPLICIT): PID {pid} '{pname}' -> Folder {matched_folder} ({len(storage_folders[matched_folder])} files)")

# Strategy 2: Match by exact list of file titles and count
for key, csv_files in patients_csv.items():
    if key in folder_to_patient: continue
    pid, pname = key
    csv_titles = sorted([c["title"].lower().replace(".pdf","").strip() for c in csv_files])
    
    best_folder = None
    for fname, f_list in storage_folders.items():
        if fname in used_folders: continue
        folder_titles = sorted([re.sub(r'^\d+_', '', fo["file_name"]).lower().replace(".pdf","").strip() for fo in f_list])
        
        # Check if list of titles matches or overlaps significantly
        matches = 0
        for ct in csv_titles:
            for ft in folder_titles:
                if ct in ft or ft in ct:
                    matches += 1
                    break
        if len(csv_titles) == len(folder_titles) and matches == len(csv_titles):
            best_folder = fname
            break

    if best_folder:
        folder_to_patient[key] = best_folder
        used_folders.add(best_folder)
        print(f"MATCH (TITLES): PID {pid} '{pname}' -> Folder {best_folder} ({len(storage_folders[best_folder])} files)")
    else:
        print(f"UNMATCHED IN CSV: PID {pid} '{pname}' (Files in CSV: {[c['title'] for c in csv_files]})")

print(f"\nTotal patients matched to storage folders: {len(folder_to_patient)} / {len(patients_csv)}")
