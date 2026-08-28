"""
apply_file_number_fix.py
Applies fix_patients_update.sql to Supabase in batches via the REST API.
Each batch of UPDATE statements is sent through the /rest/v1/rpc/exec_sql endpoint.
If that is not available, falls back to individual PATCH calls via the REST API.
"""
import urllib.request
import urllib.parse
import json
import sys
import time
import re

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
SQL_FILE = r"database 3\fix_patients_update.sql"
BATCH_SIZE = 200   # UPDATE statements per request

HEADERS = {
    "apikey":        SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}

def do_request(url, payload_bytes, method="POST"):
    req = urllib.request.Request(url, data=payload_bytes, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:
        return 0, str(e)

def parse_update_line(line):
    """Parse a single UPDATE line into (patient_number, file_number, email)."""
    line = line.strip()
    if not line.startswith("UPDATE patients SET"):
        return None
    # Extract WHERE patient_number='..'
    pn_match = re.search(r"WHERE patient_number='([^']*)'", line)
    if not pn_match:
        return None
    pn = pn_match.group(1)
    # Extract file_number
    fn_match = re.search(r"file_number='([^']*)'", line)
    fn = fn_match.group(1).replace("''", "'") if fn_match else None
    # fn=NULL case
    if "file_number=NULL" in line:
        fn = None
    # Extract email (optional)
    em_match = re.search(r"email='([^']*)'", line)
    em = em_match.group(1).replace("''", "'") if em_match else None
    return pn, fn, em

print("Reading fix_patients_update.sql ...")
with open(SQL_FILE, encoding="utf-8") as f:
    all_lines = f.readlines()

update_lines = [l.strip() for l in all_lines if l.strip().startswith("UPDATE patients SET")]
print(f"Found {len(update_lines)} UPDATE statements to apply.")
print()

# Apply via individual PATCH calls (REST API) in batches with progress
ok_count   = 0
err_count  = 0
skip_count = 0
errors     = []

for i, line in enumerate(update_lines):
    parsed = parse_update_line(line)
    if not parsed:
        skip_count += 1
        continue
    pn, fn, em = parsed

    patch_data = {}
    patch_data["file_number"] = fn   # None becomes null in JSON
    if em:
        patch_data["email"] = em

    payload = json.dumps(patch_data).encode("utf-8")
    url = f"{SUPABASE_URL}/rest/v1/patients?patient_number=eq.{urllib.parse.quote(pn)}"
    status, body = do_request(url, payload, method="PATCH")

    if status in (200, 204):
        ok_count += 1
    else:
        err_count += 1
        errors.append(f"PN={pn} => HTTP {status}: {body[:120]}")

    # Progress every 100
    if (i + 1) % 100 == 0:
        pct = (i + 1) / len(update_lines) * 100
        print(f"  Progress: {i+1}/{len(update_lines)} ({pct:.1f}%)  OK={ok_count}  Err={err_count}", flush=True)

    # Small throttle to avoid rate limits
    if (i + 1) % 50 == 0:
        time.sleep(0.2)

print()
print("=" * 60)
print(f"DONE!")
print(f"  Successful updates : {ok_count}")
print(f"  Errors             : {err_count}")
print(f"  Skipped lines      : {skip_count}")
print("=" * 60)

if errors:
    print(f"\nFirst {min(10,len(errors))} errors:")
    for e in errors[:10]:
        print(" ", e)

if ok_count > 0:
    print(f"\n? {ok_count} patients have had their file_number and email restored!")
    print("   Refresh the app to see the changes.")
