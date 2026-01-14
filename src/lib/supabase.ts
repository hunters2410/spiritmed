import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

// Create a dummy client if keys are missing to prevent top-level crash
// This allows the UI to render a proper error message instead of a white screen
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder');

export type UserRole = 'super_admin' | 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant';

export interface UserProfile {
  id: string;
  branch_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  logo_url: string | null;
  website_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
