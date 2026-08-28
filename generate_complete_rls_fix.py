import re

with open('MIGRATION_PART1_TABLES.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

tables = re.findall(r'CREATE TABLE public\.(\w+)', sql)
tables = sorted(list(set(tables)))
print(f'Total tables found: {len(tables)}')

sql_out = []
sql_out.append('-- ==========================================================')
sql_out.append('-- SPIRITMED COMPLETE RLS POLICIES & SCHEMA REPAIR SCRIPT')
sql_out.append('-- Applies SELECT and ALL permissions for authenticated users')
sql_out.append('-- across ALL 73 modules/tables in the database.')
sql_out.append('-- ==========================================================\n')
sql_out.append('BEGIN;\n')

sql_out.append('-- 1. FIX MISSING COLUMNS & CONSTRAINTS')
sql_out.append('ALTER TABLE public.medical_aids ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();')
sql_out.append('ALTER TABLE public.referral_doctors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();')
sql_out.append('ALTER TABLE public.diagnoses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();')
sql_out.append('ALTER TABLE public.surgical_procedures ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();')
sql_out.append('ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC DEFAULT 0;')
sql_out.append('ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_status_check;')
sql_out.append("ALTER TABLE public.patients ADD CONSTRAINT patients_status_check CHECK (status IN ('active', 'discharged', 'deceased', 'inactive'));")
sql_out.append('')

sql_out.append('-- 2. COMPREHENSIVE RLS POLICIES FOR ALL 73 TABLES')

for t in tables:
    sql_out.append(f'-- Table: public.{t}')
    sql_out.append(f'ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;')
    sql_out.append(f'DROP POLICY IF EXISTS "Allow authenticated select on {t}" ON public.{t};')
    sql_out.append(f'CREATE POLICY "Allow authenticated select on {t}" ON public.{t} FOR SELECT TO authenticated USING (true);')
    sql_out.append(f'DROP POLICY IF EXISTS "Allow authenticated all on {t}" ON public.{t};')
    sql_out.append(f'CREATE POLICY "Allow authenticated all on {t}" ON public.{t} FOR ALL TO authenticated USING (true) WITH CHECK (true);')
    sql_out.append('')

sql_out.append('-- 3. PERFORMANCE INDEXES')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_bills_branch_created ON public.bills(branch_id, created_at DESC);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_bills_patient_id ON public.bills(patient_id);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_payments_branch_date ON public.payments(branch_id, payment_date DESC);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON public.payments(bill_id);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON public.payments(patient_id);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_patients_branch_id ON public.patients(branch_id);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_appointments_branch_date ON public.appointments(branch_id, appointment_date DESC);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_consultations_patient_id ON public.consultations(patient_id);')
sql_out.append('CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON public.prescriptions(patient_id);')
sql_out.append('')

sql_out.append('-- 4. UPDATE PATIENT CUMULATIVE OUTSTANDING DUES')
sql_out.append('UPDATE public.patients p')
sql_out.append('SET outstanding_balance = COALESCE(b.total_due, 0)')
sql_out.append('FROM (')
sql_out.append('  SELECT patient_id, SUM(balance) AS total_due')
sql_out.append('  FROM public.bills')
sql_out.append('  WHERE balance > 0')
sql_out.append('  GROUP BY patient_id')
sql_out.append(') b')
sql_out.append('WHERE p.id = b.patient_id;')
sql_out.append('')

sql_out.append('COMMIT;')

out_path = r'database\COMPLETE_RLS_FIX.sql'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_out))

print(f'Wrote {out_path} with policies for {len(tables)} tables!')
