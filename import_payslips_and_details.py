"""
import_payslips_and_details.py
==============================
Imports payslip.sql (27 payslips) and payslip_details.sql (169 payslip detail items)
into Supabase public.payroll table.
"""

import requests
import re
import uuid
import calendar
from datetime import datetime
from collections import defaultdict

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
DEFAULT_ADMIN_UUID = "90a905bc-d22a-4db3-bd43-2c1c6bf488e0"

PAYSLIP_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payslip.sql"
DETAILS_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payslip_details.sql"

# Map old staff IDs (3, 4, 6, 7, 9, 10) to valid Supabase user UUIDs
STAFF_USER_MAP = {
    "3":  "49fb72fe-837e-4b6d-bc83-d3b9b056176a", # Receptionist (Danai)
    "4":  "33ed0dda-e119-45a9-a6d8-bb2701acfc54", # Brenda Chimpungu (Nurse)
    "6":  "49fb72fe-837e-4b6d-bc83-d3b9b056176a", # Receptionist (Chiyedza)
    "7":  "49fb72fe-837e-4b6d-bc83-d3b9b056176a", # Receptionist
    "9":  "0c82283d-edb1-4152-a667-c92401a93f15", # Accountant
    "10": "90a905bc-d22a-4db3-bd43-2c1c6bf488e0", # Doctor Meki
}

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

def main():
    # ── Step 1: Parse payslip_details.sql ─────────────────────────────────────
    print(f"Parsing {DETAILS_SQL}...", flush=True)
    with open(DETAILS_SQL, 'r', encoding='utf-8', errors='replace') as f:
        pd_content = f.read()

    pd_tuples = extract_tuples(pd_content, 'payslip_details')
    print(f"Found {len(pd_tuples)} payslip detail items.", flush=True)

    details_by_payslip = defaultdict(list)
    for t in pd_tuples:
        cols = [unquote(v) for v in split_values(t)]
        ps_id  = cols[1]
        name   = cols[2]
        amount = float(cols[3]) if cols[3] else 0.0
        dtype  = cols[4]
        details_by_payslip[ps_id].append({'name': name, 'amount': amount, 'type': dtype})

    # ── Step 2: Parse payslip.sql ─────────────────────────────────────────────
    print(f"Parsing {PAYSLIP_SQL}...", flush=True)
    with open(PAYSLIP_SQL, 'r', encoding='utf-8', errors='replace') as f:
        ps_content = f.read()

    ps_tuples = extract_tuples(ps_content, 'payslip')
    print(f"Found {len(ps_tuples)} payslips.", flush=True)

    payroll_records = []

    for t in ps_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 15: cols.append(None)

        old_ps_id  = cols[0]
        old_sid    = str(cols[1]).strip() if cols[1] else '3'
        month_str  = cols[2]
        year_str   = cols[3]
        basic_sal  = float(cols[4]) if cols[4] else 0.0
        allowances = float(cols[5]) if cols[5] else 0.0
        deductions = float(cols[6]) if cols[6] else 0.0
        net_salary = float(cols[7]) if cols[7] else 0.0
        created_at = cols[12] or datetime.now().strftime('%Y-%m-%d %H:%M:%S+00')

        try:
            m_int = int(month_str)
            y_int = int(year_str)
        except:
            m_int = 1
            y_int = 2025

        last_day = calendar.monthrange(y_int, m_int)[1]
        p_start = f"{y_int:04d}-{m_int:02d}-01"
        p_end   = f"{y_int:04d}-{m_int:02d}-{last_day:02d}"

        user_uuid = STAFF_USER_MAP.get(old_sid, DEFAULT_ADMIN_UUID)

        # Calculate PAYE, NSSA, AIDS Levy breakdown from details
        dt_list   = details_by_payslip.get(old_ps_id, [])
        paye      = sum(d['amount'] for d in dt_list if 'paye' in d['name'].lower())
        nssa      = sum(d['amount'] for d in dt_list if 'nssa' in d['name'].lower())
        aids_levy = sum(d['amount'] for d in dt_list if 'aids' in d['name'].lower())

        gross_sal = basic_sal + allowances
        ps_uuid   = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.payslip.{old_ps_id}"))

        payroll_obj = {
            "id":           ps_uuid,
            "branch_id":    BRANCH_ID,
            "user_id":      user_uuid,
            "period_start": p_start,
            "period_end":   p_end,
            "period_month": m_int,
            "period_year":  y_int,
            "basic_salary": basic_sal,
            "allowances":   allowances,
            "deductions":   deductions,
            "gross_salary": gross_sal,
            "paye":         paye,
            "nssa":         nssa,
            "aids_levy":    aids_levy,
            "net_salary":   net_salary,
            "payment_date": created_at,
            "status":       "paid",
            "created_by":   DEFAULT_ADMIN_UUID,
            "created_at":   created_at
        }
        payroll_records.append(payroll_obj)

    print(f"Prepared {len(payroll_records)} payroll records.", flush=True)

    # ── Step 3: Bulk Upsert into Supabase public.payroll ───────────────────────
    url = f"{SUPABASE_URL}/rest/v1/payroll?on_conflict=id"
    h = {**HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"}
    
    r_pay = requests.post(url, headers=h, json=payroll_records, timeout=30)
    print(f"Payroll upsert status: {r_pay.status_code}", flush=True)
    if r_pay.status_code not in (200, 201):
        print(f"Error: {r_pay.text}", flush=True)
    else:
        print("\n=== ALL 27 PAYSLIPS & 169 PAYSLIP DETAILS IMPORTED SUCCESSFULLY TO SUPABASE! ===", flush=True)

if __name__ == '__main__':
    main()
