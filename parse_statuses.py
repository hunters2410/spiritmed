# -*- coding: utf-8 -*-
import re, sys, io
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    content = f.read()

# Extract every VALUES row and parse status (second-to-last field)
# The INSERT columns end with: ..., `status`, `refbydoctor`
# Each row ends with NULL) or 'value')
# Status is the 52nd column (0-indexed: 51)

# Split into individual value rows
rows = re.findall(r"\((\d+),.*?\)(?:,\n|\);\n)", content, re.DOTALL)
print(f"Rows found with dotall: {len(rows)}")

# Better: extract each VALUES tuple line by line from the INSERT block
# Find the INSERT block
insert_match = re.search(r"INSERT INTO `patient`.*?VALUES\n(.*?);\n\nCOMMIT", content, re.DOTALL)
if not insert_match:
    print("Could not find INSERT block")
    sys.exit(1)

values_block = insert_match.group(1)
print(f"Values block length: {len(values_block)}")

# Count patient rows
individual_rows = re.findall(r"^\((\d+),", values_block, re.MULTILINE)
print(f"Patient rows: {len(individual_rows)}")

# Extract status: it's right before the last field (refbydoctor)
# Pattern: ..., 'STATUS', NULL) or ..., 'STATUS', 'refbydoctor')
# Also ..., NULL, NULL) when status is null

# Get all status values
status_values = re.findall(
    r",\s*(NULL|'[^']*'),\s*(?:NULL|'[^']*')\)(?:,|;)",
    values_block
)

# The status is second-to-last field. Extract just last 2 fields pattern
# Better: find status and refbydoctor at end of each row
all_statuses = re.findall(
    r",\s*(?:NULL|'([^']*)')\s*,\s*(?:NULL|'[^']*')\s*\)(?:,|;)",
    values_block
)

print(f"\nStatus values found: {len(all_statuses)}")
c = Counter(all_statuses)
print("Status distribution:")
for status, count in sorted(c.items(), key=lambda x: -x[1]):
    label = status if status else "NULL/empty"
    print(f"  '{label}': {count}")