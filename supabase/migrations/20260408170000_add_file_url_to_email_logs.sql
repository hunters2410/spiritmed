-- Migration: Add file_url to email_logs
-- Created: 2026-04-08

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_logs' 
        AND column_name = 'file_url'
    ) THEN
        ALTER TABLE email_logs ADD COLUMN file_url TEXT;
    END IF;
END $$;
