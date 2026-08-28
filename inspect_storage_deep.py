import urllib.request, json

SUPABASE_URL = "https://cpyyclrhnyeibxlouwep.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q"

def list_folder(prefix=""):
    url = f"{SUPABASE_URL}/storage/v1/object/list/patient-files"
    req = urllib.request.Request(url, data=json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode("utf-8"),
                                headers={"apikey": KEY, "Authorization": "Bearer "+KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        print("Error listing prefix", prefix, ":", e)
        return []

root_items = list_folder("")
print(f"Root items in patient-files bucket: {len(root_items)}")
for item in root_items:
    if isinstance(item, dict):
        name = item.get("name")
        id_val = item.get("id")
        metadata = item.get("metadata")
        print(f"  Name: '{name}' | ID: {id_val} | Meta: {metadata}")
        # If item has no metadata, it might be a folder!
        if metadata is None:
            sub = list_folder(name + "/")
            print(f"    -> Folder '{name}/' contains {len(sub)} items:")
            for s in sub:
                if isinstance(s, dict):
                    print(f"       '{s.get('name')}'")
