# -*- coding: utf-8 -*-
import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BRANCH_ID = "697a3863-1de7-4615-819c-45b0d7066d67"

REAL_OLD = {
    "estere chivasa","matienga kamota","ayden mazambani","ethan mukudzeyi chikomo",
    "andrew nemapare","netty motsi","robinson mshoperi","ernest zharo","annie muchafa",
    "fadzai mushipe","norest chikamba","gilbert njunga","davina nakai masanga",
    "stephen chisadza","goldberg rindayi chimonyo","felix tachiona","test patient",
    "daniel shumba","easter tsikwaurere","lloyd farai dongo","erina imbayago",
    "ephraim chihota","ottilia magaya","stanslous paraffin","ernest kubvoruno",
    "nqobile dube","naome uwimbabazi","alex mapfuti","trevor h spiers","vimbainashe p chimuti"
}

def map_status(raw):
    if not raw or raw.strip() == "": return "active"
    r = raw.strip()
    if r in ("Alive","alive"): return "active"
    if r in ("Discharged","discharged"): return "discharged"
    if r in ("Deceased","deceased"): return "deceased"
    return "active"

def parse_date(s):
    if not s or s.strip() in ("","NULL"): return None
    from datetime import datetime
    for fmt in ["%d-%m-%Y","%Y-%m-%d","%m/%d/%Y","%d/%m/%Y"]:
        try: return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except: pass
    return None

def esc(v):
    if v is None: return "NULL"
    return "'" + str(v).replace("'","''").replace("\\","\\\\")[:500] + "'"

def parse_row(line):
    line = line.strip().rstrip(",;)")
    if not line.startswith("("): return None
    line = line[1:]
    fields = []; i = 0
    while i < len(line):
        if line[i:i+4] == "NULL":
            fields.append(None); i += 4
            if i < len(line) and line[i] == ",": i += 1
        elif line[i] == "'":
            j = i+1; val = []
            while j < len(line):
                if line[j] == "\\" and j+1 < len(line): val.append(line[j+1]); j += 2
                elif line[j] == "'": j += 1; break
                else: val.append(line[j]); j += 1
            fields.append("".join(val)); i = j
            if i < len(line) and line[i] == ",": i += 1
        elif line[i] in "0123456789-":
            j = i
            while j < len(line) and line[j] not in ",)": j += 1
            fields.append(line[i:j]); i = j
            if i < len(line) and line[i] == ",": i += 1
        else: i += 1
    return fields

print("Reading SQL dump...", file=sys.stderr)
with open(r"database 4\patient (8).sql", "r", encoding="utf-8", errors="replace") as f:
    lines = f.readlines()

rows = []; used_fn = set(); used_emails = set()
for line in lines:
    s = line.strip()
    if not (s.startswith("(") and (s.endswith("),") or s.endswith(");"))): continue
    f = parse_row(s)
    if not f or len(f) < 52: continue

    name       = (f[2] or "").strip()
    patient_id = (f[12] or "").strip()
    if not name or not patient_id: continue

    phone      = (f[6] or "").strip() or None
    sex        = (f[7] or "").strip()
    dob        = parse_date(f[8])
    blood      = (f[10] or "").strip() or None
    address    = (f[5] or "").strip() or None
    occ        = (f[20] or "").strip() or None
    allerg     = (f[21] or "").strip() or None
    chronic    = (f[22] or "").strip() or None
    nat_id     = (f[26] or "").strip() or None
    nok_name   = (f[29] or "").strip() or None
    nok_phone  = (f[32] or "").strip() or None
    nok_rel    = (f[35] or "").strip() or None
    raw_fn     = (f[45] or "").strip()
    raw_status = f[51] if len(f) > 51 else ""

    file_number = raw_fn if raw_fn and raw_fn not in used_fn else None
    if file_number: used_fn.add(file_number)

    gender = None
    if sex:
        sl = sex.strip().lower()
        if sl in ("male","m"): gender = "Male"
        elif sl in ("female","f"): gender = "Female"

    name_lower = name.lower().strip()
    status = "inactive" if name_lower in REAL_OLD else map_status(raw_status if isinstance(raw_status,str) else "")

    email = f"legacy.{patient_id}@spiritmed.local"
    if email in used_emails: email = f"legacy.{patient_id}.{len(rows)}@spiritmed.local"
    used_emails.add(email)

    rows.append((patient_id, name, email, phone, gender, dob, address, blood,
                 occ, allerg, chronic, nat_id, file_number, status,
                 nok_name, nok_phone, nok_rel))

print(f"Parsed {len(rows)} patients", file=sys.stderr)

# Write SQL file
out_path = r"database 4\patients_fresh_import.sql"
with open(out_path, "w", encoding="utf-8") as out:
    out.write("-- FRESH PATIENT IMPORT\n")
    out.write("-- Run this in Supabase SQL Editor\n")
    out.write("-- Step 1: Clear all dependent tables first, then patients\n\n")
    out.write("TRUNCATE TABLE appointments CASCADE;\n")
    out.write("TRUNCATE TABLE vital_signs CASCADE;\n")
    out.write("TRUNCATE TABLE patient_files CASCADE;\n")
    out.write("TRUNCATE TABLE prescriptions CASCADE;\n")
    out.write("TRUNCATE TABLE consultations CASCADE;\n")
    out.write("TRUNCATE TABLE bill_items CASCADE;\n")
    out.write("TRUNCATE TABLE payments CASCADE;\n")
    out.write("TRUNCATE TABLE bills CASCADE;\n")
    out.write("TRUNCATE TABLE patients CASCADE;\n\n")
    out.write("-- Step 2: Insert all 8484 patients\n")
    out.write("INSERT INTO patients\n")
    out.write("  (patient_number,full_name,email,phone,gender,date_of_birth,address,blood_group,\n")
    out.write("   occupation,allergies,chronic_medications,national_id,file_number,status,\n")
    out.write("   next_of_kin_name,next_of_kin_phone,next_of_kin_relationship,branch_id,created_at)\nVALUES\n")

    for idx, r in enumerate(rows):
        pid,name,email,phone,gender,dob,addr,blood,occ,allerg,chronic,nat_id,fn,status,nok_name,nok_phone,nok_rel = r
        line = (
            f"  ({esc(pid)},{esc(name)},{esc(email)},{esc(phone)},{esc(gender)},{esc(dob)},"
            f"{esc(addr)},{esc(blood)},{esc(occ)},{esc(allerg)},{esc(chronic)},{esc(nat_id)},"
            f"{esc(fn)},{esc(status)},{esc(nok_name)},{esc(nok_phone)},{esc(nok_rel)},"
            f"'{BRANCH_ID}','2023-07-11T00:00:00Z')"
        )
        if idx < len(rows)-1: line += ","
        out.write(line + "\n")
    out.write(";\n")

print(f"SQL file written: {out_path}", file=sys.stderr)
import os
size_mb = os.path.getsize(out_path) / 1024 / 1024
print(f"File size: {size_mb:.1f} MB", file=sys.stderr)