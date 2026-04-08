-- 1. Relax Branches Policy (Branch admins can update their own hospital)
DROP POLICY IF EXISTS "Only super admins can update branches" ON branches;
DROP POLICY IF EXISTS "Super admins and branch admins can update branches" ON branches;

CREATE POLICY "Super admins and branch admins can update branches"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = branches.id)
      )
    )
  );

-- 2. Relax Users Policy (Allow all users to update their own basic profile/signature)
DROP POLICY IF EXISTS "Users can update based on role" ON users;

CREATE POLICY "Users can update own profile or admins can update branch staff"
  ON users FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id -- Can update self
    OR EXISTS (     -- OR Super Admin
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
    OR EXISTS (     -- OR Branch Admin for same branch
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.branch_id = users.branch_id
    )
  );

-- 3. Create System Configurations Table (Expected by Settings.tsx)
CREATE TABLE IF NOT EXISTS system_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  config_type text NOT NULL, -- 'email', 'sms', 'system'
  config_name text NOT NULL, -- 'smtp', 'provider', etc
  config_data jsonb DEFAULT '{}',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(branch_id, config_type, config_name)
);

-- Enable RLS
ALTER TABLE system_configurations ENABLE ROW LEVEL SECURITY;

-- Policies for System Configurations
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
