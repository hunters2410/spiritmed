import re

SQL_FILE = r'C:\Users\Acer P16\Documents\Spiritmed\hospital update\db2\patient (9).sql'

def unquote(v):
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1].replace("\\'", "'").replace("''", "'").replace("\\\\", "\\")
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

with open(SQL_FILE, 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

insert_pat = re.compile(
    r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
    re.DOTALL | re.IGNORECASE
)

unresolved_with_data = []

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
                
                sql_id = cols[0]
                name = cols[2]
                birthdate = cols[8]
                age = cols[9]
                
                bd = str(birthdate).strip() if birthdate else ''
                ag = str(age).strip() if age else ''
                if bd and bd.lower() not in ('null', 'none', '0', '0000-00-00', '00-00-0000', 'n/a', '-', ''):
                    # Check if it was resolved
                    pass
                elif ag and ag.lower() not in ('null', 'none', '0', ''):
                    pass
                else:
                    unresolved_with_data.append((sql_id, name, bd, ag))

print(f"Total SQL rows with truly NO birthdate AND NO age in SQL: {len(unresolved_with_data)}")
