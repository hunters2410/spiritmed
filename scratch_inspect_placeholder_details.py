import scratch_find_placeholders

all_rows = scratch_find_placeholders.all_rows
split = scratch_find_placeholders.split_values
unquote = scratch_find_placeholders.unquote
re = scratch_find_placeholders.re

print("=== Detailed inspection of placeholder rows in patient (5).sql ===")
count = 0
for row_str in all_rows:
    cols = [unquote(v) for v in split(row_str)]
    if len(cols) > 2:
        name = cols[2]
        if name and re.match(r'^patient\s*\d*$', str(name).strip(), re.IGNORECASE):
            count += 1
            if count <= 8:
                print(f"\n--- Placeholder #{count}: {name} (MySQL ID: {cols[0]}) ---")
                print(f"  patient_id       : {cols[12]}")
                print(f"  filenumber       : {cols[45]}")
                print(f"  phone            : {cols[6]}")
                print(f"  email            : {cols[3]}")
                print(f"  address          : {cols[5]}")
                print(f"  birthdate        : {cols[8]}")
                print(f"  doctor           : {cols[4]}")
                print(f"  how_added        : {cols[15]}")
                print(f"  add_date         : {cols[13]}")
                print(f"  medical_aid      : {cols[28]}")
