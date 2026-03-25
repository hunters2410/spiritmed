-- Migration to add Hospitals, Anaesthetists, and Assistants modules

-- 1. Create Hospitals table
CREATE TABLE IF NOT EXISTS hospitals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, name)
);

-- 2. Create Anaesthetists table
CREATE TABLE IF NOT EXISTS anaesthetists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    specialization TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, full_name)
);

-- 3. Create Assistants table
CREATE TABLE IF NOT EXISTS assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, full_name)
);

-- 4. Enable RLS
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE anaesthetists ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage hospitals of their branch" ON hospitals
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage anaesthetists of their branch" ON anaesthetists
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage assistants of their branch" ON assistants
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- 5. Update Operation Reports to use IDs
ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL;
ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS anaesthetist_id UUID REFERENCES anaesthetists(id) ON DELETE SET NULL;
ALTER TABLE operation_reports ADD COLUMN IF NOT EXISTS assistant_id UUID REFERENCES assistants(id) ON DELETE SET NULL;

-- 6. Update Admission Forms to use Hospital ID
ALTER TABLE admission_forms ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL;

-- 7. Add indices
CREATE INDEX IF NOT EXISTS idx_operation_reports_hospital ON operation_reports(hospital_id);
CREATE INDEX IF NOT EXISTS idx_operation_reports_anaesthetist ON operation_reports(anaesthetist_id);
CREATE INDEX IF NOT EXISTS idx_operation_reports_assistant ON operation_reports(assistant_id);
CREATE INDEX IF NOT EXISTS idx_admission_forms_hospital ON admission_forms(hospital_id);
