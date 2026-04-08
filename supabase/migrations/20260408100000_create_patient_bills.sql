-- Create patient_bills table
CREATE TABLE IF NOT EXISTS patient_bills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
    patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
    bill_number text UNIQUE NOT NULL,
    bill_date timestamptz DEFAULT now(),
    payment_method text CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'medical_aid')),
    medical_aid_id uuid REFERENCES medical_aids(id) ON DELETE SET NULL,
    subtotal numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'invoiced', 'cancelled')),
    notes text,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Create patient_bill_items table
CREATE TABLE IF NOT EXISTS patient_bill_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_id uuid REFERENCES patient_bills(id) ON DELETE CASCADE,
    procedure_id uuid REFERENCES payment_procedures(id) ON DELETE SET NULL,
    description text NOT NULL,
    quantity numeric DEFAULT 1,
    unit_price numeric DEFAULT 0,
    total_price numeric DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE patient_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_bill_items ENABLE ROW LEVEL SECURITY;

-- Policies for patient_bills
DROP POLICY IF EXISTS "Users can view patient bills in their branch" ON patient_bills;
CREATE POLICY "Users can view patient bills in their branch"
    ON patient_bills FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'super_admin' OR users.branch_id = patient_bills.branch_id)
        )
    );

DROP POLICY IF EXISTS "Users can insert patient bills" ON patient_bills;
CREATE POLICY "Users can insert patient bills"
    ON patient_bills FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'super_admin' OR users.branch_id = patient_bills.branch_id)
        )
    );

DROP POLICY IF EXISTS "Users can update patient bills" ON patient_bills;
CREATE POLICY "Users can update patient bills"
    ON patient_bills FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'super_admin' OR users.branch_id = patient_bills.branch_id)
        )
    );

DROP POLICY IF EXISTS "Users can delete patient bills" ON patient_bills;
CREATE POLICY "Users can delete patient bills"
    ON patient_bills FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (users.role = 'super_admin' OR users.branch_id = patient_bills.branch_id)
        )
    );

-- Policies for patient_bill_items
DROP POLICY IF EXISTS "Users can view patient bill items" ON patient_bill_items;
CREATE POLICY "Users can view patient bill items"
    ON patient_bill_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM patient_bills
            JOIN users ON users.branch_id = patient_bills.branch_id
            WHERE patient_bill_items.bill_id = patient_bills.id
            AND users.id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert patient bill items" ON patient_bill_items;
CREATE POLICY "Users can insert patient bill items"
    ON patient_bill_items FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM patient_bills
            JOIN users ON users.branch_id = patient_bills.branch_id
            WHERE patient_bill_items.bill_id = patient_bills.id
            AND users.id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update patient bill items" ON patient_bill_items;
CREATE POLICY "Users can update patient bill items"
    ON patient_bill_items FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM patient_bills
            JOIN users ON users.branch_id = patient_bills.branch_id
            WHERE patient_bill_items.bill_id = patient_bills.id
            AND users.id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete patient bill items" ON patient_bill_items;
CREATE POLICY "Users can delete patient bill items"
    ON patient_bill_items FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM patient_bills
            JOIN users ON users.branch_id = patient_bills.branch_id
            WHERE patient_bill_items.bill_id = patient_bills.id
            AND users.id = auth.uid()
        )
    );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_patient_bills_branch ON patient_bills(branch_id);
CREATE INDEX IF NOT EXISTS idx_patient_bills_patient ON patient_bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_bill_items_bill ON patient_bill_items(bill_id);
