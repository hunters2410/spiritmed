import re
import os

BASE_DIR = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database"
OUT_PROCEDURES_SQL = os.path.join(BASE_DIR, "import_step21_payment_procedures.sql")
OUT_BILLS_SQL = os.path.join(BASE_DIR, "import_step22_bills.sql")
OUT_ITEMS_SQL = os.path.join(BASE_DIR, "import_step23_bill_items.sql")
OUT_PAYMENTS_SQL = os.path.join(BASE_DIR, "import_step24_payments.sql")
OUT_PATIENT_DUES_SQL = os.path.join(BASE_DIR, "import_step25_update_patient_dues.sql")

def run_verification():
    print("=== VERIFYING GENERATED SQL MIGRATION FILES ===")
    
    # 1. Procedures Verification
    with open(OUT_PROCEDURES_SQL, 'r', encoding='utf-8') as f:
        proc_content = f.read()
    proc_matches = len(re.findall(r"\('[a-f0-9\-]+',", proc_content))
    print(f"1. Procedures SQL ({os.path.basename(OUT_PROCEDURES_SQL)}):")
    print(f"   - Total Procedures Inserted: {proc_matches} (Expected: 166)")
    assert proc_matches == 166, f"Expected 166 procedures, got {proc_matches}"
    
    # 2. Bills Verification
    with open(OUT_BILLS_SQL, 'r', encoding='utf-8') as f:
        bills_content = f.read()
    bill_rows_count = bills_content.count("'BILL-")
    print(f"2. Bills SQL ({os.path.basename(OUT_BILLS_SQL)}):")
    print(f"   - Total Bills Inserted: {bill_rows_count} (Expected: 8,316)")
    assert bill_rows_count == 8316, f"Expected 8316 bills, got {bill_rows_count}"
    
    # 3. Bill Items Verification
    with open(OUT_ITEMS_SQL, 'r', encoding='utf-8') as f:
        items_content = f.read()
    item_rows_count = len(re.findall(r"  \('[a-f0-9\-]+', '[a-f0-9\-]+',", items_content))
    print(f"3. Bill Items SQL ({os.path.basename(OUT_ITEMS_SQL)}):")
    print(f"   - Total Itemized Breakdown Rows Inserted: {item_rows_count}")
    assert item_rows_count >= 8316, f"Expected at least 8316 items, got {item_rows_count}"
    
    # 4. Payments Verification
    with open(OUT_PAYMENTS_SQL, 'r', encoding='utf-8') as f:
        payments_content = f.read()
    pay_rows_count = payments_content.count("'PAY-")
    print(f"4. Payments SQL ({os.path.basename(OUT_PAYMENTS_SQL)}):")
    print(f"   - Total Payment Transactions Inserted: {pay_rows_count}")
    
    # 5. Patient Dues SQL Verification
    with open(OUT_PATIENT_DUES_SQL, 'r', encoding='utf-8') as f:
        dues_content = f.read()
    print(f"5. Patient Dues SQL ({os.path.basename(OUT_PATIENT_DUES_SQL)}):")
    print("   - ALTER TABLE & UPDATE outstanding_balance query present: Yes")
    assert "ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS outstanding_balance" in dues_content
    assert "UPDATE public.patients p" in dues_content
    
    print("\n[SUCCESS] ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    run_verification()
