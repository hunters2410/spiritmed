/*
  # Simplify Medical Aids Table and Fix Referral Doctors

  ## 1. Changes to medical_aids table
    - Remove all columns except:
      - `id` (uuid, primary key)
      - `name` (text) - Medical aid name
      - `branch_id` (uuid, foreign key)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

  ## 2. Changes to referral_doctors table
    - Remove all columns except:
      - `id` (uuid, primary key)
      - `full_name` (text) - Doctor's full name
      - `branch_id` (uuid, foreign key)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

  ## 3. Drop columns that are no longer needed
*/

-- Drop columns from medical_aids table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'medical_aids' AND column_name = 'contact_person'
  ) THEN
    ALTER TABLE medical_aids DROP COLUMN contact_person;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'medical_aids' AND column_name = 'email'
  ) THEN
    ALTER TABLE medical_aids DROP COLUMN email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'medical_aids' AND column_name = 'phone'
  ) THEN
    ALTER TABLE medical_aids DROP COLUMN phone;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'medical_aids' AND column_name = 'address'
  ) THEN
    ALTER TABLE medical_aids DROP COLUMN address;
  END IF;
END $$;

-- Drop columns from referral_doctors table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_doctors' AND column_name = 'specialization'
  ) THEN
    ALTER TABLE referral_doctors DROP COLUMN specialization;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_doctors' AND column_name = 'phone'
  ) THEN
    ALTER TABLE referral_doctors DROP COLUMN phone;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_doctors' AND column_name = 'email'
  ) THEN
    ALTER TABLE referral_doctors DROP COLUMN email;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'referral_doctors' AND column_name = 'hospital'
  ) THEN
    ALTER TABLE referral_doctors DROP COLUMN hospital;
  END IF;
END $$;
