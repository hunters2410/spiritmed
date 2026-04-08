import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Mail, MessageSquare, CheckCircle, AlertCircle, Save, Building2, Globe, Phone, MapPin, User as UserIcon, Award, Stethoscope, FileSignature, Image as ImageIcon, Send, Upload, Loader2, X } from 'lucide-react';
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
  const [uploadingSignature, setUploadingSignature] = useState(false);

  const isProcessing = loading || savingEmail || uploadingLogo || uploadingSignature || testingEmail;

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
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('id', profile.branch_id)
      .maybeSingle();
    if (data) setBranchConfig(data);
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
    if (!profile?.branch_id) return;
    try {
      const { data: emailData } = await supabase
        .from('system_configurations')
        .select('*')
        .eq('branch_id', profile.branch_id)
        .eq('config_type', 'email')
        .eq('config_name', 'smtp')
        .maybeSingle();

      if (emailData) {
        setEmailConfig(emailData.config_data);
      }

      const { data: smsData } = await supabase
        .from('system_configurations')
        .select('*')
        .eq('branch_id', profile.branch_id)
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
    setSavingEmail(true);
    setMessage(null);

    try {
      const { data: existing } = await supabase
        .from('system_configurations')
        .select('id')
        .eq('branch_id', profile?.branch_id)
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
            branch_id: profile?.branch_id,
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
      signature_url: branchConfig.signature_url
    };

    const { error } = await supabase
      .from('branches')
      .update(updateData)
      .eq('id', profile.branch_id);
    
    if (error) {
      console.error('Branding save error:', error);
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Branch branding saved successfully!' });
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    }
    setLoading(false);
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.branch_id) return;

    // Validate type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please upload an image file (PNG/JPG)' });
      return;
    }

    try {
      setUploadingLogo(true);
      setMessage(null);

      // Clean old logo if needed (optional optimization)
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.branch_id}/logo_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(fileName, file, { 
          upsert: true,
          contentType: file.type // Ensure correct mime type
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('branding')
        .getPublicUrl(fileName);

      // Add a cache buster just in case
      const finalUrl = `${publicUrl}?t=${Date.now()}`;

      // Update branch config immediately
      setBranchConfig(prev => ({ ...prev, logo_url: finalUrl }));

      // Persist to database
      const { error: dbError } = await supabase
        .from('branches')
        .update({ logo_url: publicUrl })
        .eq('id', profile.branch_id);

      if (dbError) throw dbError;

      setMessage({ type: 'success', text: 'Logo uploaded and updated successfully!' });
    } catch (error: any) {
      console.error('Logo upload error:', error);
      setMessage({ type: 'error', text: 'Failed to upload logo: ' + error.message });
    } finally {
      setUploadingLogo(false);
    }
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

  if (fetching) return <div className="p-8 text-center text-gray-500">Loading settings...</div>;

  const handleSmsConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { data: existing } = await supabase
        .from('system_configurations')
        .select('id')
        .eq('branch_id', profile?.branch_id)
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
            branch_id: profile?.branch_id,
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
                      <p className="text-[9px] text-gray-400">Used for official bills, invoices, and letterheads.</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer px-4 py-2 rounded-lg font-black text-[10px] uppercase transition-all shadow-sm ${
                        uploadingLogo 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                      }`}>
                        {uploadingLogo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {uploadingLogo ? 'Uploading...' : 'Choose Stamp'}
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
                                setUploadingLogo(false);
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
              disabled={isProcessing}
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
