import urllib.request, json, sys, io, re

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H = {"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json", "Prefer": "return=minimal"}

# 1. Fetch all items in storage bucket recursively
def list_objects(prefix=""):
    url = f"{SUPABASE_URL}/storage/v1/object/list/patient-files"
    payload = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return []

print("Scanning Supabase Storage bucket 'patient-files'...")
all_storage_paths = [] # full path within bucket, e.g. "folder/filename.pdf" or "filename.pdf"

root_items = list_objects("")
for item in root_items:
    if not isinstance(item, dict): continue
    name = item.get("name")
    metadata = item.get("metadata")
    if metadata is not None:
        # File in root
        all_storage_paths.append(name)
    else:
        # Folder
        sub = list_objects(name + "/")
        for s in sub:
            if isinstance(s, dict) and s.get("metadata") is not None:
                all_storage_paths.append(f"{name}/{s.get('name')}")

print(f"Total physical files found in storage bucket: {len(all_storage_paths)}")
for p in all_storage_paths[:10]:
    print(" ", p)

# 2. Fetch all records in patient_files DB table
print("\nFetching records from patient_files DB table...")
url = f"{SUPABASE_URL}/rest/v1/patient_files?select=id,patient_id,file_name,title,file_url"
req = urllib.request.Request(url, headers={"apikey": KEY, "Authorization": "Bearer "+KEY})
with urllib.request.urlopen(req, timeout=15) as r:
    db_files = json.loads(r.read())

print(f"Total patient_files rows in DB: {len(db_files)}")

# 3. Match DB records with actual physical storage paths
updates = 0
for db_f in db_files:
    title = (db_f.get("title") or "").strip()
    file_name = (db_f.get("file_name") or "").strip()

    # Find matching physical path in storage
    matched_path = None
    
    # Clean string for matching
    clean_title = re.sub(r'[^a-zA-Z0-9]', '', title.lower())
    clean_fname = re.sub(r'[^a-zA-Z0-9]', '', file_name.lower())

    for sp in all_storage_paths:
        sp_base = sp.split("/")[-1]
        sp_clean = re.sub(r'[^a-zA-Z0-9]', '', sp_base.lower())
        
        # Check if sp_clean contains clean_title or clean_fname
        if (clean_title and clean_title in sp_clean) or (clean_fname and clean_fname in sp_clean) or (sp_clean in clean_title):
            matched_path = sp
            break

    if matched_path:
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/patient-files/{matched_path}"
        # Update DB row
        patch_payload = json.dumps({"file_url": public_url, "file_name": matched_path.split("/")[-1]}).encode("utf-8")
        patch_req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/patient_files?id=eq.{db_f['id']}",
                                           data=patch_payload, headers=H, method="PATCH")
        try:
            with urllib.request.urlopen(patch_req, timeout=10) as pr:
                updates += 1
        except Exception as ex:
            print(f"Error updating DB record {db_f['id']}:", ex)
    else:
        print(f"  [NO STORAGE MATCH] Title: '{title}', File: '{file_name}'")

print(f"\nSuccessfully matched and updated {updates} / {len(db_files)} file URLs in DB!")
