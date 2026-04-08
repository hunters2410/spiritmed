-- Migration: Fix consultation referral doctor relationship
-- The 'referred_by' column was incorrectly referencing 'users' table instead of 'referral_doctors'

DO $$ 
BEGIN
    -- 1. Drop the incorrect foreign key constraint if it exists
    -- The default constraint name for this column is usually 'consultations_referred_by_fkey'
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'consultations_referred_by_fkey' 
        AND table_name = 'consultations'
    ) THEN
        ALTER TABLE consultations DROP CONSTRAINT consultations_referred_by_fkey;
    END IF;

    -- 2. Add the correct foreign key constraint referencing referral_doctors
    ALTER TABLE consultations
    ADD CONSTRAINT consultations_referred_by_fkey 
    FOREIGN KEY (referred_by) 
    REFERENCES referral_doctors(id) 
    ON DELETE SET NULL;

END $$;
