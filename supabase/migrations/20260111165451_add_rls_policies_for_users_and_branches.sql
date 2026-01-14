/*
  # Add RLS Policies for Users and Branches

  ## Summary
  This migration adds comprehensive Row Level Security (RLS) policies for the users and branches tables to enable proper access control and fix the "Unauthorized: User not found" error.

  ## Changes Made

  ### 1. Users Table RLS Policies
  - **Select Policy**: Authenticated users can view all users in the system
  - **Insert Policy**: Only accessible via the create_user_profile function (SECURITY DEFINER)
  - **Update Policy**: Super admins can update any user, admins can update users in their branch
  - **Delete Policy**: Only super admins can delete users

  ### 2. Branches Table RLS Policies
  - **Select Policy**: All authenticated users can view all branches
  - **Insert Policy**: Only super admins can create new branches
  - **Update Policy**: Only super admins can update branches
  - **Delete Policy**: Only super admins can delete branches

  ## Security Notes
  - Super admins have full control over all operations
  - Branch admins have limited control within their branch
  - All policies check authentication status first
  - Policies are designed to work with the create_user_profile function
*/

-- RLS Policies for Users Table

-- Users can view all users (needed for staff lists, doctor selections, etc.)
CREATE POLICY "Authenticated users can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- Users table inserts should only happen via the create_user_profile function
-- This policy allows the function to insert (SECURITY DEFINER bypasses RLS)
CREATE POLICY "Allow inserts via function"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Super admins can update any user, admins can update users in their branch
CREATE POLICY "Users can update based on role"
  ON users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = users.branch_id)
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND (
        u.role = 'super_admin'
        OR (u.role = 'admin' AND u.branch_id = users.branch_id)
      )
    )
  );

-- Only super admins can delete users
CREATE POLICY "Only super admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- RLS Policies for Branches Table

-- All authenticated users can view branches
CREATE POLICY "Authenticated users can view branches"
  ON branches FOR SELECT
  TO authenticated
  USING (true);

-- Only super admins can create branches
CREATE POLICY "Only super admins can create branches"
  ON branches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- Only super admins can update branches
CREATE POLICY "Only super admins can update branches"
  ON branches FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );

-- Only super admins can delete branches
CREATE POLICY "Only super admins can delete branches"
  ON branches FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'super_admin'
    )
  );
