-- Add file_number column to patients and patient_temporary_db
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS file_number text;
ALTER TABLE public.patient_temporary_db ADD COLUMN IF NOT EXISTS file_number text;
