import csv, os, sys, io, urllib.request, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

csv_path = r"c:\Users\Acer P16\Downloads\patient_files_2026-08-09 (2).csv"
if not os.path.exists(csv_path):
    csv_path = r"c:\Users\Acer P16\Desktop\patient_files_2026-08-09 (2).csv"

print(f"Reading CSV: {csv_path}")

with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
    reader = csv.reader(f)
    rows = list(reader)

print(f"Total rows in CSV: {len(rows)}")
for idx, r in enumerate(rows[:10]):
    print(f"Row {idx}: {r}")
