-- =====================================================
-- SPIRITMED MIGRATION - PART 1 of 3
-- RUN FIRST: Extensions + Tables + Foreign Keys
-- =====================================================

-- =====================================================
-- SPIRITMED CONSOLIDATED DATABASE SCHEMAS AND POLICIES
-- =====================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Table Structures
CREATE TABLE public.accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'revenue'::text, 'expense'::text])),
  sub_type text,
  is_system boolean DEFAULT false,
  is_active boolean DEFAULT true,
  description text,
  parent_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.admission_forms (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid,
  patient_id uuid,
  doctor_id uuid,
  hospital text,
  admission_date timestamp with time zone DEFAULT now(),
  diagnosis_id uuid,
  procedure_text text,
  procedure_date date,
  plan_bloods TEXT[],
  plan_imaging TEXT[],
  plan_other text,
  npo_oral text,
  iv_fluids text,
  medication text,
  other text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  hospital_id uuid,
  npo_date date,
  npo_time time without time zone,
  CONSTRAINT admission_forms_pkey PRIMARY KEY (id)
);

CREATE TABLE public.admission_letters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  doctor_id uuid,
  admission_date timestamp with time zone DEFAULT now(),
  reason text,
  ward text,
  bed_number text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admission_letters_pkey PRIMARY KEY (id)
);

CREATE TABLE public.anaesthetists (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid,
  full_name text NOT NULL,
  specialization text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT anaesthetists_pkey PRIMARY KEY (id)
);

CREATE TABLE public.appointment_slots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  branch_id uuid,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone NOT NULL,
  is_booked boolean DEFAULT false,
  appointment_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  slot_date date NOT NULL,
  CONSTRAINT appointment_slots_pkey PRIMARY KEY (id)
);

CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  doctor_id uuid,
  appointment_date timestamp with time zone NOT NULL,
  duration_minutes integer DEFAULT 30,
  appointment_type text,
  status text DEFAULT 'pending_confirmation'::text CHECK (status = ANY (ARRAY['pending_confirmation'::text, 'confirmed'::text, 'cancelled'::text, 'treated'::text, 'completed'::text])),
  notes text,
  cancellation_reason text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT appointments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.assistants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid,
  full_name text NOT NULL,
  role text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT assistants_pkey PRIMARY KEY (id)
);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  user_id uuid,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamp with time zone DEFAULT now(),
  details text,
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bill_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid,
  description text NOT NULL,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total_price numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  code text,
  CONSTRAINT bill_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  bill_number text NOT NULL UNIQUE,
  invoice_date timestamp with time zone DEFAULT now(),
  due_date timestamp with time zone,
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  status text DEFAULT 'unpaid'::text CHECK (status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'cancelled'::text])),
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  paid_amount numeric DEFAULT 0,
  balance numeric,
  discount_amount numeric DEFAULT 0,
  medical_aid_amount numeric DEFAULT 0,
  shortfall_amount numeric DEFAULT 0,
  bill_date date,
  medical_aid_id uuid,
  payment_method text CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'bank_transfer'::text, 'medical_aid'::text])),
  medical_aid_balance numeric DEFAULT 0,
  shortfall_balance numeric DEFAULT 0,
  CONSTRAINT bills_pkey PRIMARY KEY (id)
);

CREATE TABLE public.branches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  country text,
  logo_url text,
  website_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  signature_url text,
  website text,
  CONSTRAINT branches_pkey PRIMARY KEY (id)
);

CREATE TABLE public.chat_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  last_message text,
  last_message_at timestamp with time zone DEFAULT now(),
  is_group boolean DEFAULT false,
  name text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chat_conversations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid,
  sender_id uuid,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id)
);

CREATE TABLE public.chat_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid,
  user_id uuid,
  last_read_at timestamp with time zone DEFAULT now(),
  joined_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chat_participants_pkey PRIMARY KEY (id)
);

CREATE TABLE public.complaints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT complaints_pkey PRIMARY KEY (id)
);

