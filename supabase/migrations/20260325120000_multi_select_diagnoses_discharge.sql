-- Enable multi-select for diagnoses in discharge summaries
ALTER TABLE discharge_summaries
ADD COLUMN diagnosis_ids uuid[] DEFAULT '{}';

-- Optional: Comments for clarity
COMMENT ON COLUMN discharge_summaries.diagnosis_ids IS 'List of diagnoses for the patient discharge summary';
