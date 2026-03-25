-- Create diagnoses table with ICD-10 code support (unique per branch)
CREATE TABLE IF NOT EXISTS diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  icd10_code text,
  description text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT diagnoses_branch_name_unique UNIQUE (branch_id, name)
);

ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for authenticated users' AND tablename = 'diagnoses') THEN
    CREATE POLICY "Enable all for authenticated users" ON diagnoses FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
