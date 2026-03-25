-- ==========================================
-- PATIENT STATUS ENHANCEMENTS
-- ==========================================
-- Adds fields to track deceased and discharged patients.

ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS deceased_date date,
ADD COLUMN IF NOT EXISTS deceased_reason text,
ADD COLUMN IF NOT EXISTS discharged_date date,
ADD COLUMN IF NOT EXISTS discharge_status text,
ADD COLUMN IF NOT EXISTS discharge_notes text;

-- Update the status check constraint if necessary 
-- (Our existing constraint in COMPLETE_SCHEMA_VERIFICATION.sql already allowed 'active', 'discharged', 'deceased')
