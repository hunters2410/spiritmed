-- Migration: Ensure all professional and branding fields exist
-- This migration ensures that signatures, qualifications, and specializations are available for reports

-- 1. Ensure columns exist on the ‘users’ table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS signature_url text,
ADD COLUMN IF NOT EXISTS specialization text,
ADD COLUMN IF NOT EXISTS qualifications text;

-- 2. Ensure columns exist on the ‘branches’ table
ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS signature_url text,
ADD COLUMN IF NOT EXISTS website text;

-- 3. Add column comments for clarity
COMMENT ON COLUMN users.signature_url IS 'URL to doctor signature image';
COMMENT ON COLUMN users.specialization IS 'Doctor medical specialty';
COMMENT ON COLUMN users.qualifications IS 'Doctor academic/professional qualifications';
COMMENT ON COLUMN branches.signature_url IS 'Default hospital/clinic signature image';
COMMENT ON COLUMN branches.website IS 'Public website URL for the branch';
