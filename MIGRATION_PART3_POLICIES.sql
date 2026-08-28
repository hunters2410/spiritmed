-- =====================================================
-- SPIRITMED MIGRATION - PART 3 of 3
-- RUN THIRD: RLS Policies + Seed Data
-- =====================================================

-- SECTION 8: ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- 1. Users policies
CREATE POLICY "Authenticated users can view all users"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow inserts via function"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own profile or admins can update branch staff"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.branch_id = users.branch_id
    )
  );

CREATE POLICY "Only super admins can delete users"
  ON public.users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- 2. Branches policies
CREATE POLICY "Authenticated users can view branches"
  ON public.branches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow public to view branch info"
  ON public.branches FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Only super admins can create branches"
  ON public.branches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

CREATE POLICY "Authorized staff can update their own branch branding"
  ON public.branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role IN ('admin', 'doctor') AND u.branch_id = branches.id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role IN ('admin', 'doctor') AND u.branch_id = branches.id)
      )
    )
  );

CREATE POLICY "Only super admins can delete branches"
  ON public.branches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role = 'super_admin'
    )
  );

-- 3. System Configurations policies
CREATE POLICY "Users can view their branch configurations"
  ON public.system_configurations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.branch_id = system_configurations.branch_id
      )
    )
  );

CREATE POLICY "Admins can manage their branch configurations"
  ON public.system_configurations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  );

-- 4. Doctor Schedules policies
CREATE POLICY "Authenticated users can view doctor schedules"
  ON public.doctor_schedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins and admins can create doctor schedules"
  ON public.doctor_schedules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
    OR auth.uid() = doctor_id
  );

CREATE POLICY "Admins and doctors can update schedules"
  ON public.doctor_schedules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
    OR auth.uid() = doctor_id
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
    OR auth.uid() = doctor_id
  );

CREATE POLICY "Super admins and admins can delete doctor schedules"
  ON public.doctor_schedules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
    OR auth.uid() = doctor_id
  );

-- 5. Roles policies
CREATE POLICY "Authenticated users can view roles"
  ON public.roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins and admins can create roles"
  ON public.roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Super admins and admins can update roles"
  ON public.roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Super admins and admins can delete roles"
  ON public.roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
    )
  );

-- 6. Medical Aids policies
CREATE POLICY "Users can view medical aids in their branch"
  ON public.medical_aids FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND (
        role = 'super_admin'
        OR branch_id = medical_aids.branch_id
      )
    )
  );

CREATE POLICY "Allow public to view medical aids list"
  ON public.medical_aids FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Admins can insert medical aids"
  ON public.medical_aids FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND (
        role = 'super_admin'
        OR branch_id = medical_aids.branch_id
      )
    )
  );

CREATE POLICY "Admins can update medical aids in their branch"
  ON public.medical_aids FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND (
        role = 'super_admin'
        OR branch_id = medical_aids.branch_id
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND (
        role = 'super_admin'
        OR branch_id = medical_aids.branch_id
      )
    )
  );

CREATE POLICY "Admins can delete medical aids in their branch"
  ON public.medical_aids FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin')
      AND (
        role = 'super_admin'
        OR branch_id = medical_aids.branch_id
      )
    )
  );

-- 7. Referral Doctors policies
CREATE POLICY "Users can view referral doctors in their branch"
  ON public.referral_doctors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND (
        role = 'super_admin'
        OR branch_id = referral_doctors.branch_id
      )
    )
  );

CREATE POLICY "Admins can insert referral doctors"
  ON public.referral_doctors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'doctor')
      AND (
        role = 'super_admin'
        OR branch_id = referral_doctors.branch_id
      )
    )
  );

CREATE POLICY "Admins can update referral doctors in their branch"
  ON public.referral_doctors FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'doctor')
      AND (
        role = 'super_admin'
        OR branch_id = referral_doctors.branch_id
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'doctor')
      AND (
        role = 'super_admin'
        OR branch_id = referral_doctors.branch_id
      )
    )
  );

CREATE POLICY "Admins can delete referral doctors in their branch"
  ON public.referral_doctors FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'admin', 'doctor')
      AND (
        role = 'super_admin'
        OR branch_id = referral_doctors.branch_id
      )
    )
  );

