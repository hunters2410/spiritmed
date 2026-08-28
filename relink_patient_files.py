import csv, os, sys, io, urllib.request, json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H = {"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json", "Prefer": "return=minimal"}
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

# 1. Fetch all patients from Supabase mapping patient_number -> UUID
print("Loading patients from Supabase...")
patient_map = {} # patient_number -> uuid id
name_map = {}    # full_name.lower() -> uuid id

for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number,full_name&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers={"apikey": KEY, "Authorization": "Bearer "+KEY})
    with urllib.request.urlopen(req, timeout=20) as r:
        batch = json.loads(r.read())
    if not batch: break
    for p in batch:
        if p.get("patient_number"):
            patient_map[str(p["patient_number"])] = p["id"]
        if p.get("full_name"):
            name_map[str(p["full_name"]).lower().strip()] = p["id"]
    if len(batch) < 1000: break

print(f"Loaded {len(patient_map)} patient_numbers and {len(name_map)} full_names")

# 2. Read patient_files CSV
csv_path = r"c:\Users\Acer P16\Downloads\patient_files_2026-08-09 (2).csv"
if not os.path.exists(csv_path):
    csv_path = r"c:\Users\Acer P16\Desktop\patient_files_2026-08-09 (2).csv"

print(f"\nReading CSV: {csv_path}")

with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.reader(f)
    rows = list(reader)

header = rows[0]
data_rows = rows[1:]
print(f"Found {len(data_rows)} file records in CSV")

records_to_insert = []
matched_by_pn = 0
matched_by_name = 0
unmatched = 0

for r in data_rows:
    if not r or len(r) < 5: continue
    pid_str = str(r[0]).strip()
    pname_str = str(r[2]).strip()
    title = str(r[3]).strip()
    filename = str(r[4]).strip()
    filetype = str(r[5]).strip() if len(r) > 5 else "application/pdf"
    filesize_str = str(r[6]).strip() if len(r) > 6 else "240"
    upload_date = str(r[7]).strip() if len(r) > 7 else "2026-08-09"

    # Convert filesize to bytes (CSV has KB)
    try:
        filesize_bytes = int(float(filesize_str) * 1024)
    except:
        filesize_bytes = 245760

    # Match patient UUID
    patient_uuid = patient_map.get(pid_str)
    if patient_uuid:
        matched_by_pn += 1
    else:
        # Fallback to name match
        patient_uuid = name_map.get(pname_str.lower().strip())
        if patient_uuid:
            matched_by_name += 1
        else:
            unmatched += 1
            print(f"  [UNMATCHED] PID: {pid_str}, Name: {pname_str}, File: {filename}")
            continue

    # File URL construction
    file_url = f"{SUPABASE_URL}/storage/v1/object/public/patient-files/{filename}"

    records_to_insert.append({
        "branch_id": BRANCH_ID,
        "patient_id": patient_uuid,
        "title": title,
        "file_name": filename,
        "file_type": filetype,
        "file_url": file_url,
        "file_size": filesize_bytes,
        "upload_date": upload_date,
        "created_at": "2026-08-09T00:00:00Z"
    })

print(f"\nMatching Summary:")
print(f"  Matched by Patient Number: {matched_by_pn}")
print(f"  Matched by Patient Name:   {matched_by_name}")
print(f"  Unmatched:                 {unmatched}")
print(f"  Total Ready to Insert:     {len(records_to_insert)}")

# 3. Insert into patient_files table in Supabase
if records_to_insert:
    print(f"\nInserting {len(records_to_insert)} file records into patient_files table...")
    payload = json.dumps(records_to_insert).encode("utf-8")
    req = urllib.request.Request(SUPABASE_URL + "/rest/v1/patient_files", data=payload, headers=H, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print("  SUCCESS! Status:", r.status)
    except urllib.error.HTTPError as e:
        print("  HTTP Error:", e.code, e.read().decode()[:300])
    except Exception as ex:
        print("  Error:", ex)

# Verify count in patient_files
req_cnt = urllib.request.Request(SUPABASE_URL+"/rest/v1/patient_files?select=id",
    headers={"apikey":KEY,"Authorization":"Bearer "+KEY,"Prefer":"count=exact","Range-Unit":"items","Range":"0-0"})
with urllib.request.urlopen(req_cnt, timeout=15) as r_cnt:
    total_pf = r_cnt.getheader("Content-Range","0/?").split("/")[-1]
print(f"\nTOTAL RECORDS IN PATIENT_FILES TABLE NOW: {total_pf}")
