import re

INPUT_FILE = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (3).sql"

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    return v

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

with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

insert_pat = re.compile(
    r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
    re.DOTALL | re.IGNORECASE
)

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
                row_str = block[start:idx]
                cols = [unquote(v) for v in split_values(row_str)]
                while len(cols) < 53: cols.append(None)
                
                ref_name = cols[33]
                if ref_name and "henry" in ref_name.lower():
                    print(f"ID: {cols[0]} | Name: {cols[2]} | Referred Name: {repr(ref_name)}")
