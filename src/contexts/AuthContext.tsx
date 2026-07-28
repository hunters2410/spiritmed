import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';
import { Permissions } from '../components/PermissionGrid';

interface AuthContextType {
  user: User | null;
  profile: (UserProfile & { 
    roles?: { permissions: Permissions; name: string };
    branches?: { is_active: boolean };
  }) | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (module: string, action: 'view' | 'add' | 'edit' | 'delete') => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<(UserProfile & { 
    roles?: { permissions: Permissions; name: string };
    branches?: { is_active: boolean };
  }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check if there is an active local patient session first
    const savedPatientSession = localStorage.getItem('spiritmed_patient_session');
    if (savedPatientSession) {
      try {
        const { user: savedUser, profile: savedProfile } = JSON.parse(savedPatientSession);
        setUser(savedUser);
        setProfile(savedProfile);
        setLoading(false);
        return;
      } catch (e) {
        console.error('Error restoring patient session from localStorage:', e);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      // Do not override patient session if it exists in state
      if (localStorage.getItem('spiritmed_patient_session')) return;

      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (localStorage.getItem('spiritmed_patient_session')) return;

      (async () => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      console.log('Attempting to load profile for:', userId);
      
      // Try with explicit relationship embed syntax
      const { data, error } = await supabase
        .from('users')
        .select('*, roles!users_role_id_fkey(name, permissions), branches(is_active)')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Error loading profile with roles join:', error);
        // Fallback to basic profile without role join
        const { data: basicData, error: basicError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        
        if (basicError) {
          console.error('Basic profile fetch failed:', basicError);
          throw basicError;
        }
        
        if (!basicData) {
          console.error('No record found in public.users table for this user ID.');
        }

        console.log('Loaded fallback basic profile:', basicData);
        setProfile(basicData);
      } else {
        if (!data) {
          console.warn('Primary profile query returned no data (user might be missing from public.users).');
        } else {
          console.log('Successfully loaded profile with roles.');
        }
        if (data?.is_active === false) {
          console.error('Account is deactivated.');
          signOut();
          throw new Error('Your account has been deactivated. Please contact your administrator.');
        }

        if (data?.branches && data.branches.is_active === false) {
          console.error('Branch is deactivated.');
          signOut();
          throw new Error('Your branch has been deactivated. Please contact the system administrator.');
        }
        setProfile(data);
      }
    } catch (error) {
      console.error('Critical error in loadProfile:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (module: string, action: 'view' | 'add' | 'edit' | 'delete'): boolean => {
    if (!profile) return false;
    
    // Super admins have all permissions
    if (profile.role === 'super_admin') return true;

    const permissions = profile.roles?.permissions;
    if (!permissions) return false;

    return permissions[module]?.[action] || false;
  };

  const signIn = async (email: string, password: string) => {
    try {
      // 1. First try standard Supabase Auth for staff members
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.log('Staff authentication failed, checking patient records...');
        // 2. If staff authentication fails, check patient database records
        //
        // ⚠️ SECURITY WARNING — PLAINTEXT PASSWORD COMPARISON ⚠️
        // The query below compares the user-provided password directly against
        // a plaintext value stored in the `patients.password` column.
        // Storing or transmitting passwords in plaintext is a critical security
        // vulnerability (CWE-256 / OWASP A02:2021).
        //
        // REQUIRED FIX:
        //   1. Run `FIX_PATIENT_PASSWORDS.sql` to add a `password_hash` column
        //      and hash all existing passwords with pgcrypto (bcrypt).
        //   2. Replace this client-side comparison with a Supabase Edge Function
        //      that accepts email+password and uses `crypt()` to verify the hash
        //      server-side. Never send a hash comparison through a public API key.
        //   3. Drop the plaintext `password` column from the `patients` table.
        //
        // Until the above steps are complete, this code path is insecure.
        const { data: patientData, error: patientError } = await supabase
          .from('patients')
          .select('*')
          .eq('email', email)
          .eq('password', password) // TODO: Replace with hashed comparison (see above)
          .eq('status', 'active')
          .maybeSingle();

        if (patientError || !patientData) {
          // If both fail, raise the original staff auth error
          throw authError;
        }

        // 3. Construct a beautiful, authenticated session for the patient
        const mockUser = {
          id: patientData.id,
          email: patientData.email || '',
          aud: 'authenticated',
          role: 'patient',
          created_at: patientData.created_at,
          app_metadata: {},
          user_metadata: {}
        } as any;

        const mockProfile = {
          id: patientData.id,
          branch_id: patientData.branch_id,
          email: patientData.email || '',
          full_name: patientData.full_name,
          role: 'patient',
          is_active: true,
          created_at: patientData.created_at,
          patient_data: patientData // Embed all patient demographics
        } as any;

        setUser(mockUser);
        setProfile(mockProfile);

        // 4. Persist the session to local storage for persistence across reloads
        localStorage.setItem('spiritmed_patient_session', JSON.stringify({
          user: mockUser,
          profile: mockProfile
        }));
        
        return;
      }
    } catch (err) {
      throw err;
    }
  };

  const signOut = async () => {
    try {
      // 1. Clear any active patient session
      localStorage.removeItem('spiritmed_patient_session');
      
      setUser(null);
      setProfile(null);
      
      // 2. Clear Supabase Auth session
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error during sign out:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
