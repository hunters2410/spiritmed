import re

with open(r'database/patient (5).sql', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

insert_pat = re.compile(
    r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);(?=\s*(?:INSERT|ALTER|COMMIT|--|$))',
    re.DOTALL | re.IGNORECASE
)

all_rows = []
for match in insert_pat.finditer(content):
    block = match.group(1)
    depth, start = 0, None
    for idx, ch in enumerate(block):
        if ch == '(':
            if depth == 0: start = idx + 1
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0 and start is not None:
                all_rows.append(block[start:idx])
                start = None

print("Total rows extracted:", len(all_rows))

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

placeholder_rows = []
for row_str in all_rows:
    cols = [unquote(v) for v in split_values(row_str)]
    if len(cols) > 2:
        name = cols[2]
        if name and re.match(r'^patient\s*\d*$', str(name).strip(), re.IGNORECASE):
            placeholder_rows.append((cols[0], cols[2], cols[12], cols[45])) # id, name, patient_id, filenumber

print(f"Total placeholder rows in patient (5).sql where name is 'patient X' or 'patient': {len(placeholder_rows)}")
print("Sample placeholder rows in patient (5).sql:")
for r in placeholder_rows[:15]:
    print(f"  MySQL ID={r[0]:<6} name='{r[1]}' patient_id={r[2]} filenumber={r[3]}")
