/*
  # Add System Configurations Table

  1. New Tables
    - `system_configurations`
      - `id` (uuid, primary key)
      - `config_type` (text) - Type of configuration (email, sms)
      - `config_name` (text) - Name/identifier of the configuration
      - `config_data` (jsonb) - Configuration data stored as JSON
      - `is_active` (boolean) - Whether this configuration is active
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `created_by` (uuid) - Foreign key to users table
      - `updated_by` (uuid) - Foreign key to users table

  2. Security
    - Enable RLS on `system_configurations` table
    - Add policy for super_admin and admin to view configurations
    - Add policy for super_admin and admin to create configurations
    - Add policy for super_admin and admin to update configurations
    - Add policy for super_admin and admin to delete configurations

  3. Indexes
    - Add index on config_type for faster filtering
    - Add unique index on (config_type, config_name) to prevent duplicates
*/

CREATE TABLE IF NOT EXISTS system_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type text NOT NULL,
  config_name text NOT NULL,
  config_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  CONSTRAINT unique_config_type_name UNIQUE(config_type, config_name)
);

CREATE INDEX IF NOT EXISTS idx_system_configurations_type ON system_configurations(config_type);
CREATE INDEX IF NOT EXISTS idx_system_configurations_active ON system_configurations(is_active);

ALTER TABLE system_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view system configurations"
  ON system_configurations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Admins can create system configurations"
  ON system_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Admins can update system configurations"
  ON system_configurations
  FOR UPDATE
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

CREATE POLICY "Admins can delete system configurations"
  ON system_configurations
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
  );
