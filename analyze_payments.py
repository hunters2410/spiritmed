import re

sql_file = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payment (8).sql"

with open(sql_file, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

inserts = [m.start() for m in re.finditer(r'INSERT INTO `payment`', content, re.IGNORECASE)]
print(f"Total INSERT statements found in payment (8).sql: {len(inserts)}")

all_rows = []

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            current += c
            if i + 1 < len(row_str):
                current += row_str[i+1]
                i += 2
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

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    v = v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\r', '\r').replace('\\\\', '\\')
    return v

def safe_float(v):
    if not v: return 0.0
    v_str = str(v).strip().replace(',', '')
    try:
        return float(v_str)
    except:
        return 0.0

for start_idx in inserts:
    values_idx = content.find("VALUES", start_idx)
    if values_idx != -1:
        end_semicolon = content.find(";\n", values_idx)
        if end_semicolon == -1:
            end_semicolon = content.find(";", values_idx)
        block = content[values_idx + 6:end_semicolon]
        depth, s = 0, None
        for i, ch in enumerate(block):
            if ch == '(':
                if depth == 0: s = i + 1
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0 and s is not None:
                    all_rows.append(block[s:i])
                    s = None

print(f"Total row tuples across all INSERT statements: {len(all_rows)}")

total_gross = 0.0
total_received = 0.0
total_due = 0.0
status_counts = {}
deposit_types = {}
non_numeric_received = {}
patients = set()
items_count = 0

for r in all_rows:
    cols = [unquote(v) for v in split_values(r)]
    while len(cols) < 30: cols.append(None)
    
    patient = cols[2]
    gross_raw = cols[11] or cols[5] or '0'
    received_raw = cols[17] or '0'
    deposit_type = cols[18] or 'Cash'
    st = cols[19] or 'unpaid'
    cat = cols[16]
    
    gross = safe_float(gross_raw)
    rec = safe_float(received_raw)
    
    if received_raw and not received_raw.replace('.','',1).replace('-','',1).isdigit():
        non_numeric_received[received_raw] = non_numeric_received.get(received_raw, 0) + 1
        
    due = max(0.0, gross - rec)
    
    if patient: patients.add(patient)
    total_gross += gross
    total_received += rec
    total_due += due
    status_counts[st] = status_counts.get(st, 0) + 1
    deposit_types[str(deposit_type)] = deposit_types.get(str(deposit_type), 0) + 1
    if cat: items_count += 1

print(f"\n--- ALL PAYMENTS SUMMARY ---")
print(f"Total Rows: {len(all_rows)}")
print(f"Unique Patient IDs: {len(patients)}")
print(f"Total Gross Billing: ${total_gross:,.2f}")
print(f"Total Amount Received (Paid): ${total_received:,.2f}")
print(f"Total Dues / Outstanding Balance: ${total_due:,.2f}")
print(f"Status distribution: {status_counts}")
print(f"Deposit types distribution: {deposit_types}")
print(f"Non-numeric received values encountered: {non_numeric_received}")
print(f"Rows with item breakdown: {items_count}")
