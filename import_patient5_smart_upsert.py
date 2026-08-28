"""
import_patient5_smart_upsert.py
================================
1. Fetches all existing patients from Supabase (id, patient_number, file_number, full_name, phone)
2. Builds fast lookup indexes in memory:
   - by patient_number
   - by file_number
   - by normalized full_name
3. Parses patient (5).sql (all 8,171 unique patients)
4. For each patient in patient (5).sql:
   - Finds matching existing patient in Supabase (by patient_number -> file_number -> name)
   - If match found: reuses existing Supabase `id` (so PostgREST upserts on `id`)
   - If no match found: generates a new UUID for insertion
5. Sends batched upserts using `?on_conflict=id`
"""

import requests
import re
import uuid
import sys
from datetime import datetime
from collections import defaultdict

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

SQL_FILE  = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step28_patient5_upsert.sql"
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
BATCH_SIZE = 200

# ── 1. Load all existing Supabase patients into memory ───────────────────────

def load_supabase_patients():
    print("Fetching all existing patients from Supabase...")
    all_patients = []
    from_idx = 0
    page_size = 1000

    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name,email",
            headers={**HEADERS, "Range": f"{from_idx}-{from_idx+page_size-1}"},
            timeout=30
        )
        if r.status_code not in (200, 206) or not r.json():
            break
        rows = r.json()
        all_patients.extend(rows)
        if len(rows) < page_size:
            break
        from_idx += page_size

    print(f"Loaded {len(all_patients)} existing patients from Supabase.")

    by_pn   = {}
    by_fn   = {}
    by_name = {}
    by_id   = {}

    for p in all_patients:
        pid  = p['id']
        pn   = str(p.get('patient_number') or '').strip()
        fn   = str(p.get('file_number') or '').strip()
        name = str(p.get('full_name') or '').strip().lower()

        by_id[pid] = p
        if pn:
            by_pn[pn] = pid
        if fn and fn not in ('0', 'None', 'null'):
            by_fn[fn] = pid
        if name:
            by_name[name] = pid

    return by_pn, by_fn, by_name, by_id

# ── 2. Parse SQL file rows ───────────────────────────────────────────────────

def unquote_sql(v):
    if v is None: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        return v[1:-1].replace("''", "'")
    return v

def split_sql_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            current += c
            if i + 1 < len(row_str):
                current += row_str[i+1]; i += 2
            else:
                i += 1
            continue
        elif c == "'" and not in_q:
            in_q = True; current += c
        elif c == "'" and in_q:
            if i + 1 < len(row_str) and row_str[i+1] == "'":
                current += "''"; i += 2; continue
            in_q = False; current += c
        elif c == ',' and not in_q:
            values.append(current.strip()); current = ''
        else:
            current += c
        i += 1
    if current.strip():
        values.append(current.strip())
    return values

def extract_tuples(block):
    tuples = []
    depth, start = 0, None
    for i, ch in enumerate(block):
        if ch == '(':
            if depth == 0: start = i + 1
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0 and start is not None:
                tuples.append(block[start:i])
                start = None
    return tuples

def parse_patient_row(row_str):
    cols = [unquote_sql(v) for v in split_sql_values(row_str)]
    while len(cols) < 22: cols.append(None)

    pn = cols[8]
    if not pn or not str(pn).strip():
        return None

    return {
        "title":                    cols[0],
        "full_name":                cols[1],
        "gender":                   cols[2],
        "date_of_birth":            cols[3],
        "phone":                    cols[4],
        "email":                    cols[5],
        "address":                  cols[6],
        "file_number":              cols[7],
        "patient_number":           cols[8],
        "payment_method":           cols[9],
        "medical_aid_id":           cols[10],
        "medical_aid_number":       cols[11],
        "medical_aid_main_member":  cols[12],
        "allergies":                cols[13],
        "chronic_conditions":       cols[14],
        "status":                   cols[15],
        "next_of_kin_name":         cols[16],
        "next_of_kin_phone":        cols[17],
        "next_of_kin_relationship": cols[18],
        "occupation":               cols[19],
        "branch_id":                BRANCH_ID,
    }

# ── 3. Main execution ────────────────────────────────────────────────────────

