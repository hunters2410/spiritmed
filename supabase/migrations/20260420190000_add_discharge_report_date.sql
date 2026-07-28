-- Add missing report_date column to discharge_summaries and related tables
-- Date: 2026-04-20

DO $$ 
BEGIN 
    -- 1. Harmonize discharge_summaries
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'discharge_summaries' 
        AND column_name = 'report_date'
    ) THEN
        ALTER TABLE discharge_summaries ADD COLUMN report_date DATE DEFAULT CURRENT_DATE;
        
        -- Migrate data from discharge_date if it exists and report_date is null
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'discharge_summaries' AND column_name = 'discharge_date'
        ) THEN
            UPDATE discharge_summaries SET report_date = discharge_date::date WHERE report_date IS NULL;
        END IF;
    END IF;

    -- 2. Harmonize referral_forms (Adding for consistency with front-end patterns)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'referral_forms' 
        AND column_name = 'report_date'
    ) THEN
        ALTER TABLE referral_forms ADD COLUMN report_date DATE DEFAULT CURRENT_DATE;
    END IF;

    -- 3. Harmonize medical_certificates (Adding for consistency with front-end patterns)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'medical_certificates' 
        AND column_name = 'report_date'
    ) THEN
        ALTER TABLE medical_certificates ADD COLUMN report_date DATE DEFAULT CURRENT_DATE;
    END IF;

END $$;
