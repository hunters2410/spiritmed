# -*- coding: utf-8 -*-
import urllib.request, json, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"
H = {"apikey": SERVICE_ROLE_KEY, "Authorization": "Bearer " + SERVICE_ROLE_KEY}

# Parse dump patient_ids
with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    dump_content = f.read()
dump_ids = set(re.findall(r"'(\d{3,7})',\s*'\d{2}/\d{2}/\d{2}'", dump_content))
print(f"Dump patient_ids: {len(dump_ids)}")

# Load all Supabase patients
all_pats = []
for offset in range(0, 15000, 1000):
    url = SUPABASE_URL + f"/rest/v1/patients?select=id,patient_number,full_name,status&limit=1000&offset={offset}"
    req = urllib.request.Request(url, headers=H)
    with urllib.request.urlopen(req, timeout=30) as r:
        batch = json.loads(r.read())
    if not batch: break
    all_pats.extend(batch)
    if len(batch) < 1000: break

print(f"Supabase total: {len(all_pats)}")

# Identify LEG and unmatched
leg_pats    = [p for p in all_pats if str(p["patient_number"]).startswith("LEG-")]
unmatched   = [p for p in all_pats if not str(p["patient_number"]).startswith("LEG-") 
               and str(p["patient_number"]) not in dump_ids]
matched     = [p for p in all_pats if not str(p["patient_number"]).startswith("LEG-") 
               and str(p["patient_number"]) in dump_ids]

print(f"Matched:   {len(matched)}")
print(f"LEG:       {len(leg_pats)}")
print(f"Unmatched: {len(unmatched)}")

# Check how many unmatched have bills or consultations
unmatched_ids = [p["id"] for p in unmatched]
print(f"\nChecking {len(unmatched_ids)} unmatched patients for linked data...")

has_bills = 0
has_consults = 0
has_appts = 0
empty = 0

for uid in unmatched_ids:
    b_url = SUPABASE_URL + f"/rest/v1/bills?patient_id=eq.{uid}&select=id&limit=1"
    c_url = SUPABASE_URL + f"/rest/v1/consultations?patient_id=eq.{uid}&select=id&limit=1"
    a_url = SUPABASE_URL + f"/rest/v1/appointments?patient_id=eq.{uid}&select=id&limit=1"
    
    b = json.loads(urllib.request.urlopen(urllib.request.Request(b_url, headers=H), timeout=10).read())
    c = json.loads(urllib.request.urlopen(urllib.request.Request(c_url, headers=H), timeout=10).read())
    a = json.loads(urllib.request.urlopen(urllib.request.Request(a_url, headers=H), timeout=10).read())
    
    has_b = len(b) > 0
    has_c = len(c) > 0
    has_a = len(a) > 0
    
    if has_b: has_bills += 1
    if has_c: has_consults += 1
    if has_a: has_appts += 1
    if not (has_b or has_c or has_a): empty += 1

print(f"  Have bills:          {has_bills}")
print(f"  Have consultations:  {has_consults}")
print(f"  Have appointments:   {has_appts}")
print(f"  Completely empty:    {empty}")
print(f"  Safe to delete:      {empty}")
print(f"  Must keep:           {len(unmatched_ids) - empty}")