-- Update branches RLS policy to allow branch admins to update their own branch
DROP POLICY IF EXISTS "Only super admins can update branches" ON branches;

CREATE POLICY "Super admins and branch admins can update branches"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.id = auth.uid() AND u.branch_id = branches.id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.id = auth.uid() AND u.branch_id = branches.id)
      )
    )
  );
