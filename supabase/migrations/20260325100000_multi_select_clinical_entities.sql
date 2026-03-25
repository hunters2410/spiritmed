-- Enable multi-select for anaesthetists and assistants in operation reports
ALTER TABLE operation_reports
ADD COLUMN anaesthetist_ids uuid[] DEFAULT '{}',
ADD COLUMN assistant_ids uuid[] DEFAULT '{}';

-- Optional: Comments for clarity
COMMENT ON COLUMN operation_reports.anaesthetist_ids IS 'List of anaesthetists involved in the operation';
COMMENT ON COLUMN operation_reports.assistant_ids IS 'List of assistants involved in the operation';
