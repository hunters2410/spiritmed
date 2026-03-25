-- ==========================================
-- ONLINE BOOKINGS SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS public.online_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
    doctor_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    slot_id uuid REFERENCES public.appointment_slots(id) ON DELETE SET NULL,
    patient_full_name text NOT NULL,
    patient_phone text NOT NULL,
    patient_email text,
    patient_gender text,
    patient_dob date,
    appointment_type text DEFAULT 'consultation',
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz DEFAULT now()
);

-- RLS for public access (booking)
ALTER TABLE public.online_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public booking" 
ON public.online_bookings FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow admins to view bookings" 
ON public.online_bookings FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (role = 'super_admin' OR (role IN ('admin', 'receptionist', 'doctor', 'nurse') AND branch_id = online_bookings.branch_id))
    )
);

CREATE POLICY "Allow admins to update bookings" 
ON public.online_bookings FOR UPDATE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND (role = 'super_admin' OR (role IN ('admin', 'receptionist') AND branch_id = online_bookings.branch_id))
    )
);
