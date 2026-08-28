"""Show exactly which patients were skipped during migration."""
import re

INPUT = r"C:\Users\Acer P16\Downloads\patient (2).sql"

with open(INPUT, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

insert_pat = re.compile(
    r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
    re.DOTALL | re.IGNORECASE
)

def unquote(v):
    v = v.strip()
    if v.upper() == 'NULL':
        return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("''", "'")
    return v

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == "'" and not in_q:
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

all_rows = []
for match in insert_pat.finditer(content):
    block = match.group(1)
    depth, start = 0, None
    for idx, ch in enumerate(block):
        if ch == '(':
            if depth == 0:
                start = idx + 1
            depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0 and start is not None:
                all_rows.append(block[start:idx])
                start = None

skipped = []
for row_str in all_rows:
    cols = [unquote(v) for v in split_values(row_str)]
    while len(cols) < 53:
        cols.append(None)
    old_id = cols[0]
    name   = cols[2]
    if not name or not str(name).strip():
        skipped.append((old_id, '(empty name)'))
    elif re.match(r'^patient\s+\d+$', str(name).strip(), re.IGNORECASE):
        skipped.append((old_id, str(name).strip()))

print(f"Total skipped: {len(skipped)}")
print("")
for sid, sname in skipped:
    print(f"  Old ID {sid}: '{sname}'")