-- 8. Global Lookup Tables (Medicine Frequencies, Medicines, Prescription Items, Complaints, Investigations, Diagnoses)
CREATE POLICY "Enable all for authenticated users" ON public.medicine_frequencies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.medicines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.prescription_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.complaints FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.investigations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for authenticated users" ON public.diagnoses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. Clinical Documents and Reports (Medical Reports, Discharge Summaries, Referral Forms, Medical Certificates, Operation Reports, Admission Forms, Hospitals, Anaesthetists, Assistants, Lab Results, Histology Types, Surgical Procedures)
CREATE POLICY "Users can manage discharge summaries of their branch" ON public.discharge_summaries FOR ALL USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage referral forms of their branch" ON public.referral_forms FOR ALL USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage medical certificates of their branch" ON public.medical_certificates FOR ALL USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage operation reports of their branch" ON public.operation_reports FOR ALL USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage admission forms of their branch" ON public.admission_forms FOR ALL USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage hospitals of their branch" ON public.hospitals FOR ALL USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage anaesthetists of their branch" ON public.anaesthetists FOR ALL USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage assistants of their branch" ON public.assistants FOR ALL USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Users can view medical reports of their branch" ON public.medical_reports FOR SELECT USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can insert medical reports of their branch" ON public.medical_reports FOR INSERT WITH CHECK (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can update medical reports of their branch" ON public.medical_reports FOR UPDATE USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can delete medical reports of their branch" ON public.medical_reports FOR DELETE USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Users can view lab results of their branch" ON public.lab_results FOR SELECT USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can insert lab results to their branch" ON public.lab_results FOR INSERT WITH CHECK (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can update lab results of their branch" ON public.lab_results FOR UPDATE USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can delete lab results of their branch" ON public.lab_results FOR DELETE USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Users can view histology types of their branch" ON public.histology_types FOR SELECT USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can insert histology types to their branch" ON public.histology_types FOR INSERT WITH CHECK (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can update histology types of their branch" ON public.histology_types FOR UPDATE USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can delete histology types of their branch" ON public.histology_types FOR DELETE USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Users can view procedures of their branch" ON public.surgical_procedures FOR SELECT USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can insert procedures to their branch" ON public.surgical_procedures FOR INSERT WITH CHECK (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can update procedures of their branch" ON public.surgical_procedures FOR UPDATE USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can delete procedures of their branch" ON public.surgical_procedures FOR DELETE USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- 10. Estimate Bills (formerly patient_bills) policies
CREATE POLICY "Users can view patient bills in their branch" ON public.estimate_bills FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role = 'super_admin' OR branch_id = estimate_bills.branch_id)));
CREATE POLICY "Users can insert patient bills" ON public.estimate_bills FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role = 'super_admin' OR branch_id = estimate_bills.branch_id)));
CREATE POLICY "Users can update patient bills" ON public.estimate_bills FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role = 'super_admin' OR branch_id = estimate_bills.branch_id)));
CREATE POLICY "Users can delete patient bills" ON public.estimate_bills FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND (role = 'super_admin' OR branch_id = estimate_bills.branch_id)));

CREATE POLICY "Users can view patient bill items" ON public.estimate_bill_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.estimate_bills JOIN public.users ON users.branch_id = estimate_bills.branch_id WHERE estimate_bill_items.estimate_id = estimate_bills.id AND users.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can insert patient bill items" ON public.estimate_bill_items FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.estimate_bills JOIN public.users ON users.branch_id = estimate_bills.branch_id WHERE estimate_bill_items.estimate_id = estimate_bills.id AND users.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can update patient bill items" ON public.estimate_bill_items FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.estimate_bills JOIN public.users ON users.branch_id = estimate_bills.branch_id WHERE estimate_bill_items.estimate_id = estimate_bills.id AND users.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can delete patient bill items" ON public.estimate_bill_items FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.estimate_bills JOIN public.users ON users.branch_id = estimate_bills.branch_id WHERE estimate_bill_items.estimate_id = estimate_bills.id AND users.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- 11. Core Patients & Medical Records policies
CREATE POLICY "Users can manage patients of their branch" ON public.patients FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage appointments of their branch" ON public.appointments FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage consultations of their branch" ON public.consultations FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage prescriptions of their branch" ON public.prescriptions FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage vital_signs of their branch" ON public.vital_signs FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- 12. Main Billing & Payments policies
CREATE POLICY "Users can manage bills of their branch" ON public.bills FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage bill items" ON public.bill_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.bills JOIN public.users ON users.branch_id = bills.branch_id WHERE bill_items.bill_id = bills.id AND users.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage payments of their branch" ON public.payments FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- 13. Financial / Accounts policies
CREATE POLICY "Users can manage expenses of their branch" ON public.expenses FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage expense categories of their branch" ON public.expense_categories FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage accounts of their branch" ON public.accounts FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage journal entries of their branch" ON public.journal_entries FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage journal lines" ON public.journal_lines FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.journal_entries JOIN public.users ON users.branch_id = journal_entries.branch_id WHERE journal_lines.journal_entry_id = journal_entries.id AND users.id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- 14. Inventory policies
CREATE POLICY "Users can manage inventory items of their branch" ON public.inventory_items FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage inventory transactions of their branch" ON public.inventory_transactions FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage inventory categories of their branch" ON public.inventory_categories FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage inventory units of their branch" ON public.inventory_units FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- 15. HR, Leave and Payroll policies
CREATE POLICY "Users can manage staff attendance of their branch" ON public.staff_attendance FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage leave requests of their branch" ON public.leave_requests FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage payroll of their branch" ON public.payroll FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage payroll settings of their branch" ON public.payroll_settings FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage salary configurations of their branch" ON public.salary_configurations FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- 16. Logs, Notifications and Chats policies
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can manage email logs of their branch" ON public.email_logs FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage sms logs of their branch" ON public.sms_logs FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage audit logs of their branch" ON public.audit_logs FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage internal chats of their branch" ON public.internal_chats FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));

