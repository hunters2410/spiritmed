/*
  # Add Additional Fields to Referral Doctors Table

  1. Changes
    - Add `name` column (keeping full_name for backwards compatibility, will use name going forward)
    - Add `address` column for doctor's address
    - Add `contact` column for phone number
    - Add `email` column for email address
    - Add `affiliation` column for hospital/clinic affiliation
    
  2. Notes
    - Using IF NOT EXISTS to safely add columns
    - All new fields are nullable to allow gradual data entry
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referral_doctors' AND column_name = 'name'
  ) THEN
    ALTER TABLE referral_doctors ADD COLUMN name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referral_doctors' AND column_name = 'address'
  ) THEN
    ALTER TABLE referral_doctors ADD COLUMN address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referral_doctors' AND column_name = 'contact'
  ) THEN
    ALTER TABLE referral_doctors ADD COLUMN contact text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referral_doctors' AND column_name = 'email'
  ) THEN
    ALTER TABLE referral_doctors ADD COLUMN email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'referral_doctors' AND column_name = 'affiliation'
  ) THEN
    ALTER TABLE referral_doctors ADD COLUMN affiliation text;
  END IF;
END $$;
