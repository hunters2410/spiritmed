import re, sys
from collections import Counter

with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    content = f.read()

# Count rows in INSERT VALUES
rows = re.findall(r"^\((\d+),", content, re.MULTILINE)
print("Total rows in dump:", len(rows))
if rows:
    nums = [int(r) for r in rows]
    print("Row ID range:", min(nums), "to", max(nums))

# Extract status column (second-to-last field in each row)
# STATUS is at position 52 (0-indexed) in the INSERT columns
statuses = re.findall(r",\s*'(Alive|Discharged|Deceased|Old Patient|old_patient|old|inactive|active|Active)',\s*NULL\)", content)
c = Counter(statuses)
print("Status distribution:", dict(c))

# Also check for NULL status
null_status = len(re.findall(r",\s*NULL,\s*NULL\)$", content, re.MULTILINE))
print("NULL status rows (approx):", null_status)