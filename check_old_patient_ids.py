import re
import os

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

def run():
    with open(INPUT_FILE, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    insert_pat = re.compile(
        r'INSERT INTO `patient`[^V]*VALUES\s*(.*?);\s*(?=INSERT|ALTER|COMMIT|$)',
        re.DOTALL | re.IGNORECASE
    )

    old_ids = {}
    patient_ids = {}
    filenumbers = {}

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
                    
                    name = cols[2]
                    if not name or not str(name).strip() or re.match(r'^patient\s+\d+$', str(name).strip(), re.IGNORECASE):
                        continue
                    
                    oid = cols[0] # id
                    pid = cols[12] # patient_id (col 12)
                    fn = cols[45] # filenumber (col 45)

                    if oid: old_ids[oid] = old_ids.get(oid, 0) + 1
                    if pid: patient_ids[pid] = patient_ids.get(pid, 0) + 1
                    if fn: filenumbers[fn] = filenumbers.get(fn, 0) + 1

    print(f"Total old IDs (primary key): {len(old_ids)}")
    print(f"Total unique old patient_id values: {len(patient_ids)}")
    print(f"Total unique old filenumber values: {len(filenumbers)}")
    
    dup_pids = {k: v for k, v in patient_ids.items() if v > 1}
    print(f"Duplicate patient_id values count: {len(dup_pids)}")
    if dup_pids:
        print("First 5 duplicates:")
        for k, v in list(dup_pids.items())[:5]:
            print(f"  {k}: {v} times")

if __name__ == '__main__':
    run()
