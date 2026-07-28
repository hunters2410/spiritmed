-- Fix for duplicate key constraint error on system_configurations
-- Date: 2026-04-20

-- 1. Drop the old global unique constraint if it exists.
-- The name of the constraint in the January migration was 'unique_config_type_name'
ALTER TABLE system_configurations DROP CONSTRAINT IF EXISTS unique_config_type_name;

-- 2. Add branch_id if it's missing (it was added in the April migration, but we ensure it here)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_configurations' AND column_name='branch_id') THEN
        ALTER TABLE system_configurations ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Add the correct branch-specific unique constraint.
-- This ensures each branch can have its own config for a given type/name.
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'idx_system_configs_branch_type_name' 
           OR conname = 'system_configurations_branch_id_config_type_config_name_key'
    ) THEN
        ALTER TABLE system_configurations 
        ADD CONSTRAINT idx_system_configs_branch_type_name UNIQUE(branch_id, config_type, config_name);
    END IF;
END $$;

-- 4. Update existing records that might have NULL branch_id if necessary
-- (Usually not needed if the system has been using branch_id correctly recently)

-- 5. Refresh RLS Policies to ensure branch-based access
DROP POLICY IF EXISTS "Admins can view system configurations" ON system_configurations;
DROP POLICY IF EXISTS "Users can view their branch configurations" ON system_configurations;
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

DROP POLICY IF EXISTS "Admins can manage their branch configurations" ON system_configurations;
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
