-- Create medicine_frequencies table
CREATE TABLE IF NOT EXISTS medicine_frequencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, name) -- Ensure uniqueness per branch
);

-- Create medicines table
CREATE TABLE IF NOT EXISTS medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  dosage text,
  route text,
  frequency_id uuid REFERENCES medicine_frequencies(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, name, dosage, route) -- Ensure uniqueness per branch
);

-- Enable RLS
ALTER TABLE medicine_frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;

-- Idempotent Policy Creation
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for authenticated users' AND tablename = 'medicine_frequencies') THEN
        CREATE POLICY "Enable all for authenticated users" ON medicine_frequencies FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for authenticated users' AND tablename = 'medicines') THEN
        CREATE POLICY "Enable all for authenticated users" ON medicines FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Seed initial common frequencies
INSERT INTO medicine_frequencies (name, description) VALUES
  ('OD', 'Once daily'),
  ('BD', 'Twice daily'),
  ('TDS', 'Three times daily'),
  ('QID', 'Four times daily'),
  ('STAT', 'Immediately'),
  ('PRN', 'As needed'),
  ('nocte', 'At night'),
  ('mane', 'In the morning'),
  ('pc', 'After meals'),
  ('ac', 'Before meals')
ON CONFLICT DO NOTHING;
