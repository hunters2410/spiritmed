with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patients_import.sql", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f, 1):
        if "\\" in line:
            print(f"Line {idx}: {repr(line)}")
