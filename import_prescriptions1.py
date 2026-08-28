import requests
import re
import os
import uuid
import sys
from datetime import datetime

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

BRANCH_ID   = "697a3863-1de7-4615-819c-45b0d7066d67"
PRES_SQL    = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\pres (1).sql"
PATIENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\patient (8).sql"
BATCH_SIZE  = 500

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

def parse_date(raw, date_str_raw=None, add_date_time_raw=None):
    if raw and str(raw).strip().isdigit() and len(str(raw).strip()) == 10:
        try:
            d = datetime.fromtimestamp(int(raw))
            if 1990 <= d.year <= 2030:
                return d.strftime('%Y-%m-%d %H:%M:%S+00')
        except:
            pass

    for candidate in [add_date_time_raw, date_str_raw]:
        if candidate and str(candidate).strip() not in ('', 'NULL', 'null'):
            ds = str(candidate).strip()
            for fmt in ['%d-%m-%Y %H:%M:%S', '%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y']:
                try:
                    d = datetime.strptime(ds, fmt)
                    if 1990 <= d.year <= 2030:
                        return d.strftime('%Y-%m-%d %H:%M:%S+00')
                except:
                    pass

    return datetime.now().strftime('%Y-%m-%d %H:%M:%S+00')

def normalize_name(n):
    if not n: return ''
    return " ".join(n.lower().replace('mr.', '').replace('mrs.', '').replace('ms.', '').replace('dr.', '').replace('prof.', '').split())

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

    # Load old patient id mapping from patient (8).sql
    old_id_to_pn = {}
    if os.path.exists(PATIENT_SQL):
        with open(PATIENT_SQL, 'r', encoding='utf-8', errors='replace') as f:
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

    # 1. Parse pres (1).sql
    print(f"\nParsing {PRES_SQL}...", flush=True)
    with open(PRES_SQL, 'r', encoding='utf-8', errors='replace') as f:
        sql_content = f.read()

    create_idx = sql_content.find("CREATE TABLE `pres`")
    end_create = sql_content.find(") ENGINE=", create_idx)
    col_lines = sql_content[create_idx:end_create].split("\n")
    col_names = []
    for l in col_lines:
        l = l.strip()
        if l.startswith("`"):
            cn = l.split("`")[1]
            col_names.append(cn)

    tuples = extract_tuples(sql_content, 'pres')
    print(f"Found {len(tuples)} tuples in pres (1).sql", flush=True)

    matched_count = 0
    unmatched_count = 0
    medicines_map = {}
    prescriptions_list = []
    items_list = []

    for t in tuples:
        vals = [unquote(v) for v in split_values(t)]
        row = dict(zip(col_names, vals))

        old_pres_id  = row.get('id')
        old_pat_id   = row.get('patient')
        pat_name     = row.get('patient_name')
        date_raw     = row.get('date')
        date_str     = row.get('date_string')
        add_date_time= row.get('add_date_time')

        # Patient UUID Resolution
        patient_uuid = None
        if old_pat_id:
            ref_str = str(old_pat_id).strip()
            pn = old_id_to_pn.get(ref_str) or ref_str
            patient_uuid = by_pn.get(pn)

        if not patient_uuid and pat_name:
            patient_uuid = by_name.get(normalize_name(pat_name))

        if not patient_uuid:
            unmatched_count += 1
            patient_uuid = None
        else:
            matched_count += 1

        rx_uuid   = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.prescription.{old_pres_id}"))
        rx_number = f"RX-{str(old_pres_id).zfill(6)}"
        rx_date   = parse_date(date_raw, date_str, add_date_time)

        rx_notes_parts = []

        for i in range(10):
            suffix = "" if i == 0 else str(i)
            m_name  = row.get(f"medicine{suffix}_name") or row.get(f"medicine{suffix}")
            dosage  = row.get(f"dosage{suffix}") or row.get(f"dosage{suffix}_name")
            freq    = row.get(f"frequency{suffix}_name") or row.get(f"frequency{suffix}")
            instr   = row.get(f"instruction{suffix}_name") or row.get(f"instruction{suffix}")
            period  = row.get(f"period{suffix}")
            t_unit  = row.get(f"time{suffix}_name") or row.get(f"time{suffix}")
            route   = row.get(f"route{suffix}")
            advice  = row.get(f"advice{suffix}")

            if not m_name or m_name.strip() in ('', 'NULL', 'null', '0'):
                continue

            clean_mname = m_name.strip()
            clean_dosage= dosage.strip() if dosage and dosage.strip() not in ('', 'NULL', 'null', '0') else None
            clean_route = route.strip() if route and route.strip() not in ('', 'NULL', 'null', '0') else None

            med_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.medicine.{clean_mname.lower()}"))
            if med_uuid not in medicines_map:
                medicines_map[med_uuid] = {
                    "id":         med_uuid,
                    "branch_id":  BRANCH_ID,
                    "name":       clean_mname,
                    "dosage":     clean_dosage,
                    "route":      clean_route
                }

            # Build item advice text
            advice_parts = []
            if clean_dosage: advice_parts.append(f"Dosage: {clean_dosage}")
            if freq and freq.strip() not in ('', 'NULL', 'null', '0'): advice_parts.append(f"Freq: {freq.strip()}")
            if instr and instr.strip() not in ('', 'NULL', 'null', '0'): advice_parts.append(f"Instr: {instr.strip()}")
            if route and route.strip() not in ('', 'NULL', 'null', '0'): advice_parts.append(f"Route: {route.strip()}")
            if advice and advice.strip() not in ('', 'NULL', 'null', '0'): advice_parts.append(advice.strip())

            item_advice = " | ".join(advice_parts) if advice_parts else None

            item_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.prescription_item.{old_pres_id}.{i}"))
            items_list.append({
                "id":              item_uuid,
                "prescription_id": rx_uuid,
                "medicine_id":     med_uuid,
                "period":          str(period).strip() if period and str(period).strip() not in ('', 'NULL', 'null', '0') else None,
                "time_unit":       str(t_unit).strip() if t_unit and str(t_unit).strip() not in ('', 'NULL', 'null', '0') else "Days",
                "advice":          item_advice,
                "created_at":      rx_date
            })

            rx_notes_parts.append(f"{clean_mname}" + (f" ({item_advice})" if item_advice else ""))

        prescriptions_list.append({
            "id":                  rx_uuid,
            "branch_id":           BRANCH_ID,
            "patient_id":          patient_uuid,
            "prescription_number": rx_number,
            "prescription_date":   rx_date.split('T')[0] if 'T' in rx_date else rx_date.split(' ')[0],
            "notes":               "; ".join(rx_notes_parts)[:500] if rx_notes_parts else None,
            "status":              "active",
            "created_at":          rx_date
        })

    print(f"\nPrescriptions Parsed: {len(prescriptions_list)} (Matched Patient: {matched_count}, Unmatched: {unmatched_count})")
    print(f"Unique Medicines to Upsert  : {len(medicines_map)}")
    print(f"Prescription Items to Insert: {len(items_list)}")

    # 2. CLEAR TABLES IN SUPABASE
    print("\n--- Clearing prescription_items table in Supabase ---", flush=True)
    del_pi = requests.delete(f"{SUPABASE_URL}/rest/v1/prescription_items?id=neq.00000000-0000-0000-0000-000000000000", headers=HEADERS, timeout=30)
    print("Delete prescription_items response:", del_pi.status_code)

    print("--- Clearing prescriptions table in Supabase ---", flush=True)
    del_rx = requests.delete(f"{SUPABASE_URL}/rest/v1/prescriptions?id=neq.00000000-0000-0000-0000-000000000000", headers=HEADERS, timeout=30)
    print("Delete prescriptions response:", del_rx.status_code)

    # 3. UPSERT MEDICINES
    print(f"\nUpserting {len(medicines_map)} medicines into medicines table...", flush=True)
    med_list = list(medicines_map.values())
    r_med = requests.post(f"{SUPABASE_URL}/rest/v1/medicines?on_conflict=id", headers=HEADERS, json=med_list, timeout=30)
    print("Medicines upsert response:", r_med.status_code)

    # 4. BATCH INSERT PRESCRIPTIONS
    print(f"\nBatch inserting {len(prescriptions_list)} prescriptions...", flush=True)
    inserted_rx = 0
    for i in range(0, len(prescriptions_list), BATCH_SIZE):
        batch = prescriptions_list[i:i+BATCH_SIZE]
        ins_r = requests.post(f"{SUPABASE_URL}/rest/v1/prescriptions", headers=HEADERS, json=batch, timeout=60)
        if ins_r.status_code in (200, 201):
            inserted_rx += len(batch)
            print(f"  Inserted {inserted_rx}/{len(prescriptions_list)} prescriptions...")
        else:
            print(f"  Prescriptions Batch error: {ins_r.status_code} - {ins_r.text[:200]}")

    # 5. BATCH INSERT PRESCRIPTION ITEMS
    print(f"\nBatch inserting {len(items_list)} prescription items...", flush=True)
    inserted_items = 0
    for i in range(0, len(items_list), BATCH_SIZE):
        batch = items_list[i:i+BATCH_SIZE]
        ins_r = requests.post(f"{SUPABASE_URL}/rest/v1/prescription_items", headers=HEADERS, json=batch, timeout=60)
        if ins_r.status_code in (200, 201):
            inserted_items += len(batch)
            print(f"  Inserted {inserted_items}/{len(items_list)} prescription items...")
        else:
            print(f"  Prescription Items Batch error: {ins_r.status_code} - {ins_r.text[:200]}")

    print(f"\nSUCCESS! Successfully imported {inserted_rx} prescriptions and {inserted_items} prescription items.")

if __name__ == '__main__':
    main()
