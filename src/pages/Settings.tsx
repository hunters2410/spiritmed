import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Mail, CheckCircle, AlertCircle, Save, Building2, Globe, Phone, MapPin, User as UserIcon, Award, Stethoscope, FileSignature, Send, Upload, Loader2, X, Trash2, ShieldAlert, Users } from 'lucide-react';
import { emailService } from '../utils/emailService';

export function Settings() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [clearingPatients, setClearingPatients] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [patientCount, setPatientCount] = useState<number | null>(null);

  const isProcessing = loading || savingEmail || uploadingLogo || uploadingStamp || uploadingSignature || testingEmail;

  const [branchConfig, setBranchConfig] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    website: '',
    logo_url: '',
    signature_url: '',
    bank_accounts: [] as Array<{ bank_name: string; account_number: string; swift_code: string; }>
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


  useEffect(() => {
    if (profile) {
      loadAll();
      fetchPatientCount();
    }
  }, [profile?.id]);

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
    if (!profile?.branch_id) return; // super_admin has no branch — skip silently
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('id', profile.branch_id)
      .maybeSingle();
    if (data) {
      const config = data.website_config || {};
      
      // Support legacy single bank details or new array structure
      let accounts = config.banking_details || [];
      if (accounts.length === 0 && (config.bank_name || config.account_number || config.swift_code)) {
        accounts = [{
          bank_name: config.bank_name || '',
          account_number: config.account_number || '',
          swift_code: config.swift_code || ''
        }];
      }
      if (accounts.length === 0) {
        accounts = [{ bank_name: '', account_number: '', swift_code: '' }];
      }

      setBranchConfig({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        city: data.city || '',
        country: data.country || '',
        website: data.website || '',
        logo_url: data.logo_url || '',
        signature_url: data.signature_url || '',
        bank_accounts: accounts
      });
    }
  };

  const fetchDoctorProfile = async () => {
    if (!user?.id) return;
    const { data } = await supabase
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
    if (!profile?.branch_id) return; // super_admin has no branch — skip silently
    try {
      const { data: emailData } = await supabase
        .from('system_configurations')
        .select('*')
        .eq('branch_id', profile.branch_id)
        .eq('config_type', 'email')
        .eq('config_name', 'smtp')
        .maybeSingle();

      if (emailData) {
        const cfg = emailData.config_data || {};
        setEmailConfig({
          smtp_host: cfg.smtp_host || '',
          smtp_port: cfg.smtp_port || '',
          smtp_username: cfg.smtp_username || '',
          smtp_password: cfg.smtp_password || '',
          from_email: cfg.from_email || '',
          from_name: cfg.from_name || '',
          encryption: cfg.encryption || 'tls'
        });
      }
    } catch (error: any) {
      console.error('Error fetching configurations:', error);
    }
  };

  const handleEmailConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.branch_id) return;
    setSavingEmail(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('system_configurations')
        .upsert({
          branch_id: profile.branch_id,
          config_type: 'email',
          config_name: 'smtp',
          config_data: emailConfig,
          updated_by: user?.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'branch_id,config_type,config_name'
        });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Email configuration saved successfully!' });
    } catch (error: any) {
      console.error('Save email config error:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to save email configuration' });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleTestEmail = async () => {
    const recipient = testRecipient || emailConfig.from_email;
    if (!recipient) {
      setMessage({ type: 'error', text: 'Please enter a test recipient email or configure a "From Email".' });
      return;
    }
    
    setTestingEmail(true);
    setMessage(null);
    
    try {
      console.log('Starting test email trigger...');
      const result = await emailService.sendEmail({
        recipientEmail: recipient,
        recipientName: 'Test Recipient',
        subject: 'Spiritmed SMTP Test',
        body: `This is a test email from Spiritmed Hospital Management System. 
        
SMTP Host: ${emailConfig.smtp_host}
Connection Status: Configured
        
If you received this, your email configuration is working correctly.`,
        branchId: profile?.branch_id || '',
        senderId: user?.id
      });
      console.log('Test email result:', result);

      if (result.success) {
        setMessage({ type: 'success', text: 'Test email sent successfully! Check your inbox.' });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error('Test email error caught in UI:', error);
      setMessage({ type: 'error', text: `Test failed: ${error.message}` });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleBranchSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.branch_id) return;
    setLoading(true);
    
    try {
      // Fetch current branch first to safely merge website_config
      const { data: currentBranch } = await supabase
        .from('branches')
        .select('website_config')
        .eq('id', profile.branch_id)
        .maybeSingle();

      const currentConfig = currentBranch?.website_config || {};

      // Filter out completely empty accounts
      const activeAccounts = branchConfig.bank_accounts.filter(
        acc => acc.bank_name.trim() || acc.account_number.trim() || acc.swift_code.trim()
      );

      // Only send relevant fields to avoid constraints/id errors
      const updateData = {
        name: branchConfig.name,
        email: branchConfig.email,
        phone: branchConfig.phone,
        address: branchConfig.address,
        city: branchConfig.city,
        country: branchConfig.country,
        website: branchConfig.website,
        logo_url: branchConfig.logo_url,
        signature_url: branchConfig.signature_url,
        website_config: {
          ...currentConfig,
          bank_name: activeAccounts[0]?.bank_name || '',
          account_number: activeAccounts[0]?.account_number || '',
          swift_code: activeAccounts[0]?.swift_code || '',
          banking_details: activeAccounts
        }
      };

      const { error } = await supabase
        .from('branches')
        .update(updateData)
        .eq('id', profile.branch_id);
      
      if (error) throw error;
      
      setMessage({ type: 'success', text: 'Branch branding saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Branding save error:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const addBankAccount = () => {
    setBranchConfig(prev => ({
      ...prev,
      bank_accounts: [...prev.bank_accounts, { bank_name: '', account_number: '', swift_code: '' }]
    }));
  };

  const removeBankAccount = (index: number) => {
    setBranchConfig(prev => {
      const updated = prev.bank_accounts.filter((_, idx) => idx !== index);
      return {
        ...prev,
        bank_accounts: updated.length > 0 ? updated : [{ bank_name: '', account_number: '', swift_code: '' }]
      };
    });
  };

  const updateBankAccount = (index: number, field: 'bank_name' | 'account_number' | 'swift_code', value: string) => {
    setBranchConfig(prev => {
      const updated = prev.bank_accounts.map((acc, idx) => {
        if (idx === index) {
          return { ...acc, [field]: value };
        }
        return acc;
      });
      return { ...prev, bank_accounts: updated };
    });
  };

  const handleDoctorSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setLoading(true);
    // Sanitize doctor profile payload
    const updateData = {
      full_name: doctorProfile.full_name,
      qualifications: doctorProfile.qualifications,
      specialization: doctorProfile.specialization,
      signature_url: doctorProfile.signature_url
    };

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', user.id);
    
    if (error) {
      console.error('Doctor profile save error:', error);
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Doctor profile saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    }
    setLoading(false);
  };


  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id || !profile?.branch_id) return;

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload an image file (PNG/JPG)' });
      return;
    }

    try {
      setUploadingSignature(true);
      setMessage(null);

      const fileExt = file.name.split('.').pop();
      const fileName = `signatures/${profile.branch_id}/${user.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(fileName, file, { 
          upsert: true,
          contentType: file.type
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('branding')
        .getPublicUrl(fileName);

      const finalUrl = `${publicUrl}?t=${Date.now()}`;

      // Update local state
      setDoctorProfile(prev => ({ ...prev, signature_url: finalUrl }));

      // Persist to user profile
      const { error: dbError } = await supabase
        .from('users')
        .update({ signature_url: finalUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      setMessage({ type: 'success', text: 'Professional signature updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Signature upload error:', error);
      setMessage({ type: 'error', text: 'Failed to upload signature: ' + error.message });
    } finally {
      setUploadingSignature(false);
    }
  };



  // ── Danger Zone helpers ──────────────────────────────────────────────────
  const fetchPatientCount = async () => {
    let q = supabase.from('patients').select('id', { count: 'exact', head: true });
    if (profile?.role !== 'super_admin' && profile?.branch_id) {
      q = q.eq('branch_id', profile.branch_id);
    }
    const { count } = await q;
    setPatientCount(count ?? 0);
  };

  const handleClearPatients = async () => {
    if (clearConfirmText !== 'DELETE') return;
    setClearingPatients(true);
    try {
      let q = supabase.from('patients').delete();
      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        q = q.eq('branch_id', profile.branch_id);
      } else {
        // super_admin: delete all — must have a filter for Supabase safety
        q = q.neq('id', '00000000-0000-0000-0000-000000000000');
      }
      const { error } = await q;
      if (error) throw error;
      setShowClearModal(false);
      setClearConfirmText('');
      setPatientCount(0);
      setMessage({ type: 'success', text: 'Patient table cleared successfully.' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message?.includes('foreign key')
          ? 'Cannot delete: some patients have linked records (consultations, bills, etc.). Archive them first.'
          : err.message || 'Failed to clear patients.'
      });
    } finally {
      setClearingPatients(false);
    }
  };



  if (fetching) return <div className="p-8 text-center text-gray-500">Loading settings...</div>;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings & Clinic Branding</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Configure professional letterheads, clinic details, and communication channels</p>
      </div>

      {message && (
        <div className={`fixed top-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl animate-in slide-in-from-top-4 duration-300 ${message.type === 'success'
          ? 'bg-emerald-500 text-white'
          : 'bg-rose-500 text-white'
          }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <div className="pr-4">
            <p className="font-black uppercase text-[10px] tracking-widest opacity-70 leading-none mb-1">{message.type === 'success' ? 'Success' : 'Attention'}</p>
            <p className="text-xs font-bold leading-tight">{message.text}</p>
          </div>
          <button onClick={() => setMessage(null)} className="p-1 hover:bg-white/20 rounded transition-colors"><X className="w-4 h-4" /></button>
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
          <div className="flex flex-col sm:flex-row justify-end gap-3 items-center">
            <div className="flex-1 w-full sm:max-w-xs relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="email"
                placeholder="Test email address..."
                value={testRecipient}
                onChange={e => setTestRecipient(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700"
              />
            </div>
            <button
               type="button"
               disabled={isProcessing}
               onClick={handleTestEmail}
               className="w-full sm:w-auto flex items-center justify-center gap-2 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 px-4 py-2 text-sm rounded-lg font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {testingEmail ? 'Testing...' : 'Test Config'}
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-2 text-sm rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              <Save className="w-4 h-4" />
              {savingEmail ? 'Saving...' : 'Save Configuration'}
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
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-emerald-500" /> Clinic Logo / Banner
                </label>
                <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border-2 border-dashed border-emerald-100 dark:border-emerald-900/30">
                  <div className="w-48 h-24 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-emerald-50 dark:border-emerald-900/30 flex items-center justify-center overflow-hidden shrink-0">
                    {branchConfig.logo_url ? (
                      <img src={branchConfig.logo_url} alt="Branch Logo Preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center text-emerald-200">
                        <Building2 className="w-8 h-8 opacity-20" />
                        <span className="text-[10px] font-black uppercase tracking-widest mt-2">No Logo</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-3 w-full">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-emerald-500 tracking-wider">Upload Clinic Logo</p>
                      <p className="text-[9px] text-gray-400">Used as the main branding logo on printable sheets.</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-4 py-2 rounded-lg font-black text-[10px] uppercase transition-all shadow-sm ${
                        uploadingLogo 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                      }`}>
                        {uploadingLogo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {uploadingLogo ? 'Uploading...' : 'Choose Logo'}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file || !profile?.branch_id) return;
                            
                            (async () => {
                              try {
                                setUploadingLogo(true);
                                const fileExt = file.name.split('.').pop();
                                const fileName = `${profile.branch_id}/branch_logo_${Date.now()}.${fileExt}`;
                                await supabase.storage.from('branding').upload(fileName, file, { upsert: true, contentType: file.type });
                                const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(fileName);
                                const finalUrl = `${publicUrl}?t=${Date.now()}`;
                                setBranchConfig(prev => ({ ...prev, logo_url: finalUrl }));
                                setMessage({ type: 'success', text: 'Hospital logo updated!' });
                                setTimeout(() => setMessage(null), 3000);
                              } catch (err: any) {
                                setMessage({ type: 'error', text: err.message });
                              } finally {
                                setUploadingLogo(false);
                              }
                            })();
                          }}
                        />
                      </label>
                      <button 
                        type="button"
                        onClick={() => setBranchConfig(prev => ({ ...prev, logo_url: '' }))}
                        className="px-4 py-2 border border-emerald-200 dark:border-emerald-800 rounded-lg font-black text-[10px] uppercase text-emerald-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all font-mono"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <FileSignature className="w-3 h-3 text-emerald-500" /> Hospital Corporate Signature / Stamp
                </label>
                <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border-2 border-dashed border-emerald-100 dark:border-emerald-900/30">
                  <div className="w-48 h-24 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-emerald-50 dark:border-emerald-900/30 flex items-center justify-center overflow-hidden shrink-0">
                    {branchConfig.signature_url ? (
                      <img src={branchConfig.signature_url} alt="Branch Signature Preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center text-emerald-200">
                        <Building2 className="w-8 h-8 opacity-20" />
                        <span className="text-[10px] font-black uppercase tracking-widest mt-2">No Stamp</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-3 w-full">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-emerald-500 tracking-wider">Upload Corporate Stamp</p>
                      <p className="text-[9px] text-gray-400">Used for official bills and letterheads.</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-4 py-2 rounded-lg font-black text-[10px] uppercase transition-all shadow-sm ${
                        uploadingStamp 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                      }`}>
                        {uploadingStamp ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {uploadingStamp ? 'Uploading...' : 'Choose Stamp'}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file || !profile?.branch_id) return;
                            
                            (async () => {
                              try {
                                setUploadingStamp(true);
                                const fileExt = file.name.split('.').pop();
                                const fileName = `${profile.branch_id}/branch_stamp_${Date.now()}.${fileExt}`;
                                await supabase.storage.from('branding').upload(fileName, file, { upsert: true, contentType: file.type });
                                const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(fileName);
                                const finalUrl = `${publicUrl}?t=${Date.now()}`;
                                setBranchConfig(prev => ({ ...prev, signature_url: finalUrl }));
                                setMessage({ type: 'success', text: 'Hospital stamp updated!' });
                                setTimeout(() => setMessage(null), 3000);
                              } catch (err: any) {
                                setMessage({ type: 'error', text: err.message });
                              } finally {
                                setUploadingStamp(false);
                              }
                            })();
                          }}
                        />
                      </label>
                      <button 
                        type="button"
                        onClick={() => setBranchConfig(prev => ({ ...prev, signature_url: '' }))}
                        className="px-4 py-2 border border-emerald-200 dark:border-emerald-800 rounded-lg font-black text-[10px] uppercase text-emerald-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all font-mono"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
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
            <div className="col-span-full border-t border-gray-150 dark:border-gray-700/50 pt-5 mt-2">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">Banking Details</h3>
                <button
                  type="button"
                  onClick={addBankAccount}
                  className="px-2.5 py-1 text-[10px] font-black uppercase bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 rounded-md hover:bg-emerald-600 hover:text-white transition duration-200"
                >
                  + Add Bank Account
                </button>
              </div>
              <div className="space-y-4">
                {branchConfig.bank_accounts.map((account, idx) => (
                  <div key={idx} className="flex gap-4 items-end bg-gray-50/50 dark:bg-gray-900/10 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Bank Name</label>
                        <input 
                          type="text" 
                          value={account.bank_name || ''} 
                          onChange={e => updateBankAccount(idx, 'bank_name', e.target.value)} 
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" 
                          placeholder="e.g. Hospital Bank" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Account Number</label>
                        <input 
                          type="text" 
                          value={account.account_number || ''} 
                          onChange={e => updateBankAccount(idx, 'account_number', e.target.value)} 
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" 
                          placeholder="e.g. 123456789" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Swift Code</label>
                        <input 
                          type="text" 
                          value={account.swift_code || ''} 
                          onChange={e => updateBankAccount(idx, 'swift_code', e.target.value)} 
                          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500" 
                          placeholder="e.g. SWIFT" 
                        />
                      </div>
                    </div>
                    {branchConfig.bank_accounts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBankAccount(idx)}
                        className="p-2 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20 transition duration-200 self-end mb-0.5"
                        title="Remove Account"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isProcessing}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 text-sm rounded-md font-medium hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </form>
      </div>

      {/* ─── Doctor Profile (Signatures) ─── */}
      {(profile?.role === 'doctor' || profile?.role === 'admin' || profile?.role === 'super_admin') && (
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
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                  <FileSignature className="w-3 h-3 text-indigo-500" /> Professional Signature Image
                </label>
                <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border-2 border-dashed border-indigo-100 dark:border-indigo-900/30">
                  <div className="w-48 h-24 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-indigo-50 dark:border-indigo-900/30 flex items-center justify-center overflow-hidden shrink-0">
                    {doctorProfile.signature_url ? (
                      <img src={doctorProfile.signature_url} alt="Signature Preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <div className="flex flex-col items-center text-indigo-200">
                        <FileSignature className="w-8 h-8 opacity-20" />
                        <span className="text-[10px] font-black uppercase tracking-widest mt-2">No Signature</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-3 w-full">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Upload Signature</p>
                      <p className="text-[9px] text-gray-400">Recommended: PNG with transparent background. This will be used on all clinical documents.</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-4 py-2 rounded-lg font-black text-[10px] uppercase transition-all shadow-sm ${
                        uploadingSignature 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20'
                      }`}>
                        {uploadingSignature ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Upload className="w-3 h-3" />
                        )}
                        {uploadingSignature ? 'Uploading...' : 'Upload Signature'}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*" 
                          onChange={handleSignatureUpload}
                          disabled={uploadingSignature}
                        />
                      </label>
                      <button 
                        type="button"
                        onClick={() => setDoctorProfile(prev => ({ ...prev, signature_url: '' }))}
                        className="px-4 py-2 border border-indigo-200 dark:border-indigo-800 rounded-lg font-black text-[10px] uppercase text-indigo-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all font-mono"
                      >
                        Clear
                      </button>
                    </div>
                    
                    {doctorProfile.signature_url && (
                      <div className="flex items-center gap-2 text-[9px] text-indigo-600 font-mono bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded truncate">
                        <CheckCircle className="w-3 h-3" /> {doctorProfile.signature_url.split('?')[0]}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={isProcessing} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 text-sm rounded-md font-medium hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm">
                <Save className="w-4 h-4" />
                {loading ? 'Saving...' : 'Update Doctor Profile'}
              </button>
            </div>
          </form>
        </div>
      )}


      {/* ─── Danger Zone (admin / super_admin only) ─── */}
      {(profile?.role === 'super_admin' || profile?.role === 'admin') && (
        <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm p-4 border border-rose-200 dark:border-rose-900/50">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-rose-100 dark:bg-rose-900/30 rounded-md flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-rose-700 dark:text-rose-400">Danger Zone</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Irreversible actions — proceed with caution</p>
            </div>
          </div>

          <div className="border border-rose-100 dark:border-rose-900/30 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-rose-50 dark:bg-rose-900/20 rounded-lg flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-rose-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Clear Patient Table</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Permanently delete all patient records{profile?.role !== 'super_admin' ? ' for this branch' : ' across all branches'}.
                  {patientCount !== null && (
                    <span className="ml-1 font-bold text-rose-500">{patientCount.toLocaleString()} patient{patientCount !== 1 ? 's' : ''} on record.</span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { fetchPatientCount(); setShowClearModal(true); }}
              className="shrink-0 flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All Patients
            </button>
          </div>
        </div>
      )}

      {/* ─── Clear Patients Confirmation Modal ─── */}
      {showClearModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md border border-rose-200 dark:border-rose-900/50 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-gray-100 dark:border-gray-700">
              <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Clear Patient Table</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">This action cannot be undone</p>
              </div>
              <button onClick={() => { setShowClearModal(false); setClearConfirmText(''); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-4 border border-rose-100 dark:border-rose-900/40">
                <p className="text-sm font-bold text-rose-700 dark:text-rose-400 mb-1">⚠ You are about to delete:</p>
                <p className="text-2xl font-black text-rose-600">
                  {patientCount?.toLocaleString() ?? '—'}
                  <span className="text-sm font-medium text-rose-500 ml-2">patient record{patientCount !== 1 ? 's' : ''}</span>
                </p>
                <p className="text-xs text-rose-500 mt-2">If patients have linked consultations, bills, or appointments, deletion will fail with a foreign key error — you must archive those records first.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                  Type <span className="text-rose-600 font-black">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={e => setClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 text-sm border-2 border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-rose-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono tracking-widest transition-colors"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-5 pt-0">
              <button
                type="button"
                onClick={() => { setShowClearModal(false); setClearConfirmText(''); }}
                className="flex-1 py-2.5 text-sm font-bold border border-gray-200 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearPatients}
                disabled={clearConfirmText !== 'DELETE' || clearingPatients}
                className="flex-1 py-2.5 text-sm font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {clearingPatients ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Confirm Delete</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
