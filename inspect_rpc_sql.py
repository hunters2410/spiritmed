import urllib.request
import json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

# Query pg_proc to get source code of create_user_profile
sql = """
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'create_user_profile';
"""

# Let's call rest/v1/ with SQL if available or execute via custom script
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/rpc/get_patient_balances", # test an rpc
    headers={
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}"
    }
)
print("Testing RPC connection...")
