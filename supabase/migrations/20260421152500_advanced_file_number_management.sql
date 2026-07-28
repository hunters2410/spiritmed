-- Advanced File Number Management

-- 1. Ensure uniqueness for file_number (excluding NULLs)
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_file_number_key;
ALTER TABLE public.patients ADD CONSTRAINT patients_file_number_key UNIQUE (file_number);

-- 2. Create the pool table
CREATE TABLE IF NOT EXISTS public.file_number_pool (
    file_number text PRIMARY KEY,
    is_occupied boolean DEFAULT false,
    branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE public.file_number_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read file pool"
    ON public.file_number_pool FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow admins to manage file pool"
    ON public.file_number_pool FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role IN ('super_admin', 'admin')
    ));

-- 4. Function to mark file number as occupied/available
CREATE OR REPLACE FUNCTION public.handle_patient_file_number_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If file_number was assigned
    IF (TG_OP = 'INSERT' AND NEW.file_number IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.file_number IS DISTINCT FROM OLD.file_number AND NEW.file_number IS NOT NULL) THEN
        UPDATE public.file_number_pool SET is_occupied = true WHERE file_number = NEW.file_number;
    END IF;

    -- If file_number was removed or changed
    IF (TG_OP = 'UPDATE' AND OLD.file_number IS NOT NULL AND (NEW.file_number IS NULL OR NEW.file_number IS DISTINCT FROM OLD.file_number)) THEN
        UPDATE public.file_number_pool SET is_occupied = false WHERE file_number = OLD.file_number;
    END IF;

    -- If patient is marked deceased, release the file number
    IF (TG_OP = 'UPDATE' AND NEW.status = 'deceased' AND OLD.status != 'deceased' AND NEW.file_number IS NOT NULL) THEN
        UPDATE public.file_number_pool SET is_occupied = false WHERE file_number = NEW.file_number;
        NEW.file_number := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create Trigger
DROP TRIGGER IF EXISTS tr_patient_file_number_management ON public.patients;
CREATE TRIGGER tr_patient_file_number_management
BEFORE INSERT OR UPDATE ON public.patients
FOR EACH ROW
EXECUTE FUNCTION public.handle_patient_file_number_change();

-- 6. Seed existing file numbers from patients into the pool
INSERT INTO public.file_number_pool (file_number, is_occupied, branch_id)
SELECT DISTINCT file_number, true, branch_id
FROM public.patients
WHERE file_number IS NOT NULL
ON CONFLICT (file_number) DO UPDATE SET is_occupied = true;
