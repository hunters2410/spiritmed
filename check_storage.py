import os, glob, urllib.request, json

# 1. Search for any excel or csv files with "patient_files" in Downloads or workspace
user_home = os.path.expanduser("~")
search_paths = [
    r"c:\Users\Acer P16\Downloads\*",
    r"c:\Users\Acer P16\Desktop\*",
    r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\*"
]

found_files = []
for path_pattern in search_paths:
    for f in glob.glob(path_pattern):
        if "patient_files" in os.path.basename(f).lower():
            found_files.append(f)

print("Found files on disk:")
for f in found_files:
    print(" ", f)

# 2. Query Supabase Storage bucket 'patient-files' directly
SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

url = f"{SUPABASE_URL}/storage/v1/object/list/patient-files"
req = urllib.request.Request(url, data=json.dumps({"limit": 1000, "offset": 0, "sortBy": {"column": "name", "order": "asc"}}).encode(),
                            headers={"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json"})

try:
    with urllib.request.urlopen(req, timeout=15) as r:
        storage_objects = json.loads(r.read())
        print(f"\nTotal objects found in Supabase Storage bucket 'patient-files': {len(storage_objects)}")
        if storage_objects:
            print("First 10 objects in bucket:")
            for obj in storage_objects[:10]:
                print(" ", obj.get("name"), obj.get("metadata"))
except Exception as e:
    print("Storage API error:", e)
