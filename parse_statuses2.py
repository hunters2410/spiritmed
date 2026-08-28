# -*- coding: utf-8 -*-
import re, sys, io
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Find the start of VALUES
values_start = None
for i, line in enumerate(lines):
    if "INSERT INTO" in line and "patient" in line:
        print(f"INSERT found at line {i+1}: {line[:80].strip()}")
    if line.strip().startswith("(1,") or line.strip().startswith("(1 ,"):
        values_start = i
        print(f"Values start at line {i+1}")
        break

# Count status from each row line (status is 2nd-to-last field in each row)
# Each data row starts with ( and ends with ), or );
status_counter = Counter()
row_count = 0

for line in lines:
    stripped = line.strip()
    if not stripped.startswith("("):
        continue
    if not (stripped.endswith("),") or stripped.endswith(");")):
        continue
    row_count += 1
    # Extract last 3 fields - status is second to last
    # Fields: ..., `payment_confirmation`, `status`, `refbydoctor`
    # Find status by looking for last two comma-separated values before closing )
    clean = stripped.rstrip(",;)")
    # Split from the right to get last 2 fields
    # Status should be like 'Alive', 'Discharged', 'Deceased', NULL
    m = re.search(r",\s*(NULL|'([^']*)')\s*,\s*(NULL|'([^']*)')\s*$", clean)
    if m:
        # m.group(1) = status field raw, m.group(2) = status value
        # m.group(3) = refbydoctor raw, m.group(4) = refbydoctor value
        status_raw = m.group(1)
        status_val = m.group(2) if m.group(2) is not None else ""
        status_counter[status_val if status_val else "NULL"] += 1
    else:
        status_counter["PARSE_ERROR"] += 1

print(f"\nRows parsed: {row_count}")
print("\nStatus distribution:")
for st, cnt in sorted(status_counter.items(), key=lambda x: -x[1]):
    print(f"  '{st}': {cnt}")