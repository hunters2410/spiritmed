# -*- coding: utf-8 -*-
import urllib.request, json, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
HEADERS = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

# Get total + status breakdown from Supabase
url = SUPABASE_URL + "/rest/v1/patients?select=patient_number,status&limit=1000&offset=0"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req, timeout=30) as r:
    sample = json.loads(r.read())

# Get count
url2 = SUPABASE_URL + "/rest/v1/patients?select=patient_number,status"
req2 = urllib.request.Request(url2, headers={**HEADERS, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"})
with urllib.request.urlopen(req2, timeout=30) as r2:
    count_range = r2.getheader("Content-Range", "")
    total = count_range.split("/")[-1] if "/" in count_range else "?"

print("Total patients in Supabase:", total)

# Status breakdown from sample (get all)
all_pats = []
for offset in range(0, 15000, 1000):
    url3 = SUPABASE_URL + f"/rest/v1/patients?select=patient_number,status&limit=1000&offset={offset}"
    req3 = urllib.request.Request(url3, headers=HEADERS)
    with urllib.request.urlopen(req3, timeout=30) as r3:
        batch = json.loads(r3.read())
    if not batch: break
    all_pats.extend(batch)
    if len(batch) < 1000: break

from collections import Counter
statuses = Counter(p["status"] for p in all_pats)
print("Status breakdown:", dict(statuses))

# How many have LEG- prefix
leg = sum(1 for p in all_pats if p["patient_number"] and str(p["patient_number"]).startswith("LEG-"))
numeric = sum(1 for p in all_pats if p["patient_number"] and not str(p["patient_number"]).startswith("LEG-"))
print(f"Numeric patient_number: {numeric}  |  LEG- patient_number: {leg}")

# Parse dump patient_ids
with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    dump = f.read()
dump_ids = set(re.findall(r"'(\d{4,7})',\s*'\d{2}/\d{2}/\d{2}'", dump))  # patient_id, add_date pattern
print(f"Unique patient_ids in dump: {len(dump_ids)}")

# How many Supabase numeric patient_numbers exist in the dump
supa_ids = set(p["patient_number"] for p in all_pats if p["patient_number"] and not str(p["patient_number"]).startswith("LEG-"))
matched = supa_ids & dump_ids
print(f"Supabase patient_numbers found in dump: {len(matched)} / {len(supa_ids)}")
print(f"Supabase patient_numbers NOT in dump:   {len(supa_ids - dump_ids)}")