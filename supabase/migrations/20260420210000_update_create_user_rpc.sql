-- Update create_user_profile RPC to handle role_id
-- Date: 2026-04-20

-- Drop older versions to avoid signature mismatch errors
DROP FUNCTION IF EXISTS create_user_profile(uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS create_user_profile(uuid, text, text, text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text,
  p_branch_id uuid,
  p_role_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_caller_branch_id uuid;
  v_result json;
  v_final_role_id uuid := p_role_id;
BEGIN
  -- Get caller's role and branch
  SELECT role, branch_id INTO v_caller_role, v_caller_branch_id
  FROM users
  WHERE id = auth.uid();

  -- Check authorization
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User not found';
  END IF;

  -- If p_role_id is not provided, try to find it from the roles table using p_role as base_role
  IF v_final_role_id IS NULL AND p_role IS NOT NULL THEN
    SELECT id INTO v_final_role_id
    FROM roles
    WHERE base_role = p_role OR name = p_role
    LIMIT 1;
  END IF;

  -- Super admins can create any user
  IF v_caller_role = 'super_admin' THEN
    INSERT INTO users (id, email, full_name, phone, role, branch_id, role_id, is_active)
    VALUES (p_user_id, p_email, p_full_name, p_phone, p_role, p_branch_id, v_final_role_id, true);
    
    v_result := json_build_object('success', true, 'user_id', p_user_id);
    RETURN v_result;
  END IF;

  -- Branch admins can create users for their branch (except super_admins)
  IF v_caller_role = 'admin' AND v_caller_branch_id = p_branch_id THEN
    -- Prevent creating super_admin or admin roles if caller is just a branch admin? 
    -- Actually, branch admin creates staff for their branch.
    IF p_role = 'super_admin' THEN
      RAISE EXCEPTION 'Unauthorized: Branch admins cannot create super_admin users';
    END IF;

    INSERT INTO users (id, email, full_name, phone, role, branch_id, role_id, is_active)
    VALUES (p_user_id, p_email, p_full_name, p_phone, p_role, p_branch_id, v_final_role_id, true);
    
    v_result := json_build_object('success', true, 'user_id', p_user_id);
    RETURN v_result;
  END IF;

  -- If we get here, user is not authorized
  RAISE EXCEPTION 'Unauthorized: Insufficient permissions';
END;
$$;
