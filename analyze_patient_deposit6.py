"""
analyze_patient_deposit6.py
============================
Parses patient_deposit (6).sql and analyzes its relationship with payment (10).sql and Supabase.
"""

import re
import os
from collections import defaultdict

DEPOSIT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient_deposit (6).sql"

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    return v.replace("\\'", "'").replace('\\"', '"')

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
    with open(DEPOSIT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    tuples = extract_tuples(content, 'patient_deposit')
    print(f"Total tuples in patient_deposit (6).sql: {len(tuples)}")

    parsed = []
    has_amount = 0
    blank_amount = 0
    by_payment_id = defaultdict(list)
    standalone_deposits = []

    total_deposited_sum = 0.0

    for t in tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 14: cols.append(None)

        dep_id = cols[0]
        patient_ref = cols[1]
        payment_id = cols[2]
        date_raw = cols[3]
        amount_raw = cols[4]
        dep_type = cols[6]

        amt = 0.0
        if amount_raw and str(amount_raw).strip() not in ('', 'NULL', 'null'):
            try:
                amt = float(str(amount_raw).strip().replace(',', ''))
            except:
                amt = 0.0

        if amt > 0:
            has_amount += 1
            total_deposited_sum += amt
            parsed.append((dep_id, patient_ref, payment_id, date_raw, amt, dep_type))
            if payment_id and str(payment_id).strip() not in ('', '0', 'NULL', 'null'):
                by_payment_id[str(payment_id).strip()].append((dep_id, amt, date_raw, dep_type))
            else:
                standalone_deposits.append((dep_id, patient_ref, amt, date_raw, dep_type))
        else:
            blank_amount += 1

    print(f"  Rows with deposited_amount > 0 : {has_amount}")
    print(f"  Rows with blank/zero amount    : {blank_amount}")
    print(f"  Total Deposited Amount Sum     : ${total_deposited_sum:,.2f}")
    print(f"  Unique payment_id bill links   : {len(by_payment_id)}")
    print(f"  Standalone deposits (no bill)  : {len(standalone_deposits)}")

    # Check multiple deposits per payment_id
    multi_deposits = {k: v for k, v in by_payment_id.items() if len(v) > 1}
    print(f"  Bills with MULTIPLE deposits   : {len(multi_deposits)}")

    if multi_deposits:
        print("\nSample Bills with Multiple Deposits:")
        for k, v in list(multi_deposits.items())[:5]:
            print(f"  Payment ID {k} has {len(v)} deposits: {v}")

if __name__ == '__main__':
    main()
