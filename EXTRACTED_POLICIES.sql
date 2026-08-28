-- ==========================================
-- EXTRACTED POLICIES AND TRIGGERS
-- ==========================================

-- 1. Policies
-- Source: 20260111165451_add_rls_policies_for_users_and_branches.sql
CREATE POLICY "Authenticated users can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- Source: 20260111165451_add_rls_policies_for_users_and_branches.sql
CREATE POLICY "Allow inserts via function"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Source: 20260111165451_add_rls_policies_for_users_and_branches.sql
CREATE POLICY "Users can update based on role"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = users.branch_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = users.branch_id)
      )
    )
  );

-- Source: 20260111165451_add_rls_policies_for_users_and_branches.sql
CREATE POLICY "Only super admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- Source: 20260111165451_add_rls_policies_for_users_and_branches.sql
CREATE POLICY "Authenticated users can view branches"
  ON branches FOR SELECT
  TO authenticated
  USING (true);

-- Source: 20260111165451_add_rls_policies_for_users_and_branches.sql
CREATE POLICY "Only super admins can create branches"
  ON branches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- Source: 20260111165451_add_rls_policies_for_users_and_branches.sql
CREATE POLICY "Only super admins can update branches"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- Source: 20260111165451_add_rls_policies_for_users_and_branches.sql
CREATE POLICY "Only super admins can delete branches"
  ON branches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- Source: 20260111175436_add_system_configurations_table.sql
CREATE POLICY "Admins can view system configurations"
  ON system_configurations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Source: 20260111175436_add_system_configurations_table.sql
CREATE POLICY "Admins can create system configurations"
  ON system_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Source: 20260111175436_add_system_configurations_table.sql
CREATE POLICY "Admins can update system configurations"
  ON system_configurations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Source: 20260111175436_add_system_configurations_table.sql
CREATE POLICY "Admins can delete system configurations"
  ON system_configurations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Source: 20260111183820_create_doctor_schedules_table.sql
CREATE POLICY "Authenticated users can view doctor schedules"
  ON doctor_schedules FOR SELECT
  TO authenticated
  USING (true);

-- Source: 20260111183820_create_doctor_schedules_table.sql
CREATE POLICY "Super admins and admins can create doctor schedules"
  ON doctor_schedules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
    OR
    auth.uid() = doctor_id
  );

-- Source: 20260111183820_create_doctor_schedules_table.sql
CREATE POLICY "Admins and doctors can update schedules"
  ON doctor_schedules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
    OR
    auth.uid() = doctor_id
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
    OR
    auth.uid() = doctor_id
  );

-- Source: 20260111183820_create_doctor_schedules_table.sql
CREATE POLICY "Super admins and admins can delete doctor schedules"
  ON doctor_schedules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
    OR
    auth.uid() = doctor_id
  );

-- Source: 20260111184145_create_roles_table.sql
CREATE POLICY "Authenticated users can view roles"
  ON roles FOR SELECT
  TO authenticated
  USING (true);

-- Source: 20260111184145_create_roles_table.sql
CREATE POLICY "Super admins and admins can create roles"
  ON roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Source: 20260111184145_create_roles_table.sql
CREATE POLICY "Super admins and admins can update roles"
  ON roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Source: 20260111184145_create_roles_table.sql
CREATE POLICY "Super admins and admins can delete roles"
  ON roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE POLICY "Users can view medical aids in their branch"
  ON medical_aids FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (
        users.role = 'super_admin'
        OR users.branch_id = medical_aids.branch_id
      )
    )
  );

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE POLICY "Admins can insert medical aids"
  ON medical_aids FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
      AND (
        users.role = 'super_admin'
        OR users.branch_id = medical_aids.branch_id
      )
    )
  );

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE POLICY "Admins can update medical aids in their branch"
  ON medical_aids FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
      AND (
        users.role = 'super_admin'
        OR users.branch_id = medical_aids.branch_id
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
      AND (
        users.role = 'super_admin'
        OR users.branch_id = medical_aids.branch_id
      )
    )
  );

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE POLICY "Admins can delete medical aids in their branch"
  ON medical_aids FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
      AND (
        users.role = 'super_admin'
        OR users.branch_id = medical_aids.branch_id
      )
    )
  );

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE POLICY "Users can view referral doctors in their branch"
  ON referral_doctors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND (
        users.role = 'super_admin'
        OR users.branch_id = referral_doctors.branch_id
      )
    )
  );

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE POLICY "Admins can insert referral doctors"
  ON referral_doctors FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'doctor')
      AND (
        users.role = 'super_admin'
        OR users.branch_id = referral_doctors.branch_id
      )
    )
  );

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE POLICY "Admins can update referral doctors in their branch"
  ON referral_doctors FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'doctor')
      AND (
        users.role = 'super_admin'
        OR users.branch_id = referral_doctors.branch_id
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'doctor')
      AND (
        users.role = 'super_admin'
        OR users.branch_id = referral_doctors.branch_id
      )
    )
  );

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE POLICY "Admins can delete referral doctors in their branch"
  ON referral_doctors FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin', 'doctor')
      AND (
        users.role = 'super_admin'
        OR users.branch_id = referral_doctors.branch_id
      )
    )
  );

