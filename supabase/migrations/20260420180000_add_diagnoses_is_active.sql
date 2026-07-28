-- Add missing is_active column to diagnoses table
-- Date: 2026-04-20

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'diagnoses' 
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE diagnoses ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;
