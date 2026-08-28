-- =====================================================
-- FIX: handle_new_branch_templates trigger function
-- Run this FIRST before CREATE_USERS.sql
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_branch_templates()
RETURNS TRIGGER AS $$
BEGIN
  -- Email templates (using WHERE NOT EXISTS to avoid constraint issues)
  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  SELECT NEW.id, 'Appointment Booked Notification', 'appointment_booked',
    'Your Booking at SpiritMed Medical - {doctor_name}',
    'Dear {patient_name},<br/><br/>Your appointment with <strong>{doctor_name}</strong> has been successfully booked for <strong>{date}</strong> at <strong>{time}</strong>.<br/><br/>We look forward to seeing you.<br/><br/>Regards,<br/>SpiritMed Team',
    'appointment', '["patient_name", "doctor_name", "date", "time"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE branch_id = NEW.id AND name = 'Appointment Booked Notification');

  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  SELECT NEW.id, 'Appointment Confirmation', 'appointment_confirmed',
    'CONFIRMED: Your Appointment on {date}',
    'Dear {patient_name},<br/><br/>Confirming your appointment with <strong>{doctor_name}</strong> on <strong>{date}</strong> at <strong>{time}</strong>.<br/><br/>Please arrive 10 minutes early for check-in.<br/><br/>Regards,<br/>SpiritMed Team',
    'appointment', '["patient_name", "doctor_name", "date", "time"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE branch_id = NEW.id AND name = 'Appointment Confirmation');

  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  SELECT NEW.id, 'Payment Receipt', 'payment_received',
    'Payment Received - Invoice {invoice_number}',
    'Dear {patient_name},<br/><br/>We have successfully received your payment of <strong>{amount}</strong> for Invoice <strong>#{invoice_number}</strong>.<br/><br/>Your updated balance is: <strong>{balance}</strong>.<br/><br/>Thank you for your prompt payment.<br/><br/>Regards,<br/>Accounting Department',
    'billing', '["patient_name", "amount", "invoice_number", "balance"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE branch_id = NEW.id AND name = 'Payment Receipt');

  INSERT INTO public.email_templates (branch_id, name, trigger_type, subject, body, category, placeholders, is_active)
  SELECT NEW.id, 'Welcome to SpiritMed', 'patient_registered',
    'Welcome to SpiritMed Medical System',
    'Dear {patient_name},<br/><br/>Welcome to SpiritMed Medical System! Your patient profile has been successfully created.<br/><br/>We are committed to providing you with the highest quality of healthcare.<br/><br/>Regards,<br/>Administration Team',
    'clinical', '["patient_name"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.email_templates WHERE branch_id = NEW.id AND name = 'Welcome to SpiritMed');

  -- SMS templates
  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  SELECT NEW.id, 'appointment_booked', 'DEFAULT_BOOKED_ID',
    'Dear {patient_name}, your appointment with {doctor_name} has been booked for {date} at {time}. Thank you for choosing SpiritMed.',
    '["patient_name", "doctor_name", "date", "time"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates WHERE branch_id = NEW.id AND trigger_type = 'appointment_booked');

  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  SELECT NEW.id, 'appointment_confirmed', 'DEFAULT_CONFIRMED_ID',
    'Dear {patient_name}, your appointment with {doctor_name} on {date} at {time} has been confirmed. We look forward to seeing you.',
    '["patient_name", "doctor_name", "date", "time"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates WHERE branch_id = NEW.id AND trigger_type = 'appointment_confirmed');

  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  SELECT NEW.id, 'payment_received', 'DEFAULT_PAYMENT_ID',
    'Hello {patient_name}, we have received your payment of {amount} for invoice {invoice_number}. Your remaining balance is {balance}. Thank you!',
    '["patient_name", "amount", "invoice_number", "balance"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates WHERE branch_id = NEW.id AND trigger_type = 'payment_received');

  INSERT INTO public.sms_templates (branch_id, trigger_type, provider_template_id, message_body, variables, is_active)
  SELECT NEW.id, 'patient_registered', 'DEFAULT_REG_ID',
    'Welcome {patient_name} to SpiritMed Medical System. Your registration is successful. We are here to provide you with the best care.',
    '["patient_name"]'::jsonb, true
  WHERE NOT EXISTS (SELECT 1 FROM public.sms_templates WHERE branch_id = NEW.id AND trigger_type = 'patient_registered');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
