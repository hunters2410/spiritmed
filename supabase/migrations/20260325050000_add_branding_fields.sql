-- Add signature_url to branches and users for professional reports
ALTER TABLE branches ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_url text;

-- Add website URL to branches if not exists
ALTER TABLE branches ADD COLUMN IF NOT EXISTS website text;
