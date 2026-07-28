-- Add trigger_type to email_templates
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS trigger_type TEXT;

-- Seed default templates for all existing branches
-- Note: We use placeholders like {{variable}} to match standard email template formats

-- 1. Appointment Booked
INSERT INTO email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
SELECT 
    b.id,
    'Appointment Booked Notification',
    'appointment_booked',
    'Your Booking at SpiritMed Medical - {doctor_name}',
    'Dear {patient_name},<br/><br/>Your appointment with <strong>{doctor_name}</strong> has been successfully booked for <strong>{date}</strong> at <strong>{time}</strong>.<br/><br/>We look forward to seeing you.<br/><br/>Regards,<br/>SpiritMed Team',
    'appointment',
    '["patient_name", "doctor_name", "date", "time"]'::jsonb,
    true
FROM branches b
ON CONFLICT (branch_id, name) DO UPDATE SET
    trigger_type = EXCLUDED.trigger_type,
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    placeholders = EXCLUDED.placeholders;

-- 2. Appointment Confirmed
INSERT INTO email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
SELECT 
    b.id,
    'Appointment Confirmation',
    'appointment_confirmed',
    'CONFIRMED: Your Appointment on {date}',
    'Dear {patient_name},<br/><br/>Confirming your appointment with <strong>{doctor_name}</strong> on <strong>{date}</strong> at <strong>{time}</strong>.<br/><br/>Please arrive 10 minutes early for check-in.<br/><br/>Regards,<br/>SpiritMed Team',
    'appointment',
    '["patient_name", "doctor_name", "date", "time"]'::jsonb,
    true
FROM branches b
ON CONFLICT (branch_id, name) DO UPDATE SET
    trigger_type = EXCLUDED.trigger_type,
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    placeholders = EXCLUDED.placeholders;

-- 3. Payment Received
INSERT INTO email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
SELECT 
    b.id,
    'Payment Receipt - Invoice {invoice_number}',
    'payment_received',
    'Payment Received - Invoice {invoice_number}',
    'Dear {patient_name},<br/><br/>We have successfully received your payment of <strong>{amount}</strong> for Invoice <strong>#{invoice_number}</strong>.<br/><br/>Your updated balance is: <strong>{balance}</strong>.<br/><br/>Thank you for your prompt payment.<br/><br/>Regards,<br/>Accounting Department',
    'billing',
    '["patient_name", "amount", "invoice_number", "balance"]'::jsonb,
    true
FROM branches b
ON CONFLICT (branch_id, name) DO UPDATE SET
    trigger_type = EXCLUDED.trigger_type,
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    placeholders = EXCLUDED.placeholders;

-- 4. Patient Registered
INSERT INTO email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
SELECT 
    b.id,
    'Welcome to SpiritMed',
    'patient_registered',
    'Welcome to SpiritMed Medical System',
    'Dear {patient_name},<br/><br/>Welcome to SpiritMed Medical System! Your patient profile has been successfully created.<br/><br/>We are committed to providing you with the highest quality of healthcare.<br/><br/>Regards,<br/>Administration Team',
    'clinical',
    '["patient_name"]'::jsonb,
    true
FROM branches b
ON CONFLICT (branch_id, name) DO UPDATE SET
    trigger_type = EXCLUDED.trigger_type,
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    placeholders = EXCLUDED.placeholders;
