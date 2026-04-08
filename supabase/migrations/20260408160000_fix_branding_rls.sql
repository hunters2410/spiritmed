-- Final Fix for Branding Settings Persistence
-- This migration ensures that Doctors, Admins, and Super Admins can all manage their branch branding.

-- 1. Remove all old and conflicting policies for branches update
DROP POLICY IF EXISTS "Only super admins can update branches" ON branches;
DROP POLICY IF EXISTS "Super admins and branch admins can update branches" ON branches;
DROP POLICY IF EXISTS "Allow branch updates for authorized staff" ON branches;

-- 2. Create a naming-consistent, comprehensive policy
CREATE POLICY "Authorized staff can update their own branch branding"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role IN ('admin', 'doctor') AND u.branch_id = branches.id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role IN ('admin', 'doctor') AND u.branch_id = branches.id)
      )
    )
  );

-- 3. Also Ensure SELECT is consistent
DROP POLICY IF EXISTS "Authenticated users can view branches" ON branches;
CREATE POLICY "Authenticated users can view branches"
  ON branches FOR SELECT
  TO authenticated
  USING (true);
