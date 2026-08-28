import requests
import json
from concurrent.futures import ThreadPoolExecutor

SUPABASE_URL = 'https://cpyyclrhnyeibxlouwep.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXljbHJobnllaWJ4bG91d2VwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTg4NDc3OSwiZXhwIjoyMDk1NDYwNzc5fQ.Cu5oTjaAEZ5LVOpu-p5YfP_xXNtJe9SIV_37bAk5w9Q'

headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json'
}

def fetch_all_supabase():
    sp_patients = []
    limit = 1000
    offset = 0
    while True:
        h = headers.copy()
        h['Range'] = f'{offset}-{offset + limit - 1}'
        url = f'{SUPABASE_URL}/rest/v1/patients?select=id,patient_number,full_name,file_number,status,branch_id'
        r = requests.get(url, headers=h)
        data = r.json()
        if not data or not isinstance(data, list): break
        sp_patients.extend(data)
        if len(data) < limit: break
        offset += limit
    return sp_patients

def patch_release_patient(p):
    p_id = p['id']
    try:
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/patients?id=eq.{p_id}",
            headers=headers,
            json={'file_number': None}
        )
        return r.status_code in (200, 204), p_id, p['full_name'], p['file_number'], p['status']
    except Exception as e:
        return False, p_id, p['full_name'], p['file_number'], str(e)

def main():
    print("==========================================================")
    print("     RELEASE FILE NUMBERS FOR OLD, DISCHARGED, DECEASED   ")
    print("==========================================================\n")

    print("Fetching all patients from Supabase...")
    sp_patients = fetch_all_supabase()
    print(f"Total patients: {len(sp_patients)}")

    active_patients = [p for p in sp_patients if p.get('status') == 'active']
    to_release = [p for p in sp_patients if p.get('status') in ('inactive', 'old_patient', 'discharged', 'deceased') and p.get('file_number')]

    print(f"Active patients: {len(active_patients)}")
    print(f"Patients to release file numbers from (old/discharged/deceased): {len(to_release)}")

    # 1. Build complete file_number_pool entries
    active_fns = {}
    for p in active_patients:
        fn = p.get('file_number')
        if fn:
            clean_fn = fn.split('-')[0].strip()
            if clean_fn:
                active_fns[clean_fn] = p.get('branch_id')

    released_fns = {}
    for p in to_release:
        fn = p.get('file_number')
        if fn:
            clean_fn = fn.split('-')[0].strip()
            if clean_fn and clean_fn not in active_fns:
                released_fns[clean_fn] = p.get('branch_id')

    print(f"\nUnique active file numbers: {len(active_fns)}")
    print(f"Unique released / available file numbers for new patients: {len(released_fns)}")

    pool_entries = []
    for fn, bid in active_fns.items():
        entry = {'file_number': fn, 'is_occupied': True}
        if bid: entry['branch_id'] = bid
        pool_entries.append(entry)

    for fn, bid in released_fns.items():
        entry = {'file_number': fn, 'is_occupied': False}
        if bid: entry['branch_id'] = bid
        pool_entries.append(entry)

    print(f"Total entries to seed/upsert into public.file_number_pool: {len(pool_entries)}")

    # Seed into public.file_number_pool in batches of 500
    print("\nUpserting into public.file_number_pool...")
    batch_size = 500
    for i in range(0, len(pool_entries), batch_size):
        batch = pool_entries[i:i+batch_size]
        h_upsert = headers.copy()
        h_upsert['Prefer'] = 'resolution=merge-duplicates'
        r = requests.post(f"{SUPABASE_URL}/rest/v1/file_number_pool", headers=h_upsert, json=batch)
        if r.status_code not in (200, 201):
            print(f"  [ERROR] Upserting batch {i}..{i+len(batch)}: HTTP {r.status_code} - {r.text}")
        else:
            print(f"  Upserted batch {i}..{i+len(batch)} ({len(batch)} entries)")

    # 2. Release file numbers on patients table (set file_number = NULL for old/discharged/deceased)
    print(f"\nReleasing file numbers on {len(to_release)} patients in parallel (30 worker threads)...")
    success_count = 0
    failure_count = 0

    with ThreadPoolExecutor(max_workers=30) as executor:
        results = list(executor.map(patch_release_patient, to_release))

    for ok, p_id, name, fn, stat in results:
        if ok:
            success_count += 1
        else:
            failure_count += 1
            print(f"  [ERROR] Failed to release {name} ({p_id}): {stat}")

    print(f"\nRelease Execution Completed:")
    print(f"  - Successfully released: {success_count}/{len(to_release)}")
    print(f"  - Failed: {failure_count}")

    # Verification
    print("\nVerifying updated database state...")
    sp_patients_after = fetch_all_supabase()
    act_after = [p for p in sp_patients_after if p.get('status') == 'active']
    inact_after = [p for p in sp_patients_after if p.get('status') in ('inactive', 'old_patient')]
    disch_after = [p for p in sp_patients_after if p.get('status') == 'discharged']
    deceas_after = [p for p in sp_patients_after if p.get('status') == 'deceased']

    print(f"Active patients with file_number: {sum(1 for p in act_after if p.get('file_number'))} / {len(act_after)}")
    print(f"Old / Inactive patients with file_number: {sum(1 for p in inact_after if p.get('file_number'))} / {len(inact_after)}")
    print(f"Discharged patients with file_number: {sum(1 for p in disch_after if p.get('file_number'))} / {len(disch_after)}")
    print(f"Deceased patients with file_number: {sum(1 for p in deceas_after if p.get('file_number'))} / {len(deceas_after)}")

    # Check file_number_pool table
    r_pool = requests.get(f"{SUPABASE_URL}/rest/v1/file_number_pool?select=file_number,is_occupied", headers={**headers, 'Range': '0-0', 'Prefer': 'count=exact'})
    print(f"\nTotal file numbers in file_number_pool: {r_pool.headers.get('Content-Range')}")
    
    r_avail = requests.get(f"{SUPABASE_URL}/rest/v1/file_number_pool?is_occupied=eq.false&select=file_number", headers={**headers, 'Range': '0-0', 'Prefer': 'count=exact'})
    print(f"Available / Released file numbers in pool for new patients: {r_avail.headers.get('Content-Range')}")

    r_occ = requests.get(f"{SUPABASE_URL}/rest/v1/file_number_pool?is_occupied=eq.true&select=file_number", headers={**headers, 'Range': '0-0', 'Prefer': 'count=exact'})
    print(f"Occupied file numbers in pool (active patients): {r_occ.headers.get('Content-Range')}")

if __name__ == '__main__':
    main()
