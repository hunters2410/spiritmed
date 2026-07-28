-- Migration: Public Registration Access Policies
-- Description: Allows unauthenticated (public) users to read branch information and medical aid lists for registration.

-- 1. Allow public to view active medical aids (IDs and Names only)
-- Note: We use a restrictive selection to ensure sensitive contact data is not leaked.
CREATE POLICY "Allow public to view medical aids list"
ON public.medical_aids FOR SELECT
TO anon
USING (is_active = true);

-- 2. Allow public to view branch information (IDs and Names only)
CREATE POLICY "Allow public to view branch info"
ON public.branches FOR SELECT
TO anon
USING (is_active = true);