CREATE TABLE public.consultations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  appointment_id uuid,
  patient_id uuid,
  doctor_id uuid,
  consultation_date timestamp with time zone DEFAULT now(),
  chief_complaint text,
  history text,
  examination text,
  diagnosis text,
  treatment_plan text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  investigations text,
  referred_by uuid,
  follow_up_period text,
  follow_up_time text,
  follow_up_date date,
  status text DEFAULT 'completed'::text,
  medical_history text,
  physical_examination text,
  CONSTRAINT consultations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.diagnoses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  icd10_code text,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  CONSTRAINT diagnoses_pkey PRIMARY KEY (id)
);

CREATE TABLE public.discharge_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  doctor_id uuid,
  admission_date timestamp with time zone,
  discharge_date timestamp with time zone,
  reason_for_admission text,
  treatment_summary text,
  discharge_diagnosis text,
  medications_on_discharge text,
  follow_up_instructions text,
  created_at timestamp with time zone DEFAULT now(),
  diagnosis_ids UUID[] DEFAULT '{}'::uuid[],
  diagnosis_id uuid,
  recipient text,
  diagnosis_text text,
  medical_history text,
  treatment_done text,
  follow_up_plan text,
  report_date date DEFAULT CURRENT_DATE,
  CONSTRAINT discharge_summaries_pkey PRIMARY KEY (id)
);

CREATE TABLE public.doctor_availability (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  branch_id uuid,
  day_of_week integer NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  break_start_time time without time zone,
  break_end_time time without time zone,
  slot_duration integer DEFAULT 30,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT doctor_availability_pkey PRIMARY KEY (id)
);

CREATE TABLE public.doctor_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doctor_id uuid,
  branch_id uuid,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  is_available boolean DEFAULT true,
  max_appointments integer DEFAULT 0,
  slot_duration_minutes integer DEFAULT 30,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT doctor_schedules_pkey PRIMARY KEY (id)
);

CREATE TABLE public.edit_approval_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  requestor_id uuid,
  requestor_name text NOT NULL,
  record_type text NOT NULL CHECK (record_type = ANY (ARRAY['payment'::text, 'bill'::text])),
  record_id text NOT NULL,
  record_context text,
  reason text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text, 'cancelled'::text])),
  reviewed_by uuid,
  reviewer_name text,
  reviewed_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '00:05:00'::interval),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT edit_approval_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.email_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  recipient_email text NOT NULL,
  subject text,
  body text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['sent'::text, 'failed'::text, 'pending'::text])),
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  recipient_name text,
  sender_id uuid,
  reference_id uuid,
  reference_type text,
  CONSTRAINT email_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  category text DEFAULT 'general'::text,
  placeholders jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  trigger_type text,
  CONSTRAINT email_templates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.estimate_bill_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  estimate_id uuid,
  procedure_id uuid,
  description text NOT NULL,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total_price numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  code text,
  CONSTRAINT estimate_bill_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.estimate_bills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  estimate_number text NOT NULL UNIQUE,
  estimate_date timestamp with time zone DEFAULT now(),
  payment_method text CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'bank_transfer'::text, 'medical_aid'::text])),
  medical_aid_id uuid,
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'invoiced'::text, 'cancelled'::text])),
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  converted_invoice_id uuid,
  discount_amount numeric DEFAULT 0,
  medical_aid_amount numeric DEFAULT 0,
  shortfall_amount numeric DEFAULT 0,
  CONSTRAINT estimate_bills_pkey PRIMARY KEY (id)
);

CREATE TABLE public.expense_categories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT expense_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  category text,
  description text,
  amount numeric NOT NULL,
  expense_date timestamp with time zone DEFAULT now(),
  payment_method text,
  receipt_url text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  category_id uuid,
  recorded_by uuid,
  CONSTRAINT expenses_pkey PRIMARY KEY (id)
);

CREATE TABLE public.file_number_pool (
  file_number text NOT NULL,
  is_occupied boolean DEFAULT false,
  branch_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT file_number_pool_pkey PRIMARY KEY (file_number)
);

CREATE TABLE public.follow_ups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  doctor_id uuid,
  consultation_id uuid,
  follow_up_date timestamp with time zone NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text])),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT follow_ups_pkey PRIMARY KEY (id)
);

CREATE TABLE public.histology_types (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  value text,
  branch_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT histology_types_pkey PRIMARY KEY (id)
);

