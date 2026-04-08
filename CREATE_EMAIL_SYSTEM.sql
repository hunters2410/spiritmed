-- 1. Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT DEFAULT 'general', -- e.g., 'appointment', 'billing', 'clinical'
    placeholders JSONB DEFAULT '[]'::jsonb, -- e.g., ["patient_name", "date", "branch_name"]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, name)
);

-- 2. Email Logs Table
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'sent' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reference_id UUID, -- Generic ID to link to an appointment, invoice, etc.
    reference_type TEXT -- 'appointment', 'invoice', etc.
);

-- 3. Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Users can manage email templates of their branch" ON email_templates;
CREATE POLICY "Users can manage email templates of their branch" ON email_templates
    FOR ALL USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can view email logs of their branch" ON email_logs;
CREATE POLICY "Users can view email logs of their branch" ON email_logs
    FOR SELECT USING (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert email logs for their branch" ON email_logs;
CREATE POLICY "Users can insert email logs for their branch" ON email_logs
    FOR INSERT WITH CHECK (branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()));

-- 5. Indices
CREATE INDEX IF NOT EXISTS idx_email_templates_branch ON email_templates(branch_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_branch ON email_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON email_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);

-- 6. Optional: Default Templates (Uncomment and run after obtaining a branch_id if needed)
/*
INSERT INTO email_templates (branch_id, name, subject, body, category, placeholders) 
VALUES 
(
    'YOUR_BRANCH_ID', 
    'Appointment Confirmation', 
    'Booking Confirmed - Spiritmed Hospital', 
    'Dear {{patient_name}},\n\nYour appointment has been confirmed for {{date}} at {{time}}.\n\nRegards,\nSpiritmed Team', 
    'appointment', 
    '["patient_name", "date", "time"]'
),
(
    'YOUR_BRANCH_ID', 
    'Invoice Notification', 
    'Invoice Issued - Spiritmed Hospital', 
    'Dear {{patient_name}},\n\nAn invoice ({{invoice_number}}) for the amount of {{amount}} has been generated for your recent visit.\n\nThank you.', 
    'billing', 
    '["patient_name", "invoice_number", "amount"]'
);
*/
