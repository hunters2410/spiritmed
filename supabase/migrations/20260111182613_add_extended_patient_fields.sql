/*
  # Add Extended Patient Fields

  ## Overview
  Adds comprehensive patient information fields to support detailed patient management.

  ## New Fields Added to `patients` table:
  
  ### Personal Information
  - `title` (text) - Mr, Mrs, Ms, Dr, etc.
  - `occupation` (text) - Patient's occupation
  - `password` (text) - For patient portal access
  
  ### Medical Information
  - `doctor_id` (uuid) - Assigned doctor reference
  - `clinical_history` (text) - Patient's clinical history
  - `chronic_medications` (text) - List of chronic medications
  - `smoke` (text) - Smoking status (never, former, current)
  - `alcohol` (text) - Alcohol consumption (never, occasional, regular)
  - `flags` (text) - Special flags or alerts
  
  ### Next of Kin Extended Details
  - `next_of_kin_address` (text) - Next of kin address
  - `next_of_kin_relation` (text) - Relationship to patient
  - `next_of_kin_email` (text) - Next of kin email
  
  ### Financial/Billing Information
  - `responsible_person_name` (text) - Person responsible for fees
  - `responsible_person_address` (text) - Responsible person address
  - `responsible_person_phone` (text) - Responsible person phone
  - `responsible_person_id_number` (text) - Responsible person ID number
  - `responsible_person_email` (text) - Responsible person email
  - `payment_method` (text) - Cash or Medical Aid
  - `medical_aid_number` (text) - Medical aid membership number
  - `medical_aid_suffix` (text) - Medical aid suffix
  - `medical_aid_main_member` (text) - Main member name
  
  ### Referral Information
  - `referral_doctor_id` (uuid) - Referring doctor reference
  - `send_sms` (boolean) - SMS notification preference
*/

-- Add personal information fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'title'
  ) THEN
    ALTER TABLE patients ADD COLUMN title text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'occupation'
  ) THEN
    ALTER TABLE patients ADD COLUMN occupation text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'password'
  ) THEN
    ALTER TABLE patients ADD COLUMN password text;
  END IF;
END $$;

-- Add medical information fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'doctor_id'
  ) THEN
    ALTER TABLE patients ADD COLUMN doctor_id uuid REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'clinical_history'
  ) THEN
    ALTER TABLE patients ADD COLUMN clinical_history text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'chronic_medications'
  ) THEN
    ALTER TABLE patients ADD COLUMN chronic_medications text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'smoke'
  ) THEN
    ALTER TABLE patients ADD COLUMN smoke text DEFAULT 'never';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'alcohol'
  ) THEN
    ALTER TABLE patients ADD COLUMN alcohol text DEFAULT 'never';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'flags'
  ) THEN
    ALTER TABLE patients ADD COLUMN flags text;
  END IF;
END $$;

-- Add next of kin extended fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'next_of_kin_address'
  ) THEN
    ALTER TABLE patients ADD COLUMN next_of_kin_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'next_of_kin_relation'
  ) THEN
    ALTER TABLE patients ADD COLUMN next_of_kin_relation text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'next_of_kin_email'
  ) THEN
    ALTER TABLE patients ADD COLUMN next_of_kin_email text;
  END IF;
END $$;

-- Add financial/billing fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'responsible_person_name'
  ) THEN
    ALTER TABLE patients ADD COLUMN responsible_person_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'responsible_person_address'
  ) THEN
    ALTER TABLE patients ADD COLUMN responsible_person_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'responsible_person_phone'
  ) THEN
    ALTER TABLE patients ADD COLUMN responsible_person_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'responsible_person_id_number'
  ) THEN
    ALTER TABLE patients ADD COLUMN responsible_person_id_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'responsible_person_email'
  ) THEN
    ALTER TABLE patients ADD COLUMN responsible_person_email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE patients ADD COLUMN payment_method text DEFAULT 'cash';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'medical_aid_number'
  ) THEN
    ALTER TABLE patients ADD COLUMN medical_aid_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'medical_aid_suffix'
  ) THEN
    ALTER TABLE patients ADD COLUMN medical_aid_suffix text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'medical_aid_main_member'
  ) THEN
    ALTER TABLE patients ADD COLUMN medical_aid_main_member text;
  END IF;
END $$;

-- Add referral and notification fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'referral_doctor_id'
  ) THEN
    ALTER TABLE patients ADD COLUMN referral_doctor_id uuid REFERENCES referral_doctors(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patients' AND column_name = 'send_sms'
  ) THEN
    ALTER TABLE patients ADD COLUMN send_sms boolean DEFAULT false;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON patients(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patients_referral_doctor_id ON patients(referral_doctor_id);
