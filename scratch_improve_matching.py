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
        if not values_match: continue
        start_idx = match.end() + values_match.end()
        idx = start_idx
        in_str = False; escape = False; depth = 0; tuple_start = None
        while idx < len(content):
            c = content[idx]
            if escape: escape = False; idx += 1; continue
            if c == '\\': escape = True; idx += 1; continue
            if c == "'": in_str = not in_str; idx += 1; continue
            if not in_str:
                if c == '(':
                    if depth == 0: tuple_start = idx + 1
                    depth += 1
                elif c == ')':
                    depth -= 1
                    if depth == 0 and tuple_start is not None:
                        all_rows.append(content[tuple_start:idx])
                        tuple_start = None
                elif c == ';': break
            idx += 1
    return all_rows

def fetch_all_patients():
    patients = []
    limit = 1000
    offset = 0
    while True:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,full_name,phone,file_number&limit={limit}&offset={offset}",
            headers={"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            patients.extend(data)
            if len(data) < limit: break
            offset += limit
    return patients

def clean_phone(p):
    if not p: return ""
    digits = re.sub(r'\D', '', str(p))
    if len(digits) >= 7: return digits[-7:]
    return digits

def normalize_name(name):
    if not name or str(name).strip() in ('0', 'NULL', 'null', ''): return ""
    n = str(name).strip().lower()
    n = re.sub(r'^(dr|mr|mrs|ms|prof|rev|sr)\.?\s+', '', n)
    n = re.sub(r'\s+', ' ', n)
    return n

def main():
    patients = fetch_all_patients()
    
    by_pn = {}
    by_fn = {}
    by_exact_name = {}
    by_norm_name = {}
    by_phone = {}
    all_db_names = []

    for p in patients:
        pid = p['id']
        pn = p.get('patient_number')
        fn = p.get('file_number')
        name = p.get('full_name')
        phone = p.get('phone')

        if pn: by_pn[str(pn).strip()] = pid
        if fn: by_fn[str(fn).strip()] = pid
        if name:
            by_exact_name[str(name).strip().lower()] = pid
            nn = normalize_name(name)
            if nn:
                by_norm_name[nn] = pid
            all_db_names.append((p, pid))
        if phone:
            cp = clean_phone(phone)
            if cp: by_phone[cp] = pid

    with open(LETTER_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    rows = extract_all_rows_robust(content, 'letter')

    matched = 0
    unmatched_list = []

    for r in rows:
        cols = [unquote(v) for v in split_values(r)]
        while len(cols) < 20: cols.append(None)
        
        lid = cols[0]
        old_pid = cols[2]
        pname = cols[8]
        pphone = cols[9]

        p_uuid = None
        match_reason = None

        if old_pid and str(old_pid).strip() in by_pn:
            p_uuid = by_pn[str(old_pid).strip()]
            match_reason = "pn"
        elif old_pid and f"P{str(old_pid).zfill(4)}" in by_pn:
            p_uuid = by_pn[f"P{str(old_pid).zfill(4)}"]
            match_reason = "p_zfill"
        elif old_pid and f"MIG-{old_pid}" in by_pn:
            p_uuid = by_pn[f"MIG-{old_pid}"]
            match_reason = "mig_pn"
        elif pname and str(pname).strip().lower() in by_exact_name:
            p_uuid = by_exact_name[str(pname).strip().lower()]
            match_reason = "exact_name"
        elif pname and normalize_name(pname) in by_norm_name:
            p_uuid = by_norm_name[normalize_name(pname)]
            match_reason = "norm_name"
        elif pphone and clean_phone(pphone) in by_phone and len(clean_phone(pphone)) >= 7:
            p_uuid = by_phone[clean_phone(pphone)]
            match_reason = "phone"

        if p_uuid:
            matched += 1
        else:
            unmatched_list.append((lid, old_pid, pname, pphone))

    print(f"Matched: {matched} / {len(rows)}")
    print(f"Unmatched: {len(unmatched_list)}")
    print("Unmatched items detail:")
    for item in unmatched_list:
        print(" ", item)

if __name__ == '__main__':
    main()
