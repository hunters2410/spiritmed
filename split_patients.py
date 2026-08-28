"""
Split patients_supabase.sql into 4 smaller files for Supabase SQL editor.
Each part is run separately in Supabase SQL editor.
"""

INPUT  = r"C:\Users\Acer P16\Downloads\patients_supabase.sql"
BRANCH = "697a3863-1de7-4615-819c-45b0d7066d67"
PARTS  = 4

with open(INPUT, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.splitlines()
value_rows = []

for line in lines:
    stripped = line.strip()
    if stripped.startswith("('") or (stripped.startswith("(") and BRANCH in line):
        row = stripped.rstrip(',')
        value_rows.append(row)

print(f"Total value rows collected: {len(value_rows)}")

COLS = """  title, full_name, gender, date_of_birth, phone, email, address,
  file_number, patient_number, payment_method, medical_aid_number,
  medical_aid_main_member, allergies, chronic_conditions, status,
  next_of_kin_name, next_of_kin_phone, next_of_kin_relationship,
  occupation, branch_id, created_at"""

chunk_size = (len(value_rows) + PARTS - 1) // PARTS

for part in range(PARTS):
    start = part * chunk_size
    end   = min(start + chunk_size, len(value_rows))
    rows  = value_rows[start:end]

    out_path = r"C:\Users\Acer P16\Downloads\patients_part" + str(part+1) + ".sql"

    out = []
    out.append(f"-- Patient Import - Part {part+1} of {PARTS}")
    out.append(f"-- Rows {start+1} to {end} ({len(rows)} patients)")
    out.append(f"-- Branch: {BRANCH}")
    out.append("-- Run this in Supabase SQL Editor")
    out.append("")
    out.append("BEGIN;")
    out.append("")

    SUB = 200
    for i in range(0, len(rows), SUB):
        sub = rows[i:i+SUB]
        out.append("INSERT INTO patients (")
        out.append(COLS)
        out.append(") VALUES")
        for j, row in enumerate(sub):
            comma = ',' if j < len(sub) - 1 else ''
            out.append(f"  {row}{comma}")
        out.append("ON CONFLICT (patient_number) DO NOTHING;")
        out.append("")

    out.append("COMMIT;")
    out.append(f"-- Part {part+1} done: {len(rows)} patients")

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

    size_kb = len('\n'.join(out).encode('utf-8')) / 1024
    print(f"  Part {part+1}: {len(rows)} patients saved ({size_kb:.0f} KB)")

print("")
print("All 4 parts created in C:\\Users\\Acer P16\\Downloads\\")
print("Files: patients_part1.sql, patients_part2.sql, patients_part3.sql, patients_part4.sql")
print("Run them one at a time in Supabase SQL Editor (in order).")
