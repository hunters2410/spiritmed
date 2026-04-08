-- Migration: Harmonize all Clinical Documentation modules
-- Ensures that discharge summaries, referral forms, medical certificates, and operation reports match the frontend requirements.

DO $$ 
BEGIN
    -- 1. Harmonize discharge_summaries
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'discharge_summaries') THEN
        ALTER TABLE discharge_summaries ADD COLUMN IF NOT EXISTS diagnosis_id uuid REFERENCES diagnoses(id) ON DELETE SET NULL;
        ALTER TABLE discharge_summaries ADD COLUMN IF NOT EXISTS recipient text;
        ALTER TABLE discharge_summaries ADD COLUMN IF NOT EXISTS diagnosis_text text;
        ALTER TABLE discharge_summaries ADD COLUMN IF NOT EXISTS medical_history text;
        ALTER TABLE discharge_summaries ADD COLUMN IF NOT EXISTS treatment_done text;
        ALTER TABLE discharge_summaries ADD COLUMN IF NOT EXISTS follow_up_plan text;
        ALTER TABLE discharge_summaries ADD COLUMN IF NOT EXISTS diagnosis_ids uuid[] DEFAULT '{}';
        
        -- Fix doctor_id constraints/types if necessary
        ALTER TABLE discharge_summaries ALTER COLUMN doctor_id DROP NOT NULL;
    END IF;

    -- 2. Harmonize referral_forms
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'referral_forms') THEN
        ALTER TABLE referral_forms ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE referral_forms ADD COLUMN IF NOT EXISTS recipient text;
        ALTER TABLE referral_forms ADD COLUMN IF NOT EXISTS reason_for_referral text;
        ALTER TABLE referral_forms ADD COLUMN IF NOT EXISTS background_history text;
        ALTER TABLE referral_forms ADD COLUMN IF NOT EXISTS treatment_done text;
    END IF;

    -- 3. Harmonize medical_certificates
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medical_certificates') THEN
        ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS date_attended date DEFAULT CURRENT_DATE;
        ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS illness_date date;
        ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS resume_date date;
        ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS period integer;
        ALTER TABLE medical_certificates ADD COLUMN IF NOT EXISTS time_unit text;
    END IF;

    -- 4. Harmonize operation_reports
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'operation_reports') THEN
        ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS hospital text;
        ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS anaesthetist text;
        ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS assistant text;
        ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS anaesthesia_type text;
        ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS procedure_text text;
        ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS post_op_plan text;
        ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS follow_up_date date;
        ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS follow_up_time time;
    END IF;

END $$;

-- Add indices for new relationship columns
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_diagnosis_id ON discharge_summaries(diagnosis_id);
CREATE INDEX IF NOT EXISTS idx_referral_forms_doctor_id ON referral_forms(doctor_id);
