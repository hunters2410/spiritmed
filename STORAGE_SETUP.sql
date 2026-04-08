-- ==========================================
-- SPIRITMED STORAGE SETUP SCRIPT
-- ==========================================
-- This script ensures the required storage buckets exist and have proper RLS policies.
-- Run this in your Supabase SQL Editor.
-- This script is idempotent (safe to run multiple times).

-- 1. CREATE BUCKETS
-------------------------------------------

-- Insert buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('patient-files', 'patient-files', true),
  ('avatars', 'avatars', true),
  ('hospital-files', 'hospital-files', true),
  ('hospital-assets', 'hospital-assets', true),
  ('financial_documents', 'financial_documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS POLICIES FOR 'patient-files'
-------------------------------------------

DROP POLICY IF EXISTS "Allow authenticated uploads to patient-files" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to patient-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-files');

DROP POLICY IF EXISTS "Allow authenticated selects from patient-files" ON storage.objects;
CREATE POLICY "Allow authenticated selects from patient-files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patient-files');

DROP POLICY IF EXISTS "Allow authenticated deletes from patient-files" ON storage.objects;
CREATE POLICY "Allow authenticated deletes from patient-files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patient-files');

-- 3. RLS POLICIES FOR 'avatars'
-------------------------------------------

DROP POLICY IF EXISTS "Allow public select from avatars" ON storage.objects;
CREATE POLICY "Allow public select from avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Allow authenticated uploads to avatars" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- 4. RLS POLICIES FOR 'hospital-files'
-------------------------------------------

DROP POLICY IF EXISTS "Allow authenticated uploads to hospital-files" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to hospital-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'hospital-files');

DROP POLICY IF EXISTS "Allow authenticated selects from hospital-files" ON storage.objects;
CREATE POLICY "Allow authenticated selects from hospital-files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'hospital-files');

DROP POLICY IF EXISTS "Allow authenticated deletes from hospital-files" ON storage.objects;
CREATE POLICY "Allow authenticated deletes from hospital-files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'hospital-files');

-- 5. RLS POLICIES FOR 'hospital-assets'
-------------------------------------------

DROP POLICY IF EXISTS "Allow public select from hospital-assets" ON storage.objects;
CREATE POLICY "Allow public select from hospital-assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'hospital-assets');

DROP POLICY IF EXISTS "Allow admin uploads to hospital-assets" ON storage.objects;
CREATE POLICY "Allow admin uploads to hospital-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'hospital-assets' AND 
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
);

-- 6. RLS POLICIES FOR 'financial_documents'
-------------------------------------------

DROP POLICY IF EXISTS "Allow authenticated uploads to financial_documents" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to financial_documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'financial_documents');

DROP POLICY IF EXISTS "Allow authenticated selects from financial_documents" ON storage.objects;
CREATE POLICY "Allow authenticated selects from financial_documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'financial_documents');

DROP POLICY IF EXISTS "Allow authenticated deletes from financial_documents" ON storage.objects;
CREATE POLICY "Allow authenticated deletes from financial_documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'financial_documents');
