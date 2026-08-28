import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile, Permissions } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: any }>;
  signOut: () => Promise<void>;
  hasPermission: (module: string, action?: 'view' | 'add' | 'edit' | 'delete') => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Fallback role permissions if no custom permissions object is assigned
const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['all'],
  admin: ['all'],
  doctor: ['patients', 'appointments', 'medical_records', 'clinical_reports', 'communication'],
  surgeon: ['patients', 'appointments', 'medical_records', 'clinical_reports', 'communication'],
  nurse: ['patients', 'appointments', 'medical_records', 'communication'],
  receptionist: ['patients', 'appointments', 'communication'],
  pharmacist: ['patients', 'medical_records', 'communication'],
  lab_technician: ['patients', 'medical_records', 'communication'],
  accountant: ['billing', 'payments', 'patients', 'communication'],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      // 1. Try fetching with foreign key embed
      let { data, error } = await supabase
        .from('users')
        .select('*, roles!users_role_id_fkey(name, permissions)')
        .eq('id', userId)
        .maybeSingle();

      // 2. If relation name differs, try standard embed
      if (error || !data) {
        const res = await supabase
          .from('users')
          .select('*, roles(name, permissions)')
          .eq('id', userId)
          .maybeSingle();
        data = res.data;
        error = res.error;
      }

      // 3. If still error or no roles embedded, fallback to basic user query + separate role query
      if (!data) {
        const { data: basicUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (basicUser) {
          data = basicUser;
          if (basicUser.role_id) {
            const { data: roleData } = await supabase
              .from('roles')
              .select('name, permissions')
              .eq('id', basicUser.role_id)
              .maybeSingle();

            if (roleData) {
              data.roles = roleData;
            }
          }
        }
      }

      if (data) {
        setProfile(data as UserProfile);
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await loadProfile(user.id);
    }
  };

const MOBILE_PARENT_MAP: Record<string, string> = {
  prescriptions: 'medical_records',
  consultations: 'medical_records',
  vital_signs: 'medical_records',
  operation_reports: 'clinical_reports',
  medicines: 'medical_records',
  referral_doctors: 'medical_records',
  patient_files: 'patients',
  patient_history: 'patients',
  chats: 'communication',
  chat: 'communication',
};

  const hasPermission = (
    module: string,
    action: 'view' | 'add' | 'edit' | 'delete' = 'view'
  ): boolean => {
    if (!profile) return false;

    const userRole = (profile.role || '').toLowerCase();

    // 1. Super Admins & Admins have full access
    if (userRole === 'super_admin' || userRole === 'admin') {
      return true;
    }

    // 2. Internal Staff Chat is always accessible to all authenticated staff
    if (module === 'communication' || module === 'chat' || module === 'chats') {
      if (profile.roles?.permissions?.['communication']) {
        return profile.roles.permissions['communication'][action] ?? true;
      }
      return true;
    }

    // 3. Check custom role permissions from DB
    const customPermissions = profile.roles?.permissions;
    if (customPermissions) {
      if (customPermissions[module] !== undefined && customPermissions[module]?.[action] !== undefined) {
        return !!customPermissions[module][action];
      }

      // Hierarchical parent fallback
      const parentMod = MOBILE_PARENT_MAP[module];
      if (parentMod && customPermissions[parentMod] !== undefined && customPermissions[parentMod]?.[action] !== undefined) {
        return !!customPermissions[parentMod][action];
      }
    }

    // 4. Default standard role permissions fallback
    const allowedModules = DEFAULT_ROLE_PERMISSIONS[userRole] || ['communication'];
    if (allowedModules.includes('all') || allowedModules.includes(module)) {
      return true;
    }

    const parentModule = MOBILE_PARENT_MAP[module];
    if (parentModule && allowedModules.includes(parentModule)) {
      return true;
    }

    return false;
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) return { error };
      if (data.user) {
        await loadProfile(data.user.id);
      }
      return {};
    } catch (err: any) {
      return { error: err };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        signOut,
        hasPermission,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
