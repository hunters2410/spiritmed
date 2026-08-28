"""
bulk_patch_core_pages.py
========================
Replaces single unpaginated .select() calls in primary data-fetching functions
across all major SpiritMed page modules with chunked range-pagination (.range(from, from + 999)) loops.
"""

import os

PAGES_DIR = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\src\pages"

def patch_file(filename, old_str, new_str):
    filepath = os.path.join(PAGES_DIR, filename)
    if not os.path.exists(filepath):
        print(f"[MISSING] {filename}")
        return False
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if old_str in content:
        content = content.replace(old_str, new_str)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"[OK] Patched {filename}")
        return True
    else:
        print(f"[FAIL] Target pattern not found in {filename}")
        return False

def main():
    print("=== Patching Core Pages for Infinite Range Pagination ===")

    # 1. Consultations.tsx
    patch_file("Consultations.tsx",
"""            let query = supabase.from('consultations').select(`
                *, patient:patients(full_name, patient_number), 
                doctor:users!doctor_id(full_name, specialization, qualifications, signature_url),
                referral_doctor:referral_doctors!referred_by(full_name),
                prescriptions(prescription_items(medicine:medicines(name, dosage), period, time_unit, advice))
            `).order('created_at', { ascending: false });
            if (profile?.role === 'doctor') query = query.eq('doctor_id', profile.id);
            else if (profile?.role !== 'super_admin' && profile?.role !== 'admin')
                if (profile?.branch_id) query = query.eq('branch_id', profile.branch_id);
            const { data, error } = await query;
            if (error) throw error;""",
"""            let allConsultations: any[] = [];
            let from = 0;
            const pageSize = 1000;

            while (true) {
                let query = supabase.from('consultations').select(`
                    *, patient:patients(full_name, patient_number), 
                    doctor:users!doctor_id(full_name, specialization, qualifications, signature_url),
                    referral_doctor:referral_doctors!referred_by(full_name),
                    prescriptions(prescription_items(medicine:medicines(name, dosage), period, time_unit, advice))
                `).order('created_at', { ascending: false }).range(from, from + pageSize - 1);

                if (profile?.role === 'doctor') query = query.eq('doctor_id', profile.id);
                else if (profile?.role !== 'super_admin' && profile?.role !== 'admin') {
                    if (profile?.branch_id) query = query.eq('branch_id', profile.branch_id);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allConsultations = allConsultations.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }
            const data = allConsultations;"""
    )

    # 2. Prescriptions.tsx
    patch_file("Prescriptions.tsx",
"""        const rxQuery = supabase.from('prescriptions')
            .select('*, patient:patients(full_name,patient_number), doctor:users(full_name, specialization, qualifications, signature_url), prescription_items(id, period, time_unit, advice, medicine:medicines(name,dosage))')
            .order('created_at', { ascending: false });""",
"""        let allRxs: any[] = [];
        let fromRx = 0;
        const pageSizeRx = 1000;
        while (true) {
            let rxQuery = supabase.from('prescriptions')
                .select('*, patient:patients(full_name,patient_number), doctor:users(full_name, specialization, qualifications, signature_url), prescription_items(id, period, time_unit, advice, medicine:medicines(name,dosage))')
                .order('created_at', { ascending: false })
                .range(fromRx, fromRx + pageSizeRx - 1);

            if (!isSuperAdmin && branchId) {
                rxQuery = rxQuery.eq('branch_id', branchId);
            }
            const { data, error } = await rxQuery;
            if (error) break;
            if (!data || data.length === 0) break;
            allRxs = allRxs.concat(data);
            if (data.length < pageSizeRx) break;
            fromRx += pageSizeRx;
        }
        const rxRes = { error: null, data: allRxs };"""
    )

    print("Done!")

if __name__ == '__main__':
    main()
