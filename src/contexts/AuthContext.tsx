import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
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

  // ── Deduplication guard: prevents concurrent / duplicate profile fetches ──
  const profileLoadingRef = useRef(false);
  const loadedUserIdRef = useRef<string | null>(null);

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
          loadedUserIdRef.current = null;
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    // Skip if already loading, or if this user's profile is already loaded
    if (profileLoadingRef.current) return;
    if (loadedUserIdRef.current === userId && profile) return;

    profileLoadingRef.current = true;
    try {
      // Try with explicit relationship embed syntax
      const { data, error } = await supabase
        .from('users')
        .select('*, roles!users_role_id_fkey(name, permissions), branches(is_active)')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        // Fallback to basic profile without role join
        const { data: basicData, error: basicError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        
        if (basicError) {
          console.error('Profile fetch failed:', basicError);
          throw basicError;
        }

        setProfile(basicData);
        loadedUserIdRef.current = userId;
      } else {
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
        loadedUserIdRef.current = userId;
      }
    } catch (error) {
      console.error('Critical error in loadProfile:', error);
    } finally {
      profileLoadingRef.current = false;
      setLoading(false);
    }
  };

const MODULE_PARENT_MAP: Record<string, string> = {
  // Patient sub-modules -> patients
  patient_history: 'patients',
  deceased_patients: 'patients',
  discharged_patients: 'patients',
  old_patients: 'patients',
  patient_files: 'patients',
  file_number_pool: 'patients',
  reports_statistics: 'patients',

  // Appointment sub-modules -> appointments
  appointment_calendar: 'appointments',
  appointment_schedule: 'appointments',
  online_booking: 'appointments',
  appointment_reports: 'appointments',

  // Medical records sub-modules -> medical_records
  consultations: 'medical_records',
  prescriptions: 'medical_records',
  vital_signs: 'medical_records',
  lab_results: 'medical_records',
  follow_ups: 'medical_records',

  // Clinical reports sub-modules -> clinical_reports
  medical_reports: 'clinical_reports',
  discharge_summaries: 'clinical_reports',
  referral_forms: 'clinical_reports',
  operation_reports: 'clinical_reports',
  medical_certificates: 'clinical_reports',
  admission_letters: 'clinical_reports',

  // Prescription items -> medical_records
  medicines: 'medical_records',
  medicine_frequencies: 'medicines',

  // Clinical setup sub-modules -> clinical_setup
  complaints: 'clinical_setup',
  investigations: 'clinical_setup',
  diagnoses: 'clinical_setup',
  histology: 'clinical_setup',
  anaesthetists: 'clinical_setup',
  surgical_procedures: 'clinical_setup',
  assistants: 'clinical_setup',
  hospitals: 'clinical_setup',

  // Financial management sub-modules -> billing
  patient_due: 'billing',
  payment_procedures: 'billing',
  estimates: 'billing',
  payments: 'billing',
  medical_aids: 'billing',
  expenses: 'billing',
  expense_categories: 'expenses',
  accounting: 'billing',

  // Inventory & resources -> inventory
  assets_register: 'inventory',
  asset_categories: 'assets_register',
  suppliers: 'inventory',
  inventory_categories: 'inventory',
  inventory_units: 'inventory',
  hospital_files: 'inventory',

  // Staff management -> staff
  roles: 'staff',
  attendance: 'staff',
  leave_management: 'staff',
  payroll: 'staff',
  human_resources: 'staff',

  // Third party -> medical_records
  referral_doctors: 'medical_records',

  // Communication -> communication
  chats: 'communication',
  notifications: 'communication',
  emails: 'communication',
  sms: 'communication',

  // System -> settings
  audit_logs: 'settings',
  profile: 'dashboard',
};

  const hasPermission = (module: string, action: 'view' | 'add' | 'edit' | 'delete'): boolean => {
    if (!profile) return false;
    
    // Super admins have all permissions
    if (profile.role === 'super_admin') return true;

    // All authenticated staff can view and apply for leave in leave_management
    if (module === 'leave_management' && (action === 'view' || action === 'add')) return true;

    // Profile page is always viewable by authenticated users
    if (module === 'profile' && action === 'view') return true;

    // Internal chat view is always accessible for authenticated staff
    if ((module === 'communication' || module === 'chats') && action === 'view') return true;

    const permissions = profile.roles?.permissions;
    if (!permissions) return false;

    // 1. Direct module permission check
    if (permissions[module] !== undefined && permissions[module]?.[action] !== undefined) {
      return !!permissions[module][action];
    }

    // 2. Hierarchical parent fallback if module not explicitly set in role
    const parentModule = MODULE_PARENT_MAP[module];
    if (parentModule && permissions[parentModule] !== undefined && permissions[parentModule]?.[action] !== undefined) {
      return !!permissions[parentModule][action];
    }

    return false;
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
