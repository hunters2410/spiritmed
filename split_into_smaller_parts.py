import os

DIR = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database"

def split_smaller():
    # Split Step 2 (Referrals) - 2,932 lines
    step2_file = os.path.join(DIR, "import_step2_referrals.sql")
    if os.path.exists(step2_file):
        with open(step2_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        header = lines[0] # BEGIN;
        insert_header = lines[2] # INSERT INTO...
        data_lines = lines[3:-1] # exclude COMMIT; and the last line
        
        chunk_size = 600
        part_num = 1
        for i in range(0, len(data_lines), chunk_size):
            chunk = data_lines[i:i+chunk_size]
            part_file = os.path.join(DIR, f"import_step2_referrals_part{part_num}.sql")
            with open(part_file, 'w', encoding='utf-8') as pf:
                pf.write("BEGIN;\n\n")
                pf.write(insert_header)
                # Write rows, make sure the last row ends with a semicolon instead of a comma
                for j, row in enumerate(chunk):
                    row_clean = row.strip()
                    if j == len(chunk) - 1:
                        if row_clean.endswith(','):
                            row_clean = row_clean[:-1]
                        pf.write(f"  {row_clean};\n")
                    else:
                        pf.write(f"  {row_clean}\n")
                pf.write("\nCOMMIT;\n")
            part_num += 1
            
    # Split Step 3 (Patients) - 8,132 lines
    step3_file = os.path.join(DIR, "import_step3_patients.sql")
    if os.path.exists(step3_file):
        with open(step3_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        header = lines[0] # BEGIN;
        insert_header = lines[2] # INSERT INTO...
        
        # Step 3 actually has multiple "INSERT INTO" statements (each chunk of 100 has its own statement!)
        # Let's verify this by checking if lines start with "INSERT INTO"
        # Since they already have "ON CONFLICT DO NOTHING;", we can just group them into sets of 8 INSERT statements (800 rows per file)
        data_blocks = []
        current_block = []
        for line in lines[2:-1]:
            current_block.append(line)
            if "ON CONFLICT" in line:
                data_blocks.append(current_block)
                current_block = []
        if current_block:
            data_blocks.append(current_block)
            
        chunk_blocks = 8 # 800 patients per file
        part_num = 1
        for i in range(0, len(data_blocks), chunk_blocks):
            chunk = data_blocks[i:i+chunk_blocks]
            part_file = os.path.join(DIR, f"import_step3_patients_part{part_num}.sql")
            with open(part_file, 'w', encoding='utf-8') as pf:
                pf.write("BEGIN;\n\n")
                for block in chunk:
                    pf.write("".join(block))
                pf.write("\nCOMMIT;\n")
            part_num += 1
    # Split Step 9 (Appointments)
    step9_file = os.path.join(DIR, "import_step9_appointments.sql")
    if os.path.exists(step9_file):
        with open(step9_file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        import re
        blocks = re.findall(r'(INSERT INTO appointments .*?;)', content, re.DOTALL)
        
        part_num = 1
        for block in blocks:
            part_file = os.path.join(DIR, f"import_step9_appointments_part{part_num}_appointments.sql")
            with open(part_file, 'w', encoding='utf-8') as pf:
                pf.write("BEGIN;\n\n")
                pf.write(block)
                pf.write("\n\nCOMMIT;\n")
            part_num += 1
        print(f"Successfully split appointments into {part_num - 1} part files!")

    # Split Step 10 (Billing and Payments)
    step10_file = os.path.join(DIR, "import_step10_billing_and_payments.sql")
    if os.path.exists(step10_file):
        with open(step10_file, 'r', encoding='utf-8') as f:
            content = f.read()
            
        import re
        invoice_blocks = re.findall(r'(INSERT INTO invoices .*?;)', content, re.DOTALL)
        item_blocks = re.findall(r'(INSERT INTO invoice_items .*?;)', content, re.DOTALL)
        payment_blocks = re.findall(r'(INSERT INTO payments .*?;)', content, re.DOTALL)
        
        part_num = 1
        for block in invoice_blocks:
            part_file = os.path.join(DIR, f"import_step10_billing_and_payments_part{part_num}_invoices.sql")
            with open(part_file, 'w', encoding='utf-8') as pf:
                pf.write("BEGIN;\n\n")
                pf.write(block)
                pf.write("\n\nCOMMIT;\n")
            part_num += 1
            
        for block in item_blocks:
            part_file = os.path.join(DIR, f"import_step10_billing_and_payments_part{part_num}_invoice_items.sql")
            with open(part_file, 'w', encoding='utf-8') as pf:
                pf.write("BEGIN;\n\n")
                pf.write(block)
                pf.write("\n\nCOMMIT;\n")
            part_num += 1
            
        for block in payment_blocks:
            part_file = os.path.join(DIR, f"import_step10_billing_and_payments_part{part_num}_payments.sql")
            with open(part_file, 'w', encoding='utf-8') as pf:
                pf.write("BEGIN;\n\n")
                pf.write(block)
                pf.write("\n\nCOMMIT;\n")
            part_num += 1
        print(f"Successfully split billing & payments into {part_num - 1} part files!")
            
    print("Successfully split referrals, patients, appointments and billing into small copy-pasteable files!")

if __name__ == '__main__':
    split_smaller()
