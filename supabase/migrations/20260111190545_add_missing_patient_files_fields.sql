/*
  # Add Missing Fields to Patient Files Table

  ## Overview
  Adds title, notes, and upload_date fields to the patient_files table

  ## New Fields Added:
  - `title` (text) - File title/description
  - `notes` (text) - Additional notes about the file
  - `upload_date` (date) - Date of upload
*/

-- Add title field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patient_files' AND column_name = 'title'
  ) THEN
    ALTER TABLE patient_files ADD COLUMN title text;
  END IF;
END $$;

-- Add notes field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patient_files' AND column_name = 'notes'
  ) THEN
    ALTER TABLE patient_files ADD COLUMN notes text;
  END IF;
END $$;

-- Add upload_date field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patient_files' AND column_name = 'upload_date'
  ) THEN
    ALTER TABLE patient_files ADD COLUMN upload_date date;
  END IF;
END $$;
