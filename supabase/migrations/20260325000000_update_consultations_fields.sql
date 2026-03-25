-- Update consultations table with new fields matching the Add Consultation form
ALTER TABLE consultations 
ADD COLUMN IF NOT EXISTS investigations text,
ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS follow_up_period text,
ADD COLUMN IF NOT EXISTS follow_up_time text,
ADD COLUMN IF NOT EXISTS follow_up_date date;

-- Add status column if not exists (was missing from original schema)
ALTER TABLE consultations
ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';

-- Add medical_history column if not exists
ALTER TABLE consultations
ADD COLUMN IF NOT EXISTS medical_history text;

-- Rename/alias columns for clarity:
-- chief_complaint = Main Complaints
-- physical_examination = Observations (using existing 'examination' OR we add this)
-- treatment_plan = Treatment Plan
-- notes = Remarks

-- Add physical_examination alias if only 'examination' exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'consultations' 
        AND column_name = 'physical_examination'
    ) THEN
        ALTER TABLE consultations ADD COLUMN physical_examination text;
    END IF;
END
$$;

-- Add chief_complaint alias if only 'history' exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'consultations' 
        AND column_name = 'chief_complaint'
    ) THEN
        ALTER TABLE consultations ADD COLUMN chief_complaint text;
    END IF;
END
$$;
