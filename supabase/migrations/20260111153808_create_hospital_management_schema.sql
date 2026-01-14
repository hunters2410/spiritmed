/*
  # SpiritMed - Complete Database Schema

  ## Overview
  Multi-branch hospital management system with role-based access control for super admin, branch admin, doctors, nurses, receptionists, and accountants.

  ## 1. Core Tables
  
  ### branches
  - `id` (uuid, primary key)
  - `name` (text) - Branch/Hospital name
  - `email` (text)
  - `phone` (text)
  - `address` (text)
  - `city` (text)
  - `country` (text)
  - `logo_url` (text)
  - `website_config` (jsonb) - Website configuration
  - `is_active` (boolean)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### users
  - `id` (uuid, primary key) - Links to auth.users
  - `branch_id` (uuid, foreign key to branches)
  - `email` (text)
  - `full_name` (text)
  - `role` (text) - super_admin, admin, doctor, nurse, receptionist, accountant
  - `phone` (text)
  - `address` (text)
  - `avatar_url` (text)
  - `is_active` (boolean)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### patients
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_number` (text, unique)
  - `full_name` (text)
  - `date_of_birth` (date)
  - `gender` (text)
  - `phone` (text)
  - `email` (text)
  - `address` (text)
  - `emergency_contact_name` (text)
  - `emergency_contact_phone` (text)
  - `medical_aid_id` (uuid, foreign key)
  - `blood_group` (text)
  - `allergies` (text)
  - `chronic_conditions` (text)
  - `status` (text) - active, discharged, deceased
  - `discharge_date` (timestamptz)
  - `death_date` (timestamptz)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### medical_aids
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `name` (text)
  - `contact_person` (text)
  - `email` (text)
  - `phone` (text)
  - `address` (text)
  - `is_active` (boolean)
  - `created_at` (timestamptz)

  ### referral_doctors
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `full_name` (text)
  - `specialization` (text)
  - `phone` (text)
  - `email` (text)
  - `hospital` (text)
  - `is_active` (boolean)
  - `created_at` (timestamptz)

  ## 2. Appointment Management

  ### appointments
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `doctor_id` (uuid, foreign key to users)
  - `appointment_date` (timestamptz)
  - `duration_minutes` (integer)
  - `appointment_type` (text)
  - `status` (text) - pending_confirmation, confirmed, cancelled, completed
  - `notes` (text)
  - `cancellation_reason` (text)
  - `created_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### consultations
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `appointment_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `doctor_id` (uuid, foreign key to users)
  - `consultation_date` (timestamptz)
  - `chief_complaint` (text)
  - `history` (text)
  - `examination` (text)
  - `diagnosis` (text)
  - `treatment_plan` (text)
  - `notes` (text)
  - `created_at` (timestamptz)

  ## 3. Medical Records

  ### prescriptions
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `doctor_id` (uuid, foreign key to users)
  - `consultation_id` (uuid, foreign key)
  - `medication_name` (text)
  - `dosage` (text)
  - `frequency` (text)
  - `duration` (text)
  - `instructions` (text)
  - `created_at` (timestamptz)

  ### vital_signs
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `recorded_by` (uuid, foreign key to users)
  - `recorded_at` (timestamptz)
  - `temperature` (numeric)
  - `blood_pressure_systolic` (integer)
  - `blood_pressure_diastolic` (integer)
  - `heart_rate` (integer)
  - `respiratory_rate` (integer)
  - `oxygen_saturation` (numeric)
  - `weight` (numeric)
  - `height` (numeric)
  - `notes` (text)
  - `created_at` (timestamptz)

  ### lab_results
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `ordered_by` (uuid, foreign key to users)
  - `test_name` (text)
  - `test_date` (timestamptz)
  - `result` (text)
  - `reference_range` (text)
  - `status` (text) - pending, completed
  - `notes` (text)
  - `file_url` (text)
  - `created_at` (timestamptz)

  ### medical_reports
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `doctor_id` (uuid, foreign key to users)
  - `report_type` (text)
  - `report_date` (timestamptz)
  - `content` (text)
  - `file_url` (text)
  - `created_at` (timestamptz)

  ### discharge_summaries
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `doctor_id` (uuid, foreign key to users)
  - `admission_date` (timestamptz)
  - `discharge_date` (timestamptz)
  - `reason_for_admission` (text)
  - `treatment_summary` (text)
  - `discharge_diagnosis` (text)
  - `medications_on_discharge` (text)
  - `follow_up_instructions` (text)
  - `created_at` (timestamptz)

  ### admission_letters
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `doctor_id` (uuid, foreign key to users)
  - `admission_date` (timestamptz)
  - `reason` (text)
  - `ward` (text)
  - `bed_number` (text)
  - `created_at` (timestamptz)

  ### referral_forms
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `referring_doctor_id` (uuid, foreign key to users)
  - `referred_to_doctor_id` (uuid, foreign key to referral_doctors)
  - `referral_date` (timestamptz)
  - `reason` (text)
  - `clinical_notes` (text)
  - `urgency` (text)
  - `created_at` (timestamptz)

  ### operation_reports
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `surgeon_id` (uuid, foreign key to users)
  - `operation_date` (timestamptz)
  - `operation_name` (text)
  - `pre_operative_diagnosis` (text)
  - `post_operative_diagnosis` (text)
  - `procedure_description` (text)
  - `findings` (text)
  - `complications` (text)
  - `created_at` (timestamptz)

  ### medical_certificates
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `doctor_id` (uuid, foreign key to users)
  - `issue_date` (timestamptz)
  - `valid_from` (date)
  - `valid_to` (date)
  - `purpose` (text)
  - `diagnosis` (text)
  - `recommendations` (text)
  - `created_at` (timestamptz)

  ### follow_ups
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `doctor_id` (uuid, foreign key to users)
  - `consultation_id` (uuid, foreign key)
  - `follow_up_date` (timestamptz)
  - `status` (text) - pending, completed, cancelled
  - `notes` (text)
  - `created_at` (timestamptz)

  ## 4. Billing & Payments

  ### invoices
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `invoice_number` (text, unique)
  - `invoice_date` (timestamptz)
  - `due_date` (timestamptz)
  - `subtotal` (numeric)
  - `tax_amount` (numeric)
  - `total_amount` (numeric)
  - `status` (text) - unpaid, partially_paid, paid, cancelled
  - `notes` (text)
  - `created_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)

  ### invoice_items
  - `id` (uuid, primary key)
  - `invoice_id` (uuid, foreign key)
  - `description` (text)
  - `quantity` (numeric)
  - `unit_price` (numeric)
  - `total_price` (numeric)
  - `created_at` (timestamptz)

  ### payments
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `invoice_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `payment_date` (timestamptz)
  - `amount` (numeric)
  - `payment_method` (text) - cash, card, bank_transfer, medical_aid
  - `reference_number` (text)
  - `notes` (text)
  - `received_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)

  ### expenses
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `category` (text)
  - `description` (text)
  - `amount` (numeric)
  - `expense_date` (timestamptz)
  - `payment_method` (text)
  - `receipt_url` (text)
  - `created_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)

  ## 5. Inventory Management

  ### inventory_items
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `name` (text)
  - `category` (text)
  - `description` (text)
  - `sku` (text)
  - `unit` (text)
  - `quantity` (numeric)
  - `reorder_level` (numeric)
  - `unit_price` (numeric)
  - `supplier` (text)
  - `expiry_date` (date)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### inventory_transactions
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `item_id` (uuid, foreign key to inventory_items)
  - `transaction_type` (text) - in, out, adjustment
  - `quantity` (numeric)
  - `reference` (text)
  - `notes` (text)
  - `created_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)

  ## 6. HR & Staff Management

  ### staff_attendance
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `user_id` (uuid, foreign key to users)
  - `date` (date)
  - `check_in` (timestamptz)
  - `check_out` (timestamptz)
  - `status` (text) - present, absent, late, on_leave
  - `notes` (text)
  - `created_at` (timestamptz)

  ### leave_requests
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `user_id` (uuid, foreign key to users)
  - `leave_type` (text) - annual, sick, maternity, unpaid
  - `start_date` (date)
  - `end_date` (date)
  - `reason` (text)
  - `status` (text) - pending, approved, rejected
  - `approved_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### payroll
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `user_id` (uuid, foreign key to users)
  - `period_start` (date)
  - `period_end` (date)
  - `basic_salary` (numeric)
  - `allowances` (numeric)
  - `deductions` (numeric)
  - `net_salary` (numeric)
  - `payment_date` (timestamptz)
  - `status` (text) - pending, paid
  - `created_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)

  ## 7. Communication

  ### internal_chats
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `sender_id` (uuid, foreign key to users)
  - `receiver_id` (uuid, foreign key to users)
  - `message` (text)
  - `is_read` (boolean)
  - `created_at` (timestamptz)

  ### notifications
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `user_id` (uuid, foreign key to users)
  - `title` (text)
  - `message` (text)
  - `type` (text)
  - `is_read` (boolean)
  - `link` (text)
  - `created_at` (timestamptz)

  ### email_logs
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `recipient_email` (text)
  - `subject` (text)
  - `body` (text)
  - `status` (text) - sent, failed, pending
  - `sent_at` (timestamptz)
  - `created_at` (timestamptz)

  ### sms_logs
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `recipient_phone` (text)
  - `message` (text)
  - `status` (text) - sent, failed, pending
  - `sent_at` (timestamptz)
  - `created_at` (timestamptz)

  ## 8. System Management

  ### audit_logs
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `user_id` (uuid, foreign key to users)
  - `action` (text)
  - `table_name` (text)
  - `record_id` (uuid)
  - `old_values` (jsonb)
  - `new_values` (jsonb)
  - `ip_address` (text)
  - `created_at` (timestamptz)

  ### system_settings
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `setting_key` (text)
  - `setting_value` (jsonb)
  - `updated_by` (uuid, foreign key to users)
  - `updated_at` (timestamptz)

  ### patient_files
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `patient_id` (uuid, foreign key)
  - `file_name` (text)
  - `file_type` (text)
  - `file_url` (text)
  - `file_size` (integer)
  - `uploaded_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)

  ### hospital_files
  - `id` (uuid, primary key)
  - `branch_id` (uuid, foreign key)
  - `file_name` (text)
  - `file_type` (text)
  - `file_url` (text)
  - `category` (text)
  - `file_size` (integer)
  - `uploaded_by` (uuid, foreign key to users)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Implement role-based access control policies
*/

