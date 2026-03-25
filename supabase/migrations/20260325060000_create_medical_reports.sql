-- Create medical_reports table
CREATE TABLE IF NOT EXISTS medical_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
    patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id uuid REFERENCES users(id) ON DELETE SET NULL,
    diagnosis_id uuid REFERENCES diagnoses(id) ON DELETE SET NULL,
    report_date date DEFAULT CURRENT_DATE,
    recipient text,
    content text,
    status text DEFAULT 'active',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE medical_reports ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view medical reports of their branch"
    ON medical_reports FOR SELECT
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

CREATE POLICY "Users can insert medical reports of their branch"
    ON medical_reports FOR INSERT
    WITH CHECK (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

CREATE POLICY "Users can update medical reports of their branch"
    ON medical_reports FOR UPDATE
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

CREATE POLICY "Users can delete medical reports of their branch"
    ON medical_reports FOR DELETE
    USING (branch_id IN (
        SELECT branch_id FROM users WHERE id = auth.uid()
    ));

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_medical_reports_branch_id ON medical_reports(branch_id);
CREATE INDEX IF NOT EXISTS idx_medical_reports_patient_id ON medical_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_reports_doctor_id ON medical_reports(doctor_id);
