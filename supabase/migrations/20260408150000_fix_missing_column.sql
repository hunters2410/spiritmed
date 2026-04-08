-- 1. Ensure branch_id column exists in system_configurations
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'system_configurations' 
        AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE system_configurations ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 2. Update Row Level Security (Drop existing first to be clean)
DROP POLICY IF EXISTS "Users can view their branch configurations" ON system_configurations;
DROP POLICY IF EXISTS "Admins can manage their branch configurations" ON system_configurations;

-- 3. Re-enable RLS
ALTER TABLE system_configurations ENABLE ROW LEVEL SECURITY;

-- 4. Create proper Isolated Policies
CREATE POLICY "Users can view their branch configurations"
  ON system_configurations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR u.branch_id = system_configurations.branch_id
      )
    )
  );

CREATE POLICY "Admins can manage their branch configurations"
  ON system_configurations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = system_configurations.branch_id)
      )
    )
  );

-- 5. Fix Unique Constraint (Ensure it includes branch_id for multi-tenancy)
ALTER TABLE system_configurations DROP CONSTRAINT IF EXISTS system_configurations_branch_id_config_type_config_name_key;
ALTER TABLE system_configurations ADD CONSTRAINT system_configurations_branch_id_config_type_config_name_key UNIQUE (branch_id, config_type, config_name);
