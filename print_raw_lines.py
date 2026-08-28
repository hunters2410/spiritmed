with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step2_referrals.sql", "r", encoding="utf-8") as f:
    lines = f.readlines()
for idx in range(954, 965):
    print(f"Line {idx+1}: {repr(lines[idx])}")
