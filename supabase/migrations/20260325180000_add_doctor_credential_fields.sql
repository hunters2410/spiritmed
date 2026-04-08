-- Migration: Add doctor credential fields to users table
-- These fields are used in medical reports and consultations

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS specialization text,
ADD COLUMN IF NOT EXISTS qualifications text;

-- Add comments for documentation
COMMENT ON COLUMN users.specialization IS 'Doctor specialization (e.g. Specialist Urologist)';
COMMENT ON COLUMN users.qualifications IS 'Doctor professional qualifications (e.g. MMED UROLOGY-UZ)';
