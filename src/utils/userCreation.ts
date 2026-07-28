import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface CreateStaffParams {
  email: string;
  password?: string;
  full_name: string;
  phone?: string;
  role: string;
  branch_id?: string | null;
  role_id?: string | null;
  specialization?: string | null;
  qualifications?: string | null;
}

export async function createStaffUserAccount({
  email,
  password,
  full_name,
  phone = '',
  role,
  branch_id = null,
  role_id = null,
  specialization = null,
  qualifications = null
}: CreateStaffParams) {
  // Create an isolated Supabase client with persistSession: false and unique storageKey
  // This prevents signUp() from overwriting the currently logged-in admin's auth session and avoids GoTrueClient storage conflicts
  const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'spiritmed_temp_user_creation_session',
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      }
    }
  });

  const pwd = password || `SpiritMed${Math.floor(100000 + Math.random() * 900000)}!`;

  const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
    email: email.trim(),
    password: pwd,
  });

  if (authError) throw authError;
  if (!authData.user) throw new Error('User creation failed in authentication service');

  // Call create_user_profile RPC using the active ADMIN session on the primary client
  const { data: rpcData, error: rpcError } = await supabase.rpc('create_user_profile', {
    p_user_id: authData.user.id,
    p_email: email.trim(),
    p_full_name: full_name.trim(),
    p_phone: phone ? phone.trim() : '',
    p_role: role,
    p_branch_id: branch_id || null,
    p_role_id: role_id || null
  });

  if (rpcError) throw rpcError;

  // Update additional fields if provided
  if (specialization || qualifications) {
    await supabase
      .from('users')
      .update({
        ...(specialization ? { specialization } : {}),
        ...(qualifications ? { qualifications } : {})
      })
      .eq('id', authData.user.id);
  }

  return { user: authData.user, result: rpcData };
}
