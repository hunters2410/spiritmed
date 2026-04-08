-- Add linked invoice ID to patient_bills for traceability
ALTER TABLE patient_bills ADD COLUMN IF NOT EXISTS converted_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;

-- Update the existing bills that have status 'invoiced' (will be NULL for old ones, but helps going forward)
-- No easy way to match old ones without more logic, so we'll just leave them for new conversions.
