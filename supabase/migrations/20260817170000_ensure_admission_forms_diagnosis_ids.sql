-- Ensure diagnosis_ids and related columns exist on admission_forms
DO $$
BEGIN
    -- 1. Ensure diagnosis_ids column exists for multi-diagnosis selection
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admission_forms') THEN
        ALTER TABLE admission_forms ADD COLUMN IF NOT EXISTS diagnosis_ids uuid[] DEFAULT '{}';
        ALTER TABLE admission_forms ADD COLUMN IF NOT EXISTS diagnosis_id uuid REFERENCES diagnoses(id) ON DELETE SET NULL;
        ALTER TABLE admission_forms ADD COLUMN IF NOT EXISTS hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL;
        ALTER TABLE admission_forms ADD COLUMN IF NOT EXISTS npo_date date;
        ALTER TABLE admission_forms ADD COLUMN IF NOT EXISTS npo_time time;
    END IF;
END $$;

-- Optional index for faster diagnosis queries
CREATE INDEX IF NOT EXISTS idx_admission_forms_diagnosis_id ON admission_forms(diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_admission_forms_hospital_id ON admission_forms(hospital_id);
