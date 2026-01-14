import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Mail, User, CheckCircle, AlertCircle } from 'lucide-react';

export function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userData, setUserData] = useState({ full_name: '', email: '' });

  const [profileFormData, setProfileFormData] = useState({
    full_name: '',
    password: ''
  });

  const [emailFormData, setEmailFormData] = useState({
    newEmail: '',
    password: ''
  });

  const [passwordFormData, setPasswordFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setUserData(data);
      setProfileFormData({ full_name: data.full_name, password: '' });
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password: profileFormData.password
      });

      if (signInError) {
        throw new Error('Password is incorrect');
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ full_name: profileFormData.full_name })
        .eq('id', user?.id);

      if (updateError) throw updateError;

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setProfileFormData({ ...profileFormData, password: '' });
      fetchUserData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password: emailFormData.password
      });

      if (signInError) {
        throw new Error('Current password is incorrect');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        email: emailFormData.newEmail
      });

      if (updateError) throw updateError;

      const { error: dbError } = await supabase
        .from('users')
        .update({ email: emailFormData.newEmail })
        .eq('id', user?.id);

      if (dbError) throw dbError;

      setMessage({ type: 'success', text: 'Email updated successfully! Please check your new email for confirmation.' });
      setEmailFormData({ newEmail: '', password: '' });
      fetchUserData();
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update email' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (passwordFormData.newPassword !== passwordFormData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      setLoading(false);
      return;
    }

    if (passwordFormData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'New password must be at least 6 characters long' });
      setLoading(false);
      return;
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password: passwordFormData.currentPassword
      });

      if (signInError) {
        throw new Error('Current password is incorrect');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordFormData.newPassword
      });

      if (updateError) throw updateError;

      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setPasswordFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">My Profile</h1>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Manage your personal information and account security</p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
          message.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-3 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-green-100 dark:bg-green-900/30 rounded-md flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Update Profile</h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">Change your personal information</p>
            </div>
          </div>

          <form onSubmit={handleProfileUpdate} className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Full Name</label>
              <input
                type="text"
                value={profileFormData.full_name}
                onChange={(e) => setProfileFormData({ ...profileFormData, full_name: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter your full name"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Current Email</label>
              <input
                type="email"
                value={userData.email}
                disabled
                className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Password</label>
              <input
                type="password"
                value={profileFormData.password}
                onChange={(e) => setProfileFormData({ ...profileFormData, password: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Confirm with password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-1.5 text-sm rounded-md font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-3 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/30 rounded-md flex items-center justify-center">
              <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Update Email</h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">Change your email address</p>
            </div>
          </div>

          <form onSubmit={handleEmailUpdate} className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">New Email</label>
              <input
                type="email"
                value={emailFormData.newEmail}
                onChange={(e) => setEmailFormData({ ...emailFormData, newEmail: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter new email"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Current Password</label>
              <input
                type="password"
                value={emailFormData.password}
                onChange={(e) => setEmailFormData({ ...emailFormData, password: e.target.value })}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Confirm with password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-1.5 text-sm rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Updating...' : 'Update Email'}
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-orange-100 dark:bg-orange-900/30 rounded-md flex items-center justify-center">
            <Lock className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Update Password</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">Change your account password</p>
          </div>
        </div>

        <form onSubmit={handlePasswordUpdate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Current Password</label>
            <input
              type="password"
              value={passwordFormData.currentPassword}
              onChange={(e) => setPasswordFormData({ ...passwordFormData, currentPassword: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Current password"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">New Password</label>
            <input
              type="password"
              value={passwordFormData.newPassword}
              onChange={(e) => setPasswordFormData({ ...passwordFormData, newPassword: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="New password"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">Confirm Password</label>
            <input
              type="password"
              value={passwordFormData.confirmPassword}
              onChange={(e) => setPasswordFormData({ ...passwordFormData, confirmPassword: e.target.value })}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="Confirm password"
              required
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto bg-orange-600 text-white px-4 py-1.5 text-sm rounded-md font-medium hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
