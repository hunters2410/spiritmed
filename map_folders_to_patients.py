import urllib.request, json, sys, io, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H = {"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json", "Prefer": "return=minimal"}

def list_folder(prefix=""):
    url = f"{SUPABASE_URL}/storage/v1/object/list/patient-files"
    payload = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return []

# Fetch all patients from Supabase to match by patient_number or full_name
print("Loading patients from Supabase...")
patient_by_number = {}
patient_by_name = {}

for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number,full_name,file_number&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers={"apikey": KEY, "Authorization": "Bearer "+KEY})
    with urllib.request.urlopen(req, timeout=20) as r:
        batch = json.loads(r.read())
    if not batch: break
    for p in batch:
        if p.get("patient_number"):
            patient_by_number[str(p["patient_number"])] = p
        if p.get("full_name"):
            patient_by_name[str(p["full_name"]).lower().strip()] = p
    if len(batch) < 1000: break

print(f"Loaded {len(patient_by_number)} patients")

root_items = list_folder("")
print(f"\nScanning storage bucket subfolders...")

folder_mappings = {} # folder_uuid -> matched_patient_dict

for item in root_items:
    if not isinstance(item, dict): continue
    folder_name = item.get("name")
    metadata = item.get("metadata")
    if metadata is not None: continue # skip root files

    files_in_folder = list_folder(folder_name + "/")
    file_names = [f.get("name") for f in files_in_folder if isinstance(f, dict)]

    # Search for patient number (3-7 digits) or name in file_names
    matched_patient = None
    
    for fn in file_names:
        # Check patient numbers in filename
        pids_in_fn = re.findall(r'(\d{4,7})', fn)
        for pid in pids_in_fn:
            if pid in patient_by_number:
                matched_patient = patient_by_number[pid]
                break
        if matched_patient: break
        
        # Check names in filename
        clean_fn_lower = fn.lower().replace("_", " ")
        for pname, pobj in patient_by_name.items():
            if len(pname) > 4 and pname in clean_fn_lower:
                matched_patient = pobj
                break
        if matched_patient: break

    if matched_patient:
        folder_mappings[folder_name] = {
            "patient": matched_patient,
            "files": file_names
        }
        print(f"Folder '{folder_name}' -> Patient: '{matched_patient['full_name']}' (PN: {matched_patient['patient_number']}, ID: {matched_patient['id']}) [{len(file_names)} files]")
    else:
        print(f"Folder '{folder_name}' -> UNMATCHED! Files: {file_names}")

print(f"\nTotal folders mapped to patients: {len(folder_mappings)} / {len([i for i in root_items if isinstance(i, dict) and i.get('metadata') is None])}")
