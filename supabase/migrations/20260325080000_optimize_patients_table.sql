-- Optimize patients table with uniqueness constraints
-- Date: 2026-03-25

-- 1. Uniqueness on email within a branch (where email is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_patient_email_per_branch 
ON patients (branch_id, email) 
WHERE (email IS NOT NULL AND email <> '');

-- 2. Uniqueness on name and DOB within a branch to prevent duplicates (where DOB is known)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_patient_name_dob_per_branch 
ON patients (branch_id, full_name, date_of_birth)
WHERE (date_of_birth IS NOT NULL);

-- 3. Note: phone numbering could also be unique, but multiple family members 
-- may share the same phone number for notifications.
