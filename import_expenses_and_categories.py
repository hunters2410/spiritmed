"""
import_expenses_and_categories.py
=================================
Imports expense_category.sql (53 categories) and expense (1).sql (774 expenses)
into Supabase public.expense_categories and public.expenses tables.
"""

import requests
import re
import os
import uuid
from datetime import datetime
from collections import Counter

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
DEFAULT_USER_UUID = "90a905bc-d22a-4db3-bd43-2c1c6bf488e0"

CAT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\expense_category.sql"
EXP_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\expense (1).sql"
BATCH_SIZE = 250

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    return v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\r', '\r').replace('\\\\', '\\')

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            current += c
            if i + 1 < len(row_str): current += row_str[i+1]; i += 2
            else: i += 1
            continue
        elif c == "'" and not in_q: in_q = True; current += c
        elif c == "'" and in_q:
            if i + 1 < len(row_str) and row_str[i+1] == "'": current += "''"; i += 2; continue
            in_q = False; current += c
        elif c == ',' and not in_q: values.append(current.strip()); current = ''
        else: current += c
        i += 1
    if current.strip(): values.append(current.strip())
    return values

def extract_tuples(sql_content, table_name):
    inserts = [m.start() for m in re.finditer(rf'INSERT INTO `{table_name}`', sql_content, re.IGNORECASE)]
    rows = []
    for start_idx in inserts:
        values_idx = sql_content.find("VALUES", start_idx)
        if values_idx != -1:
            end_semicolon = sql_content.find(";\n", values_idx)
            if end_semicolon == -1: end_semicolon = sql_content.find(";", values_idx)
            block = sql_content[values_idx + 6:end_semicolon]
            depth, s = 0, None
            for i, ch in enumerate(block):
                if ch == '(':
                    if depth == 0: s = i + 1
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0 and s is not None:
                        rows.append(block[s:i])
                        s = None
    return rows

def parse_date(date_str, timestamp_raw=None):
    if date_str and str(date_str).strip() not in ('', 'NULL', 'null'):
        ds = str(date_str).strip()
        for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y-%m-%d %H:%M:%S']:
            try:
                d = datetime.strptime(ds, fmt)
                if 1990 <= d.year <= 2035:
                    return d.strftime('%Y-%m-%d %H:%M:%S+00')
            except:
                pass

    if timestamp_raw and str(timestamp_raw).strip().isdigit():
        try:
            d = datetime.fromtimestamp(int(timestamp_raw))
            if 1990 <= d.year <= 2035:
                return d.strftime('%Y-%m-%d %H:%M:%S+00')
        except:
            pass

    return datetime.now().strftime('%Y-%m-%d 09:00:00+00')

def bulk_upsert(table, records, on_conflict_col="id"):
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict_col}"
    h = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    total_ok = 0
    total_err = 0
    total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE

    print(f"Upserting {len(records)} records into {table} ({total_batches} batches)...", flush=True)

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        pct = (min(i + BATCH_SIZE, len(records)) / len(records)) * 100

        r = requests.post(url, headers=h, json=batch, timeout=60)
        if r.status_code in (200, 201):
            total_ok += len(batch)
            print(f"  [{table}] Batch {batch_num:>2}/{total_batches} OK ({total_ok}/{len(records)} = {pct:.0f}%)", flush=True)
        else:
            print(f"  [{table}] Batch {batch_num:>2}/{total_batches} RETRY ({r.status_code}): {r.text[:150]}", flush=True)
            for single in batch:
                r2 = requests.post(url, headers=h, json=[single], timeout=30)
                if r2.status_code in (200, 201):
                    total_ok += 1
                else:
                    total_err += 1
                    print(f"    FAIL: id={single.get('id')} - {r2.text[:120]}", flush=True)

    print(f"[{table}] Completed: {total_ok} OK, {total_err} errors\n", flush=True)
    return total_ok, total_err

def main():
    # ── Step 1: Parse expense_category.sql ─────────────────────────────────────
    print(f"Parsing {CAT_SQL}...", flush=True)
    with open(CAT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        cat_content = f.read()

    cat_tuples = extract_tuples(cat_content, 'expense_category')
    print(f"Found {len(cat_tuples)} categories.", flush=True)

    categories_to_import = []
    cat_name_to_uuid = {}

    for t in cat_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 3: cols.append(None)

        old_cat_id = cols[0]
        cat_name   = str(cols[1]).strip() if cols[1] else ''
        cat_desc   = str(cols[2]).strip() if cols[2] else None

        if not cat_name: continue

        cat_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.expense_category.{old_cat_id}"))
        cat_name_to_uuid[cat_name.lower()] = cat_uuid

        cat_obj = {
            "id":          cat_uuid,
            "branch_id":   BRANCH_ID,
            "name":        cat_name,
            "description": cat_desc,
            "created_at":  datetime.now().strftime('%Y-%m-%d %H:%M:%S+00')
        }
        categories_to_import.append(cat_obj)

    print(f"Prepared {len(categories_to_import)} category records.", flush=True)

    # ── Step 2: Upsert Categories into Supabase ───────────────────────────────
    bulk_upsert("expense_categories", categories_to_import)

    # ── Step 3: Parse expense (1).sql ──────────────────────────────────────────
    print(f"Parsing {EXP_SQL}...", flush=True)
    with open(EXP_SQL, 'r', encoding='utf-8', errors='replace') as f:
        exp_content = f.read()

    exp_tuples = extract_tuples(exp_content, 'expense')
    print(f"Found {len(exp_tuples)} expense records.", flush=True)

    expenses_to_import = []

    for t in exp_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 7: cols.append(None)

        old_exp_id   = cols[0]
        cat_name_raw = str(cols[1]).strip() if cols[1] else 'General'
        timestamp    = cols[2]
        note         = str(cols[3]).strip() if cols[3] else None
        amount_raw   = cols[4]
        datestring   = cols[6]

        try:
            amount = float(amount_raw) if amount_raw is not None else 0.0
        except:
            amount = 0.0

        exp_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.expense.{old_exp_id}"))
        cat_uuid = cat_name_to_uuid.get(cat_name_raw.lower())

        exp_date = parse_date(datestring, timestamp)

        exp_obj = {
            "id":             exp_uuid,
            "branch_id":      BRANCH_ID,
            "category_id":    cat_uuid,
            "category":       cat_name_raw,
            "description":    note,
            "amount":         amount,
            "expense_date":   exp_date,
            "payment_method": "cash",
            "created_by":     DEFAULT_USER_UUID,
            "recorded_by":    DEFAULT_USER_UUID,
            "created_at":     exp_date
        }
        expenses_to_import.append(exp_obj)

    print(f"Prepared {len(expenses_to_import)} expense records.", flush=True)

    # ── Step 4: Bulk Upsert Expenses into Supabase ────────────────────────────
    bulk_upsert("expenses", expenses_to_import)

    print("\n=== ALL EXPENSE CATEGORIES & EXPENSE RECORDS IMPORTED SUCCESSFULLY! ===", flush=True)

if __name__ == '__main__':
    main()
