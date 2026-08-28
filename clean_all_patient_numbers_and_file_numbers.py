import requests
from concurrent.futures import ThreadPoolExecutor

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'
headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}', 'Content-Type': 'application/json'}

def clean_patient_record(item):
    p_id, clean_fn, clean_pno = item
    payload = {}
    if clean_fn is not None:
        payload['file_number'] = clean_fn
    if clean_pno is not None:
        payload['patient_number'] = clean_pno

    if not payload:
        return True

    try:
        r = requests.patch(f"{url}/rest/v1/patients?id=eq.{p_id}", headers=headers, json=payload)
        return r.status_code in (200, 204)
    except:
        return False

def main():
    print("=== FETCHING ALL PATIENTS FROM SUPABASE ===")
    all_patients = []
    from_idx = 0
    page_size = 1000

    while True:
        r = requests.get(f'{url}/rest/v1/patients?select=id,full_name,file_number,patient_number', headers={**headers, 'Range': f'{from_idx}-{from_idx+page_size-1}'})
        if r.status_code not in (200, 206) or not r.json():
            break
        rows = r.json()
        all_patients.extend(rows)
        if len(rows) < page_size:
            break
        from_idx += page_size

    print(f"Loaded {len(all_patients)} total patients from Supabase.")

    to_update = []
    for p in all_patients:
        p_id = p['id']
        fn = p.get('file_number')
        pno = p.get('patient_number')

        clean_fn = None
        clean_pno = None

        if fn and '-' in str(fn):
            clean_fn = str(fn).split('-')[0].strip()

        if pno and '-' in str(pno):
            clean_pno = str(pno).split('-')[0].strip()

        if clean_fn is not None or clean_pno is not None:
            to_update.append((p_id, clean_fn, clean_pno))

    print(f"Found {len(to_update)} patients requiring file_number or patient_number cleaning.")

    if to_update:
        print("Cleaning patient numbers and file numbers in parallel (40 worker threads)...")
        with ThreadPoolExecutor(max_workers=40) as executor:
            res = list(executor.map(clean_patient_record, to_update))
        print(f"Successfully updated {res.count(True)}/{len(to_update)} patient records!")

    # Verify sample patients
    print("\nVerifying sample patients:")
    r_check = requests.get(f'{url}/rest/v1/patients?full_name=ilike.*Mwakutuya*&select=id,full_name,patient_number,file_number', headers=headers)
    print("  Arthur Mwakutuya:", r_check.json())

    r_check2 = requests.get(f'{url}/rest/v1/patients?full_name=ilike.*Munyaradzi Chikondo*&select=id,full_name,patient_number,file_number', headers=headers)
    print("  Munyaradzi Chikondo:", r_check2.json())

if __name__ == "__main__":
    main()
