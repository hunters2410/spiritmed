-- Migration: Hospital Assets Register Schema
-- Date: 2026-04-20

-- 1. Create hospital_assets table
CREATE TABLE IF NOT EXISTS hospital_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  asset_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'biomedical',
  model_number VARCHAR(100),
  serial_number VARCHAR(100),
  manufacturer VARCHAR(100),
  location VARCHAR(150),
  department VARCHAR(100),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'operational',
  condition VARCHAR(50) NOT NULL DEFAULT 'good',
  purchase_date DATE,
  purchase_cost NUMERIC(15, 2) DEFAULT 0.00,
  salvage_value NUMERIC(15, 2) DEFAULT 0.00,
  useful_life_years INT DEFAULT 5,
  warranty_expiry DATE,
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  last_calibration_date DATE,
  next_calibration_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create asset_maintenance_logs table
CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES hospital_assets(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'preventive_maintenance',
  performed_by VARCHAR(150),
  cost NUMERIC(15, 2) DEFAULT 0.00,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  details TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE hospital_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_maintenance_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "hospital_assets_select" ON hospital_assets;
DROP POLICY IF EXISTS "hospital_assets_all" ON hospital_assets;

CREATE POLICY "hospital_assets_select"
ON hospital_assets FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "hospital_assets_all"
ON hospital_assets FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "asset_maintenance_logs_all" ON asset_maintenance_logs;

CREATE POLICY "asset_maintenance_logs_all"
ON asset_maintenance_logs FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
