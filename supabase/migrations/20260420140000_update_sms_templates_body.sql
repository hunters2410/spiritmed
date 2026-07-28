-- Add message_body to sms_templates
ALTER TABLE sms_templates ADD COLUMN IF NOT EXISTS message_body TEXT;

-- Seed default templates for all existing branches
-- Note: We use placeholders like {{variable}} to match standard template formats
INSERT INTO sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
SELECT 
    b.id,
    'appointment_booked',
    'DEFAULT_BOOKED_ID',
    'Dear {patient_name}, your appointment with {doctor_name} has been booked for {date} at {time}. Thank you for choosing SpiritMed.',
    '["patient_name", "doctor_name", "date", "time"]'::jsonb,
    true
FROM branches b
ON CONFLICT (branch_id, trigger_type) DO UPDATE SET
    message_body = EXCLUDED.message_body,
    variables = EXCLUDED.variables;

INSERT INTO sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
SELECT 
    b.id,
    'appointment_confirmed',
    'DEFAULT_CONFIRMED_ID',
    'Dear {patient_name}, your appointment with {doctor_name} on {date} at {time} has been confirmed. We look forward to seeing you.',
    '["patient_name", "doctor_name", "date", "time"]'::jsonb,
    true
FROM branches b
ON CONFLICT (branch_id, trigger_type) DO UPDATE SET
    message_body = EXCLUDED.message_body,
    variables = EXCLUDED.variables;

INSERT INTO sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
SELECT 
    b.id,
    'payment_received',
    'DEFAULT_PAYMENT_ID',
    'Hello {patient_name}, we have received your payment of {amount} for invoice {invoice_number}. Your remaining balance is {balance}. Thank you!',
    '["patient_name", "amount", "invoice_number", "balance"]'::jsonb,
    true
FROM branches b
ON CONFLICT (branch_id, trigger_type) DO UPDATE SET
    message_body = EXCLUDED.message_body,
    variables = EXCLUDED.variables;

INSERT INTO sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
SELECT 
    b.id,
    'patient_registered',
    'DEFAULT_REG_ID',
    'Welcome {patient_name} to SpiritMed Medical System. Your registration is successful. We are here to provide you with the best care.',
    '["patient_name"]'::jsonb,
    true
FROM branches b
ON CONFLICT (branch_id, trigger_type) DO UPDATE SET
    message_body = EXCLUDED.message_body,
    variables = EXCLUDED.variables;
