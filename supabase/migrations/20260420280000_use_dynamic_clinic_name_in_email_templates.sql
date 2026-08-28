-- Update existing email_templates and sms_templates to use dynamic {clinic_name} placeholder instead of hardcoded 'SpiritMed'

-- 1. Email Templates
UPDATE email_templates
SET 
  subject = REPLACE(REPLACE(REPLACE(subject, 'SpiritMed Medical System', '{clinic_name}'), 'SpiritMed Medical', '{clinic_name}'), 'SpiritMed', '{clinic_name}'),
  body = REPLACE(REPLACE(REPLACE(REPLACE(body, 'SpiritMed Medical System', '{clinic_name}'), 'SpiritMed Medical', '{clinic_name}'), 'SpiritMed Team', '{clinic_name} Team'), 'SpiritMed', '{clinic_name}'),
  name = REPLACE(name, 'SpiritMed', '{clinic_name}')
WHERE subject LIKE '%SpiritMed%' OR body LIKE '%SpiritMed%' OR name LIKE '%SpiritMed%';

-- 2. SMS Templates
UPDATE sms_templates
SET 
  message_body = REPLACE(REPLACE(REPLACE(REPLACE(message_body, 'SpiritMed Medical System', '{clinic_name}'), 'SpiritMed Medical', '{clinic_name}'), 'SpiritMed Team', '{clinic_name} Team'), 'SpiritMed', '{clinic_name}')
WHERE message_body LIKE '%SpiritMed%';
