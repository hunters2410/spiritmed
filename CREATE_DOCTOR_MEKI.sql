-- =====================================================
-- SPIRITMED: CREATE DOCTOR MEKI + SELF-PROFILE RESTORE
-- Run this in your Supabase SQL Editor
-- =====================================================

DO $$
DECLARE
  v_branch_id       uuid := '697a3863-1de7-4615-819c-45b0d7066d67'; -- Urocare Clinic Branch
  v_doctor_id       uuid := '90a905bc-d22a-4db3-bd43-2c1c6bf488e0'; -- Fixed UUID for Doctor Meki
  v_doctor_role_id  uuid;
  
  -- Caller variables (your logged-in account showing console error)
  v_caller_id       uuid := 'aa709778-a163-4b82-a244-f817a0c97e98'; 
  v_caller_email    text;
  v_caller_role_id  uuid;
BEGIN

  -- -------------------------------------------------------
  -- STEP 1: FIX YOUR LOGGED-IN ACCOUNT PROFILE
  -- -------------------------------------------------------
  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;
  SELECT id INTO v_caller_role_id FROM public.roles WHERE name = 'Super Admin' LIMIT 1;
  
  IF v_caller_email IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_caller_id) THEN
      INSERT INTO public.users (
        id, email, full_name, role, branch_id, role_id, is_active, created_at, updated_at
      ) VALUES (
        v_caller_id,
        v_caller_email,
        'Super Administrator',
        'super_admin',
        NULL, -- Super admins have global access (no branch lock)
        v_caller_role_id,
        true,
        NOW(), NOW()
      );
      RAISE NOTICE 'SUCCESS: Restored profile for logged-in user % as Super Admin', v_caller_email;
    ELSE
      -- Ensure role and permissions are correct
      UPDATE public.users 
      SET role = 'super_admin', role_id = v_caller_role_id, is_active = true
      WHERE id = v_caller_id;
      RAISE NOTICE 'SUCCESS: Updated existing profile for logged-in user to Super Admin';
    END IF;
  ELSE
    RAISE NOTICE 'WARNING: Logged-in user ID % not found in auth.users table.', v_caller_id;
  END IF;


  -- -------------------------------------------------------
  -- STEP 2: CREATE DOCTOR MEKI
  -- -------------------------------------------------------
  -- 1. Get the Role ID for "Doctor"
  SELECT id INTO v_doctor_role_id FROM public.roles WHERE name = 'Doctor' LIMIT 1;
  
  IF v_doctor_role_id IS NULL THEN
    RAISE EXCEPTION 'Doctor role not found in public.roles. Please make sure migrations have run.';
  END IF;

  -- 2. Insert into auth.users (Supabase Auth System)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'doctormeki@urocare.co.zw') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role,
      email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_user_meta_data,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_doctor_id,
      'authenticated', 'authenticated',
      'doctormeki@urocare.co.zw',
      crypt('123456', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      jsonb_build_object('full_name', 'Doctor Meki'),
      '', '', '', ''
    );
    RAISE NOTICE 'Doctor Meki created in auth.users';
  ELSE
    SELECT id INTO v_doctor_id FROM auth.users WHERE email = 'doctormeki@urocare.co.zw';
  END IF;

  -- 3. Insert into public.users (SpiritMed Profiles)
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE email = 'doctormeki@urocare.co.zw') THEN
    INSERT INTO public.users (
      id, email, full_name, role, branch_id, role_id, is_active, 
      qualifications, specialization, created_at, updated_at
    ) VALUES (
      v_doctor_id,
      'doctormeki@urocare.co.zw',
      'Doctor Meki',
      'doctor',
      v_branch_id,
      v_doctor_role_id,
      true,
      'AHFOZ: 229812',
      'Specialist Urologist',
      NOW(), NOW()
    );
    RAISE NOTICE 'SUCCESS: Doctor Meki profile created in public.users';
  ELSE
    UPDATE public.users 
    SET qualifications = 'AHFOZ: 229812', specialization = 'Specialist Urologist', role_id = v_doctor_role_id, is_active = true
    WHERE email = 'doctormeki@urocare.co.zw';
    RAISE NOTICE 'SUCCESS: Doctor Meki profile updated';
  END IF;

END $$;
