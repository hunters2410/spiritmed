dump_path = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database\u819957882_urocaresystem (16).sql"

with open(dump_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for i in range(18913, min(18950, len(lines))):
    print(f"{i+1}: {lines[i].strip()}")
