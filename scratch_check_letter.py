import re
import json
import urllib.request

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

LETTER_FILE = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\letter.sql"

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
        v = v.replace("\\'", "'")
        v = v.replace('\\"', '"')
        v = v.replace('\\n', '\n')
        v = v.replace('\\r', '\r')
        v = v.replace('\\t', '\t')
        v = v.replace('\\\\', '\\')
        v = v.replace("''", "'")
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

def extract_all_rows_robust(content, table_name):
    pattern = re.compile(r"INSERT\s+INTO\s+`" + table_name + r"`", re.I)
    all_rows = []
    for match in pattern.finditer(content):
        values_match = re.search(r"\bVALUES\b", content[match.end():], re.I)
        if not values_match:
            continue
        start_idx = match.end() + values_match.end()
        idx = start_idx
        in_str = False
        escape = False
        depth = 0
        tuple_start = None
        while idx < len(content):
            c = content[idx]
            if escape:
                escape = False; idx += 1; continue
            if c == '\\':
                escape = True; idx += 1; continue
            if c == "'":
                in_str = not in_str; idx += 1; continue
            if not in_str:
                if c == '(':
                    if depth == 0: tuple_start = idx + 1
                    depth += 1
                elif c == ')':
                    depth -= 1
                    if depth == 0 and tuple_start is not None:
                        all_rows.append(content[tuple_start:idx])
                        tuple_start = None
                elif c == ';':
                    break
            idx += 1
    return all_rows

def main():
    with open(LETTER_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    rows = extract_all_rows_robust(content, 'letter')
    print(f"Found {len(rows)} letter rows in letter.sql")

    # Let's check medical_reports in Supabase
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/medical_reports?select=id,patient_id,created_at,recipient",
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Prefer": "count=exact"
        }
    )
    with urllib.request.urlopen(req) as resp:
        content_range = resp.headers.get("Content-Range")
        print("Medical reports count in Supabase:", content_range)

if __name__ == '__main__':
    main()
