import os
import re

pages_dir = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\src\pages"

files_to_check = []
for root, dirs, files in os.walk(pages_dir):
    for f in files:
        if f.endswith('.tsx'):
            files_to_check.append(os.path.join(root, f))

print(f"Checking {len(files_to_check)} page files...")

unpaginated_queries = []

for filepath in files_to_check:
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Find functions that perform supabase.from('...').select(...) without range
    # Look for supabase.from('xyz')
    matches = re.finditer(r"supabase\s*\n*\s*\.from\(['\"]([a-zA-Z0-9_]+)['\"]\)\s*\n*\s*\.select\(", content)
    for m in matches:
        table_name = m.group(1)
        # Check surrounding text for .range(
        start = max(0, m.start() - 100)
        end = min(len(content), m.end() + 400)
        snippet = content[start:end]
        if ".range(" not in snippet and "count: 'exact', head: true" not in snippet and ".single()" not in snippet and ".limit(1)" not in snippet and "limit(" not in snippet:
            unpaginated_queries.append((os.path.basename(filepath), table_name, snippet[:100]))

print(f"Found {len(unpaginated_queries)} unpaginated queries:")
for fname, tbl, snip in unpaginated_queries[:30]:
    print(f"  {fname:30s} -> table: {tbl:20s}")
