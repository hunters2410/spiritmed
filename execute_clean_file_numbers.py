import requests
from concurrent.futures import ThreadPoolExecutor

url = 'https://cpyyclrhnyeibxlouwep.supabase.co'
service_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'
headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}', 'Content-Type': 'application/json'}

def clean_patient(p):
    p_id, clean_fn = p
    try:
        r = requests.patch(f"{url}/rest/v1/patients?id=eq.{p_id}", headers=headers, json={'file_number': clean_fn})
        return r.status_code == 204
    except:
        return False

def main():
    print("Fetching patients with hyphenated file_number...")
    to_clean = []
    from_idx = 0
    page_size = 1000
    
    while True:
        r = requests.get(f'{url}/rest/v1/patients?file_number=like.*-*&select=id,file_number&range={from_idx}-{from_idx+page_size-1}', headers=headers)
        if r.status_code != 200 or not r.json():
            break
        rows = r.json()
        for r_item in rows:
            fn = r_item.get('file_number')
            if fn and '-' in fn:
                clean_fn = fn.split('-')[0].strip()
                if clean_fn:
                    to_clean.append((r_item['id'], clean_fn))
        if len(rows) < page_size:
            break
        from_idx += page_size

    print(f"Total hyphenated file_numbers found to clean: {len(to_clean)}")
    if to_clean:
        print("Cleaning file numbers in parallel using 40 worker threads...")
        with ThreadPoolExecutor(max_workers=40) as executor:
            res = list(executor.map(clean_patient, to_clean))
        print(f"Successfully cleaned {res.count(True)}/{len(to_clean)} patient file numbers!")

    # Verify Patrick Mhembere
    r_check = requests.get(f'{url}/rest/v1/patients?full_name=ilike.*Patrick Mhembere*&select=id,full_name,patient_number,file_number', headers=headers)
    print("Patrick Mhembere verification:", r_check.json())

if __name__ == "__main__":
    main()
