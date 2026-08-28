"""
run_patient5_import.py  (v2 - fixed upsert via on_conflict query param)
=======================================================================
Uses the correct Supabase REST upsert:
  POST /rest/v1/patients?on_conflict=patient_number
  Prefer: resolution=merge-duplicates
"""

import requests
import re
import sys

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

BASE_HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

SQL_FILE  = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step28_patient5_upsert.sql"
BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
BATCH_SIZE = 150

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
    """
    Columns in the SQL file (22 total):
    title, full_name, gender, date_of_birth, phone, email, address,
    file_number, patient_number, payment_method,
    medical_aid_id, medical_aid_number, medical_aid_main_member,
    allergies, chronic_conditions, status,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
    occupation, branch_id, created_at (skipped)
    """
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

def parse_ma_row(row_str):
    cols = [unquote_sql(v) for v in split_sql_values(row_str)]
    if len(cols) < 4: return None
    return {
        "id":        cols[0],
        "branch_id": cols[1],
        "name":      cols[2],
        "is_active": True,
    }

def upsert(table, rows, on_conflict_col):
    """Proper Supabase upsert using ?on_conflict= query param."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict_col}"
    headers = {
        **BASE_HEADERS,
        "Prefer": "resolution=merge-duplicates,return=minimal"
    }
    return requests.post(url, headers=headers, json=rows, timeout=90)

def insert_only(table, rows):
    """Plain insert — skips rows that already exist (DO NOTHING)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        **BASE_HEADERS,
        "Prefer": "resolution=ignore-duplicates,return=minimal"
    }
    return requests.post(url, headers=headers, json=rows, timeout=90)

# ── main ─────────────────────────────────────────────────────────────────────

def main():
    print("Reading SQL file...")
    with open(SQL_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # ── 1. Medical Aids ───────────────────────────────────────────────────────
    print("\n=== Step 1: Upserting Medical Aids ===")
    ma_section = re.search(
        r'INSERT INTO public\.medical_aids.*?VALUES\s*(.*?)\nON CONFLICT',
        content, re.DOTALL | re.IGNORECASE
    )
    if ma_section:
        ma_tuples = extract_tuples(ma_section.group(1))
        ma_rows = [r for r in (parse_ma_row(t) for t in ma_tuples) if r]
        print(f"Parsed {len(ma_rows)} medical aids")
        resp = upsert("medical_aids", ma_rows, "id")
        if resp.status_code in (200, 201):
            print(f"  OK: {len(ma_rows)} medical aids upserted")
        else:
            print(f"  ERR {resp.status_code}: {resp.text[:300]}")
    else:
        print("  (No medical aids section found)")

    # ── 2. Patients ───────────────────────────────────────────────────────────
    print("\n=== Step 2: Upserting Patients ===")

    patient_insert_pat = re.compile(
        r'INSERT INTO public\.patients\s*\(.*?\)\s*VALUES\s*(.*?)\nON CONFLICT',
        re.DOTALL | re.IGNORECASE
    )

    all_tuples = []
    for m in patient_insert_pat.finditer(content):
        all_tuples.extend(extract_tuples(m.group(1)))

    print(f"Found {len(all_tuples)} patient tuples in SQL file")

    all_rows = []
    for t in all_tuples:
        row = parse_patient_row(t)
        if row:
            all_rows.append(row)

    print(f"Parsed {len(all_rows)} valid patient rows")

    # First pass: upsert (updates existing, inserts new)
    total_ok  = 0
    total_err = 0
    failed    = []
    total_batches = (len(all_rows) + BATCH_SIZE - 1) // BATCH_SIZE

    print(f"Sending {total_batches} batches of up to {BATCH_SIZE} rows...")

    for i in range(0, len(all_rows), BATCH_SIZE):
        batch      = all_rows[i:i + BATCH_SIZE]
        batch_num  = (i // BATCH_SIZE) + 1
        pct        = (min(i + BATCH_SIZE, len(all_rows)) / len(all_rows)) * 100

        resp = upsert("patients", batch, "patient_number")

        if resp.status_code in (200, 201):
            total_ok += len(batch)
            print(f"  Batch {batch_num:>3}/{total_batches} OK -- {total_ok}/{len(all_rows)} ({pct:.0f}%)", end='\r', flush=True)
        else:
            # Retry row by row
            print(f"\n  Batch {batch_num:>3}/{total_batches} RETRY ({resp.status_code}) -- retrying row by row...")
            for row in batch:
                r2 = upsert("patients", [row], "patient_number")
                if r2.status_code in (200, 201):
                    total_ok += 1
                    print(f"    inserted: {row['patient_number']} {row['full_name']}")
                else:
                    total_err += 1
                    failed.append((row['patient_number'], row['full_name'], r2.status_code, r2.text[:120]))

    print()  # end carriage-return line
    print(f"\n=== Import Complete ===")
    print(f"  Upserted OK  : {total_ok}")
    print(f"  Failed       : {total_err}")

    if failed:
        print(f"\n--- Failed rows ({len(failed)}) ---")
        for pn, name, code, msg in failed[:30]:
            print(f"  pn={pn}  name={name}  [{code}] {msg}")

    # Final count
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/patients?select=count",
        headers={**BASE_HEADERS, "Prefer": "count=exact"},
        timeout=15
    )
    print(f"\nFinal patient count in Supabase: {r.headers.get('content-range', 'unknown')}")

if __name__ == '__main__':
    main()
