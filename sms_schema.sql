-- SMS Integration Schema

-- 1. Table for SMS Logs
CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    message_body TEXT,
    template_id TEXT, -- For MSG91 Template ID
    status TEXT DEFAULT 'pending', -- sent, failed, delivered
    provider TEXT DEFAULT 'msg91',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Table for SMS Templates (Mapping triggers to provider templates)
CREATE TABLE IF NOT EXISTS sms_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL, -- appointment_booked, appointment_confirmed, payment_received
    provider_template_id TEXT NOT NULL, -- The Template ID from MSG91
    is_active BOOLEAN DEFAULT true,
    variables JSONB DEFAULT '[]'::jsonb, -- List of variable names used in this template
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, trigger_type)
);

-- 3. Enable RLS
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view their branch sms logs" ON sms_logs
    FOR SELECT USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can view their branch sms templates" ON sms_templates
    FOR SELECT USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Admins can manage sms templates" ON sms_templates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.branch_id = sms_templates.branch_id
            AND users.role IN ('admin', 'super_admin')
        )
    );
