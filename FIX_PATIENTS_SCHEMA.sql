-- Fix missing columns in patients table and reload PostgREST schema cache

ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS file_number text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS password text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinical_history text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS chronic_medications text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS smoke text DEFAULT 'never';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS alcohol text DEFAULT 'never';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS flags text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS next_of_kin_address text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS next_of_kin_relation text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS next_of_kin_email text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS responsible_person_name text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS responsible_person_address text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS responsible_person_phone text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS responsible_person_id_number text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS responsible_person_email text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cash';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_aid_number text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_aid_suffix text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_aid_main_member text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS referral_doctor_id uuid REFERENCES referral_doctors(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS send_sms boolean DEFAULT false;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_national_id ON patients(national_id);
CREATE INDEX IF NOT EXISTS idx_patients_file_number ON patients(file_number);

-- Force PostgREST to refresh its schema cache immediately
NOTIFY pgrst, 'reload schema';
