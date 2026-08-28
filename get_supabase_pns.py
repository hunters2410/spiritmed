import requests
import json
import os

URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
# Read anon key from .env
anon_key = ""
if os.path.exists(".env"):
    with open(".env", "r") as f:
        for line in f:
            if "VITE_SUPABASE_ANON_KEY" in line:
                anon_key = line.split("=")[1].strip()

def get_existing():
    if not anon_key:
        print("No anon key found")
        return
    
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json"
    }
    
    # Let's count existing patients
    res = requests.get(f"{URL}/rest/v1/patients?select=patient_number", headers=headers)
    if res.status_code == 200:
        data = res.json()
        print(f"Total patients in Supabase DB: {len(data)}")
        pns = [d['patient_number'] for d in data if d.get('patient_number')]
        print(f"First 10 patient numbers in DB: {pns[:10]}")
        # Save existing patient numbers to a file for comparison
        with open("existing_patient_numbers.json", "w") as f:
            json.dump(pns, f)
        print("Saved existing patient numbers to existing_patient_numbers.json")
    else:
        print(f"Failed to fetch: {res.status_code} - {res.text}")

if __name__ == '__main__':
    get_existing()
