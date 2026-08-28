import requests
import re
import os
import uuid
from datetime import datetime
from collections import Counter

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"
FALLBACK_PATIENT_UUID = "00000000-0000-4000-a000-000000000099"

APPOINTMENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\appointment (6).sql"
OLD_PATIENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (5).sql"

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    return v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\r', '\r').replace('\\\\', '\\')

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            current += c
            if i + 1 < len(row_str): current += row_str[i+1]; i += 2
            else: i += 1
            continue
        elif c == "'" and not in_q: in_q = True; current += c
        elif c == "'" and in_q:
            if i + 1 < len(row_str) and row_str[i+1] == "'": current += "''"; i += 2; continue
            in_q = False; current += c
        elif c == ',' and not in_q: values.append(current.strip()); current = ''
        else: current += c
        i += 1
    if current.strip(): values.append(current.strip())
    return values

def extract_tuples(sql_content, table_name):
    inserts = [m.start() for m in re.finditer(rf'INSERT INTO `{table_name}`', sql_content, re.IGNORECASE)]
    rows = []
    for start_idx in inserts:
        values_idx = sql_content.find("VALUES", start_idx)
        if values_idx != -1:
            end_semicolon = sql_content.find(";\n", values_idx)
            if end_semicolon == -1: end_semicolon = sql_content.find(";", values_idx)
            block = sql_content[values_idx + 6:end_semicolon]
            depth, s = 0, None
            for i, ch in enumerate(block):
                if ch == '(':
                    if depth == 0: s = i + 1
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0 and s is not None:
                        rows.append(block[s:i])
                        s = None
    return rows

def normalize_name(n):
    if not n: return ''
    return " ".join(n.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').replace('prof.', '').split())

def parse_date(timestamp_raw, add_date_raw=None):
    if timestamp_raw and str(timestamp_raw).strip().isdigit():
        try:
            d = datetime.fromtimestamp(int(timestamp_raw))
            if 1990 <= d.year <= 2035:
                return d.strftime('%Y-%m-%d %H:%M:%S+00')
        except:
            pass

    if add_date_raw and str(add_date_raw).strip() not in ('', 'NULL', 'null'):
        ds = str(add_date_raw).strip()
        for fmt in ['%m/%d/%y', '%m/%d/%Y', '%d/%m/%Y', '%Y-%m-%d']:
            try:
                d = datetime.strptime(ds, fmt)
                if 1990 <= d.year <= 2035:
                    return d.strftime('%Y-%m-%d 09:00:00+00')
            except:
                pass

    return datetime.now().strftime('%Y-%m-%d 09:00:00+00')

def map_status(raw_status):
    if not raw_status:
        return 'pending_confirmation'
    st = str(raw_status).strip().lower()
    if 'pending' in st or 'request' in st:
        return 'pending_confirmation'
    if 'treat' in st:
        return 'treated'
    if 'confirm' in st:
        return 'confirmed'
    if 'cancel' in st:
        return 'cancelled'
    if 'complete' in st:
        return 'completed'
    return 'pending_confirmation'

def main():
    print("Loading patients from Supabase...", flush=True)
    all_patients = []
    from_idx = 0
    page_size = 1000
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,file_number,full_name",
            headers={**HEADERS, "Range": f"{from_idx}-{from_idx+page_size-1}"},
            timeout=30
        )
        if r.status_code not in (200, 206) or not r.json(): break
        rows = r.json()
        all_patients.extend(rows)
        if len(rows) < page_size: break
        from_idx += page_size

    print(f"Loaded {len(all_patients)} patients from Supabase.", flush=True)

    by_pn   = {str(p.get('patient_number') or '').strip(): p['id'] for p in all_patients if p.get('patient_number')}
    by_fn   = {str(p.get('file_number') or '').strip(): p['id'] for p in all_patients if p.get('file_number') and str(p.get('file_number')).strip() not in ('0', 'None', 'null')}
    by_name = {normalize_name(p.get('full_name')): p['id'] for p in all_patients if p.get('full_name')}

    # Load old patient id mapping from patient (5).sql
    old_id_to_pn = {}
    if os.path.exists(OLD_PATIENT_SQL):
        with open(OLD_PATIENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
            old_p_content = f.read()
        old_rows = extract_tuples(old_p_content, 'patient')
        for r in old_rows:
            cols = [unquote(v) for v in split_values(r)]
            while len(cols) < 13: cols.append(None)
            oid = cols[0]
            pid = cols[12]
            if pid and str(pid).strip() not in ('', 'NULL', 'null', '0'):
                pn = str(pid).strip()
            else:
                pn = f"P{str(oid).zfill(4)}"
            if oid:
                old_id_to_pn[str(oid)] = pn

    # Load appointments from appointment (6).sql
    print(f"\nParsing {APPOINTMENT_SQL}...", flush=True)
    with open(APPOINTMENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
        app_content = f.read()

    app_tuples = extract_tuples(app_content, 'appointment')
    print(f"Found {len(app_tuples)} tuples in appointment (6).sql", flush=True)

    matched_count = 0
    fallback_count = 0
    status_counts = Counter()

    appointments_to_import = []

    for t in app_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 20: cols.append(None)

        old_app_id   = cols[0]
        old_pat_id   = cols[1]
        timestamp    = cols[3]
        time_slot    = cols[4]
        remarks      = cols[7]
        add_date     = cols[8]
        raw_status   = cols[11]
        patient_name = cols[14]

        mapped_st = map_status(raw_status)
        status_counts[mapped_st] += 1

        # Patient UUID Resolution
        patient_uuid = None
        if old_pat_id:
            ref_str = str(old_pat_id).strip()
            pn = old_id_to_pn.get(ref_str) or ref_str
            patient_uuid = by_pn.get(pn)

        if not patient_uuid and patient_name:
            patient_uuid = by_name.get(normalize_name(patient_name))

        if not patient_uuid:
            patient_uuid = FALLBACK_PATIENT_UUID
            fallback_count += 1
        else:
            matched_count += 1

        app_date = parse_date(timestamp, add_date)
        app_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.appointment.{old_app_id}"))

        notes_str = f"Remarks: {remarks}" if remarks else None

        app_obj = {
            "id":               app_uuid,
            "branch_id":        BRANCH_ID,
            "patient_id":       patient_uuid,
            "appointment_date": app_date,
            "duration_minutes": 15,
            "appointment_type": "review" if remarks and "review" in remarks.lower() else "consultation",
            "status":           mapped_st,
            "notes":            notes_str,
            "created_at":       app_date
        }
        appointments_to_import.append(app_obj)

    print(f"\n=== Appointment Matching & Status Breakdown ===")
    print(f"  Total Appointments Parsed : {len(appointments_to_import)}")
    print(f"  Matched to Registered Patients : {matched_count} / {len(appointments_to_import)} ({(matched_count/len(appointments_to_import))*100:.1f}%)")
    print(f"  Fallback Unlinked Patient : {fallback_count}\n")
    print("  Status Breakdown:")
    for st, cnt in status_counts.most_common():
        print(f"    - {st:<22s} : {cnt:>6d} ({(cnt/len(appointments_to_import))*100:.1f}%)")

if __name__ == '__main__':
    main()
