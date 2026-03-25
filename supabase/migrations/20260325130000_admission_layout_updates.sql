-- Add NPO start date and time to admission forms
ALTER TABLE admission_forms
ADD COLUMN npo_date DATE,
ADD COLUMN npo_time TIME;

-- Optional: Comments for clarity
COMMENT ON COLUMN admission_forms.npo_date IS 'Starting date for Nil Per Oral instructions';
COMMENT ON COLUMN admission_forms.npo_time IS 'Starting time for Nil Per Oral instructions';
