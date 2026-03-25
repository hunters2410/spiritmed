-- HOLIDAYS TABLE FOR APPOINTMENT SCHEDULING
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.holidays (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    holiday_date DATE NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(branch_id, holiday_date)
);

-- Enable RLS
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view holidays within their branch
CREATE POLICY "Users can view their branch holidays" 
ON public.holidays FOR SELECT 
TO authenticated 
USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid()));

-- Allow admins to manage holidays
CREATE POLICY "Admins can manage their branch holidays" 
ON public.holidays FOR ALL 
TO authenticated 
USING (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')))
WITH CHECK (branch_id IN (SELECT branch_id FROM public.users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
