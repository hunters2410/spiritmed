import re, urllib.request, json

with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

total_rows = 0
empty_name_or_pid = 0
pids = []
pids_seen = set()
duplicates_in_dump = 0

def parse_row(line):
    line = line.strip().rstrip(",;)")
    if not line.startswith("("): return None
    line = line[1:]
    fields=[]; i=0
    while i < len(line):
        if line[i:i+4]=="NULL":
            fields.append(None); i+=4
            if i<len(line) and line[i]==",": i+=1
        elif line[i]=="'":
            j=i+1; val=[]
            while j<len(line):
                if line[j]=="\\" and j+1<len(line): val.append(line[j+1]); j+=2
                elif line[j]=="'": j+=1; break
                else: val.append(line[j]); j+=1
            fields.append("".join(val)); i=j
            if i<len(line) and line[i]==",": i+=1
        elif line[i] in "0123456789-":
            j=i
            while j<len(line) and line[j] not in ",)": j+=1
            fields.append(line[i:j]); i=j
            if i<len(line) and line[i]==",": i+=1
        else: i+=1
    return fields

for line in lines:
    s = line.strip()
    if not (s.startswith("(") and (s.endswith("),") or s.endswith(");"))): continue
    f = parse_row(s)
    if not f or len(f) < 52: continue
    total_rows += 1
    name = (f[2] or "").strip()
    pid = (f[12] or "").strip()
    if not name or not pid:
        empty_name_or_pid += 1
        continue
    if pid in pids_seen:
        duplicates_in_dump += 1
    else:
        pids_seen.add(pid)

print(f"Total row tuples in patient (8).sql: {total_rows}")
print(f"Rows with empty Name or Patient ID: {empty_name_or_pid}")
print(f"Duplicate patient_ids in dump file: {duplicates_in_dump}")
print(f"Unique valid patients in dump file: {len(pids_seen)}")