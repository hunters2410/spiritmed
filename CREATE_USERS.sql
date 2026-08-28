-- =====================================================
-- SPIRITMED: CREATE BRANCH + SUPERADMIN & ADMIN USERS
-- Run this in Supabase SQL Editor
-- =====================================================

DO $$
DECLARE
  v_branch_id           uuid := gen_random_uuid();
  v_super_admin_id      uuid := gen_random_uuid();
  v_admin_id            uuid := gen_random_uuid();
  v_super_admin_role_id uuid;
  v_admin_role_id       uuid;
BEGIN

  -- -------------------------------------------------------
  -- STEP 1: CREATE BRANCH (Urocare Clinic)
  -- -------------------------------------------------------
  INSERT INTO public.branches (id, name, email, phone, is_active, created_at)
  VALUES (
    v_branch_id,
    'Urocare Clinic',
    'meki@urocare.co.zw',
    '+263772242388',
    true,
    NOW()
  );
  RAISE NOTICE 'Branch created: Urocare Clinic (ID: %)', v_branch_id;


  -- -------------------------------------------------------
  -- STEP 2: CREATE SUPER ADMIN
  -- -------------------------------------------------------
  SELECT id INTO v_super_admin_role_id FROM public.roles WHERE name = 'Super Admin' LIMIT 1;

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_super_admin_id,
    'authenticated', 'authenticated',
    'superadmin@spiritmed.com',
    crypt('123456', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    jsonb_build_object('full_name', 'Super Administrator'),
    '', '', '', ''
  );

  INSERT INTO public.users (id, email, full_name, phone, role, branch_id, role_id, is_active)
  VALUES (
    v_super_admin_id,
    'superadmin@spiritmed.com',
    'Super Administrator',
    '+1234567890',
    'super_admin',
    NULL,
    v_super_admin_role_id,
    true
  );
  RAISE NOTICE 'Super Admin created: superadmin@spiritmed.com (ID: %)', v_super_admin_id;


  -- -------------------------------------------------------
  -- STEP 3: CREATE BRANCH ADMIN linked to Urocare Clinic
  -- -------------------------------------------------------
  SELECT id INTO v_admin_role_id FROM public.roles WHERE name = 'Admin' LIMIT 1;

  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_admin_id,
    'authenticated', 'authenticated',
    'meki@urocare.co.zw',
    crypt('123456', gen_salt('bf')),
    NOW(), NOW(), NOW(),
    jsonb_build_object('full_name', 'Urocare Clinic'),
    '', '', '', ''
  );

  INSERT INTO public.users (id, email, full_name, phone, role, branch_id, role_id, is_active)
  VALUES (
    v_admin_id,
    'meki@urocare.co.zw',
    'Urocare Clinic',
    '+263772242388',
    'admin',
    v_branch_id,
    v_admin_role_id,
    true
  );
  RAISE NOTICE 'Admin created: meki@urocare.co.zw (ID: %)', v_admin_id;

END $$;


-- -------------------------------------------------------
-- VERIFY: Check what was created
-- -------------------------------------------------------
SELECT
  u.full_name,
  u.email,
  u.role,
  u.is_active,
  r.name  AS role_name,
  b.name  AS branch_name
FROM public.users u
LEFT JOIN public.roles    r ON r.id = u.role_id
LEFT JOIN public.branches b ON b.id = u.branch_id
ORDER BY u.role DESC;