-- Create branches table
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  address text,
  city text,
  country text,
  logo_url text,
  website_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'doctor', 'nurse', 'receptionist', 'accountant')),
  phone text,
  address text,
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create medical_aids table
CREATE TABLE IF NOT EXISTS medical_aids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  email text,
  phone text,
  address text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create referral_doctors table
CREATE TABLE IF NOT EXISTS referral_doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  specialization text,
  phone text,
  email text,
  hospital text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create patients table
CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_number text UNIQUE NOT NULL,
  full_name text NOT NULL,
  date_of_birth date,
  gender text,
  phone text,
  email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  medical_aid_id uuid REFERENCES medical_aids(id) ON DELETE SET NULL,
  blood_group text,
  allergies text,
  chronic_conditions text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'discharged', 'deceased')),
  discharge_date timestamptz,
  death_date timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  appointment_date timestamptz NOT NULL,
  duration_minutes integer DEFAULT 30,
  appointment_type text,
  status text DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'confirmed', 'cancelled', 'completed')),
  notes text,
  cancellation_reason text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create consultations table
CREATE TABLE IF NOT EXISTS consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  consultation_date timestamptz DEFAULT now(),
  chief_complaint text,
  history text,
  examination text,
  diagnosis text,
  treatment_plan text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create prescriptions table
CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  medication_name text NOT NULL,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  created_at timestamptz DEFAULT now()
);

-- Create vital_signs table
CREATE TABLE IF NOT EXISTS vital_signs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  recorded_at timestamptz DEFAULT now(),
  temperature numeric,
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  heart_rate integer,
  respiratory_rate integer,
  oxygen_saturation numeric,
  weight numeric,
  height numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create lab_results table
CREATE TABLE IF NOT EXISTS lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  ordered_by uuid REFERENCES users(id) ON DELETE SET NULL,
  test_name text NOT NULL,
  test_date timestamptz DEFAULT now(),
  result text,
  reference_range text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  notes text,
  file_url text,
  created_at timestamptz DEFAULT now()
);

-- Create medical_reports table
CREATE TABLE IF NOT EXISTS medical_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  report_type text NOT NULL,
  report_date timestamptz DEFAULT now(),
  content text,
  file_url text,
  created_at timestamptz DEFAULT now()
);

-- Create discharge_summaries table
CREATE TABLE IF NOT EXISTS discharge_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  admission_date timestamptz,
  discharge_date timestamptz,
  reason_for_admission text,
  treatment_summary text,
  discharge_diagnosis text,
  medications_on_discharge text,
  follow_up_instructions text,
  created_at timestamptz DEFAULT now()
);

