/*
  # Add Public Signup Function

  ## Changes
  - Create a public signup function that allows self-registration
  - Function allows creating admin and super_admin accounts during signup
  - No authentication required (for initial account creation)
  
  ## Security
  - Function is callable by anonymous users
  - Creates user profile after successful auth signup
*/

-- Function for public signup (no authentication required)
CREATE OR REPLACE FUNCTION public_signup(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  -- Validate role (only allow admin and super_admin for signup)
  IF p_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Invalid role: Only admin and super_admin roles are allowed';
  END IF;

  -- Insert user profile
  INSERT INTO users (id, email, full_name, phone, role, branch_id, is_active)
  VALUES (p_user_id, p_email, p_full_name, p_phone, p_role, NULL, true);
  
  v_result := json_build_object('success', true, 'user_id', p_user_id);
  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'User already exists';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating user: %', SQLERRM;
END;
$$;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public_signup TO anon, authenticated;
