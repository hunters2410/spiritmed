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
  -- Insert default email templates
  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  VALUES
    (NEW.id, 'Appointment Booked Notification', 'appointment_booked', 'Your Booking at SpiritMed Medical - {doctor_name}', 'Dear {patient_name},<br/><br/>Your appointment with <strong>{doctor_name}</strong> has been successfully booked for <strong>{date}</strong> at <strong>{time}</strong>.<br/><br/>We look forward to seeing you.<br/><br/>Regards,<br/>SpiritMed Team', 'appointment', '["patient_name", "doctor_name", "date", "time"]'::jsonb, true),
    (NEW.id, 'Appointment Confirmation', 'appointment_confirmed', 'CONFIRMED: Your Appointment on {date}', 'Dear {patient_name},<br/><br/>Confirming your appointment with <strong>{doctor_name}</strong> on <strong>{date}</strong> at <strong>{time}</strong>.<br/><br/>Please arrive 10 minutes early for check-in.<br/><br/>Regards,<br/>SpiritMed Team', 'appointment', '["patient_name", "doctor_name", "date", "time"]'::jsonb, true),
    (NEW.id, 'Payment Receipt - Invoice {invoice_number}', 'payment_received', 'Payment Received - Invoice {invoice_number}', 'Dear {patient_name},<br/><br/>We have successfully received your payment of <strong>{amount}</strong> for Invoice <strong>#{invoice_number}</strong>.<br/><br/>Your updated balance is: <strong>{balance}</strong>.<br/><br/>Thank you for your prompt payment.<br/><br/>Regards,<br/>Accounting Department', 'billing', '["patient_name", "amount", "invoice_number", "balance"]'::jsonb, true),
    (NEW.id, 'Welcome to SpiritMed', 'patient_registered', 'Welcome to SpiritMed Medical System', 'Dear {patient_name},<br/><br/>Welcome to SpiritMed Medical System! Your patient profile has been successfully created.<br/><br/>We are committed to providing you with the highest quality of healthcare.<br/><br/>Regards,<br/>Administration Team', 'clinical', '["patient_name"]'::jsonb, true)
  ON CONFLICT (branch_id, name) DO NOTHING;

  -- Insert default SMS templates
  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  VALUES
    (NEW.id, 'appointment_booked', 'DEFAULT_BOOKED_ID', 'Dear {patient_name}, your appointment with {doctor_name} has been booked for {date} at {time}. Thank you for choosing SpiritMed.', '["patient_name", "doctor_name", "date", "time"]'::jsonb, true),
    (NEW.id, 'appointment_confirmed', 'DEFAULT_CONFIRMED_ID', 'Dear {patient_name}, your appointment with {doctor_name} on {date} at {time} has been confirmed. We look forward to seeing you.', '["patient_name", "doctor_name", "date", "time"]'::jsonb, true),
    (NEW.id, 'payment_received', 'DEFAULT_PAYMENT_ID', 'Hello {patient_name}, we have received your payment of {amount} for invoice {invoice_number}. Your remaining balance is {balance}. Thank you!', '["patient_name", "amount", "invoice_number", "balance"]'::jsonb, true),
    (NEW.id, 'patient_registered', 'DEFAULT_REG_ID', 'Welcome {patient_name} to SpiritMed Medical System. Your registration is successful. We are here to provide you with the best care.', '["patient_name"]'::jsonb, true)
  ON CONFLICT (branch_id, trigger_type) DO NOTHING;

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

-- 1. Seed Medicine Frequencies
INSERT INTO public.medicine_frequencies (branch_id, name, description) VALUES
  (NULL, 'OD', 'Once daily'),
  (NULL, 'BD', 'Twice daily'),
  (NULL, 'TDS', 'Three times daily'),
  (NULL, 'QID', 'Four times daily'),
  (NULL, 'STAT', 'Immediately'),
  (NULL, 'PRN', 'As needed'),
  (NULL, 'nocte', 'At night'),
  (NULL, 'mane', 'In the morning'),
  (NULL, 'pc', 'After meals'),
  (NULL, 'ac', 'Before meals')
ON CONFLICT (branch_id, name) DO NOTHING;

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
WHERE u.id IS NULL
ON CONFLICT (id) DO UPDATE 
SET role = 'super_admin', 
    role_id = (SELECT id FROM public.roles WHERE name = 'Super Admin' LIMIT 1),
    is_active = true;



