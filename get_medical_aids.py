import requests
import os

URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
anon_key = ""
if os.path.exists(".env"):
    with open(".env", "r") as f:
        for line in f:
            if "VITE_SUPABASE_ANON_KEY" in line:
                anon_key = line.split("=")[1].strip()

def get_meds():
    if not anon_key:
        return
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
    }
    res = requests.get(f"{URL}/rest/v1/medical_aids?select=id,name", headers=headers)
    if res.status_code == 200:
        print(f"Medical Aids: {res.json()}")
    else:
        print(f"Failed: {res.status_code}")

if __name__ == '__main__':
    get_meds()
