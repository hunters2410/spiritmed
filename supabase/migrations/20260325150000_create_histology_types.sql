-- Create histology_types table
CREATE TABLE IF NOT EXISTS histology_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    value TEXT,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, branch_id)
);

ALTER TABLE histology_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view histology types of their branch" ON histology_types;
CREATE POLICY "Users can view histology types of their branch"
    ON histology_types FOR SELECT
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert histology types to their branch" ON histology_types;
CREATE POLICY "Users can insert histology types to their branch"
    ON histology_types FOR INSERT
    WITH CHECK (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update histology types of their branch" ON histology_types;
CREATE POLICY "Users can update histology types of their branch"
    ON histology_types FOR UPDATE
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete histology types of their branch" ON histology_types;
CREATE POLICY "Users can delete histology types of their branch"
    ON histology_types FOR DELETE
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_histology_types_branch_id ON histology_types(branch_id);

-- Add histology_type_id FK to lab_results
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS histology_type_id UUID REFERENCES histology_types(id) ON DELETE SET NULL;
