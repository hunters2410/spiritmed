import re

sql_file = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\appointment (6).sql"

with open(sql_file, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Find CREATE TABLE `appointment`
create_table_match = re.search(r"CREATE TABLE `appointment` \((.*?)\) ENGINE", content, re.DOTALL | re.IGNORECASE)
if create_table_match:
    print("=== Table Schema ===")
    print(create_table_match.group(1).strip()[:1000])

# Helper to split values
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

tuples = extract_tuples(content, 'appointment')
print(f"\nTotal Appointment Tuples Found: {len(tuples)}")

# Analyze column positions and statuses
if tuples:
    print("\nSample first tuple parsed:")
    cols = [unquote(v) for v in split_values(tuples[0])]
    print(f"Col count: {len(cols)}")
    for idx, c in enumerate(cols):
        print(f"  Col {idx}: {c}")

    statuses = {}
    for t in tuples:
        c = [unquote(v) for v in split_values(t)]
        if len(c) > 5:
            # Let's inspect potential status columns
            st = c[5] if len(c) > 5 else None # candidate status
            st_alt = c[6] if len(c) > 6 else None
            st_alt2 = c[7] if len(c) > 7 else None
            st_key = f"col5={st} | col6={st_alt} | col7={st_alt2}"
            statuses[st_key] = statuses.get(st_key, 0) + 1

    print("\nTop Status Combinations in Dump:")
    sorted_st = sorted(statuses.items(), key=lambda x: x[1], reverse=True)
    for k, v in sorted_st[:20]:
        print(f"  {v:>5d} rows : {k}")