CREATE TABLE public.holidays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  holiday_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT holidays_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hospital_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  file_type text,
  file_url text NOT NULL,
  category text,
  file_size integer,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  tags TEXT[],
  description text,
  CONSTRAINT hospital_files_pkey PRIMARY KEY (id)
);

CREATE TABLE public.hospitals (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid,
  name text NOT NULL,
  address text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hospitals_pkey PRIMARY KEY (id)
);

CREATE TABLE public.internal_chats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  sender_id uuid,
  receiver_id uuid,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT internal_chats_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_categories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  category text,
  description text,
  sku text,
  unit text,
  quantity numeric DEFAULT 0,
  reorder_level numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  supplier text,
  expiry_date date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  category_id uuid,
  unit_id uuid,
  supplier_id uuid,
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  item_id uuid,
  transaction_type text CHECK (transaction_type = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text])),
  quantity numeric NOT NULL,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_units (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT inventory_units_pkey PRIMARY KEY (id)
);

CREATE TABLE public.investigations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT investigations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.journal_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  entry_number text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  reference_type text,
  reference_id text,
  is_posted boolean DEFAULT true,
  created_by uuid,
  posted_by uuid,
  posted_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT journal_entries_pkey PRIMARY KEY (id)
);

CREATE TABLE public.journal_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  journal_entry_id uuid,
  account_id uuid,
  description text,
  debit numeric NOT NULL DEFAULT 0.00,
  credit numeric NOT NULL DEFAULT 0.00,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT journal_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.lab_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  ordered_by uuid,
  test_name text NOT NULL,
  test_date timestamp with time zone DEFAULT now(),
  result text,
  reference_range text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text])),
  notes text,
  file_url text,
  created_at timestamp with time zone DEFAULT now(),
  histology_type_id uuid,
  CONSTRAINT lab_results_pkey PRIMARY KEY (id)
);

CREATE TABLE public.leave_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  user_id uuid,
  leave_type text CHECK (leave_type = ANY (ARRAY['annual'::text, 'sick'::text, 'maternity'::text, 'unpaid'::text])),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  approved_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT leave_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.medical_aids (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT medical_aids_pkey PRIMARY KEY (id)
);

CREATE TABLE public.medical_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  doctor_id uuid,
  issue_date timestamp with time zone DEFAULT now(),
  valid_from date,
  valid_to date,
  purpose text,
  diagnosis text,
  recommendations text,
  created_at timestamp with time zone DEFAULT now(),
  date_attended date DEFAULT CURRENT_DATE,
  illness_date date,
  resume_date date,
  period integer,
  time_unit text,
  report_date date DEFAULT CURRENT_DATE,
  CONSTRAINT medical_certificates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.medical_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  doctor_id uuid,
  report_type text NOT NULL,
  report_date timestamp with time zone DEFAULT now(),
  content text,
  file_url text,
  created_at timestamp with time zone DEFAULT now(),
  diagnosis_id uuid,
  recipient text,
  status text DEFAULT 'active'::text,
  CONSTRAINT medical_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE public.medicine_frequencies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT medicine_frequencies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.medicines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  dosage text,
  route text,
  frequency_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT medicines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  user_id uuid,
  title text NOT NULL,
  message text NOT NULL,
  type text,
  is_read boolean DEFAULT false,
  link text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.online_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  doctor_id uuid,
  slot_id uuid,
  patient_full_name text NOT NULL,
  patient_phone text NOT NULL,
  patient_email text,
  patient_gender text,
  patient_dob date,
  appointment_type text DEFAULT 'consultation'::text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT online_bookings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operation_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  surgeon_id uuid,
  operation_date timestamp with time zone DEFAULT now(),
  operation_name text NOT NULL,
  pre_operative_diagnosis text,
  post_operative_diagnosis text,
  procedure_description text,
  findings text,
  complications text,
  created_at timestamp with time zone DEFAULT now(),
  hospital_id uuid,
  anaesthetist_id uuid,
  assistant_id uuid,
  procedure_id uuid,
  hospital text,
  anaesthetist text,
  assistant text,
  anaesthesia_type text,
  procedure_text text,
  post_op_plan text,
  follow_up_date date,
  follow_up_time time without time zone,
  CONSTRAINT operation_reports_pkey PRIMARY KEY (id)
);

