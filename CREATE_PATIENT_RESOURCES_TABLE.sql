-- Migration: Create patient_resources table for sharing secure temporary links
CREATE TABLE IF NOT EXISTS patient_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('video_link', 'video_file', 'pdf_file', 'other')),
    url TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    shared_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE patient_resources ENABLE ROW LEVEL SECURITY;

-- Allow public read access (the app itself will validate token ID and check expires_at timestamp dynamically)
CREATE POLICY "Allow public read access to resources"
ON patient_resources FOR SELECT
USING (true);

-- Allow authenticated staff members to perform all operations
CREATE POLICY "Allow authenticated staff to manage resources"
ON patient_resources FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
