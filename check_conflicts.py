"""Check if the 1,263 conflict patients are genuinely different people."""
import re

INPUT = r"C:\Users\Acer P16\Downloads\patient (2).sql"

def unquote(v):
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("''", "'")
    return v

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == "'" and not in_q: in_q = True; current += c
        elif c == "'" and in_q:
            if i+1 < len(row_str) and row_str[i+1] == "'":
                current += "''"; i += 2; continue
            in_q = False; current += c
        elif c == ',' and not in_q: values.append(current.strip()); current = ''
        else: current += c
        i += 1
    if current.strip(): values.append(current.strip())
    return values

def gen_patient_number(filenumber, old_id):
    fn = str(filenumber or '').strip()
    if fn and fn not in ('', 'NULL', 'null', '0') and len(fn) <= 10:
        return fn.zfill(4)
    return str(old_id).zfill(4)

with open(INPUT, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

insert_pat = re.compile(
    r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
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
                all_rows.append(block[start:idx]); start = None

# Map patient_number -> first patient's name (already imported)
first_occurrence = {}
conflicts = []

for row_str in all_rows:
    cols = [unquote(v) for v in split_values(row_str)]
    while len(cols) < 53: cols.append(None)
    old_id     = cols[0]
    name       = cols[2]
    filenumber = cols[45]

    if not name or not str(name).strip(): continue
    name_clean = str(name).strip()
    if re.match(r'^patient\s+\d+$', name_clean, re.IGNORECASE): continue

    pn = gen_patient_number(filenumber, old_id)

    if pn in first_occurrence:
        first_name = first_occurrence[pn]
        is_same = first_name.strip().lower() == name_clean.strip().lower()
        conflicts.append((pn, first_name, name_clean, is_same))
    else:
        first_occurrence[pn] = name_clean

same_name  = sum(1 for c in conflicts if c[3])
diff_name  = sum(1 for c in conflicts if not c[3])

print(f"Total conflicts:              {len(conflicts)}")
print(f"  Same name (true duplicates): {same_name}")
print(f"  Different name (diff people): {diff_name}")
print("")
print("Sample of DIFFERENT name conflicts (genuinely different people):")
shown = 0
for pn, first, second, same in conflicts:
    if not same:
        print(f"  File# {pn}: '{first}' vs '{second}'")
        shown += 1
        if shown >= 20:
            print(f"  ... and {diff_name - 20} more")
            break

print("")
print("Sample of SAME name conflicts (true duplicates):")
shown = 0
for pn, first, second, same in conflicts:
    if same:
        print(f"  File# {pn}: '{first}' (duplicate entry)")
        shown += 1
        if shown >= 10:
            print(f"  ... and {same_name - 10} more")
            break
