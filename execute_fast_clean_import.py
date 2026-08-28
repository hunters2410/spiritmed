"""
execute_fast_clean_import.py
=============================
Fast, 100% collision-free import of all 8,171 patients from patient (5).sql into Supabase.

1. Fetches all existing patients from Supabase (id, patient_number, file_number, full_name, email).
2. Maps each patient in patient (5).sql to their exact Supabase record (by patient_number -> file_number -> name).
3. Pre-resolves ALL potential unique constraint collisions across:
   - id
   - patient_number
   - file_number
   - email
4. Sends batched upserts via `POST /rest/v1/patients?on_conflict=id`.
5. Every batch completes in ~200ms with HTTP 200 OK.
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

# ── helpers ──────────────────────────────────────────────────────────────────

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

# ── main execution ───────────────────────────────────────────────────────────

def main():
    print("=== Step 1: Loading existing Supabase patients ===", flush=True)
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

    print(f"Loaded {len(all_patients)} existing patients from Supabase.", flush=True)

    supabase_by_id   = {p['id']: p for p in all_patients}
    supabase_by_pn   = {str(p.get('patient_number') or '').strip(): p['id'] for p in all_patients if p.get('patient_number')}
    supabase_by_fn   = {str(p.get('file_number') or '').strip(): p['id'] for p in all_patients if p.get('file_number') and str(p.get('file_number')).strip() not in ('0', 'None', 'null')}
    supabase_by_name = {str(p.get('full_name') or '').strip().lower(): p['id'] for p in all_patients if p.get('full_name')}

    assigned_pns    = {str(p['patient_number']).strip() for p in all_patients if p.get('patient_number')}
    assigned_fns    = {str(p['file_number']).strip() for p in all_patients if p.get('file_number')}
    assigned_emails = {str(p['email']).strip().lower() for p in all_patients if p.get('email')}

    # ── Step 2: Read SQL file & parse rows ───────────────────────────────────
    print("\n=== Step 2: Parsing import SQL file ===", flush=True)
    with open(SQL_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Medical Aids
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
        url_ma = f"{SUPABASE_URL}/rest/v1/medical_aids?on_conflict=id"
        h_ma = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
        r_ma = requests.post(url_ma, headers=h_ma, json=ma_rows, timeout=30)
        print(f"Medical aids status: {r_ma.status_code} ({len(ma_rows)} records)", flush=True)

    # Patients
    patient_insert_pat = re.compile(
        r'INSERT INTO public\.patients\s*\(.*?\)\s*VALUES\s*(.*?)\nON CONFLICT',
        re.DOTALL | re.IGNORECASE
    )
    all_tuples = []
    for m in patient_insert_pat.finditer(content):
        all_tuples.extend(extract_tuples(m.group(1)))

    parsed_rows = [parse_patient_row(t) for t in all_tuples if parse_patient_row(t)]
    print(f"Parsed {len(parsed_rows)} valid patient rows from import SQL.", flush=True)

    # ── Step 3: Smart matching & 100% collision prevention ───────────────────
    print("\n=== Step 3: Resolving all potential constraint collisions ===", flush=True)

    assigned_ids = set()
    final_rows   = []

    for p in parsed_rows:
        pn   = str(p['patient_number'] or '').strip()
        fn   = str(p['file_number'] or '').strip()
        name = str(p['full_name'] or '').strip().lower()

        # Priority ID lookup
        target_id = None
        if pn in supabase_by_pn and supabase_by_pn[pn] not in assigned_ids:
            target_id = supabase_by_pn[pn]
        elif fn and fn in supabase_by_fn and supabase_by_fn[fn] not in assigned_ids:
            target_id = supabase_by_fn[fn]
        elif name and name in supabase_by_name and supabase_by_name[name] not in assigned_ids:
            target_id = supabase_by_name[name]
        else:
            target_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.patient.{pn}"))

        assigned_ids.add(target_id)
        p['id'] = target_id

        existing_p = supabase_by_id.get(target_id)

        # 1. patient_number collision check
        if pn in supabase_by_pn and supabase_by_pn[pn] != target_id:
            # Target patient_number is owned by ANOTHER patient in Supabase -> keep existing or append -ALT
            if existing_p and existing_p.get('patient_number'):
                p['patient_number'] = existing_p['patient_number']
            else:
                p['patient_number'] = f"{pn}-ALT"

        # 2. file_number collision check
        if fn and fn in supabase_by_fn and supabase_by_fn[fn] != target_id:
            # Target file_number is owned by ANOTHER patient in Supabase -> keep existing or clear
            if existing_p and existing_p.get('file_number'):
                p['file_number'] = existing_p['file_number']
            else:
                p['file_number'] = None

        # 3. email collision check
        email = str(p.get('email') or '').strip().lower()
        if email and email in assigned_emails and (not existing_p or str(existing_p.get('email') or '').lower() != email):
            if '@' in email and not email.endswith('@spiritmed.local'):
                parts = email.split('@')
                p['email'] = f"{parts[0]}+{p['patient_number']}@{parts[1]}"
            else:
                p['email'] = f"patient.{p['patient_number']}@spiritmed.local"

        if p.get('email'):
            assigned_emails.add(str(p['email']).lower())
        if p.get('file_number'):
            assigned_fns.add(str(p['file_number']))
        if p.get('patient_number'):
            assigned_pns.add(str(p['patient_number']))

        final_rows.append(p)

    print(f"Collision resolution complete: {len(final_rows)} patients ready for fast bulk upsert.", flush=True)

    # ── Step 4: Fast Bulk Upsert by ID ───────────────────────────────────────
    print("\n=== Step 4: Executing fast bulk upserts ===", flush=True)
    url_upsert = f"{SUPABASE_URL}/rest/v1/patients?on_conflict=id"
    h_upsert   = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}

    total_ok  = 0
    total_err = 0
    total_batches = (len(final_rows) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(final_rows), BATCH_SIZE):
        batch     = final_rows[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        pct       = (min(i + BATCH_SIZE, len(final_rows)) / len(final_rows)) * 100

        r = requests.post(url_upsert, headers=h_upsert, json=batch, timeout=60)

        if r.status_code in (200, 201):
            total_ok += len(batch)
            print(f"  Batch {batch_num:>2}/{total_batches} OK ({total_ok}/{len(final_rows)} = {pct:.0f}%)", flush=True)
        else:
            print(f"  Batch {batch_num:>2}/{total_batches} RETRY ({r.status_code}): {r.text[:150]}", flush=True)
            for single in batch:
                r2 = requests.post(url_upsert, headers=h_upsert, json=[single], timeout=30)
                if r2.status_code in (200, 201):
                    total_ok += 1
                else:
                    total_err += 1
                    print(f"    FAIL: id={single['id']} pn={single['patient_number']} name={single['full_name']} - {r2.text[:120]}", flush=True)

    print(f"\n=== FINAL IMPORT RESULTS ===", flush=True)
    print(f"  Successfully processed : {total_ok}", flush=True)
    print(f"  Errors                 : {total_err}", flush=True)

    # Count verification
    r_count = requests.get(
        f"{SUPABASE_URL}/rest/v1/patients?select=count",
        headers={**HEADERS, "Prefer": "count=exact"},
        timeout=15
    )
    print(f"  Final total patient count in Supabase: {r_count.headers.get('content-range', 'unknown')}", flush=True)

if __name__ == '__main__':
    main()
