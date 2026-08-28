import re
with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

pids = []
for line in lines:
    m = re.search(r"'(\d{3,7})',\s*'\d{2}/\d{2}/\d{2}'", line)
    if m:
        pids.append(m.group(1))

print(f"Total lines with patient_id: {len(pids)}")
print(f"Unique patient_ids: {len(set(pids))}")