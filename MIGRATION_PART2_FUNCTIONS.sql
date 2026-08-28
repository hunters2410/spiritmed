-- =====================================================
-- SPIRITMED MIGRATION - PART 2 of 3
-- RUN SECOND: RLS Enable + Functions + Triggers + Storage
-- =====================================================

-- SECTION 4: ENABLE ROW LEVEL SECURITY (RLS)
-- ==========================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anaesthetists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discharge_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_number_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.histology_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_aids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_temporary_db ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgical_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vital_signs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- SECTION 5: CUSTOM FUNCTIONS & RPCS
-- ==========================================

-- 1. Helper to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. CREATE USER PROFILE FUNCTION
DROP FUNCTION IF EXISTS create_user_profile(uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS create_user_profile(uuid, text, text, text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text,
  p_branch_id uuid,
  p_role_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_caller_branch_id uuid;
  v_result json;
  v_final_role_id uuid := p_role_id;
BEGIN
  -- Get caller's role and branch
  SELECT role, branch_id INTO v_caller_role, v_caller_branch_id
  FROM public.users
  WHERE id = auth.uid();

  -- Check authorization
  IF v_caller_role IS NULL THEN
    -- If no users exist yet in the database, allow creating the first user (bootstrap)
    IF NOT EXISTS (SELECT 1 FROM public.users) THEN
      v_caller_role := 'super_admin';
    ELSE
      RAISE EXCEPTION 'Unauthorized: User not found';
    END IF;
  END IF;

  -- If p_role_id is not provided, try to find it from the roles table using p_role as base_role
  IF v_final_role_id IS NULL AND p_role IS NOT NULL THEN
    SELECT id INTO v_final_role_id
    FROM public.roles
    WHERE base_role = p_role OR name = p_role
    LIMIT 1;
  END IF;

  -- Super admins can create any user
  IF v_caller_role = 'super_admin' THEN
    INSERT INTO public.users (id, email, full_name, phone, role, branch_id, role_id, is_active)
    VALUES (p_user_id, p_email, p_full_name, p_phone, p_role, p_branch_id, v_final_role_id, true);
    
    v_result := json_build_object('success', true, 'user_id', p_user_id);
    RETURN v_result;
  END IF;

  -- Branch admins can create users for their branch (except super_admins)
  IF v_caller_role = 'admin' AND v_caller_branch_id = p_branch_id THEN
    IF p_role = 'super_admin' THEN
      RAISE EXCEPTION 'Unauthorized: Branch admins cannot create super_admin users';
    END IF;

    INSERT INTO public.users (id, email, full_name, phone, role, branch_id, role_id, is_active)
    VALUES (p_user_id, p_email, p_full_name, p_phone, p_role, p_branch_id, v_final_role_id, true);
    
    v_result := json_build_object('success', true, 'user_id', p_user_id);
    RETURN v_result;
  END IF;

  -- If we get here, user is not authorized
  RAISE EXCEPTION 'Unauthorized: Insufficient permissions';
END;
$$;

-- 3. PUBLIC SIGNUP FUNCTION
CREATE OR REPLACE FUNCTION public_signup(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  -- Validate role (only allow admin and super_admin for signup)
  IF p_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: Only admin and super_admin roles are allowed';
  END IF;

  -- Insert user profile
  INSERT INTO public.users (id, email, full_name, phone, role, branch_id, is_active)
  VALUES (p_user_id, p_email, p_full_name, p_phone, p_role, NULL, true);
  
  v_result := json_build_object('success', true, 'user_id', p_user_id);
  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'User already exists';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating user: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public_signup TO anon, authenticated;

-- 4. DELETE USER ACCOUNT FUNCTION
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role text;
  v_result json;
BEGIN
  -- 1. Get caller's role
  SELECT role INTO v_caller_role
  FROM public.users
  WHERE id = auth.uid();

  -- 2. Authorization check: Only super_admins can delete users
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only super admins can delete users';
  END IF;

  -- 3. Safety check: Prevent users from deleting themselves
  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Action Denied: You cannot delete your own account';
  END IF;

  -- 4. Delete the user from auth.users
  DELETE FROM auth.users WHERE id = p_user_id;

  -- 5. Return success result
  v_result := jsonb_build_object(
    'success', true,
    'message', 'User account and profile deleted successfully'
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$$;

-- 5. IS CHAT PARTICIPANT FUNCTION
CREATE OR REPLACE FUNCTION public.is_chat_participant(conv_id UUID, user_auth_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.chat_participants 
    WHERE conversation_id = conv_id 
    AND user_id = user_auth_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. PUBLIC REGISTRATION NOTIFICATION FUNCTION
CREATE OR REPLACE FUNCTION public.handle_public_registration_notification()
RETURNS TRIGGER AS $$
DECLARE
    staff_record RECORD;
BEGIN
    FOR staff_record IN 
        SELECT id 
        FROM public.users 
        WHERE branch_id = NEW.branch_id 
        AND role IN ('admin', 'receptionist', 'super_admin')
        AND is_active = true
    LOOP
        INSERT INTO public.notifications (
            branch_id,
            user_id,
            title,
            message,
            type,
            is_read,
            link
        ) VALUES (
            NEW.branch_id,
            staff_record.id,
            'New Public Registration',
            NEW.full_name || ' has registered via the public link and is awaiting approval.',
            'registration',
            false,
            '/patients'
        );
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. ADVANCED FILE NUMBER MANAGEMENT FUNCTION
CREATE OR REPLACE FUNCTION public.handle_patient_file_number_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.file_number IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.file_number IS DISTINCT FROM OLD.file_number AND NEW.file_number IS NOT NULL) THEN
        UPDATE public.file_number_pool SET is_occupied = true WHERE file_number = NEW.file_number;
    END IF;

    IF (TG_OP = 'UPDATE' AND OLD.file_number IS NOT NULL AND (NEW.file_number IS NULL OR NEW.file_number IS DISTINCT FROM OLD.file_number)) THEN
        UPDATE public.file_number_pool SET is_occupied = false WHERE file_number = OLD.file_number;
    END IF;

    IF (TG_OP = 'UPDATE' AND NEW.status = 'deceased' AND OLD.status != 'deceased' AND NEW.file_number IS NOT NULL) THEN
        UPDATE public.file_number_pool SET is_occupied = false WHERE file_number = NEW.file_number;
        NEW.file_number := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. AUTOMATIC TEMPLATES CREATION ON BRANCH INSERT FUNCTION
CREATE OR REPLACE FUNCTION public.handle_new_branch_templates()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  SELECT NEW.id, 'Appointment Booked Notification', 'appointment_booked',
    'Your Booking at SpiritMed Medical - {doctor_name}',
    'Dear {patient_name},<br/><br/>Your appointment with <strong>{doctor_name}</strong> has been successfully booked for <strong>{date}</strong> at <strong>{time}</strong>.<br/><br/>We look forward to seeing you.<br/><br/>Regards,<br/>SpiritMed Team',
    'appointment', '["patient_name", "doctor_name", "date", "time"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE branch_id = NEW.id AND name = 'Appointment Booked Notification');

  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  SELECT NEW.id, 'Appointment Confirmation', 'appointment_confirmed',
    'CONFIRMED: Your Appointment on {date}',
    'Dear {patient_name},<br/><br/>Confirming your appointment with <strong>{doctor_name}</strong> on <strong>{date}</strong> at <strong>{time}</strong>.<br/><br/>Please arrive 10 minutes early for check-in.<br/><br/>Regards,<br/>SpiritMed Team',
    'appointment', '["patient_name", "doctor_name", "date", "time"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE branch_id = NEW.id AND name = 'Appointment Confirmation');

  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  SELECT NEW.id, 'Payment Receipt', 'payment_received',
    'Payment Received - Invoice {invoice_number}',
    'Dear {patient_name},<br/><br/>We have successfully received your payment of <strong>{amount}</strong> for Invoice <strong>#{invoice_number}</strong>.<br/><br/>Your updated balance is: <strong>{balance}</strong>.<br/><br/>Thank you for your prompt payment.<br/><br/>Regards,<br/>Accounting Department',
    'billing', '["patient_name", "amount", "invoice_number", "balance"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE branch_id = NEW.id AND name = 'Payment Receipt');

  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  SELECT NEW.id, 'Welcome to SpiritMed', 'patient_registered',
    'Welcome to SpiritMed Medical System',
    'Dear {patient_name},<br/><br/>Welcome to SpiritMed Medical System! Your patient profile has been successfully created.<br/><br/>We are committed to providing you with the highest quality of healthcare.<br/><br/>Regards,<br/>Administration Team',
    'clinical', '["patient_name"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE branch_id = NEW.id AND name = 'Welcome to SpiritMed');

  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  SELECT NEW.id, 'appointment_booked', 'DEFAULT_BOOKED_ID',
    'Dear {patient_name}, your appointment with {doctor_name} has been booked for {date} at {time}. Thank you for choosing SpiritMed.',
    '["patient_name", "doctor_name", "date", "time"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates WHERE branch_id = NEW.id AND trigger_type = 'appointment_booked');

  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  SELECT NEW.id, 'appointment_confirmed', 'DEFAULT_CONFIRMED_ID',
    'Dear {patient_name}, your appointment with {doctor_name} on {date} at {time} has been confirmed. We look forward to seeing you.',
    '["patient_name", "doctor_name", "date", "time"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates WHERE branch_id = NEW.id AND trigger_type = 'appointment_confirmed');

  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  SELECT NEW.id, 'payment_received', 'DEFAULT_PAYMENT_ID',
    'Hello {patient_name}, we have received your payment of {amount} for invoice {invoice_number}. Your remaining balance is {balance}. Thank you!',
    '["patient_name", "amount", "invoice_number", "balance"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates WHERE branch_id = NEW.id AND trigger_type = 'payment_received');

  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  SELECT NEW.id, 'patient_registered', 'DEFAULT_REG_ID',
    'Welcome {patient_name} to SpiritMed Medical System. Your registration is successful. We are here to provide you with the best care.',
    '["patient_name"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates WHERE branch_id = NEW.id AND trigger_type = 'patient_registered');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- SECTION 6: TRIGGERS DEFINITIONS
-- ==========================================

-- 1. medical_aids and referral_doctors updated_at triggers
CREATE TRIGGER update_medical_aids_updated_at BEFORE UPDATE ON public.medical_aids
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_doctors_updated_at BEFORE UPDATE ON public.referral_doctors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. public registration notifications trigger
DROP TRIGGER IF EXISTS on_public_registration_insert ON public.patient_temporary_db;
CREATE TRIGGER on_public_registration_insert
  AFTER INSERT ON public.patient_temporary_db
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_public_registration_notification();

-- 3. patients file number management trigger
DROP TRIGGER IF EXISTS tr_patient_file_number_management ON public.patients;
CREATE TRIGGER tr_patient_file_number_management
  BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_patient_file_number_change();

-- 4. Automatic branch template seeding trigger
DROP TRIGGER IF EXISTS tr_new_branch_templates ON public.branches;
CREATE TRIGGER tr_new_branch_templates
  AFTER INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_branch_templates();

-- ==========================================
-- SECTION 7: STORAGE SETUP & POLICIES
-- ==========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for Storage
CREATE POLICY "Public Access for Branding"
  ON storage.objects FOR SELECT
  USING ( bucket_id = 'branding' );

CREATE POLICY "Authenticated Manage Branding"
  ON storage.objects FOR ALL
  TO authenticated
  USING ( bucket_id = 'branding' )
  WITH CHECK ( bucket_id = 'branding' );

-- ==========================================