# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, re, time
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

def extract_id_from_text(text):
    nums = re.findall(r"[_\-](\d{4,7})[_\-\.]", str(text))
    for n in nums:
        if n.startswith("202") or n.startswith("201") or n.startswith("200"): continue
        return n
    return None

# Step 1: All files joined with patients
print("Loading all patient_files...")
all_files = []
for offset in range(0, 50000, 1000):
    url = (SUPABASE_URL + "/rest/v1/patient_files"
           + "?select=id,patient_id,file_name,title,file_url,"
           + "patients(id,patient_number,full_name,status)"
           + f"&limit=1000&offset={offset}")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    all_files.extend(batch)
    if len(batch) < 1000: break

print(f"Total files: {len(all_files)}")

from collections import defaultdict
patient_files_map = defaultdict(list)
for f in all_files:
    pat = f.get("patients")
    if not pat: continue
    patient_files_map[pat["id"]].append(f)

print(f"Unique patients with files: {len(patient_files_map)}")
print()

needs_fix = []
for uuid, files in patient_files_map.items():
    pat = files[0]["patients"]
    cur_pn = pat["patient_number"]
    name   = pat["full_name"]
    status = pat["status"]

    id_from_file = None
    for f in files:
        fname = f.get("file_name","") or f.get("title","") or ""
        url_  = f.get("file_url","") or ""
        extracted = extract_id_from_text(fname)
        if not extracted:
            url_path = url_.split(uuid)[-1] if uuid in url_ else ""
            extracted = extract_id_from_text(url_path)
        if extracted:
            id_from_file = extracted
            break

    flag = "OK" if not id_from_file or id_from_file == cur_pn else "MISMATCH"
    print(f"  {name:<35} current={cur_pn:<12} file_id={str(id_from_file):<10} {flag}")

    if id_from_file and id_from_file != cur_pn:
        needs_fix.append({"id": uuid, "current_pn": cur_pn, "correct_pn": id_from_file, "name": name})

print()
print(f"Needs fix: {len(needs_fix)}")

if needs_fix:
    # Check conflicts
    all_pns = {}
    for offset in range(0, 15000, 1000):
        url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number&limit=1000&offset={offset}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as r:
            batch = json.loads(r.read())
        if not batch: break
        for p in batch:
            if p.get("patient_number"): all_pns[p["patient_number"]] = p["id"]
        if len(batch) < 1000: break

    PATCH_H = {**HEADERS, "Content-Type": "application/json", "Prefer": "return=minimal"}
    ok=0; err=0
    for fix in needs_fix:
        new_pn = fix["correct_pn"]
        if new_pn in all_pns and all_pns[new_pn] != fix["id"]:
            print(f"  CONFLICT: {fix['name']} -> {new_pn} already taken")
            continue
        payload = json.dumps({"patient_number": new_pn}).encode()
        url = SUPABASE_URL + "/rest/v1/patients?id=eq." + fix["id"]
        req = urllib.request.Request(url, data=payload, headers=PATCH_H, method="PATCH")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                ok += 1
                print(f"  FIXED: {fix['name']} | {fix['current_pn']} -> {new_pn}")
        except Exception as e:
            err += 1
            print(f"  ERROR: {fix['name']}: {e}")
        time.sleep(0.05)

    print()
    print(f"===== DONE: Fixed={ok}  Errors={err} =====")
else:
    print("All patients with files already have correct patient_numbers.")
