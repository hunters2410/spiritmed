import urllib.request, urllib.parse, json

SUPABASE_URL     = "https://cpyyclrhnyeibxlouwep.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

test_patches = [
    ("780999", "0001", None),
    ("570318", "0002", None),
    ("729237", "0010", None),
    ("853472", "1014", "phossil@yahoo.com"),
    ("213964", "1657", None),
]

for pn, fn, em in test_patches:
    data = {"file_number": fn}
    if em:
        data["email"] = em
    payload = json.dumps(data).encode()
    url = SUPABASE_URL + "/rest/v1/patients?patient_number=eq." + urllib.parse.quote(pn) + "&select=full_name,patient_number,file_number,email"
    req = urllib.request.Request(url, data=payload, headers=HEADERS, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = json.loads(r.read())
            if body:
                p = body[0]
                print("OK  PN=" + pn + "  file=" + str(p.get("file_number")) + "  name=" + str(p.get("full_name")) + "  email=" + str(p.get("email")))
            else:
                print("OK  PN=" + pn + " (no match in DB)")
    except Exception as e:
        print("ERR PN=" + pn + ": " + str(e))
