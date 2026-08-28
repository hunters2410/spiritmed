-- Migration: Asset Categories Table & Precategories Seed
-- Date: 2026-04-20

-- 1. Create asset_categories table
CREATE TABLE IF NOT EXISTS asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE asset_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "asset_categories_select" ON asset_categories;
DROP POLICY IF EXISTS "asset_categories_all" ON asset_categories;

CREATE POLICY "asset_categories_select"
ON asset_categories FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "asset_categories_all"
ON asset_categories FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 3. Seed pre-defined hospital asset precategories
INSERT INTO asset_categories (name, code, description)
VALUES 
  ('Biomedical & Medical Equipment', 'BIOMED', 'Biomedical devices, patient monitors, ICU ventilators, ultrasound, and imaging equipment.'),
  ('IT Hardware & Infrastructure', 'IT_HW', 'Hospital computers, servers, networking gear, medical displays, and printers.'),
  ('Facilities & Power Plant', 'FACILITY', 'Generators, HVAC systems, elevators, water filtration, and building plant equipment.'),
  ('Vehicles & Ambulances', 'VEHICLE', 'Ambulances, mobile emergency clinics, staff transport vans, and logistics vehicles.'),
  ('Furniture & Hospital Fixtures', 'FURNITURE', 'Patient beds, examination tables, surgical chairs, medical carts, and office furniture.'),
  ('Laboratory Instruments', 'LAB_INST', 'Blood analyzers, centrifuges, microscopes, incubators, and lab diagnostic equipment.'),
  ('Surgical & Theatre Equipment', 'SURGICAL', 'Anaesthesia machines, electrocautery units, surgical lights, and endoscopy towers.'),
  ('General Appliances & Storage', 'GENERAL', 'Medicine refrigerators, autoclaves, sterilizers, and general office appliances.')
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;