-- 17. Recursion-Fixed Chat Policies
CREATE POLICY "chat_conversations_select" ON public.chat_conversations FOR SELECT USING (public.is_chat_participant(id, auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "chat_conversations_admin" ON public.chat_conversations FOR ALL USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

CREATE POLICY "chat_participants_select" ON public.chat_participants FOR SELECT USING (user_id = auth.uid() OR public.is_chat_participant(conversation_id, auth.uid()));
CREATE POLICY "chat_participants_insert" ON public.chat_participants FOR INSERT WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

CREATE POLICY "chat_messages_select" ON public.chat_messages FOR SELECT USING (public.is_chat_participant(conversation_id, auth.uid()));
CREATE POLICY "chat_messages_insert" ON public.chat_messages FOR INSERT WITH CHECK (sender_id = auth.uid() AND public.is_chat_participant(conversation_id, auth.uid()));

-- 18. File number pool policies
CREATE POLICY "Allow authenticated users to read file pool" ON public.file_number_pool FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow admins to manage file pool" ON public.file_number_pool FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

-- 19. Other files and settings tables
CREATE POLICY "Users can manage patient files of their branch" ON public.patient_files FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Users can manage hospital files of their branch" ON public.hospital_files FOR ALL TO authenticated USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()) OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin'));
CREATE POLICY "Admins can manage system settings" ON public.system_settings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

-- ==========================================
-- SECTION 9: INITIAL SEED DATA
-- ==========================================

-- 1. Seed Medicine Frequencies (use WHERE NOT EXISTS to avoid constraint issues)
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'OD', 'Once daily' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'OD' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'BD', 'Twice daily' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'BD' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'TDS', 'Three times daily' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'TDS' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'QID', 'Four times daily' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'QID' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'STAT', 'Immediately' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'STAT' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'PRN', 'As needed' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'PRN' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'nocte', 'At night' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'nocte' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'mane', 'In the morning' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'mane' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'pc', 'After meals' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'pc' AND branch_id IS NULL);
INSERT INTO public.medicine_frequencies (branch_id, name, description)
SELECT NULL, 'ac', 'Before meals' WHERE NOT EXISTS (SELECT 1 FROM public.medicine_frequencies WHERE name = 'ac' AND branch_id IS NULL);

-- 2. Seed Default Roles with Permissions Helper
CREATE OR REPLACE FUNCTION generate_system_permissions(can_full_access BOOLEAN) 
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'dashboard', jsonb_build_object('view', true, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'branches', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'patients', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'appointments', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'medical_records', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'clinical_reports', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'clinical_setup', jsonb_build_object('view', true, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'inventory', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'billing', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'staff', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'attendance', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'leave_management', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'payroll', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'human_resources', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'medical_aids', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'communication', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
        'statistics', jsonb_build_object('view', true, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'audit_logs', jsonb_build_object('view', can_full_access, 'add', false, 'edit', false, 'delete', false),
        'settings', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access)
    );
END;
$$ LANGUAGE plpgsql;

INSERT INTO public.roles (name, base_role, description, permissions, is_active)
SELECT 'Super Admin', 'admin', 'System-wide full access', generate_system_permissions(true), true
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Super Admin');

INSERT INTO public.roles (name, base_role, description, permissions, is_active)
SELECT 'Admin', 'admin', 'Branch administration access', generate_system_permissions(true), true
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Admin');

INSERT INTO public.roles (name, base_role, description, permissions, is_active)
SELECT 'Doctor', 'doctor', 'Medical staff access', generate_system_permissions(false), true
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Doctor');

INSERT INTO public.roles (name, base_role, description, permissions, is_active)
SELECT 'Nurse', 'nurse', 'Nursing staff access', generate_system_permissions(false), true
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Nurse');

INSERT INTO public.roles (name, base_role, description, permissions, is_active)
SELECT 'Accountant', 'accountant', 'Financial staff access', generate_system_permissions(false), true
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Accountant');

INSERT INTO public.roles (name, base_role, description, permissions, is_active)
SELECT 'Receptionist', 'receptionist', 'Front desk staff access', generate_system_permissions(false), true
WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE name = 'Receptionist');

DROP FUNCTION IF EXISTS generate_system_permissions(BOOLEAN);

-- 3. EMERGENCY RECOVERY/BOOTSTRAP SCRIPT
-- This automatically syncs all existing auth users to public.users as Super Admins.
INSERT INTO public.users (id, email, full_name, role, is_active, role_id)
SELECT 
    au.id, 
    au.email, 
    COALESCE(au.raw_user_meta_data->>'full_name', 'System Administrator'), 
    'super_admin', 
    true,
    (SELECT id FROM public.roles WHERE name = 'Super Admin' LIMIT 1)
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE u.id IS NULL;