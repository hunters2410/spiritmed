/*
  # Add Function to Create Users

  ## Changes
  - Create a database function `create_user_profile` that can be called to insert users
  - Function runs with SECURITY DEFINER to bypass RLS
  - Validates that the caller is authorized (super_admin or branch admin)

  ## Security
  - Only super_admins can create users for any branch
  - Branch admins can only create users for their own branch
  - Prevents creation of super_admin users by non-super_admins
*/

-- Function to create user profile
CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text,
  p_branch_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role text;
  v_caller_branch_id uuid;
  v_result json;
BEGIN
  -- Get caller's role and branch
  SELECT role, branch_id INTO v_caller_role, v_caller_branch_id
  FROM users
  WHERE id = auth.uid();

  -- Check authorization
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User not found';
  END IF;

  -- Super admins can create any user
  IF v_caller_role = 'super_admin' THEN
    INSERT INTO users (id, email, full_name, phone, role, branch_id, is_active)
    VALUES (p_user_id, p_email, p_full_name, p_phone, p_role, p_branch_id, true);
    
    v_result := json_build_object('success', true, 'user_id', p_user_id);
    RETURN v_result;
  END IF;

  -- Branch admins can create users for their branch (except super_admins)
  IF v_caller_role = 'admin' AND v_caller_branch_id = p_branch_id THEN
    IF p_role = 'super_admin' THEN
      RAISE EXCEPTION 'Unauthorized: Branch admins cannot create super_admin users';
    END IF;

    INSERT INTO users (id, email, full_name, phone, role, branch_id, is_active)
    VALUES (p_user_id, p_email, p_full_name, p_phone, p_role, p_branch_id, true);
    
    v_result := json_build_object('success', true, 'user_id', p_user_id);
    RETURN v_result;
  END IF;

  -- If we get here, user is not authorized
  RAISE EXCEPTION 'Unauthorized: Insufficient permissions';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_profile TO authenticated;
