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

BRANCH_ID  = "697a3863-1de7-4615-819c-45b0d7066d67"
MH_SQL      = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\medicalhistory (1).sql"
PATIENT_SQL = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database 4\patient (8).sql"

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

def parse_date(raw, actualdate_raw=None):
    if raw and str(raw).strip().isdigit() and len(str(raw).strip()) == 10:
        try:
            d = datetime.fromtimestamp(int(raw))
            if 1990 <= d.year <= 2030:
                return d.strftime('%Y-%m-%d %H:%M:%S+00')
        except:
            pass

    if actualdate_raw and str(actualdate_raw).strip() not in ('', 'NULL', 'null'):
        ds = str(actualdate_raw).strip()
        for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y']:
            try:
                d = datetime.strptime(ds, fmt)
                if 1990 <= d.year <= 2030:
                    return d.strftime('%Y-%m-%d 00:00:00+00')
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

    # 1. Parse medicalhistory (1).sql
    print(f"\nParsing {MH_SQL}...", flush=True)
    with open(MH_SQL, 'r', encoding='utf-8', errors='replace') as f:
        mh_content = f.read()
    mh_tuples = extract_tuples(mh_content, 'medicalhistory')
    print(f"Found {len(mh_tuples)} tuples in medicalhistory (1).sql", flush=True)

    consultations_to_import = []
    diagnoses_to_upsert     = {}
    complaints_to_upsert    = {}
    investigations_to_upsert= {}

    matched_count = 0
    unmatched_count = 0

    for t in mh_tuples:
        cols = [unquote(v) for v in split_values(t)]
        while len(cols) < 45: cols.append(None)

        old_mh_id       = cols[0]
        old_pat_id      = cols[1]
        title           = cols[2]
        description     = cols[3]
        patient_name    = cols[4]
        date_raw        = cols[8]
        doctor_raw      = cols[10]
        icd10_name      = cols[11]
        treatment_plan  = cols[20] or cols[12]
        allergies       = cols[13]
        period          = cols[14] or cols[37]
        time_val        = cols[16] or cols[22] or cols[36]
        diag_val        = cols[17] or cols[25] or cols[11] or cols[24]
        complaint_val   = cols[18] or cols[26] or cols[2]
        investigation_val=cols[19] or cols[27]
        observation_val = cols[23] or cols[28]
        medicine_val    = cols[30] or cols[29]
        instruction_val = cols[34] or cols[33]
        remarks_val     = cols[38]
        actualdate_val  = cols[40]

        # Patient UUID Resolution
        patient_uuid = None
        if old_pat_id:
            ref_str = str(old_pat_id).strip()
            pn = old_id_to_pn.get(ref_str) or ref_str
            patient_uuid = by_pn.get(pn)

        if not patient_uuid and patient_name:
            patient_uuid = by_name.get(normalize_name(patient_name))

        if not patient_uuid:
            unmatched_count += 1
            patient_uuid = None
        else:
            matched_count += 1

        c_date = parse_date(date_raw, actualdate_val)
        c_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.consultation.{old_mh_id}"))

        # Build Notes / Additional History
        notes_parts = []
        if allergies and allergies.strip() not in ('-', 'None', 'NULL'):
            notes_parts.append(f"Allergies: {allergies.strip()}")
        if medicine_val and medicine_val.strip() not in ('-', 'None', 'NULL'):
            med_str = f"Medication: {medicine_val.strip()}"
            if instruction_val: med_str += f" ({instruction_val.strip()})"
            notes_parts.append(med_str)
        if remarks_val and remarks_val.strip() not in ('-', 'None', 'NULL'):
            notes_parts.append(f"Remarks: {remarks_val.strip()}")

        notes_combined = " | ".join(notes_parts) if notes_parts else None

        consultations_to_import.append({
            "id":                   c_uuid,
            "branch_id":            BRANCH_ID,
            "patient_id":           patient_uuid,
            "consultation_date":    c_date,
            "chief_complaint":      complaint_val.strip() if complaint_val and complaint_val.strip() not in ('-', 'None', 'NULL') else None,
            "history":              description.strip() if description and description.strip() not in ('-', 'None', 'NULL') else None,
            "examination":          observation_val.strip() if observation_val and observation_val.strip() not in ('-', 'None', 'NULL') else None,
            "diagnosis":            diag_val.strip() if diag_val and diag_val.strip() not in ('-', 'None', 'NULL') else None,
            "treatment_plan":       treatment_plan.strip() if treatment_plan and treatment_plan.strip() not in ('-', 'None', 'NULL') else None,
            "investigations":       investigation_val.strip() if investigation_val and investigation_val.strip() not in ('-', 'None', 'NULL') else None,
            "follow_up_period":     str(period).strip() if period and str(period).strip() not in ('-', 'None', 'NULL') else None,
            "follow_up_time":       str(time_val).strip() if time_val and str(time_val).strip() not in ('-', 'None', 'NULL') else None,
            "notes":                notes_combined,
            "status":               "completed",
            "created_at":           c_date
        })

        # Collect unique diagnoses, complaints, investigations for matching lookup tables
        if diag_val and diag_val.strip() not in ('-', 'None', 'NULL'):
            d_name = diag_val.strip()
            icd_code = icd10_name.strip() if icd10_name and icd10_name.strip() not in ('-', 'None', 'NULL') else None
            if d_name not in diagnoses_to_upsert:
                diagnoses_to_upsert[d_name] = {
                    "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.diagnosis.{d_name}")),
                    "branch_id": BRANCH_ID,
                    "name": d_name,
                    "icd10_code": icd_code,
                    "description": f"Imported Diagnosis: {d_name}"
                }

        if complaint_val and complaint_val.strip() not in ('-', 'None', 'NULL'):
            c_name = complaint_val.strip()
            if c_name not in complaints_to_upsert:
                complaints_to_upsert[c_name] = {
                    "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.complaint.{c_name}")),
                    "branch_id": BRANCH_ID,
                    "name": c_name,
                    "description": f"Imported Chief Complaint: {c_name}"
                }

        if investigation_val and investigation_val.strip() not in ('-', 'None', 'NULL'):
            i_name = investigation_val.strip()
            if i_name not in investigations_to_upsert:
                investigations_to_upsert[i_name] = {
                    "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, f"spiritmed.investigation.{i_name}")),
                    "branch_id": BRANCH_ID,
                    "name": i_name
                }

    print(f"Consultations Parsed: {len(consultations_to_import)} (Matched Patient: {matched_count}, Unmatched: {unmatched_count})")
    print(f"Unique Diagnoses to Upsert     : {len(diagnoses_to_upsert)}")
    print(f"Unique Complaints to Upsert    : {len(complaints_to_upsert)}")
    print(f"Unique Investigations to Upsert: {len(investigations_to_upsert)}")

    # 2. CLEAR & IMPORT INTO SUPABASE
    print("\n--- Clearing consultations table in Supabase ---", flush=True)
    del_c = requests.delete(f"{SUPABASE_URL}/rest/v1/consultations?id=neq.00000000-0000-0000-0000-000000000000", headers=HEADERS, timeout=30)
    print("Clear consultations response:", del_c.status_code)

    # 3. UPSERT DIAGNOSES LOOKUP TABLE
    if diagnoses_to_upsert:
        diag_list = list(diagnoses_to_upsert.values())
        print(f"Upserting {len(diag_list)} diagnoses into diagnoses table...", flush=True)
        r_diag = requests.post(f"{SUPABASE_URL}/rest/v1/diagnoses?on_conflict=id", headers=HEADERS, json=diag_list, timeout=30)
        print("Diagnoses upsert response:", r_diag.status_code)

    # 4. UPSERT COMPLAINTS LOOKUP TABLE
    if complaints_to_upsert:
        comp_list = list(complaints_to_upsert.values())
        print(f"Upserting {len(comp_list)} complaints into complaints table...", flush=True)
        r_comp = requests.post(f"{SUPABASE_URL}/rest/v1/complaints?on_conflict=id", headers=HEADERS, json=comp_list, timeout=30)
        print("Complaints upsert response:", r_comp.status_code)

    # 5. UPSERT INVESTIGATIONS LOOKUP TABLE
    if investigations_to_upsert:
        inv_list = list(investigations_to_upsert.values())
        print(f"Upserting {len(inv_list)} investigations into investigations table...", flush=True)
        r_inv = requests.post(f"{SUPABASE_URL}/rest/v1/investigations?on_conflict=id", headers=HEADERS, json=inv_list, timeout=30)
        print("Investigations upsert response:", r_inv.status_code)

    # 6. INSERT CONSULTATIONS
    print(f"\nBatch inserting {len(consultations_to_import)} consultations...", flush=True)
    r_cons = requests.post(f"{SUPABASE_URL}/rest/v1/consultations", headers=HEADERS, json=consultations_to_import, timeout=60)
    if r_cons.status_code in (200, 201):
        print(f"SUCCESS! Successfully inserted {len(consultations_to_import)} consultations.")
    else:
        print(f"Consultations Insert Error: {r_cons.status_code} - {r_cons.text[:300]}")

if __name__ == '__main__':
    main()