CREATE TABLE public.patient_files (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  file_name text NOT NULL,
  file_type text,
  file_url text NOT NULL,
  file_size integer,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  title text,
  notes text,
  upload_date date,
  CONSTRAINT patient_files_pkey PRIMARY KEY (id)
);

CREATE TABLE public.patient_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  patient_id uuid,
  branch_id uuid,
  title text NOT NULL,
  description text,
  resource_type text NOT NULL CHECK (resource_type = ANY (ARRAY['video_link'::text, 'video_file'::text, 'pdf_file'::text, 'other'::text])),
  url text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  shared_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT patient_resources_pkey PRIMARY KEY (id)
);

CREATE TABLE public.patient_temporary_db (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  title text,
  full_name text NOT NULL,
  gender text,
  email text,
  address text,
  phone text,
  date_of_birth date,
  clinical_history text,
  chronic_medications text,
  smoke text,
  alcohol text,
  flags text,
  allergies text,
  chronic_conditions text,
  occupation text,
  blood_group text,
  emergency_contact_name text,
  emergency_contact_phone text,
  next_of_kin_address text,
  next_of_kin_relation text,
  next_of_kin_email text,
  responsible_person_name text,
  responsible_person_address text,
  responsible_person_phone text,
  responsible_person_id_number text,
  responsible_person_email text,
  payment_method text,
  medical_aid_id uuid,
  medical_aid_number text,
  medical_aid_suffix text,
  medical_aid_main_member text,
  referral_doctor_id uuid,
  send_sms boolean DEFAULT false,
  submitted_at timestamp with time zone DEFAULT now(),
  id_passport_number text,
  age integer,
  initial_consultation_date date,
  food_allergies text,
  medication_allergies text,
  referring_doctor text,
  gp_practitioner text,
  specialist_doctor text,
  emergency_contact_relationship text,
  emergency_contact_id text,
  emergency_contact_address text,
  emergency_contact_email text,
  next_of_kin_name text,
  next_of_kin_phone text,
  next_of_kin_id text,
  next_of_kin_relationship text,
  file_number text,
  CONSTRAINT patient_temporary_db_pkey PRIMARY KEY (id)
);

CREATE TABLE public.patients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  date_of_birth date,
  gender text,
  phone text,
  email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  medical_aid_id uuid,
  blood_group text,
  allergies text,
  chronic_conditions text,
  status text DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'discharged'::text, 'deceased'::text])),
  discharge_date timestamp with time zone,
  death_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  title text,
  occupation text,
  password text,
  doctor_id uuid,
  clinical_history text,
  chronic_medications text,
  smoke text DEFAULT 'never'::text,
  alcohol text DEFAULT 'never'::text,
  flags text,
  next_of_kin_address text,
  next_of_kin_relation text,
  next_of_kin_email text,
  responsible_person_name text,
  responsible_person_address text,
  responsible_person_phone text,
  responsible_person_id_number text,
  responsible_person_email text,
  payment_method text DEFAULT 'cash'::text,
  medical_aid_number text,
  medical_aid_suffix text,
  medical_aid_main_member text,
  referral_doctor_id uuid,
  send_sms boolean DEFAULT false,
  deceased_date date,
  deceased_reason text,
  discharged_date date,
  discharge_status text,
  discharge_notes text,
  id_passport_number text,
  age integer,
  initial_consultation_date date,
  food_allergies text,
  medication_allergies text,
  referring_doctor text,
  gp_practitioner text,
  specialist_doctor text,
  emergency_contact_relationship text,
  emergency_contact_id text,
  emergency_contact_address text,
  emergency_contact_email text,
  next_of_kin_name text,
  next_of_kin_phone text,
  next_of_kin_id text,
  next_of_kin_relationship text,
  file_number text UNIQUE,
  default_payment_method text DEFAULT 'cash'::text,
  CONSTRAINT patients_pkey PRIMARY KEY (id)
);

CREATE TABLE public.payment_procedures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  code text NOT NULL,
  name text NOT NULL,
  price numeric DEFAULT 0,
  category text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_procedures_pkey PRIMARY KEY (id)
);

CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  bill_id uuid,
  patient_id uuid,
  payment_date timestamp with time zone DEFAULT now(),
  amount numeric NOT NULL,
  payment_method text CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'bank_transfer'::text, 'medical_aid'::text])),
  reference_number text,
  notes text,
  received_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  discount_amount numeric DEFAULT 0,
  target_portion text DEFAULT 'standard'::text,
  CONSTRAINT payments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.payroll (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  user_id uuid,
  period_start date NOT NULL,
  period_end date NOT NULL,
  basic_salary numeric DEFAULT 0,
  allowances numeric DEFAULT 0,
  deductions numeric DEFAULT 0,
  net_salary numeric DEFAULT 0,
  payment_date timestamp with time zone,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text])),
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  gross_salary numeric DEFAULT 0,
  paye numeric DEFAULT 0,
  nssa numeric DEFAULT 0,
  aids_levy numeric DEFAULT 0,
  period_month integer,
  period_year integer,
  CONSTRAINT payroll_pkey PRIMARY KEY (id)
);

CREATE TABLE public.payroll_settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid NOT NULL UNIQUE,
  paye_enabled boolean DEFAULT true,
  nssa_enabled boolean DEFAULT true,
  aids_levy_enabled boolean DEFAULT true,
  nssa_rate numeric DEFAULT 4.5,
  nssa_limit numeric DEFAULT 700,
  aids_levy_rate numeric DEFAULT 3.0,
  tax_brackets jsonb DEFAULT '[{"max": 100, "min": 0, "rate": 0}, {"max": 300, "min": 101, "rate": 20}, {"max": 1000, "min": 301, "rate": 25}, {"max": 2000, "min": 1001, "rate": 30}, {"max": 3000, "min": 2001, "rate": 35}, {"max": 9999999, "min": 3001, "rate": 40}]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payroll_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.prescription_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  prescription_id uuid,
  medicine_id uuid,
  period text,
  time_unit text DEFAULT 'Days'::text,
  advice text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT prescription_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.prescriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  doctor_id uuid,
  consultation_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  prescription_number text,
  prescription_date date DEFAULT CURRENT_DATE,
  notes text,
  status text DEFAULT 'active'::text,
  CONSTRAINT prescriptions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.referral_doctors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  full_name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  name text,
  address text,
  contact text,
  email text,
  affiliation text,
  CONSTRAINT referral_doctors_pkey PRIMARY KEY (id)
);

CREATE TABLE public.referral_forms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  referring_doctor_id uuid,
  referred_to_doctor_id uuid,
  referral_date timestamp with time zone DEFAULT now(),
  reason text,
  clinical_notes text,
  urgency text,
  created_at timestamp with time zone DEFAULT now(),
  doctor_id uuid,
  recipient text,
  reason_for_referral text,
  background_history text,
  treatment_done text,
  report_date date DEFAULT CURRENT_DATE,
  CONSTRAINT referral_forms_pkey PRIMARY KEY (id)
);

CREATE TABLE public.roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  description text,
  base_role text NOT NULL CHECK (base_role = ANY (ARRAY['doctor'::text, 'nurse'::text, 'receptionist'::text, 'accountant'::text, 'admin'::text])),
  permissions jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT roles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.salary_configurations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE,
  basic_salary numeric NOT NULL DEFAULT 0,
  housing_allowance numeric NOT NULL DEFAULT 0,
  transport_allowance numeric NOT NULL DEFAULT 0,
  other_allowances numeric NOT NULL DEFAULT 0,
  medical_aid_deduction numeric NOT NULL DEFAULT 0,
  pension_deduction numeric NOT NULL DEFAULT 0,
  branch_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  custom_deductions jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT salary_configurations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sms_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  phone_number text NOT NULL,
  message_body text NOT NULL,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['sending'::text, 'sent'::text, 'failed'::text, 'pending'::text])),
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  patient_id uuid,
  template_id text,
  provider text DEFAULT 'msg91'::text,
  CONSTRAINT sms_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sms_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  trigger_type text NOT NULL,
  provider_template_id text NOT NULL,
  is_active boolean DEFAULT true,
  variables jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  message_body text,
  CONSTRAINT sms_templates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.staff_attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  user_id uuid,
  date date NOT NULL,
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  status text CHECK (status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'on_leave'::text])),
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT staff_attendance_pkey PRIMARY KEY (id)
);

CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  branch_id uuid NOT NULL,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.surgical_procedures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT surgical_procedures_pkey PRIMARY KEY (id)
);

CREATE TABLE public.system_configurations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  config_type text NOT NULL,
  config_name text NOT NULL,
  config_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  branch_id uuid,
  CONSTRAINT system_configurations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT system_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.users (
  id uuid NOT NULL,
  branch_id uuid,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'doctor'::text, 'nurse'::text, 'receptionist'::text, 'accountant'::text])),
  phone text,
  address text,
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  specialization text,
  qualifications text,
  signature_url text,
  role_id uuid,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.vital_signs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid,
  patient_id uuid,
  recorded_by uuid,
  recorded_at timestamp with time zone DEFAULT now(),
  temperature numeric,
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  heart_rate integer,
  respiratory_rate integer,
  oxygen_saturation numeric,
  weight numeric,
  height numeric,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vital_signs_pkey PRIMARY KEY (id)
);

-- 3. Foreign Key Constraints
ALTER TABLE public.accounts ADD CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.accounts(id);
ALTER TABLE public.admission_forms ADD CONSTRAINT admission_forms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.admission_forms ADD CONSTRAINT admission_forms_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.admission_forms ADD CONSTRAINT admission_forms_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.admission_forms ADD CONSTRAINT admission_forms_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.diagnoses(id);
ALTER TABLE public.admission_forms ADD CONSTRAINT admission_forms_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
ALTER TABLE public.admission_letters ADD CONSTRAINT admission_letters_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.admission_letters ADD CONSTRAINT admission_letters_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.admission_letters ADD CONSTRAINT admission_letters_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.anaesthetists ADD CONSTRAINT anaesthetists_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.appointment_slots ADD CONSTRAINT appointment_slots_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES auth.users(id);
ALTER TABLE public.appointment_slots ADD CONSTRAINT appointment_slots_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.assistants ADD CONSTRAINT assistants_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE public.bill_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id);
ALTER TABLE public.bills ADD CONSTRAINT invoices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.bills ADD CONSTRAINT invoices_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.bills ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.bills ADD CONSTRAINT bills_medical_aid_id_fkey FOREIGN KEY (medical_aid_id) REFERENCES public.medical_aids(id);
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);
ALTER TABLE public.chat_participants ADD CONSTRAINT chat_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chat_conversations(id);
ALTER TABLE public.chat_participants ADD CONSTRAINT chat_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE public.complaints ADD CONSTRAINT complaints_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.consultations ADD CONSTRAINT consultations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.consultations ADD CONSTRAINT consultations_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id);
ALTER TABLE public.consultations ADD CONSTRAINT consultations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.consultations ADD CONSTRAINT consultations_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.consultations ADD CONSTRAINT consultations_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.referral_doctors(id);
ALTER TABLE public.diagnoses ADD CONSTRAINT diagnoses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.discharge_summaries ADD CONSTRAINT discharge_summaries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.discharge_summaries ADD CONSTRAINT discharge_summaries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.discharge_summaries ADD CONSTRAINT discharge_summaries_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.discharge_summaries ADD CONSTRAINT discharge_summaries_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.diagnoses(id);
ALTER TABLE public.doctor_availability ADD CONSTRAINT doctor_availability_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES auth.users(id);
ALTER TABLE public.doctor_schedules ADD CONSTRAINT doctor_schedules_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.doctor_schedules ADD CONSTRAINT doctor_schedules_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.edit_approval_requests ADD CONSTRAINT edit_approval_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.edit_approval_requests ADD CONSTRAINT edit_approval_requests_requestor_id_fkey FOREIGN KEY (requestor_id) REFERENCES public.users(id);
ALTER TABLE public.edit_approval_requests ADD CONSTRAINT edit_approval_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);
ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.estimate_bill_items ADD CONSTRAINT patient_bill_items_bill_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimate_bills(id);
ALTER TABLE public.estimate_bill_items ADD CONSTRAINT patient_bill_items_procedure_id_fkey FOREIGN KEY (procedure_id) REFERENCES public.payment_procedures(id);
ALTER TABLE public.estimate_bills ADD CONSTRAINT patient_bills_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.estimate_bills ADD CONSTRAINT patient_bills_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.estimate_bills ADD CONSTRAINT patient_bills_medical_aid_id_fkey FOREIGN KEY (medical_aid_id) REFERENCES public.medical_aids(id);
ALTER TABLE public.estimate_bills ADD CONSTRAINT patient_bills_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.estimate_bills ADD CONSTRAINT patient_bills_converted_invoice_id_fkey FOREIGN KEY (converted_invoice_id) REFERENCES public.bills(id);
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.expense_categories(id);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);
ALTER TABLE public.file_number_pool ADD CONSTRAINT file_number_pool_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.follow_ups ADD CONSTRAINT follow_ups_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.consultations(id);
ALTER TABLE public.histology_types ADD CONSTRAINT histology_types_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.holidays ADD CONSTRAINT holidays_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.hospital_files ADD CONSTRAINT hospital_files_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.hospital_files ADD CONSTRAINT hospital_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);
ALTER TABLE public.hospitals ADD CONSTRAINT hospitals_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.internal_chats ADD CONSTRAINT internal_chats_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.internal_chats ADD CONSTRAINT internal_chats_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);
ALTER TABLE public.internal_chats ADD CONSTRAINT internal_chats_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id);
ALTER TABLE public.inventory_categories ADD CONSTRAINT inventory_categories_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.inventory_categories(id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.inventory_units(id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.inventory_items(id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.inventory_units ADD CONSTRAINT inventory_units_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.investigations ADD CONSTRAINT investigations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.users(id);
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);
ALTER TABLE public.journal_lines ADD CONSTRAINT journal_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
ALTER TABLE public.lab_results ADD CONSTRAINT lab_results_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.lab_results ADD CONSTRAINT lab_results_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.lab_results ADD CONSTRAINT lab_results_ordered_by_fkey FOREIGN KEY (ordered_by) REFERENCES public.users(id);
ALTER TABLE public.lab_results ADD CONSTRAINT lab_results_histology_type_id_fkey FOREIGN KEY (histology_type_id) REFERENCES public.histology_types(id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);
ALTER TABLE public.medical_aids ADD CONSTRAINT medical_aids_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.medical_certificates ADD CONSTRAINT medical_certificates_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.medical_certificates ADD CONSTRAINT medical_certificates_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.medical_certificates ADD CONSTRAINT medical_certificates_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.medical_reports ADD CONSTRAINT medical_reports_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.medical_reports ADD CONSTRAINT medical_reports_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.medical_reports ADD CONSTRAINT medical_reports_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.medical_reports ADD CONSTRAINT medical_reports_diagnosis_id_fkey FOREIGN KEY (diagnosis_id) REFERENCES public.diagnoses(id);
ALTER TABLE public.medicine_frequencies ADD CONSTRAINT medicine_frequencies_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.medicines ADD CONSTRAINT medicines_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.medicines ADD CONSTRAINT medicines_frequency_id_fkey FOREIGN KEY (frequency_id) REFERENCES public.medicine_frequencies(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE public.online_bookings ADD CONSTRAINT online_bookings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.online_bookings ADD CONSTRAINT online_bookings_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.online_bookings ADD CONSTRAINT online_bookings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.appointment_slots(id);
ALTER TABLE public.operation_reports ADD CONSTRAINT operation_reports_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.operation_reports ADD CONSTRAINT operation_reports_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.operation_reports ADD CONSTRAINT operation_reports_surgeon_id_fkey FOREIGN KEY (surgeon_id) REFERENCES public.users(id);
ALTER TABLE public.operation_reports ADD CONSTRAINT operation_reports_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitals(id);
ALTER TABLE public.operation_reports ADD CONSTRAINT operation_reports_anaesthetist_id_fkey FOREIGN KEY (anaesthetist_id) REFERENCES public.anaesthetists(id);
ALTER TABLE public.operation_reports ADD CONSTRAINT operation_reports_assistant_id_fkey FOREIGN KEY (assistant_id) REFERENCES public.assistants(id);
ALTER TABLE public.operation_reports ADD CONSTRAINT operation_reports_procedure_id_fkey FOREIGN KEY (procedure_id) REFERENCES public.surgical_procedures(id);
ALTER TABLE public.patient_files ADD CONSTRAINT patient_files_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.patient_files ADD CONSTRAINT patient_files_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.patient_files ADD CONSTRAINT patient_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);
ALTER TABLE public.patient_resources ADD CONSTRAINT patient_resources_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.patient_resources ADD CONSTRAINT patient_resources_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.patient_resources ADD CONSTRAINT patient_resources_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.users(id);
ALTER TABLE public.patient_temporary_db ADD CONSTRAINT patient_temporary_db_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.patient_temporary_db ADD CONSTRAINT patient_temporary_db_medical_aid_id_fkey FOREIGN KEY (medical_aid_id) REFERENCES public.medical_aids(id);
ALTER TABLE public.patient_temporary_db ADD CONSTRAINT patient_temporary_db_referral_doctor_id_fkey FOREIGN KEY (referral_doctor_id) REFERENCES public.referral_doctors(id);
ALTER TABLE public.patients ADD CONSTRAINT patients_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.patients ADD CONSTRAINT patients_medical_aid_id_fkey FOREIGN KEY (medical_aid_id) REFERENCES public.medical_aids(id);
ALTER TABLE public.patients ADD CONSTRAINT patients_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.patients ADD CONSTRAINT patients_referral_doctor_id_fkey FOREIGN KEY (referral_doctor_id) REFERENCES public.referral_doctors(id);
ALTER TABLE public.payment_procedures ADD CONSTRAINT payment_procedures_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (bill_id) REFERENCES public.bills(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_received_by_fkey FOREIGN KEY (received_by) REFERENCES public.users(id);
ALTER TABLE public.payroll ADD CONSTRAINT payroll_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.payroll ADD CONSTRAINT payroll_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE public.payroll ADD CONSTRAINT payroll_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.payroll_settings ADD CONSTRAINT payroll_settings_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.prescription_items ADD CONSTRAINT prescription_items_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id);
ALTER TABLE public.prescription_items ADD CONSTRAINT prescription_items_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicines(id);
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_consultation_id_fkey FOREIGN KEY (consultation_id) REFERENCES public.consultations(id);
ALTER TABLE public.referral_doctors ADD CONSTRAINT referral_doctors_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.referral_forms ADD CONSTRAINT referral_forms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.referral_forms ADD CONSTRAINT referral_forms_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.referral_forms ADD CONSTRAINT referral_forms_referring_doctor_id_fkey FOREIGN KEY (referring_doctor_id) REFERENCES public.users(id);
ALTER TABLE public.referral_forms ADD CONSTRAINT referral_forms_referred_to_doctor_id_fkey FOREIGN KEY (referred_to_doctor_id) REFERENCES public.referral_doctors(id);
ALTER TABLE public.referral_forms ADD CONSTRAINT referral_forms_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.users(id);
ALTER TABLE public.roles ADD CONSTRAINT roles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.roles ADD CONSTRAINT roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.salary_configurations ADD CONSTRAINT salary_configurations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE public.salary_configurations ADD CONSTRAINT salary_configurations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.sms_templates ADD CONSTRAINT sms_templates_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.staff_attendance ADD CONSTRAINT staff_attendance_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.staff_attendance ADD CONSTRAINT staff_attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.surgical_procedures ADD CONSTRAINT surgical_procedures_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.system_configurations ADD CONSTRAINT system_configurations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
ALTER TABLE public.system_configurations ADD CONSTRAINT system_configurations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);
ALTER TABLE public.system_configurations ADD CONSTRAINT system_configurations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);
ALTER TABLE public.users ADD CONSTRAINT users_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.users ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);
ALTER TABLE public.vital_signs ADD CONSTRAINT vital_signs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.vital_signs ADD CONSTRAINT vital_signs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id);
ALTER TABLE public.vital_signs ADD CONSTRAINT vital_signs_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id);


-- ==========================================