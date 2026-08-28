with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step2_referrals.sql", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f, 1):
        if "henry" in line.lower():
            print(f"Line {idx}: {repr(line)}")
