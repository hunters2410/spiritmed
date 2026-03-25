-- Create tables for additional clinical documentation modules

-- 1. Discharge Summaries
CREATE TABLE IF NOT EXISTS discharge_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    diagnosis_id UUID REFERENCES diagnoses(id) ON DELETE SET NULL,
    report_date DATE DEFAULT CURRENT_DATE,
    recipient TEXT,
    diagnosis_text TEXT,
    medical_history TEXT,
    treatment_done TEXT,
    follow_up_plan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Referral Forms
CREATE TABLE IF NOT EXISTS referral_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    report_date DATE DEFAULT CURRENT_DATE,
    recipient TEXT,
    reason_for_referral TEXT,
    background_history TEXT,
    treatment_done TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Medical Certificates
CREATE TABLE IF NOT EXISTS medical_certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    report_date DATE DEFAULT CURRENT_DATE,
    date_attended DATE DEFAULT CURRENT_DATE,
    illness_date DATE,
    resume_date DATE,
    period INTEGER,
    time_unit TEXT, -- Days, Weeks, Months
    purpose_template TEXT,
    purpose TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Operation Reports
CREATE TABLE IF NOT EXISTS operation_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Surgeon
    report_date DATE DEFAULT CURRENT_DATE,
    hospital TEXT,
    anaesthetist TEXT,
    assistant TEXT,
    anaesthesia_type TEXT,
    procedure_text TEXT,
    description TEXT,
    post_op_plan TEXT,
    follow_up_date DATE,
    follow_up_time TIME,
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Admission Forms
CREATE TABLE IF NOT EXISTS admission_forms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    hospital TEXT,
    admission_date TIMESTAMPTZ DEFAULT NOW(),
    diagnosis_id UUID REFERENCES diagnoses(id) ON DELETE SET NULL,
    procedure_text TEXT,
    procedure_date DATE,
    plan_bloods TEXT[], -- array of test labels
    plan_imaging TEXT[], -- array of imaging labels
    plan_other TEXT,
    npo_oral TEXT, -- NPO or Oral
    iv_fluids TEXT,
    medication TEXT,
    other TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and add policies
ALTER TABLE discharge_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_forms ENABLE ROW LEVEL SECURITY;

-- Policies (Simplified: branch-level access)
CREATE POLICY "Users can manage discharge summaries of their branch" ON discharge_summaries
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage referral forms of their branch" ON referral_forms
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage medical certificates of their branch" ON medical_certificates
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage operation reports of their branch" ON operation_reports
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can manage admission forms of their branch" ON admission_forms
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_patient ON discharge_summaries(patient_id);
CREATE INDEX IF NOT EXISTS idx_referral_forms_patient ON referral_forms(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_certificates_patient ON medical_certificates(patient_id);
CREATE INDEX IF NOT EXISTS idx_operation_reports_patient ON operation_reports(patient_id);
CREATE INDEX IF NOT EXISTS idx_admission_forms_patient ON admission_forms(patient_id);
