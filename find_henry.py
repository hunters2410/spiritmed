with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patient (3).sql", "r", encoding="utf-8", errors="replace") as f:
    for line_num, line in enumerate(f, 1):
        if "Henry" in line or "henry" in line:
            print(f"Line {line_num}: {line[:150]}")
