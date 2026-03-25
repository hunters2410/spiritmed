import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Mail, MessageSquare, CheckCircle, AlertCircle, Save, Server, Building2, Globe, Phone, MapPin, User as UserIcon, Award, Stethoscope, FileSignature, Image as ImageIcon } from 'lucide-react';

interface Configuration {
  id: string;
  config_type: string;
  config_name: string;
  config_data: any;
  is_active: boolean;
}

export function Settings() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [branchConfig, setBranchConfig] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    website: '',
    logo_url: '',
    signature_url: ''
  });

  const [doctorProfile, setDoctorProfile] = useState({
    full_name: '',
    qualifications: '',
    specialization: '',
    signature_url: ''
  });

  const [emailConfig, setEmailConfig] = useState({
    smtp_host: '',
    smtp_port: '',
    smtp_username: '',
    smtp_password: '',
    from_email: '',
    from_name: '',
    encryption: 'tls'
  });

  const [smsConfig, setSmsConfig] = useState({
    provider: 'twilio',
    api_key: '',
    api_secret: '',
    sender_id: '',
    api_url: ''
  });

  useEffect(() => {
    if (profile?.branch_id) {
      loadAll();
    }
  }, [profile?.branch_id]);

  const loadAll = async () => {
    setFetching(true);
    await Promise.all([
      fetchConfigurations(),
      fetchBranchDetails(),
      fetchDoctorProfile()
    ]);
    setFetching(false);
  };

  const fetchBranchDetails = async () => {
    if (!profile?.branch_id) return;
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('id', profile.branch_id)
      .maybeSingle();
    if (data) setBranchConfig(data);
  };

  const fetchDoctorProfile = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (data) setDoctorProfile({
      full_name: data.full_name || '',
      qualifications: data.qualifications || '',
      specialization: data.specialization || '',
      signature_url: data.signature_url || ''
    });
  };

  const fetchConfigurations = async () => {
    try {
      const { data: emailData } = await supabase
        .from('system_configurations')
        .select('*')
        .eq('config_type', 'email')
        .eq('config_name', 'smtp')
        .maybeSingle();

      if (emailData) {
        setEmailConfig(emailData.config_data);
      }

      const { data: smsData } = await supabase
        .from('system_configurations')
        .select('*')
        .eq('config_type', 'sms')
        .eq('config_name', 'provider')
        .maybeSingle();

      if (smsData) {
        setSmsConfig(smsData.config_data);
      }
    } catch (error: any) {
      console.error('Error fetching configurations:', error);
    }
  };

  const handleEmailConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data: existing } = await supabase
        .from('system_configurations')
        .select('id')
        .eq('config_type', 'email')
        .eq('config_name', 'smtp')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('system_configurations')
          .update({
            config_data: emailConfig,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('system_configurations')
          .insert({
            config_type: 'email',
            config_name: 'smtp',
            config_data: emailConfig,
            created_by: user?.id,
            updated_by: user?.id
          });

        if (error) throw error;
      }

      setMessage({ type: 'success', text: 'Email configuration saved successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save email configuration' });
    } finally {
      setLoading(false);
    }
  };

  const handleBranchSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.branch_id) return;
    setLoading(true);
    const { error } = await supabase
      .from('branches')
      .update(branchConfig)
      .eq('id', profile.branch_id);
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'success', text: 'Branch branding saved successfully!' });
    setLoading(false);
  };

  const handleDoctorSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setLoading(true);
    const { error } = await supabase
      .from('users')
      .update(doctorProfile)
      .eq('id', user.id);
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'success', text: 'Doctor profile saved successfully!' });
    setLoading(false);
  };

  if (fetching) return <div className="p-8 text-center text-gray-500">Loading settings...</div>;

  const handleSmsConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data: existing } = await supabase
        .from('system_configurations')
        .select('id')
        .eq('config_type', 'sms')
        .eq('config_name', 'provider')
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('system_configurations')
          .update({
            config_data: smsConfig,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('system_configurations')
          .insert({
            config_type: 'sms',
            config_name: 'provider',
            config_data: smsConfig,
            created_by: user?.id,
            updated_by: user?.id
          });

        if (error) throw error;
      }

      setMessage({ type: 'success', text: 'SMS configuration saved successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save SMS configuration' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings & Clinic Branding</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Configure professional letterheads, clinic details, and communication channels</p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${message.type === 'success'
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

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-md flex items-center justify-center">
            <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Email Configuration</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">Configure SMTP settings for sending emails</p>
          </div>
        </div>

        <form onSubmit={handleEmailConfigSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Host</label>
              <input
                type="text"
                value={emailConfig.smtp_host}
                onChange={(e) => setEmailConfig({ ...emailConfig, smtp_host: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="smtp.gmail.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Port</label>
              <input
                type="text"
                value={emailConfig.smtp_port}
                onChange={(e) => setEmailConfig({ ...emailConfig, smtp_port: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="587"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
              <input
                type="text"
                value={emailConfig.smtp_username}
                onChange={(e) => setEmailConfig({ ...emailConfig, smtp_username: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="your-email@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input
                type="password"
                value={emailConfig.smtp_password}
                onChange={(e) => setEmailConfig({ ...emailConfig, smtp_password: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">From Email</label>
              <input
                type="email"
                value={emailConfig.from_email}
                onChange={(e) => setEmailConfig({ ...emailConfig, from_email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="noreply@hospital.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">From Name</label>
              <input
                type="text"
                value={emailConfig.from_name}
                onChange={(e) => setEmailConfig({ ...emailConfig, from_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Hospital Management System"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Encryption</label>
              <select
                value={emailConfig.encryption}
                onChange={(e) => setEmailConfig({ ...emailConfig, encryption: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="tls">TLS</option>
                <option value="ssl">SSL</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 text-sm rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save Email Configuration'}
            </button>
          </div>
        </form>
      </div>

      {/* ─── Branch Branding ─── */}
      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-md flex items-center justify-center">
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Clinic Branding</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">Manage hospital details for professional reports</p>
          </div>
        </div>

        <form onSubmit={handleBranchSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Clinic Name</label>
              <input type="text" value={branchConfig.name} onChange={e => setBranchConfig({ ...branchConfig, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Website URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input type="url" value={branchConfig.website || ''} onChange={e => setBranchConfig({ ...branchConfig, website: e.target.value })} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" placeholder="www.clinic.com" />
              </div>
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <ImageIcon className="w-3 h-3 text-emerald-500" /> Logo URL
              </label>
              <input type="text" value={branchConfig.logo_url || ''} onChange={e => setBranchConfig({ ...branchConfig, logo_url: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 font-mono" placeholder="https://cloud.storage.com/logo.png" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={branchConfig.phone} onChange={e => setBranchConfig({ ...branchConfig, phone: e.target.value })} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input type="email" value={branchConfig.email} onChange={e => setBranchConfig({ ...branchConfig, email: e.target.value })} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" required />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={branchConfig.address} onChange={e => setBranchConfig({ ...branchConfig, address: e.target.value })} className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" required />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={loading} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 text-sm rounded-md font-medium hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm">
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </form>
      </div>

      {/* ─── Doctor Profile (Signatures) ─── */}
      {profile?.role === 'doctor' && (
        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-md flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Doctor Professional Profile</h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">Configure your professional details and signature for reports</p>
            </div>
          </div>

          <form onSubmit={handleDoctorSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <Award className="w-3 h-3 text-indigo-500" /> Qualifications
                </label>
                <input type="text" value={doctorProfile.qualifications} onChange={e => setDoctorProfile({ ...doctorProfile, qualifications: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" placeholder="e.g. MMED UROLOGY-UZ" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <Stethoscope className="w-3 h-3 text-indigo-500" /> Specialization
                </label>
                <input type="text" value={doctorProfile.specialization} onChange={e => setDoctorProfile({ ...doctorProfile, specialization: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" placeholder="e.g. Specialist Urologist - SU700212" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <FileSignature className="w-3 h-3 text-indigo-500" /> Professional Signature URL
                </label>
                <input type="text" value={doctorProfile.signature_url} onChange={e => setDoctorProfile({ ...doctorProfile, signature_url: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono" placeholder="URL to your transparent signature image" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 text-sm rounded-md font-medium hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm">
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Update Doctor Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-md flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">SMS Configuration</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400">Configure SMS gateway for sending text messages</p>
          </div>
        </div>

        <form onSubmit={handleSmsConfigSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">SMS Provider</label>
              <select
                value={smsConfig.provider}
                onChange={(e) => setSmsConfig({ ...smsConfig, provider: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="twilio">Twilio</option>
                <option value="nexmo">Nexmo / Vonage</option>
                <option value="africastalking">Africa's Talking</option>
                <option value="custom">Custom Provider</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">API Key / Account SID</label>
              <input
                type="text"
                value={smsConfig.api_key}
                onChange={(e) => setSmsConfig({ ...smsConfig, api_key: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Your API Key"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">API Secret / Auth Token</label>
              <input
                type="password"
                value={smsConfig.api_secret}
                onChange={(e) => setSmsConfig({ ...smsConfig, api_secret: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sender ID / Phone Number</label>
              <input
                type="text"
                value={smsConfig.sender_id}
                onChange={(e) => setSmsConfig({ ...smsConfig, sender_id: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="+1234567890"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">API URL (Optional)</label>
              <input
                type="url"
                value={smsConfig.api_url}
                onChange={(e) => setSmsConfig({ ...smsConfig, api_url: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none transition bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="https://api.sms-provider.com/v1"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 text-sm rounded-md font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save SMS Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
