# -*- coding: utf-8 -*-
import urllib.request, urllib.parse, json, time

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
}

url = SUPABASE_URL + "/rest/v1/patients?select=id,patient_number,full_name,status,file_number&status=in.(inactive,old_patient,old)&file_number=not.is.null&limit=1000"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req, timeout=30) as r:
    bad_patients = json.loads(r.read())

print("Inactive/Old patients with file_number wrongly set: " + str(len(bad_patients)))
for p in bad_patients[:10]:
    print("  " + str(p["full_name"]) + "  PN=" + str(p["patient_number"]) + "  FN=" + str(p["file_number"]) + "  ST=" + str(p["status"]))

if bad_patients:
    print("\nFixing " + str(len(bad_patients)) + " patients: setting file_number = NULL ...")
    PATCH_HEADERS = dict(HEADERS)
    PATCH_HEADERS["Prefer"] = "return=minimal"
    fixed = 0
    for p in bad_patients:
        payload = json.dumps({"file_number": None}).encode()
        url2 = SUPABASE_URL + "/rest/v1/patients?id=eq." + p["id"]
        req2 = urllib.request.Request(url2, data=payload, headers=PATCH_HEADERS, method="PATCH")
        try:
            with urllib.request.urlopen(req2, timeout=15) as r2:
                fixed += 1
        except Exception as ex:
            print("  ERR " + str(p["patient_number"]) + ": " + str(ex))
        if fixed % 50 == 0 and fixed > 0:
            print("  Fixed " + str(fixed) + "/" + str(len(bad_patients)) + "...", flush=True)
            time.sleep(0.1)
    print("\nDone! Cleared file_number for " + str(fixed) + " inactive/old patients.")
    print("Their file numbers are now released to the pool.")
else:
    print("All good - no inactive patients have wrongly-set file numbers!")