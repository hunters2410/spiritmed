-- Add paid_amount and balance columns to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance numeric;

-- Update balance to equal total_amount for all invoices initially
UPDATE invoices 
SET balance = total_amount 
WHERE balance IS NULL;

-- Recalculate paid_amount and balance for all existing invoices based on payments
UPDATE invoices i
SET 
    paid_amount = COALESCE((
        SELECT SUM(amount) 
        FROM payments p 
        WHERE p.invoice_id = i.id
    ), 0),
    balance = i.total_amount - COALESCE((
        SELECT SUM(amount) 
        FROM payments p 
        WHERE p.invoice_id = i.id
    ), 0);
