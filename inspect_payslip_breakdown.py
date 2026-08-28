import re
from collections import defaultdict

payslip_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payslip.sql"
details_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payslip_details.sql"

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

with open(payslip_sql, 'r', encoding='utf-8', errors='replace') as f:
    ps_tuples = extract_tuples(f.read(), 'payslip')

with open(details_sql, 'r', encoding='utf-8', errors='replace') as f:
    pd_tuples = extract_tuples(f.read(), 'payslip_details')

details_by_payslip = defaultdict(list)
for t in pd_tuples:
    cols = [unquote(v) for v in split_values(t)]
    # id, payslip_id, name, amount, type (1=allowance, 2=deduction)
    ps_id = cols[1]
    name = cols[2]
    amount = float(cols[3]) if cols[3] else 0.0
    dtype = cols[4]
    details_by_payslip[ps_id].append({'name': name, 'amount': amount, 'type': dtype})

print(f"Total payslips: {len(ps_tuples)}")
print(f"Details mapped to {len(details_by_payslip)} payslips\n")

for t in ps_tuples:
    cols = [unquote(v) for v in split_values(t)]
    # id, staff_id, month, year, basic_salary, total_allowance, total_deduction, net_salary, bill_no, remarks, pay_via, hash, created_at, paid_by, branch_id
    ps_id = cols[0]
    staff_id = cols[1]
    month = cols[2]
    year = cols[3]
    basic = float(cols[4])
    allowances = float(cols[5])
    deductions = float(cols[6])
    net = float(cols[7])
    created_at = cols[12]

    dt_list = details_by_payslip[ps_id]
    paye = sum(d['amount'] for d in dt_list if 'paye' in d['name'].lower())
    nssa = sum(d['amount'] for d in dt_list if 'nssa' in d['name'].lower())
    aids_levy = sum(d['amount'] for d in dt_list if 'aids' in d['name'].lower())

    print(f"Payslip #{ps_id} | Staff={staff_id} | Period={month}/{year} | Basic=${basic:.2f} | Allow=${allowances:.2f} | Deduct=${deductions:.2f} | Net=${net:.2f} | PAYE=${paye:.2f} | NSSA=${nssa:.2f} | AidsLevy=${aids_levy:.2f}")

