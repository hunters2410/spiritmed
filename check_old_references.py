import re

def analyze_insert_samples(dump_path, target_tables):
    samples = {}
    
    insert_into_re = re.compile(r'^\s*INSERT INTO\s+`([^`]+)`\s+(?:\([^)]+\)\s+)?VALUES\s*(.*)$', re.IGNORECASE)
    
    with open(dump_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            match = insert_into_re.match(line)
            if match:
                table_name = match.group(1)
                if table_name in target_tables and table_name not in samples:
                    # Capture the line and a few subsequent lines if it continues
                    lines_captured = [line]
                    if not line.strip().endswith(';'):
                        for _ in range(5):
                            next_line = next(f, '')
                            lines_captured.append(next_line)
                            if next_line.strip().endswith(';'):
                                break
                    samples[table_name] = "".join(lines_captured)[:2000] # keep it readable
                    
            if len(samples) == len(target_tables):
                break
                
    return samples

def main():
    dump_path = r"C:\Users\Acer P16\Documents\Spiritmed\hospital update\database\u819957882_urocaresystem (16).sql"
    target_tables = [
        'admission', 'medicalhistory', 'pres', 'referral', 
        'patient_deposit', 'patient_material', 'odontogram'
    ]
    
    samples = analyze_insert_samples(dump_path, target_tables)
    
    with open("data_samples_inspected.txt", "w", encoding="utf-8") as out:
        for table, sample in sorted(samples.items()):
            out.write(f"=== SAMPLE DATA FOR: {table} ===\n")
            out.write(sample)
            out.write("\n\n")
            
    print("Samples written to data_samples_inspected.txt")

if __name__ == '__main__':
    main()
