-- Create branding bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Helper to safely create policies
DO $$
BEGIN
    -- Public Select Policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Public Access for Branding'
    ) THEN
        CREATE POLICY "Public Access for Branding"
        ON storage.objects FOR SELECT
        USING ( bucket_id = 'branding' );
    END IF;

    -- Authenticated Manage Policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND schemaname = 'storage' 
        AND policyname = 'Authenticated Manage Branding'
    ) THEN
        CREATE POLICY "Authenticated Manage Branding"
        ON storage.objects FOR ALL
        TO authenticated
        USING ( bucket_id = 'branding' )
        WITH CHECK ( bucket_id = 'branding' );
    END IF;
END
$$;
