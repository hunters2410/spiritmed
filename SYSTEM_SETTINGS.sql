-- ==========================================
-- SYSTEM SETTINGS & ENHANCEMENTS (REVISED)
-- ==========================================

-- Drop the old table if it exists to fix the reserved word conflict
DROP TABLE IF EXISTS public.system_settings;

CREATE TABLE public.system_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key text UNIQUE NOT NULL, -- Renamed from 'key' to avoid conflicts
    value jsonb NOT NULL,
    updated_at timestamptz DEFAULT now()
);

-- Seed online booking status
INSERT INTO public.system_settings (setting_key, value)
VALUES ('online_booking_enabled', 'true'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- RLS for settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow members to read settings" 
ON public.system_settings FOR SELECT 
USING (true);

CREATE POLICY "Allow super_admins to update settings" 
ON public.system_settings FOR UPDATE 
TO authenticated 
USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);
