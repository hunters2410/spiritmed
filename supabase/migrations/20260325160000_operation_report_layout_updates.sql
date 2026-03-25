-- Create surgical_procedures lookup table
CREATE TABLE IF NOT EXISTS surgical_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT surgical_procedures_name_branch_unique UNIQUE (branch_id, name)
);

-- Enable RLS for surgical_procedures
ALTER TABLE surgical_procedures ENABLE ROW LEVEL SECURITY;

-- RLS Policies for surgical_procedures
DROP POLICY IF EXISTS "Users can view procedures of their branch" ON surgical_procedures;
CREATE POLICY "Users can view procedures of their branch"
    ON surgical_procedures FOR SELECT
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert procedures to their branch" ON surgical_procedures;
CREATE POLICY "Users can insert procedures to their branch"
    ON surgical_procedures FOR INSERT
    WITH CHECK (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update procedures of their branch" ON surgical_procedures;
CREATE POLICY "Users can update procedures of their branch"
    ON surgical_procedures FOR UPDATE
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete procedures of their branch" ON surgical_procedures;
CREATE POLICY "Users can delete procedures of their branch"
    ON surgical_procedures FOR DELETE
    USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Update operation_reports table to include procedure_id
ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS procedure_id UUID REFERENCES surgical_procedures(id) ON DELETE SET NULL;
