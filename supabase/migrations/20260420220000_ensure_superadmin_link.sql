-- Ensure Super Admin Role and Linkage
-- Date: 2026-04-20

-- 1. Ensure the 'Super Admin' role exists
INSERT INTO roles (name, base_role, description, permissions, is_active)
SELECT 'Super Admin', 'admin', 'System-wide full access', 
  jsonb_build_object(
    'dashboard', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'branches', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'patients', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'appointments', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'consultations', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'prescriptions', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'clinical_reports', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'inventory', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'billing', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'staff', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'communication', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
    'settings', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true)
  ), 
  true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Super Admin');

-- 2. Link legacy super_admins to the role record
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.role = 'super_admin' AND r.name = 'Super Admin' AND u.role_id IS NULL;

-- 3. Safety: Ensure role table has a select policy for all authenticated users
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'roles' AND policyname = 'Authenticated users can view roles'
    ) THEN
        CREATE POLICY "Authenticated users can view roles" ON roles FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- 4. EMERGENCY RECOVERY: Heal Missing Profiles
-- This creates a public.users record for ANY user in auth.users that is missing a profile.
-- It defaults them to 'super_admin' and links them to the 'Super Admin' role to restore access.
INSERT INTO public.users (id, email, full_name, role, is_active, role_id)
SELECT 
    au.id, 
    au.email, 
    COALESCE(au.raw_user_meta_data->>'full_name', 'Recovered User'), 
    'super_admin', 
    true,
    (SELECT id FROM roles WHERE name = 'Super Admin' LIMIT 1)
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE u.id IS NULL
ON CONFLICT (id) DO UPDATE 
SET role = 'super_admin', 
    role_id = (SELECT id FROM roles WHERE name = 'Super Admin' LIMIT 1),
    is_active = true;
