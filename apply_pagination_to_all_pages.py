"""
apply_pagination_to_all_pages.py
================================
Scans and updates all primary list-fetching functions across src/pages/*.tsx to use
chunked range-pagination (.range(from, from + pageSize - 1)) so that PostgREST
1,000-row limits are eliminated everywhere across the entire SpiritMed system.
"""

import os
import re

PAGES_DIR = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\src\pages"

def patch_file(filename, targets):
    filepath = os.path.join(PAGES_DIR, filename)
    if not os.path.exists(filepath):
        print(f"Skipping {filename} (not found)")
        return

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    modified = False
    for old_pattern, new_code in targets:
        if old_pattern in content:
            content = content.replace(old_pattern, new_code)
            modified = True
            print(f"  [OK] Updated {filename}")
        else:
            print(f"  [WARN] Pattern not found in {filename}")

    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

def main():
    print("=== Patching SpiritMed Frontend Pages for Bulk Range Pagination ===")

    # 1. Appointments.tsx
    patch_file("Appointments.tsx", [
        (
            """      let query = supabase
        .from('appointments')
        .select(`
          *,
          doctor_id,
          patients (full_name, phone, patient_number),
          users:doctor_id (full_name)
        `)
        .order('appointment_date', { ascending: false })
        .limit(1000);""",
            """      let allAppointments: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('appointments')
          .select(`
            *,
            doctor_id,
            patients (full_name, phone, patient_number),
            users:doctor_id (full_name)
          `)
          .order('appointment_date', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile.role !== 'super_admin') {
          query = query.eq('branch_id', profile.branch_id);
        }
        if (profile.role === 'doctor') {
          query = query.eq('doctor_id', profile.id);
        }
        if (dateRange.startDate) {
          query = query.gte('appointment_date', dateRange.startDate);
        }
        if (dateRange.endDate) {
          const endDateObj = new Date(dateRange.endDate);
          endDateObj.setDate(endDateObj.getDate() + 1);
          query = query.lt('appointment_date', endDateObj.toISOString().split('T')[0]);
        }
        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }
        if (typeFilter !== 'all') {
          query = query.eq('appointment_type', typeFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allAppointments = allAppointments.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setAppointments(allAppointments);
      return;"""
        ),
        (
            """      let query = supabase
        .from('patients')
        .select('id, full_name, patient_number, email')
        .eq('status', 'active')
        .order('full_name')
        .limit(1000);""",
            """      let allPatients: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('patients')
          .select('id, full_name, patient_number, email')
          .eq('status', 'active')
          .order('full_name')
          .range(from, from + pageSize - 1);

        if (profile.role !== 'super_admin' && profile.branch_id) {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allPatients = allPatients.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setPatients(allPatients);
      return;"""
        )
    ])

    # 2. Consultations.tsx
    patch_file("Consultations.tsx", [
        (
            """      let query = supabase
        .from('consultations')
        .select(`
          *,
          patients (full_name, patient_number, date_of_birth, gender),
          users (full_name)
        `)
        .order('consultation_date', { ascending: false });""",
            """      let allConsultations: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('consultations')
          .select(`
            *,
            patients (full_name, patient_number, date_of_birth, gender),
            users (full_name)
          `)
          .order('consultation_date', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          query = query.eq('branch_id', profile.branch_id);
        }
        if (profile?.role === 'doctor') {
          query = query.eq('doctor_id', profile.id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allConsultations = allConsultations.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setConsultations(allConsultations);
      return;"""
        )
    ])

    # 3. Prescriptions.tsx
    patch_file("Prescriptions.tsx", [
        (
            """      let query = supabase
        .from('prescriptions')
        .select(`
          *,
          patient:patients(full_name, patient_number, gender, date_of_birth),
          doctor:users!prescriptions_doctor_id_fkey(full_name),
          items:prescription_items(*)
        `)
        .order('created_at', { ascending: false });""",
            """      let allPrescriptions: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('prescriptions')
          .select(`
            *,
            patient:patients(full_name, patient_number, gender, date_of_birth),
            doctor:users!prescriptions_doctor_id_fkey(full_name),
            items:prescription_items(*)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allPrescriptions = allPrescriptions.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setPrescriptions(allPrescriptions);
      return;"""
        )
    ])

    # 4. EstimateBills.tsx
    patch_file("EstimateBills.tsx", [
        (
            """      let query = supabase
        .from('estimate_bills')
        .select(`
          *,
          patient:patients(full_name, patient_number, phone, email),
          items:estimate_bill_items(*)
        `)
        .order('created_at', { ascending: false });""",
            """      let allEstimates: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('estimate_bills')
          .select(`
            *,
            patient:patients(full_name, patient_number, phone, email),
            items:estimate_bill_items(*)
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
      setEstimateBills(allEstimates);
      return;"""
        )
    ])

    # 5. OperationReports.tsx
    patch_file("OperationReports.tsx", [
        (
            """      let query = supabase
        .from('operation_reports')
        .select(`
          *,
          patient:patients(full_name, patient_number, gender, date_of_birth),
          doctor:users!operation_reports_surgeon_id_fkey(full_name)
        `)
        .order('operation_date', { ascending: false });""",
            """      let allOps: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('operation_reports')
          .select(`
            *,
            patient:patients(full_name, patient_number, gender, date_of_birth),
            doctor:users!operation_reports_surgeon_id_fkey(full_name)
          `)
          .order('operation_date', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allOps = allOps.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setReports(allOps);
      return;"""
        )
    ])

    # 6. Expenses.tsx
    patch_file("Expenses.tsx", [
        (
            """      let query = supabase
        .from('expenses')
        .select(`
          *,
          category:expense_categories(name)
        `)
        .order('expense_date', { ascending: false });""",
            """      let allExpenses: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('expenses')
          .select(`
            *,
            category:expense_categories(name)
          `)
          .order('expense_date', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allExpenses = allExpenses.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setExpenses(allExpenses);
      return;"""
        )
    ])

    # 7. AuditLogs.tsx
    patch_file("AuditLogs.tsx", [
        (
            """      let query = supabase
        .from('audit_logs')
        .select(`
          *,
          user:users(full_name, email)
        `)
        .order('created_at', { ascending: false });""",
            """      let allLogs: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('audit_logs')
          .select(`
            *,
            user:users(full_name, email)
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allLogs = allLogs.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setLogs(allLogs);
      return;"""
        )
    ])

    print("=== Bulk Pagination Upgrade Completed ===")

if __name__ == '__main__':
    main()
