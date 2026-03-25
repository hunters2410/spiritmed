-- Enable multi-select for diagnoses in admission forms
ALTER TABLE admission_forms
ADD COLUMN diagnosis_ids uuid[] DEFAULT '{}';

-- Optional: Comments for clarity
COMMENT ON COLUMN admission_forms.diagnosis_ids IS 'List of diagnoses for the patient admission';
