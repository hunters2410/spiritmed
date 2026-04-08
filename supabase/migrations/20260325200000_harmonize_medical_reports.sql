-- Migration: Harmonize medical_reports table schema
-- Adds missing columns expected by the MedicalReports.tsx component

DO $$ 
BEGIN
    -- 1. Add diagnosis_id referencing diagnoses(id)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'medical_reports' AND column_name = 'diagnosis_id'
    ) THEN
        ALTER TABLE medical_reports ADD COLUMN diagnosis_id uuid REFERENCES diagnoses(id) ON DELETE SET NULL;
    END IF;

    -- 2. Add recipient column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'medical_reports' AND column_name = 'recipient'
    ) THEN
        ALTER TABLE medical_reports ADD COLUMN recipient text;
    END IF;

    -- 3. Add status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'medical_reports' AND column_name = 'status'
    ) THEN
        ALTER TABLE medical_reports ADD COLUMN status text DEFAULT 'active';
    END IF;

    -- 4. Ensure doctor_id can be null (some initial versions had it as NOT NULL or CASCADE)
    -- This ensures consistency with the expected SET NULL behavior
    ALTER TABLE medical_reports ALTER COLUMN doctor_id DROP NOT NULL;

END $$;

-- Indices for newly added columns
CREATE INDEX IF NOT EXISTS idx_medical_reports_diagnosis_id ON medical_reports(diagnosis_id);
