import re

sql_file = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\payment_category.sql"

with open(sql_file, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    v = v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\r', '\r').replace('\\\\', '\\')
    return v

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

inserts = [m.start() for m in re.finditer(r'INSERT INTO `payment_category`', content, re.IGNORECASE)]
all_rows = []
for start_idx in inserts:
    values_idx = content.find("VALUES", start_idx)
    if values_idx != -1:
        end_semicolon = content.find(";\n", values_idx)
        if end_semicolon == -1: end_semicolon = content.find(";", values_idx)
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

print(f"Total procedures/categories in payment_category.sql: {len(all_rows)}")

parsed_procedures = []
for r in all_rows:
    cols = [unquote(v) for v in split_values(r)]
    while len(cols) < 8: cols.append(None)
    
    cat_id = cols[0]
    category_name = cols[1]
    desc = cols[2]
    c_price = cols[3]
    cat_type = cols[4]
    code = cols[7]
    
    parsed_procedures.append({
        'id': cat_id,
        'name': category_name,
        'description': desc,
        'price': c_price,
        'type': cat_type,
        'code': code
    })

print("\n--- SAMPLE PROCEDURES (First 10) ---")
for p in parsed_procedures[:10]:
    print(f"ID: {p['id']} | Code: {p['code']} | Name: {p['name']} | Price: ${p['price']} | Type: {p['type']}")
