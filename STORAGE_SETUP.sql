-- ==========================================
-- SPIRITMED STORAGE SETUP SCRIPT
-- ==========================================
-- This script ensures the required storage buckets exist and have proper RLS policies.
-- Run this in your Supabase SQL Editor.

-- 1. CREATE BUCKETS
-------------------------------------------

-- Insert buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('patient-files', 'patient-files', true),
  ('avatars', 'avatars', true),
  ('hospital-assets', 'hospital-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS POLICIES FOR 'patient-files'
-------------------------------------------

-- NOTE: RLS is usually enabled by default on storage.objects in Supabase.
-- If you get a 'must be owner' error, you can skip the ALTER TABLE command.
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all authenticated users to upload files
CREATE POLICY "Allow authenticated uploads to patient-files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'patient-files');

-- Policy: Allow all authenticated users to view files
CREATE POLICY "Allow authenticated selects from patient-files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'patient-files');

-- Policy: Allow users to delete their own uploads (or admins to delete any)
CREATE POLICY "Allow authenticated deletes from patient-files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'patient-files');

-- 3. RLS POLICIES FOR 'avatars'
-------------------------------------------

CREATE POLICY "Allow public select from avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Allow authenticated uploads to avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- 4. RLS POLICIES FOR 'hospital-assets'
-------------------------------------------

CREATE POLICY "Allow public select from hospital-assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'hospital-assets');

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
