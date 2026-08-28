-- Migration: Add missing columns and RLS policies for email_logs
-- Fixes: HTTP 400 Bad Request error on email_logs insert

-- 1. Add missing columns to email_logs
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS file_url TEXT;

-- 2. Ensure RLS is enabled
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- 3. Add RLS policies for authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to view email logs" ON email_logs;
CREATE POLICY "Allow authenticated users to view email logs" 
  ON email_logs FOR SELECT 
  TO authenticated 
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert email logs" ON email_logs;
CREATE POLICY "Allow authenticated users to insert email logs" 
  ON email_logs FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to update email logs" ON email_logs;
CREATE POLICY "Allow authenticated users to update email logs" 
  ON email_logs FOR UPDATE 
  TO authenticated 
  USING (true);
