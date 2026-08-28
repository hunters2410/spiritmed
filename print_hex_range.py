with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step2_referrals.sql", "rb") as f:
    lines = f.readlines()
for idx in range(954, 962):
    line_bytes = lines[idx]
    print(f"Line {idx+1}: {repr(line_bytes)}")
    # Print if backslash or other control characters are present (except \r, \n)
    for b in line_bytes:
        if b == 92: # ord('\\')
            print(f"  --> FOUND BACKSLASH IN LINE {idx+1}!")
        elif b < 32 and b not in (10, 13):
            print(f"  --> FOUND CONTROL CHAR {b} IN LINE {idx+1}!")
