import re

DUMP = r"database 3\u819957882_urocaresystem (20).sql"
PATIENT_SQL = r"database 3\patient (7).sql"

print("Scanning full database dump for LEG patient origins...")

# First, check the big dump for any table that might map to these patients
# Look for table definitions
with open(DUMP, encoding="utf-8", errors="replace") as f:
    # Only read first part to find table names
    content = f.read(500000)  # first 500KB for table list

tables = re.findall(r"CREATE TABLE `([^`]+)`", content)
print(f"Tables found in full dump (first 500KB): {tables}")

# Now look for LEG-style IDs in the big dump
print("\nSearching full dump for LEG-XXXXX pattern...")
with open(DUMP, encoding="utf-8", errors="replace") as f:
    chunk_size = 1024 * 1024  # 1MB chunks
    chunk_num = 0
    leg_hits = []
    while True:
        chunk = f.read(chunk_size)
        if not chunk:
            break
        hits = re.findall(r"LEG-\d+", chunk)
        if hits:
            leg_hits.extend(hits)
        chunk_num += 1
        if chunk_num % 5 == 0:
            print(f"  Scanned {chunk_num}MB...", flush=True)

print(f"\nLEG-XXXXX occurrences in full dump: {len(leg_hits)}")
if leg_hits:
    print("Samples:", set(leg_hits[:20]))

# Also look in patient (7).sql for these names
print("\nSearching patient (7).sql for known LEG patient names...")
leg_names = [
    "Tawedzera Shadaya", "Nathaniel Mohammed", "Mack Nkhoma", 
    "Joshua Magwaro", "Chamunorwa Zhakata", "Simon Chitekesha"
]
with open(PATIENT_SQL, encoding="utf-8", errors="replace") as f:
    praw = f.read()

for name in leg_names:
    found = name in praw
    print(f"  '{name}' in patient (7).sql: {found}")
    if found:
        # Find surrounding context to get patient_id
        idx = praw.index(name)
        # Get the row context
        row_start = praw.rfind("(", 0, idx)
        row_end = praw.find(")", idx)
        row = praw[row_start:min(row_end+1, row_start+300)]
        print(f"    Context: {row[:200]}")
