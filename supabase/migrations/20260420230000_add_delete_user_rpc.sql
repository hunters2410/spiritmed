-- Add delete_user_account RPC
-- Date: 2026-04-20
-- Description: Allows superadmins to permanently delete a user from both auth.users and public.users.

CREATE OR REPLACE FUNCTION delete_user_account(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role text;
  v_result json;
BEGIN
  -- 1. Get caller's role
  SELECT role INTO v_caller_role
  FROM public.users
  WHERE id = auth.uid();

  -- 2. Authorization check: Only super_admins can delete users
  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Unauthorized: Only super admins can delete users';
  END IF;

  -- 3. Safety check: Prevent users from deleting themselves
  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Action Denied: You cannot delete your own account';
  END IF;

  -- 4. Delete the user from auth.users
  -- This will cascade to public.users because of the foreign key constraint:
  -- REFERENCES auth.users(id) ON DELETE CASCADE
  DELETE FROM auth.users WHERE id = p_user_id;

  -- 5. Return success result
  v_result := jsonb_build_object(
    'success', true,
    'message', 'User account and profile deleted successfully'
  );
  
  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$$;
