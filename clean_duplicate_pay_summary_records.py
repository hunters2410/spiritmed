"""
clean_duplicate_pay_summary_records.py
======================================
Removes the redundant PAY- summary payment rows created from payment (10).sql header summaries,
leaving the exact itemized DEP- deposit receipts from patient_deposit (6).sql.
"""

import requests

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

def main():
    print("=== Step 1: Deleting redundant PAY- summary payment rows ===", flush=True)
    r_del = requests.delete(
        f"{SUPABASE_URL}/rest/v1/payments?reference_number=like.PAY-*",
        headers=HEADERS
    )
    print(f"Delete PAY- status: {r_del.status_code}", flush=True)

    # Check remaining payments
    r_rem = requests.get(
        f"{SUPABASE_URL}/rest/v1/payments?select=count",
        headers={**HEADERS, "Prefer": "count=exact"}
    )
    print(f"Remaining payments in Supabase: {r_rem.headers.get('content-range', 'N/A')}", flush=True)

    # Check Fidelis Disderio Marimo
    pid = "1748fbd8-b132-5446-9fa8-da5ed22c3198"
    r_fidelis = requests.get(
        f"{SUPABASE_URL}/rest/v1/payments?patient_id=eq.{pid}&select=id,reference_number,amount,notes,payment_date",
        headers=HEADERS
    )
    print("\nFidelis Disderio Marimo updated payment ledger:")
    for p in r_fidelis.json():
        print("  ", p)

if __name__ == '__main__':
    main()