-- Source: 20260325010000_create_medicine_tables.sql
CREATE POLICY "Enable all for authenticated users" ON medicine_frequencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Source: 20260325010000_create_medicine_tables.sql
CREATE POLICY "Enable all for authenticated users" ON medicines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Source: 20260325020000_update_prescriptions_for_items.sql
CREATE POLICY "Enable all for authenticated users" ON prescription_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Source: 20260325030000_create_complaints_investigations.sql
CREATE POLICY "Enable all for authenticated users" ON complaints FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Source: 20260325030000_create_complaints_investigations.sql
CREATE POLICY "Enable all for authenticated users" ON investigations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Source: 20260325040000_create_diagnoses.sql
CREATE POLICY "Enable all for authenticated users" ON diagnoses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Source: 20260325060000_create_medical_reports.sql
CREATE POLICY "Users can view medical reports of their branch"
    ON medical_reports FOR SELECT
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Source: 20260325060000_create_medical_reports.sql
CREATE POLICY "Users can insert medical reports of their branch"
    ON medical_reports FOR INSERT
    WITH CHECK (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Source: 20260325060000_create_medical_reports.sql
CREATE POLICY "Users can update medical reports of their branch"
    ON medical_reports FOR UPDATE
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Source: 20260325060000_create_medical_reports.sql
CREATE POLICY "Users can delete medical reports of their branch"
    ON medical_reports FOR DELETE
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Source: 20260325070000_create_additional_clinical_modules.sql
CREATE POLICY "Users can manage discharge summaries of their branch" ON discharge_summaries
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325070000_create_additional_clinical_modules.sql
CREATE POLICY "Users can manage referral forms of their branch" ON referral_forms
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325070000_create_additional_clinical_modules.sql
CREATE POLICY "Users can manage medical certificates of their branch" ON medical_certificates
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325070000_create_additional_clinical_modules.sql
CREATE POLICY "Users can manage operation reports of their branch" ON operation_reports
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325070000_create_additional_clinical_modules.sql
CREATE POLICY "Users can manage admission forms of their branch" ON admission_forms
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325090000_clinical_entities.sql
CREATE POLICY "Users can manage hospitals of their branch" ON hospitals
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325090000_clinical_entities.sql
CREATE POLICY "Users can manage anaesthetists of their branch" ON anaesthetists
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325090000_clinical_entities.sql
CREATE POLICY "Users can manage assistants of their branch" ON assistants
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325140000_create_lab_results.sql
CREATE POLICY "Users can view lab results of their branch"
    ON lab_results FOR SELECT
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Source: 20260325140000_create_lab_results.sql
CREATE POLICY "Users can insert lab results to their branch"
    ON lab_results FOR INSERT
    WITH CHECK (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Source: 20260325140000_create_lab_results.sql
CREATE POLICY "Users can update lab results of their branch"
    ON lab_results FOR UPDATE
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Source: 20260325140000_create_lab_results.sql
CREATE POLICY "Users can delete lab results of their branch"
    ON lab_results FOR DELETE
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Source: 20260325150000_create_histology_types.sql
CREATE POLICY "Users can view histology types of their branch"
    ON histology_types FOR SELECT
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325150000_create_histology_types.sql
CREATE POLICY "Users can insert histology types to their branch"
    ON histology_types FOR INSERT
    WITH CHECK (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325150000_create_histology_types.sql
CREATE POLICY "Users can update histology types of their branch"
    ON histology_types FOR UPDATE
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325150000_create_histology_types.sql
CREATE POLICY "Users can delete histology types of their branch"
    ON histology_types FOR DELETE
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325160000_operation_report_layout_updates.sql
CREATE POLICY "Users can view procedures of their branch"
    ON surgical_procedures FOR SELECT
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325160000_operation_report_layout_updates.sql
CREATE POLICY "Users can insert procedures to their branch"
    ON surgical_procedures FOR INSERT
    WITH CHECK (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325160000_operation_report_layout_updates.sql
CREATE POLICY "Users can update procedures of their branch"
    ON surgical_procedures FOR UPDATE
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260325160000_operation_report_layout_updates.sql
CREATE POLICY "Users can delete procedures of their branch"
    ON surgical_procedures FOR DELETE
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Source: 20260408100000_create_patient_bills.sql
CREATE POLICY "Users can view patient bills in their branch"
    ON patient_bills FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'super_admin' OR users.branch_id = patient_bills.branch_id)
        )
    );

-- Source: 20260408100000_create_patient_bills.sql
CREATE POLICY "Users can insert patient bills"
    ON patient_bills FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'super_admin' OR users.branch_id = patient_bills.branch_id)
        )
    );

