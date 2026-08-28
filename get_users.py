import requests
import os

URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
anon_key = ""
if os.path.exists(".env"):
    with open(".env", "r") as f:
        for line in f:
            if "VITE_SUPABASE_ANON_KEY" in line:
                anon_key = line.split("=")[1].strip()

def get_users():
    if not anon_key:
        print("No anon key found")
        return
    
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json"
    }
    
    res = requests.get(f"{URL}/rest/v1/users?select=id,full_name,email,role", headers=headers)
    if res.status_code == 200:
        data = res.json()
        print(f"Total Users in Supabase: {len(data)}")
        for u in data:
            print(f" - ID: {u['id']} | Name: {u['full_name']} | Email: {u['email']} | Role: {u['role']}")
    else:
        print(f"Failed to fetch: {res.status_code} - {res.text}")

if __name__ == '__main__':
    get_users()
