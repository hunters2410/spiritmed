-- Update prescriptions table: make it a header-only record
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS prescription_number text,
  ADD COLUMN IF NOT EXISTS prescription_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Drop old single-medication columns (safe to drop if no data to preserve)
ALTER TABLE prescriptions
  DROP COLUMN IF EXISTS medication_name,
  DROP COLUMN IF EXISTS dosage,
  DROP COLUMN IF EXISTS frequency,
  DROP COLUMN IF EXISTS duration,
  DROP COLUMN IF EXISTS instructions;

-- Create prescription_items table (one row per medicine per prescription)
CREATE TABLE IF NOT EXISTS prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id uuid REFERENCES medicines(id) ON DELETE RESTRICT,
  period text,
  time_unit text DEFAULT 'Days',
  advice text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for authenticated users' AND tablename = 'prescription_items'
  ) THEN
    CREATE POLICY "Enable all for authenticated users" ON prescription_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
