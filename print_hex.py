with open(r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\import_step2_referrals.sql", "rb") as f:
    lines = f.readlines()
line_959_bytes = lines[958] # 0-indexed
print(f"Line 959 bytes: {line_959_bytes}")
print(f"Line 959 hex: {line_959_bytes.hex()}")
