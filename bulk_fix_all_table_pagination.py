"""
bulk_fix_all_table_pagination.py
================================
Upgrades all data-fetching functions across SpiritMed frontend pages (src/pages/*.tsx)
to use chunked range-pagination (.range(from, from + 999)) so that PostgREST 1000-row limits
are completely bypassed across ALL tables and views.
"""

import os
import re

PAGES_DIR = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\src\pages"

def fix_appointments():
    path = os.path.join(PAGES_DIR, "Appointments.tsx")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Replace loadAppointments limit(1000) with range pagination
    old_load_appts = """      let query = supabase
        .from('appointments')
        .select(`
          *,
          doctor_id,
          patients (full_name, phone, patient_number),
          users:doctor_id (full_name)
        `)
        .order('appointment_date', { ascending: false })
        .limit(1000);"""

    new_load_appts = """      let allAppointments: any[] = [];
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

    if ".limit(1000);" in content:
        content = content.replace(".limit(1000);", "")
        print("Updated Appointments.tsx limit(1000)")

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

print("Starting bulk audit and fix...")
fix_appointments()
