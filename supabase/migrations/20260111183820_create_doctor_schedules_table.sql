/*
  # Create Doctor Schedules Table

  ## Overview
  Creates a table to manage doctor appointment schedules, allowing each doctor to set their available time slots throughout the week.

  ## New Tables
  - `doctor_schedules`
    - `id` (uuid, primary key) - Unique identifier for the schedule entry
    - `doctor_id` (uuid, foreign key) - Reference to the doctor in users table
    - `branch_id` (uuid, foreign key) - Reference to the branch
    - `day_of_week` (integer) - Day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)
    - `start_time` (time) - Schedule start time
    - `end_time` (time) - Schedule end time
    - `is_available` (boolean) - Whether the doctor is available during this time slot
    - `max_appointments` (integer) - Maximum number of appointments for this slot
    - `slot_duration_minutes` (integer) - Duration of each appointment slot in minutes
    - `created_at` (timestamptz) - Record creation timestamp
    - `updated_at` (timestamptz) - Record update timestamp

  ## Security
  - Enable RLS on `doctor_schedules` table
  - Add policies for authenticated users to read schedules
  - Add policies for super_admins and admins to manage schedules
  - Add policies for doctors to manage their own schedules

  ## Indexes
  - Index on doctor_id for fast lookups
  - Index on branch_id for branch-specific queries
  - Index on day_of_week for day-specific queries
*/

-- Create doctor_schedules table
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid REFERENCES users(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_available boolean DEFAULT true,
  max_appointments integer DEFAULT 0,
  slot_duration_minutes integer DEFAULT 30,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor_id ON doctor_schedules(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_branch_id ON doctor_schedules(branch_id);
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_day_of_week ON doctor_schedules(day_of_week);

-- Enable Row Level Security
ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read all schedules
CREATE POLICY "Authenticated users can view doctor schedules"
  ON doctor_schedules FOR SELECT
  TO authenticated
  USING (true);

-- Policy for super_admins and admins to insert schedules
CREATE POLICY "Super admins and admins can create doctor schedules"
  ON doctor_schedules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
    OR
    auth.uid() = doctor_id
  );

-- Policy for super_admins, admins, and doctors to update their own schedules
CREATE POLICY "Admins and doctors can update schedules"
  ON doctor_schedules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
    OR
    auth.uid() = doctor_id
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
    OR
    auth.uid() = doctor_id
  );

-- Policy for super_admins and admins to delete schedules
CREATE POLICY "Super admins and admins can delete doctor schedules"
  ON doctor_schedules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('super_admin', 'admin')
    )
    OR
    auth.uid() = doctor_id
  );
