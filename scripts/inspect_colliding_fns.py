import re
import os
import requests
import json

SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json'
}

# Fetch patients who have file_number = 0845, 1014, 1502, 1645, 1657
test_fns = ['0845', '1014', '1502', '1645', '1657']
for fn in test_fns:
    r = requests.get(f'{SUPABASE_URL}/rest/v1/patients?file_number=eq.{fn}&select=id,patient_number,full_name,file_number,created_at,status', headers=headers)
    print(f'Supabase patients with file_number={fn}:')
    print(json.dumps(r.json(), indent=2))
