"""
bulk_patch_all_remaining_pages.py
==================================
Patches remaining SpiritMed modules so that all list views use chunked range-pagination
(.range(from, from + 999)) to bypass PostgREST's 1000-row limit.
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
        print(f"[FAIL] Pattern not found in {filename}")
        return False

def main():
    print("=== Patching Remaining Pages for Infinite Range Pagination ===")

    # 1. EstimateBills.tsx
    patch_file("EstimateBills.tsx",
"""            const { data, error } = await supabase
                .from('estimate_bills')
                .select(`
                    *,
                    patient:patients(full_name, patient_number, medical_aid_id, email, medical_aid:medical_aids(name)),
                    estimate_bill_items(*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setBills(data || []);""",
"""            let allEstimates: any[] = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                let query = supabase
                    .from('estimate_bills')
                    .select(`
                        *,
                        patient:patients(full_name, patient_number, medical_aid_id, email, medical_aid:medical_aids(name)),
                        estimate_bill_items(*)
                    `)
                    .order('created_at', { ascending: false })
                    .range(from, from + pageSize - 1);

                if (profile?.role !== 'super_admin' && profile?.branch_id) {
                    query = query.eq('branch_id', profile.branch_id);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allEstimates = allEstimates.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }
            setBills(allEstimates);"""
    )

    # 2. Expenses.tsx
    patch_file("Expenses.tsx",
"""            const bid = profile?.branch_id;
            let query = supabase
                .from('expenses')
                .select(`
                    *,
                    category:expense_categories(name),
                    recorder:users!expenses_recorded_by_fkey(full_name)
                `)
                .order('expense_date', { ascending: false });

            if (bid) {
                query = query.eq('branch_id', bid);
            }

            const { data, error } = await query;
            if (error) throw error;
            setExpenses(data || []);""",
"""            const bid = profile?.branch_id;
            let allExpenses: any[] = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                let query = supabase
                    .from('expenses')
                    .select(`
                        *,
                        category:expense_categories(name),
                        recorder:users!expenses_recorded_by_fkey(full_name)
                    `)
                    .order('expense_date', { ascending: false })
                    .range(from, from + pageSize - 1);

                if (bid) {
                    query = query.eq('branch_id', bid);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allExpenses = allExpenses.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }
            setExpenses(allExpenses);"""
    )

    # 3. Vitals.tsx
    patch_file("Vitals.tsx",
"""            let query = supabase
                .from('vital_signs')
                .select(`
          *,
          patient:patients(full_name, patient_number),
          recorder:users!recorded_by(full_name)
        `)
                .order('recorded_at', { ascending: false });

            if (profile?.role !== 'super_admin' && profile?.branch_id) {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setVitalsList(data || []);""",
"""            let allVitals: any[] = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                let query = supabase
                    .from('vital_signs')
                    .select(`
                      *,
                      patient:patients(full_name, patient_number),
                      recorder:users!recorded_by(full_name)
                    `)
                    .order('recorded_at', { ascending: false })
                    .range(from, from + pageSize - 1);

                if (profile?.role !== 'super_admin' && profile?.branch_id) {
                    query = query.eq('branch_id', profile.branch_id);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allVitals = allVitals.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }
            setVitalsList(allVitals);"""
    )

    # 4. AuditLogs.tsx
    patch_file("AuditLogs.tsx",
"""      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          *,
          profiles:user_id (full_name, role)
        `)
        .eq('branch_id', profile.branch_id)
        .order('created_at', { ascending: false })
        .limit(500);""",
"""      let allLogs: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('audit_logs')
          .select(`
            *,
            profiles:user_id (full_name, role)
          `)
          .eq('branch_id', profile.branch_id)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allLogs = allLogs.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setLogs(allLogs);"""
    )

    # 5. OperationReports.tsx
    patch_file("OperationReports.tsx",
"""            const [forRes, allPats, hospRes, anaRes, astRes, docRes, prcRes] = await Promise.all([
                forQ.order('operation_date', { ascending: false }).order('created_at', { ascending: false }),
                fetchAllPatients({ branchId: bid, select: 'id, full_name, patient_number, gender, date_of_birth' }),
                hospQ.order('name'),
                anaQ.order('full_name'),
                astQ.order('full_name'),
                docQ.order('full_name'),
                prcQ.order('name')
            ]);""",
"""            let allOps: any[] = [];
            let fromOp = 0;
            const pageSizeOp = 1000;
            while (true) {
                let opQ = supabase.from('operation_reports').select('*, patient:patients(full_name, patient_number, gender, date_of_birth), doctor:users(full_name, specialization, qualifications, signature_url), procedure:surgical_procedures(name), hospital:hospitals(name)')
                    .order('operation_date', { ascending: false }).order('created_at', { ascending: false })
                    .range(fromOp, fromOp + pageSizeOp - 1);
                if (bid) opQ = opQ.eq('branch_id', bid);
                const { data, error } = await opQ;
                if (error || !data || data.length === 0) break;
                allOps = allOps.concat(data);
                if (data.length < pageSizeOp) break;
                fromOp += pageSizeOp;
            }
            const forRes = { error: null, data: allOps };

            const [allPats, hospRes, anaRes, astRes, docRes, prcRes] = await Promise.all([
                fetchAllPatients({ branchId: bid, select: 'id, full_name, patient_number, gender, date_of_birth' }),
                hospQ.order('name'),
                anaQ.order('full_name'),
                astQ.order('full_name'),
                docQ.order('full_name'),
                prcQ.order('name')
            ]);"""
    )

    # 6. LabResults.tsx
    patch_file("LabResults.tsx",
"""            const [resData, allPats, histData] = await Promise.all([
                resQ,
                fetchAllPatients({ branchId: bid, select: 'id, full_name, patient_number, email' }),
                histQ
            ]);
            setResults(resData.data || []);""",
"""            let allLabRes: any[] = [];
            let fromLab = 0;
            const pageSizeLab = 1000;
            while (true) {
                let lQ = supabase.from('lab_results').select('*, patient:patients(full_name, patient_number)').order('created_at', { ascending: false }).range(fromLab, fromLab + pageSizeLab - 1);
                if (bid) lQ = lQ.eq('branch_id', bid);
                const { data, error } = await lQ;
                if (error || !data || data.length === 0) break;
                allLabRes = allLabRes.concat(data);
                if (data.length < pageSizeLab) break;
                fromLab += pageSizeLab;
            }

            const [allPats, histData] = await Promise.all([
                fetchAllPatients({ branchId: bid, select: 'id, full_name, patient_number, email' }),
                histQ
            ]);
            setResults(allLabRes);"""
    )

    print("Done!")

if __name__ == '__main__':
    main()