def main():
    by_pn, by_fn, by_name, by_id = load_supabase_patients()

    print("\nReading SQL file...")
    with open(SQL_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Upsert Medical Aids
    print("\n=== Step 1: Upserting Medical Aids ===")
    ma_section = re.search(
        r'INSERT INTO public\.medical_aids.*?VALUES\s*(.*?)\nON CONFLICT',
        content, re.DOTALL | re.IGNORECASE
    )
    if ma_section:
        ma_tuples = extract_tuples(ma_section.group(1))
        ma_rows = []
        for t in ma_tuples:
            cols = [unquote_sql(v) for v in split_sql_values(t)]
            if len(cols) >= 3:
                ma_rows.append({"id": cols[0], "branch_id": cols[1], "name": cols[2], "is_active": True})
        
        url = f"{SUPABASE_URL}/rest/v1/medical_aids?on_conflict=id"
        h = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
        r = requests.post(url, headers=h, json=ma_rows, timeout=30)
        print(f"  Medical aids status: {r.status_code} ({len(ma_rows)} records)")

    # 2. Match and map patients
    print("\n=== Step 2: Matching Patients to Existing Supabase Records ===")

    patient_insert_pat = re.compile(
        r'INSERT INTO public\.patients\s*\(.*?\)\s*VALUES\s*(.*?)\nON CONFLICT',
        re.DOTALL | re.IGNORECASE
    )

    all_tuples = []
    for m in patient_insert_pat.finditer(content):
        all_tuples.extend(extract_tuples(m.group(1)))

    print(f"Parsed {len(all_tuples)} patient tuples from SQL file.")

    matched_by_pn   = 0
    matched_by_fn   = 0
    matched_by_name = 0
    new_patients    = 0

    assigned_ids = set()
    final_patient_rows = []

    for t in all_tuples:
        p = parse_patient_row(t)
        if not p: continue

        pn   = str(p['patient_number'] or '').strip()
        fn   = str(p['file_number'] or '').strip()
        name = str(p['full_name'] or '').strip().lower()

        target_id = None

        # Priority 1: Match by patient_number
        if pn in by_pn and by_pn[pn] not in assigned_ids:
            target_id = by_pn[pn]
            matched_by_pn += 1
        # Priority 2: Match by file_number
        elif fn and fn in by_fn and by_fn[fn] not in assigned_ids:
            target_id = by_fn[fn]
            matched_by_fn += 1
        # Priority 3: Match by full_name
        elif name and name in by_name and by_name[name] not in assigned_ids:
            target_id = by_name[name]
            matched_by_name += 1
        else:
            # Deterministic UUID for new patients
            target_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{pn}"))
            new_patients += 1

        assigned_ids.add(target_id)
        p['id'] = target_id
        final_patient_rows.append(p)

    print(f"\nMatching summary:")
    print(f"  Matched by patient_number : {matched_by_pn}")
    print(f"  Matched by file_number    : {matched_by_fn}")
    print(f"  Matched by full_name      : {matched_by_name}")
    print(f"  New patients to create    : {new_patients}")
    print(f"  Total mapped              : {len(final_patient_rows)}")

    # 3. Send batched upserts on Primary Key `id`
    print("\n=== Step 3: Upserting Patients by Primary Key (id) ===")

    url = f"{SUPABASE_URL}/rest/v1/patients?on_conflict=id"
    h = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}

    total_ok  = 0
    total_err = 0
    total_batches = (len(final_patient_rows) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(final_patient_rows), BATCH_SIZE):
        batch     = final_patient_rows[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        pct       = (min(i + BATCH_SIZE, len(final_patient_rows)) / len(final_patient_rows)) * 100

        r = requests.post(url, headers=h, json=batch, timeout=60)

        if r.status_code in (200, 201):
            total_ok += len(batch)
            print(f"  Batch {batch_num:>2}/{total_batches} OK ({total_ok}/{len(final_patient_rows)} = {pct:.0f}%)", end='\r', flush=True)
        else:
            print(f"\n  Batch {batch_num:>2}/{total_batches} RETRY ({r.status_code}): {r.text[:150]}")
            # Try row by row
            for single in batch:
                r2 = requests.post(url, headers=h, json=[single], timeout=30)
                if r2.status_code in (200, 201):
                    total_ok += 1
                else:
                    total_err += 1
                    print(f"    FAIL: id={single['id']} pn={single['patient_number']} name={single['full_name']} - {r2.text[:120]}")

    print()
    print(f"\n=== Upsert Complete ===")
    print(f"  Successfully processed : {total_ok}")
    print(f"  Errors                 : {total_err}")

    # Fetch final count
    r_count = requests.get(
        f"{SUPABASE_URL}/rest/v1/patients?select=count",
        headers={**HEADERS, "Prefer": "count=exact"},
        timeout=15
    )
    print(f"Final patient count in Supabase: {r_count.headers.get('content-range', 'unknown')}")

if __name__ == '__main__':
    main()