-- Source: 20260408100000_create_patient_bills.sql
CREATE POLICY "Users can update patient bills"
    ON patient_bills FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'super_admin' OR users.branch_id = patient_bills.branch_id)
        )
    );

-- Source: 20260408100000_create_patient_bills.sql
CREATE POLICY "Users can delete patient bills"
    ON patient_bills FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'super_admin' OR users.branch_id = patient_bills.branch_id)
        )
    );

-- Source: 20260408100000_create_patient_bills.sql
CREATE POLICY "Users can view patient bill items"
    ON patient_bill_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM patient_bills
            JOIN users ON users.branch_id = patient_bills.branch_id
            WHERE patient_bill_items.bill_id = patient_bills.id
            AND users.id = auth.uid()
        )
    );

-- Source: 20260408100000_create_patient_bills.sql
CREATE POLICY "Users can insert patient bill items"
    ON patient_bill_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM patient_bills
            JOIN users ON users.branch_id = patient_bills.branch_id
            WHERE patient_bill_items.bill_id = patient_bills.id
            AND users.id = auth.uid()
        )
    );

-- Source: 20260408100000_create_patient_bills.sql
CREATE POLICY "Users can update patient bill items"
    ON patient_bill_items FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM patient_bills
            JOIN users ON users.branch_id = patient_bills.branch_id
            WHERE patient_bill_items.bill_id = patient_bills.id
            AND users.id = auth.uid()
        )
    );

-- Source: 20260408100000_create_patient_bills.sql
CREATE POLICY "Users can delete patient bill items"
    ON patient_bill_items FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM patient_bills
            JOIN users ON users.branch_id = patient_bills.branch_id
            WHERE patient_bill_items.bill_id = patient_bills.id
            AND users.id = auth.uid()
        )
    );

-- Source: 20260408110000_setup_branding_storage.sql
CREATE POLICY "Public Access for Branding"
        ON storage.objects FOR SELECT
        USING ( bucket_id = 'branding' );

-- Source: 20260408110000_setup_branding_storage.sql
CREATE POLICY "Authenticated Manage Branding"
        ON storage.objects FOR ALL
        TO authenticated
        USING ( bucket_id = 'branding' )
        WITH CHECK ( bucket_id = 'branding' );

-- Source: 20260408130000_update_branches_policy.sql
CREATE POLICY "Super admins and branch admins can update branches"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.id = auth.uid() AND u.branch_id = branches.id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.id = auth.uid() AND u.branch_id = branches.id)
      )
    )
  );

-- Source: 20260408140000_fix_settings_persistence.sql
CREATE POLICY "Super admins and branch admins can update branches"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = branches.id)
      )
    )
  );

-- Source: 20260408140000_fix_settings_persistence.sql
CREATE POLICY "Users can update own profile or admins can update branch staff"
  ON users FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id -- Can update self
    OR EXISTS (     -- OR Super Admin
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
    OR EXISTS (     -- OR Branch Admin for same branch
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.branch_id = users.branch_id
    )
  );

-- Source: 20260408140000_fix_settings_persistence.sql
CREATE POLICY "Users can view their branch configurations"
  ON system_configurations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.branch_id = system_configurations.branch_id
      )
    )
  );

-- Source: 20260408140000_fix_settings_persistence.sql
CREATE POLICY "Admins can manage their branch configurations"
  ON system_configurations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  );

-- Source: 20260408150000_fix_missing_column.sql
CREATE POLICY "Users can view their branch configurations"
  ON system_configurations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.branch_id = system_configurations.branch_id
      )
    )
  );

