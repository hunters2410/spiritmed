-- Run this in the Supabase SQL Editor to sync the hospital_files table with the frontend requirements.

-- 1. Rename file_name to name
ALTER TABLE hospital_files RENAME COLUMN file_name TO name;

-- 2. Add description column
ALTER TABLE hospital_files ADD COLUMN IF NOT EXISTS description text;

-- 3. Update the handleBatchUpload logic already handled in HospitalFiles.tsx
