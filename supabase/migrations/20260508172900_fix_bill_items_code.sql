-- Add code column to billing items
ALTER TABLE IF EXISTS bill_items ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE IF EXISTS estimate_bill_items ADD COLUMN IF NOT EXISTS code text;
