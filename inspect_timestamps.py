import csv, os, sys, io, urllib.request, json, re
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

# 1. Fetch storage contents with created_at timestamps
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
storage_folders = {} # folder_uuid -> {files: [{name, full_path, ts_prefix, title}], min_ts, max_ts}

for item in root_items:
    if not isinstance(item, dict): continue
    fname = item.get("name")
    if item.get("metadata") is None: # folder
        sub = list_objects(fname + "/")
        files_info = []
        timestamps = []
        for s in sub:
            if isinstance(s, dict) and s.get("metadata") is not None:
                sname = s.get("name")
                # Extract numeric timestamp prefix if present (e.g. 1786193537940)
                m = re.match(r'^(\d{13})_', sname)
                ts = int(m.group(1)) if m else None
                if ts: timestamps.append(ts)
                
                # Extract clean title from filename
                clean_title = re.sub(r'^\d+_', '', sname)
                files_info.append({
                    "full_path": f"{fname}/{sname}",
                    "filename": sname,
                    "clean_title": clean_title,
                    "ts": ts
                })
        
        storage_folders[fname] = {
            "files": files_info,
            "min_ts": min(timestamps) if timestamps else 0,
            "max_ts": max(timestamps) if timestamps else 0
        }

print(f"Parsed {len(storage_folders)} folders in storage")

# Sort storage folders by min_ts
sorted_folders = sorted(storage_folders.items(), key=lambda x: x[1]["min_ts"])

print("\nFolders sorted by earliest upload timestamp:")
for folder_name, f_data in sorted_folders:
    min_ts_str = datetime.fromtimestamp(f_data["min_ts"]/1000.0).strftime("%Y-%m-%d %H:%M:%S") if f_data["min_ts"] else "N/A"
    titles = [f["clean_title"] for f in f_data["files"]]
    print(f"Folder '{folder_name}' | Min Time: {min_ts_str} | Files ({len(titles)}): {titles[:3]}")

# 2. Read CSV rows in order
csv_path = r"c:\Users\Acer P16\Downloads\patient_files_2026-08-09 (2).csv"
if not os.path.exists(csv_path):
    csv_path = r"c:\Users\Acer P16\Desktop\patient_files_2026-08-09 (2).csv"

with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.reader(f)
    csv_rows = list(reader)[1:]

# Group CSV rows by patient while keeping original upload order
ordered_csv_patients = []
seen_keys = set()
for r in csv_rows:
    if len(r) < 5: continue
    pid = str(r[0]).strip()
    pname = str(r[2]).strip()
    key = (pid, pname)
    if key not in seen_keys:
        seen_keys.add(key)
        ordered_csv_patients.append({
            "pid": pid,
            "pname": pname,
            "files": []
        })
    # add file to patient
    for p in ordered_csv_patients:
        if p["pid"] == pid and p["pname"] == pname:
            p["files"].append({
                "title": str(r[3]).strip(),
                "filename": str(r[4]).strip()
            })
            break

print(f"\nCSV Patients in upload order ({len(ordered_csv_patients)} patients):")
for idx, p in enumerate(ordered_csv_patients):
    titles = [f["title"] for f in p["files"]]
    print(f"Patient {idx+1}: PID {p['pid']} '{p['pname']}' | Files ({len(titles)}): {titles[:3]}")
