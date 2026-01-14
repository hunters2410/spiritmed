/*
  # Create Medical Aids and Referral Doctors Tables

  ## 1. New Tables
    
    ### `medical_aids`
      - `id` (uuid, primary key) - Unique identifier
      - `name` (text) - Medical aid/insurance company name
      - `contact_person` (text) - Contact person at the medical aid
      - `phone` (text) - Contact phone number
      - `email` (text) - Contact email address
      - `address` (text) - Physical address
      - `policy_prefix` (text) - Prefix used for policy numbers
      - `is_active` (boolean) - Active status
      - `branch_id` (uuid, foreign key) - Reference to branches table
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

    ### `referral_doctors`
      - `id` (uuid, primary key) - Unique identifier
      - `full_name` (text) - Doctor's full name
      - `specialty` (text) - Medical specialty
      - `practice_name` (text) - Name of practice/clinic
      - `phone` (text) - Contact phone number
      - `email` (text) - Contact email address
      - `address` (text) - Practice address
      - `is_active` (boolean) - Active status
      - `branch_id` (uuid, foreign key) - Reference to branches table
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  ## 2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage records based on role and branch access
*/

-- Create medical_aids table
CREATE TABLE IF NOT EXISTS medical_aids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  policy_prefix text,
  is_active boolean DEFAULT true,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create referral_doctors table
CREATE TABLE IF NOT EXISTS referral_doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  specialty text,
  practice_name text,
  phone text,
  email text,
  address text,
  is_active boolean DEFAULT true,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_medical_aids_branch ON medical_aids(branch_id);
CREATE INDEX IF NOT EXISTS idx_medical_aids_active ON medical_aids(is_active);
CREATE INDEX IF NOT EXISTS idx_medical_aids_name ON medical_aids(name);

CREATE INDEX IF NOT EXISTS idx_referral_doctors_branch ON referral_doctors(branch_id);
CREATE INDEX IF NOT EXISTS idx_referral_doctors_active ON referral_doctors(is_active);
CREATE INDEX IF NOT EXISTS idx_referral_doctors_name ON referral_doctors(full_name);

-- Enable RLS
ALTER TABLE medical_aids ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_doctors ENABLE ROW LEVEL SECURITY;

-- Medical Aids Policies
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

-- Referral Doctors Policies
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

-- Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_medical_aids_updated_at BEFORE UPDATE ON medical_aids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referral_doctors_updated_at BEFORE UPDATE ON referral_doctors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
