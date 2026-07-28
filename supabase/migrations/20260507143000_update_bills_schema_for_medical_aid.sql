-- Update bills table (formerly invoices) to support medical aid billing and new terminology
DO $$ 
BEGIN
    -- Rename invoice_date to bill_date ONLY if invoice_date exists and bill_date does NOT exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'invoice_date') AND 
       NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'bill_date') THEN
        ALTER TABLE bills RENAME COLUMN invoice_date TO bill_date;
    END IF;

    -- Add missing columns for medical aid and financial tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'payment_method') THEN
        ALTER TABLE bills ADD COLUMN payment_method text CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'medical_aid', 'eft'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'medical_aid_id') THEN
        ALTER TABLE bills ADD COLUMN medical_aid_id uuid REFERENCES medical_aids(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'medical_aid_amount') THEN
        ALTER TABLE bills ADD COLUMN medical_aid_amount numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'shortfall_amount') THEN
        ALTER TABLE bills ADD COLUMN shortfall_amount numeric DEFAULT 0;
    END IF;

    -- NEW: Track individual balances for shortfall and medical aid
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'medical_aid_balance') THEN
        ALTER TABLE bills ADD COLUMN medical_aid_balance numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'shortfall_balance') THEN
        ALTER TABLE bills ADD COLUMN shortfall_balance numeric DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'discount_amount') THEN
        ALTER TABLE bills ADD COLUMN discount_amount numeric DEFAULT 0;
    END IF;

    -- Add target_portion to payments if missing (for legacy data)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'target_portion') THEN
        ALTER TABLE payments ADD COLUMN target_portion text DEFAULT 'shortfall' CHECK (target_portion IN ('shortfall', 'medical_aid'));
    END IF;

END $$;

-- Update initial balances for existing bills
UPDATE bills 
SET 
  medical_aid_balance = medical_aid_amount,
  shortfall_balance = shortfall_amount
WHERE medical_aid_balance = 0 AND shortfall_balance = 0;
