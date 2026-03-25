-- Create lab_results table
CREATE TABLE IF NOT EXISTS lab_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    
    -- FULL BLOOD COUNT
    fbc_date DATE,
    hb TEXT,
    wbc TEXT,
    platelets TEXT,
    neutro TEXT,
    
    -- ELECTROLYTES
    electrolytes_date DATE,
    na TEXT,
    k TEXT,
    urea TEXT,
    creatinine TEXT,
    
    -- PSA / TESTOSTERONE
    psa_date DATE,
    psa_value TEXT,
    testo_date DATE,
    testo_value TEXT,
    
    -- URINE CULTURE
    urine_culture_date DATE,
    isolate TEXT,
    sensitivity TEXT,
    
    -- HISTOLOGY
    histology_date DATE,
    histology_text TEXT,
    histology_value TEXT,
    
    -- IMAGING
    imaging_date DATE,
    imaging_type TEXT,
    imaging_description TEXT,
    
    -- OTHER TESTS (Generic)
    other_test_date DATE,
    other_test_name TEXT,
    other_test_result TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
CREATE POLICY "Users can view lab results of their branch"
    ON lab_results FOR SELECT
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert lab results to their branch"
    ON lab_results FOR INSERT
    WITH CHECK (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update lab results of their branch"
    ON lab_results FOR UPDATE
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

CREATE POLICY "Users can delete lab results of their branch"
    ON lab_results FOR DELETE
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lab_results_patient_id ON lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_branch_id ON lab_results(branch_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_created_at ON lab_results(created_at);
