import os

IMPORT_FILE = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\patients_import.sql"
DIR = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database"

def split():
    if not os.path.exists(IMPORT_FILE):
        return
        
    with open(IMPORT_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    # Find divisions
    med_aids_lines = []
    referral_lines = []
    patient_lines = []
    
    current_section = None
    
    for line in lines:
        if "-- ─── 1. Insert Medical Aids ───" in line:
            current_section = 'med_aids'
            continue
        elif "-- ─── 2. Insert Referral Doctors ───" in line:
            current_section = 'referrals'
            continue
        elif "-- ─── 3. Insert Patients ───" in line:
            current_section = 'patients'
            continue
            
        if current_section == 'med_aids':
            med_aids_lines.append(line)
        elif current_section == 'referrals':
            referral_lines.append(line)
        elif current_section == 'patients':
            patient_lines.append(line)
            
    # Write Step 1
    with open(os.path.join(DIR, "import_step1_medical_aids.sql"), "w", encoding="utf-8") as f:
        f.write("BEGIN;\n\n")
        f.write("".join(med_aids_lines))
        f.write("\nCOMMIT;\n")
        
    # Write Step 2
    with open(os.path.join(DIR, "import_step2_referrals.sql"), "w", encoding="utf-8") as f:
        f.write("BEGIN;\n\n")
        f.write("".join(referral_lines))
        f.write("\nCOMMIT;\n")
        
    # Write Step 3
    with open(os.path.join(DIR, "import_step3_patients.sql"), "w", encoding="utf-8") as f:
        f.write("BEGIN;\n\n")
        f.write("".join(patient_lines))
        f.write("\nCOMMIT;\n")
        
    print("Successfully split import script into 3 steps!")

if __name__ == '__main__':
    split()