-- Source: 20260408150000_fix_missing_column.sql
CREATE POLICY "Admins can manage their branch configurations"
  ON system_configurations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  );

-- Source: 20260408160000_fix_branding_rls.sql
CREATE POLICY "Authorized staff can update their own branch branding"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role IN ('admin', 'doctor') AND u.branch_id = branches.id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role IN ('admin', 'doctor') AND u.branch_id = branches.id)
      )
    )
  );

-- Source: 20260408160000_fix_branding_rls.sql
CREATE POLICY "Authenticated users can view branches"
  ON branches FOR SELECT
  TO authenticated
  USING (true);

-- Source: 20260417180000_notification_policies.sql
CREATE POLICY "Users can view own notifications" 
ON notifications FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Source: 20260417180000_notification_policies.sql
CREATE POLICY "Users can update own notifications" 
ON notifications FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Source: 20260417180000_notification_policies.sql
CREATE POLICY "Users can delete own notifications" 
ON notifications FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- Source: 20260417200000_public_registration_access.sql
CREATE POLICY "Allow public to view medical aids list"
ON public.medical_aids FOR SELECT
TO anon
USING (is_active = true);

-- Source: 20260417200000_public_registration_access.sql
CREATE POLICY "Allow public to view branch info"
ON public.branches FOR SELECT
TO anon
USING (is_active = true);

-- Source: 20260420160000_fix_system_configurations_uniqueness.sql
CREATE POLICY "Users can view their branch configurations"
  ON system_configurations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.branch_id = system_configurations.branch_id
      )
    )
  );

-- Source: 20260420160000_fix_system_configurations_uniqueness.sql
CREATE POLICY "Admins can manage their branch configurations"
  ON system_configurations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  );

-- Source: 20260420170000_fix_chat_rls_recursion.sql
CREATE POLICY "chat_conversations_select"
ON chat_conversations FOR SELECT
USING (
  public.is_chat_participant(id, auth.uid()) OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
);

-- Source: 20260420170000_fix_chat_rls_recursion.sql
CREATE POLICY "chat_conversations_admin"
ON chat_conversations FOR ALL
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
);

-- Source: 20260420170000_fix_chat_rls_recursion.sql
CREATE POLICY "chat_participants_select"
ON chat_participants FOR SELECT
USING (
  user_id = auth.uid() OR -- Always see your own
  public.is_chat_participant(conversation_id, auth.uid()) -- See others in same convo
);

-- Source: 20260420170000_fix_chat_rls_recursion.sql
CREATE POLICY "chat_participants_insert"
ON chat_participants FOR INSERT
WITH CHECK (
  user_id = auth.uid() OR -- Add self
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')) -- Admins add others
);

-- Source: 20260420170000_fix_chat_rls_recursion.sql
CREATE POLICY "chat_messages_select"
ON chat_messages FOR SELECT
USING (
  public.is_chat_participant(conversation_id, auth.uid())
);

-- Source: 20260420170000_fix_chat_rls_recursion.sql
CREATE POLICY "chat_messages_insert"
ON chat_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  public.is_chat_participant(conversation_id, auth.uid())
);

-- Source: 20260420220000_ensure_superadmin_link.sql
CREATE POLICY "Authenticated users can view roles" ON roles FOR SELECT TO authenticated USING (true);

-- Source: 20260421152500_advanced_file_number_management.sql
CREATE POLICY "Allow authenticated users to read file pool"
    ON public.file_number_pool FOR SELECT
    TO authenticated
    USING (true);

-- Source: 20260421152500_advanced_file_number_management.sql
CREATE POLICY "Allow admins to manage file pool"
    ON public.file_number_pool FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role IN ('super_admin', 'admin')
    ));


-- 2. Triggers
-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE TRIGGER update_medical_aids_updated_at BEFORE UPDATE ON medical_aids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Source: 20260111185541_create_medical_aids_and_referral_doctors_tables.sql
CREATE TRIGGER update_referral_doctors_updated_at BEFORE UPDATE ON referral_doctors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Source: 20260417193000_public_registration_notifications.sql
CREATE TRIGGER on_public_registration_insert
        AFTER INSERT ON public.patient_temporary_db
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_public_registration_notification();

-- Source: 20260421152500_advanced_file_number_management.sql
Create Trigger
DROP TRIGGER IF EXISTS tr_patient_file_number_management ON public.patients;

-- Source: 20260421152500_advanced_file_number_management.sql
CREATE TRIGGER tr_patient_file_number_management
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.handle_patient_file_number_change();

