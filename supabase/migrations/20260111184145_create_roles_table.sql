/*
  # Create Roles and Permissions Table

  ## Overview
  Creates a table to manage custom roles and their permissions within the hospital management system.

  ## New Tables
  - `roles`
    - `id` (uuid, primary key) - Unique identifier for the role
    - `branch_id` (uuid, foreign key) - Reference to the branch (null for system-wide roles)
    - `name` (text) - Role name (e.g., "Senior Doctor", "Head Nurse")
    - `description` (text) - Description of the role
    - `base_role` (text) - Base role type (doctor, nurse, receptionist, accountant)
    - `permissions` (jsonb) - JSON object containing permissions
    - `is_active` (boolean) - Whether the role is active
    - `created_at` (timestamptz) - Record creation timestamp
    - `updated_at` (timestamptz) - Record update timestamp
    - `created_by` (uuid, foreign key) - User who created the role

  ## Security
  - Enable RLS on `roles` table
  - Add policies for authenticated users to view roles
  - Add policies for super_admins and admins to manage roles

  ## Indexes
  - Index on branch_id for branch-specific queries
  - Index on base_role for filtering by base role type
*/

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  base_role text NOT NULL CHECK (base_role IN ('doctor', 'nurse', 'receptionist', 'accountant', 'admin')),
  permissions jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_roles_branch_id ON roles(branch_id);
CREATE INDEX IF NOT EXISTS idx_roles_base_role ON roles(base_role);

-- Enable Row Level Security
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read roles
CREATE POLICY "Authenticated users can view roles"
  ON roles FOR SELECT
  TO authenticated
  USING (true);

-- Policy for super_admins and admins to insert roles
CREATE POLICY "Super admins and admins can create roles"
  ON roles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Policy for super_admins and admins to update roles
CREATE POLICY "Super admins and admins can update roles"
  ON roles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

-- Policy for super_admins and admins to delete roles
CREATE POLICY "Super admins and admins can delete roles"
  ON roles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );
