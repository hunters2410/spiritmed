-- Create complaints table (unique per branch)
CREATE TABLE IF NOT EXISTS complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT complaints_branch_name_unique UNIQUE (branch_id, name)
);

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for authenticated users' AND tablename = 'complaints') THEN
    CREATE POLICY "Enable all for authenticated users" ON complaints FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Create investigations table (unique per branch)
CREATE TABLE IF NOT EXISTS investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT investigations_branch_name_unique UNIQUE (branch_id, name)
);

ALTER TABLE investigations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all for authenticated users' AND tablename = 'investigations') THEN
    CREATE POLICY "Enable all for authenticated users" ON investigations FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed default complaints (global, branch_id = null not possible due to FK, skip seeding)
-- Users will add their own complaints per branch via the management UI
