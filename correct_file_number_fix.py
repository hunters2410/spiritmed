# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, time, re

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
SQL_FILE = r"database 3\fix_patients_update.sql"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

def do_patch(pn, fn):
    payload = json.dumps({"file_number": fn}).encode()
    url = SUPABASE_URL + "/rest/v1/patients?patient_number=eq." + urllib.parse.quote(pn) + "&status=not.in.(inactive,old_patient,old)"
    req = urllib.request.Request(url, data=payload, headers=HEADERS, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, ""
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")[:80]
    except Exception as e:
        return 0, str(e)

def parse_line(line):
    line = line.strip()
    if not line.startswith("UPDATE patients SET"):
        return None
    pn_match = re.search(r"WHERE patient_number='([^']*)'", line)
    if not pn_match:
        return None
    pn = pn_match.group(1)
    fn_match = re.search(r"file_number='([^']*)'", line)
    fn = fn_match.group(1).replace("''", "'") if fn_match else None
    if "file_number=NULL" in line:
        fn = None
    return pn, fn

print("Reading fix_patients_update.sql ...")
with open(SQL_FILE, encoding="utf-8") as f:
    all_lines = f.readlines()

update_lines = [l.strip() for l in all_lines if l.strip().startswith("UPDATE patients SET")]
print("Found " + str(len(update_lines)) + " UPDATE statements.")
print()
print("Rules:")
print("  SKIP patients status inactive/old_patient/old (file stays NULL = in pool)")
print("  SKIP patients where file_number is NULL in source")
print("  UPDATE file_number ONLY for active/discharged/deceased patients")
print("  NEVER touch email or national_id")
print()

ok_count  = 0
skip_null = 0
skip_info = 0
err_count = 0
errors    = []

for i, line in enumerate(update_lines):
    parsed = parse_line(line)
    if not parsed:
        skip_info += 1
        continue
    pn, fn = parsed

    if fn is None:
        skip_null += 1
        continue

    status, body = do_patch(pn, fn)
    if status in (200, 204):
        ok_count += 1
    else:
        err_count += 1
        errors.append("PN=" + pn + " FN=" + str(fn) + " => HTTP " + str(status) + ": " + body)

    if (i + 1) % 100 == 0:
        pct = (i + 1) / len(update_lines) * 100
        print("  Progress: " + str(i+1) + "/" + str(len(update_lines)) + " (" + f"{pct:.1f}" + "%)  Restored=" + str(ok_count) + "  SkippedNull=" + str(skip_null) + "  Err=" + str(err_count), flush=True)

    if (i + 1) % 50 == 0:
        time.sleep(0.15)

print()
print("=" * 55)
print("DONE!")
print("  File numbers restored (active/discharged/deceased): " + str(ok_count))
print("  Skipped (NULL file_number in source)              : " + str(skip_null))
print("  Skipped (parse errors)                            : " + str(skip_info))
print("  Errors (no match or HTTP error)                   : " + str(err_count))
print("=" * 55)
print()
print("Old Patient (inactive) patients were NOT touched.")
print("Their file_number remains NULL = released to pool.")

if errors:
    print("\nFirst errors:")
    for e in errors[:5]:
        print("  " + e)