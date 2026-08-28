-- Fix FK constraints so bills can be deleted with all related records
-- and so PostgREST has only ONE clear relationship between bills and bill_items.
--
-- STEP 1: Fix payments FK
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_bill_id_fkey;
ALTER TABLE payments
    ADD CONSTRAINT payments_bill_id_fkey
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;

-- STEP 2: Fix bill_items FK
-- Drop ALL possible old constraints (invoice_id era + any duplicates)
ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS bill_items_invoice_id_fkey;
ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS bill_items_bill_id_fkey;

-- Find and drop any other FK from bill_items → bills
-- (Run this if the above doesn't clear PGRST201):
-- SELECT conname FROM pg_constraint WHERE conrelid='bill_items'::regclass AND confrelid='bills'::regclass;
-- Then: ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS <found_name>;

ALTER TABLE bill_items
    ADD CONSTRAINT bill_items_bill_id_fkey
    FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;
