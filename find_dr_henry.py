with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step2_referrals.sql", "r", encoding="utf-8", errors="replace") as f:
    for line_num, line in enumerate(f, 1):
        if "Dr Henry" in line:
            print(f"Line {line_num}: {repr(line)}")
