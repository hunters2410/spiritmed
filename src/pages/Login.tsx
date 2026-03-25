import { useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [resetMessage, setResetMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetStatus('idle');
    setResetMessage('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setResetStatus('success');
      setResetMessage('Password reset link has been sent to your email.');
    } catch (err: any) {
      setResetStatus('error');
      setResetMessage(err.message || 'Failed to send reset link');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <img
              src="/favicon.png"
              alt="Hospital Logo"
              className="w-20 h-20 object-contain"
            />
          </div>

          <h1 className="text-2xl font-semibold text-center text-green-600 mb-2">
            SpiritMed Doctor Assistant
          </h1>
          <p className="text-center text-gray-500 text-sm mb-6">
            Sign in to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                placeholder="Email address"
                required
              />
            </div>

            <div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                placeholder="Password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-md text-base font-medium hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div className="flex flex-col space-y-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-sm text-green-600 hover:text-green-700 font-medium transition text-center"
              >
                Forgot Password?
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500 font-bold uppercase tracking-wider text-[10px]">Bookings</span>
                </div>
              </div>

              <a
                href="/book"
                className="w-full text-center py-2.5 px-4 border border-emerald-600 text-emerald-600 rounded-md text-sm font-bold hover:bg-emerald-50 transition shadow-sm flex items-center justify-center gap-2"
              >
                Online Appointment Booking
              </a>
            </div>
          </form>
        </div>

        <p className="text-center text-gray-500 text-sm mt-6">
          © 2026 Global Hunterstech Technologies. All Rights Reserved.
        </p>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="bg-green-100 dark:bg-green-900/30 p-2.5 rounded-lg">
                  <Mail className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <button
                  onClick={() => {
                    setShowForgotModal(false);
                    setResetStatus('idle');
                    setResetMessage('');
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-left">
                Reset Password
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-left">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleResetPassword} className="space-y-4">
                {resetStatus !== 'idle' && (
                  <div className={`p-4 rounded-lg flex items-start gap-3 text-sm animate-in slide-in-from-top-2 duration-300 ${resetStatus === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                    {resetStatus === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    )}
                    <span>{resetMessage}</span>
                  </div>
                )}

                {resetStatus !== 'success' && (
                  <>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="Email address"
                        required
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                    >
                      {resetLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Sending link...
                        </>
                      ) : 'Send Reset Link'}
                    </button>
                  </>
                )}

                {resetStatus === 'success' && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotModal(false);
                      setResetStatus('idle');
                      setResetMessage('');
                    }}
                    className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white py-3 rounded-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition mt-4"
                  >
                    Back to Login
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition mt-2 font-medium"
                >
                  Cancel
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
