import re

with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

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

seen = {}
duplicates = []
for line in lines:
    s = line.strip()
    if not (s.startswith("(") and (s.endswith("),") or s.endswith(");"))): continue
    f = parse_row(s)
    if not f or len(f) < 52: continue
    name = (f[2] or "").strip()
    pid = (f[12] or "").strip()
    if not pid: continue
    if pid in seen:
        duplicates.append((pid, name, seen[pid]))
    else:
        seen[pid] = name

print(f"Total duplicate instances: {len(duplicates)}")
print("Sample duplicates in dump file:")
for pid, n1, n2 in duplicates[:5]:
    print(f"  Patient ID '{pid}': '{n1}' vs '{n2}'")