-- Create admission_letters table
CREATE TABLE IF NOT EXISTS admission_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  admission_date timestamptz DEFAULT now(),
  reason text,
  ward text,
  bed_number text,
  created_at timestamptz DEFAULT now()
);

-- Create referral_forms table
CREATE TABLE IF NOT EXISTS referral_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  referring_doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  referred_to_doctor_id uuid REFERENCES referral_doctors(id) ON DELETE SET NULL,
  referral_date timestamptz DEFAULT now(),
  reason text,
  clinical_notes text,
  urgency text,
  created_at timestamptz DEFAULT now()
);

-- Create operation_reports table
CREATE TABLE IF NOT EXISTS operation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  surgeon_id uuid REFERENCES users(id) ON DELETE CASCADE,
  operation_date timestamptz DEFAULT now(),
  operation_name text NOT NULL,
  pre_operative_diagnosis text,
  post_operative_diagnosis text,
  procedure_description text,
  findings text,
  complications text,
  created_at timestamptz DEFAULT now()
);

-- Create medical_certificates table
CREATE TABLE IF NOT EXISTS medical_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  issue_date timestamptz DEFAULT now(),
  valid_from date,
  valid_to date,
  purpose text,
  diagnosis text,
  recommendations text,
  created_at timestamptz DEFAULT now()
);

-- Create follow_ups table
CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  follow_up_date timestamptz NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  invoice_number text UNIQUE NOT NULL,
  invoice_date timestamptz DEFAULT now(),
  due_date timestamptz,
  subtotal numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  status text DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total_price numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  payment_date timestamptz DEFAULT now(),
  amount numeric NOT NULL,
  payment_method text CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'medical_aid')),
  reference_number text,
  notes text,
  received_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text,
  amount numeric NOT NULL,
  expense_date timestamptz DEFAULT now(),
  payment_method text,
  receipt_url text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create inventory_transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  item_id uuid REFERENCES inventory_items(id) ON DELETE CASCADE,
  transaction_type text CHECK (transaction_type IN ('in', 'out', 'adjustment')),
  quantity numeric NOT NULL,
  reference text,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create staff_attendance table
CREATE TABLE IF NOT EXISTS staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in timestamptz,
  check_out timestamptz,
  status text CHECK (status IN ('present', 'absent', 'late', 'on_leave')),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Create leave_requests table
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  leave_type text CHECK (leave_type IN ('annual', 'sick', 'maternity', 'unpaid')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create payroll table
CREATE TABLE IF NOT EXISTS payroll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  basic_salary numeric DEFAULT 0,
  allowances numeric DEFAULT 0,
  deductions numeric DEFAULT 0,
  net_salary numeric DEFAULT 0,
  payment_date timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create internal_chats table
CREATE TABLE IF NOT EXISTS internal_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text,
  is_read boolean DEFAULT false,
  link text,
  created_at timestamptz DEFAULT now()
);

-- Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text,
  body text,
  status text DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create sms_logs table
CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  message text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value jsonb,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

-- Create patient_files table
CREATE TABLE IF NOT EXISTS patient_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text,
  file_url text NOT NULL,
  file_size integer,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create hospital_files table
CREATE TABLE IF NOT EXISTS hospital_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text,
  file_url text NOT NULL,
  category text,
  file_size integer,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_aids ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE discharge_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_files ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_patients_branch_id ON patients(branch_id);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_appointments_branch_id ON appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_id ON invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient_id ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_branch_id ON payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_chats_sender_id ON internal_chats(sender_id);
CREATE INDEX IF NOT EXISTS idx_internal_chats_receiver_id ON internal_chats(receiver_id);