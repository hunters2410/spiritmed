import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  MessageSquare, 
  Settings, 
  History, 
  Save, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Database
} from 'lucide-react';
import { format } from 'date-fns';
import { smsService } from '../utils/smsService';

interface SmsLog {
  id: string;
  phone_number: string;
  status: string;
  created_at: string;
  provider: string;
  error_message?: string;
  template_id?: string;
}

interface SmsTemplate {
  id: string;
  trigger_type: string;
  provider_template_id: string;
  message_body?: string;
  is_active: boolean;
  variables: string[];
}

export function SmsManagement() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'config' | 'templates' | 'logs'>('templates');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Config State
  const [smsConfig, setSmsConfig] = useState({
    provider: 'msg91',
    api_key: '',
    sender_id: ''
  });

  // Templates State
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<SmsTemplate> | null>(null);

  // Logs State
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [logsCount, setLogsCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (profile) {
      loadConfig();
      loadTemplates();
      loadLogs();
    }
  }, [profile?.id, currentPage]);

  const loadConfig = async () => {
    if (!profile?.branch_id) return; // super_admin has no branch — skip config load
    const { data } = await supabase
      .from('system_configurations')
      .select('*')
      .eq('branch_id', profile.branch_id)
      .eq('config_type', 'sms')
      .eq('config_name', 'provider')
      .maybeSingle();

    if (data) {
      setSmsConfig({
        provider: data.config_data.provider || 'msg91',
        api_key: data.config_data.api_key || '',
        sender_id: data.config_data.sender_id || ''
      });
    }
  };

  const loadTemplates = async () => {
    let query = supabase.from('sms_templates').select('*');
    if (profile?.branch_id) {
      query = query.eq('branch_id', profile.branch_id);
    }
    const { data } = await query;
    setTemplates(data || []);
  };

  const loadLogs = async () => {
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    let query = supabase
      .from('sms_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Only filter by branch if the user has one (super_admin sees all)
    if (profile?.branch_id) {
      query = query.eq('branch_id', profile.branch_id);
    }

    const { data, count } = await query;
    setLogs(data || []);
    setLogsCount(count || 0);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.branch_id) return;
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from('system_configurations')
        .select('id')
        .eq('branch_id', profile.branch_id)
        .eq('config_type', 'sms')
        .eq('config_name', 'provider')
        .maybeSingle();

      const payload = {
        branch_id: profile?.branch_id,
        config_type: 'sms',
        config_name: 'provider',
        config_data: smsConfig,
        updated_by: user?.id,
        updated_at: new Date().toISOString()
      };

      if (existing) {
        await supabase.from('system_configurations').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('system_configurations').insert([{ ...payload, created_by: user?.id }]);
      }

      setMessage({ type: 'success', text: 'Configuration saved successfully' });
      loadLogs();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTestSms = async () => {
    const testPhone = prompt('Enter phone number (e.g. 919876543210):');
    if (!testPhone) return;

    setLoading(true);
    try {
      const result = await smsService.sendSms({
        recipientPhone: testPhone,
        triggerType: 'appointment_booked', 
        variables: {
          patient_name: 'Test Patient',
          doctor_name: 'Dr. Test',
          date: new Date().toLocaleDateString(),
          time: new Date().toLocaleTimeString()
        },
        branchId: profile?.branch_id || ''
      });

      if (result.success) {
        setMessage({ type: 'success', text: 'Test SMS sent!' });
        loadLogs();
      } else {
        setMessage({ type: 'error', text: `Failed: ${result.error}` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate?.trigger_type || !editingTemplate?.provider_template_id) return;

    setLoading(true);
    try {
      const payload = {
        branch_id: profile?.branch_id,
        trigger_type: editingTemplate.trigger_type,
        provider_template_id: editingTemplate.provider_template_id,
        message_body: editingTemplate.message_body,
        is_active: editingTemplate.is_active ?? true,
        variables: editingTemplate.variables || []
      };

      if (editingTemplate.id) {
        await supabase.from('sms_templates').update(payload).eq('id', editingTemplate.id);
      } else {
        await supabase.from('sms_templates').insert([payload]);
      }

      setShowTemplateModal(false);
      loadTemplates();
      setMessage({ type: 'success', text: 'Template saved successfully' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleTemplateStatus = async (tmpl: SmsTemplate) => {
    try {
      const { error } = await supabase
        .from('sms_templates')
        .update({ is_active: !tmpl.is_active })
        .eq('id', tmpl.id);

      if (error) throw error;
      loadTemplates();
      setMessage({ type: 'success', text: `Template ${!tmpl.is_active ? 'activated' : 'deactivated'} successfully` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template mapping?')) return;
    await supabase.from('sms_templates').delete().eq('id', id);
    loadTemplates();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-indigo-600" />
            SMS Management
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Configure MSG91 integration and automated triggers</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <p className="text-sm font-bold">{message.text}</p>
          <button onClick={() => setMessage(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        <button 
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-black transition-all ${
            activeTab === 'templates' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-white/50'
          }`}
        >
          <Database className="w-4 h-4" />
          Templates
        </button>
        <button 
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-black transition-all ${
            activeTab === 'config' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-white/50'
          }`}
        >
          <Settings className="w-4 h-4" />
          Gateway Settings
        </button>
        <button 
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-black transition-all ${
            activeTab === 'logs' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-white/50'
          }`}
        >
          <History className="w-4 h-4" />
          SMS Logs
        </button>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
        {activeTab === 'config' && (
          <div className="p-8 space-y-8">
            <div className="max-w-xl">
              <h2 className="text-xl font-bold mb-1">MSG91 Credentials</h2>
              <p className="text-sm text-gray-500 mb-6">Enter your authentication details from the MSG91 dashboard</p>
              
              <form onSubmit={handleSaveConfig} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Auth Key</label>
                  <input 
                    type="password"
                    value={smsConfig.api_key}
                    onChange={e => setSmsConfig({...smsConfig, api_key: e.target.value})}
                    placeholder="Enter MSG91 Auth Key"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-400 mb-2">Sender ID (Optional)</label>
                  <input 
                    type="text"
                    value={smsConfig.sender_id}
                    onChange={e => setSmsConfig({...smsConfig, sender_id: e.target.value})}
                    placeholder="e.g. SPRMED"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-black transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Saving...' : 'Save Configuration'}
                </button>
              </form>

              <div className="mt-12 p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                <h3 className="text-indigo-900 dark:text-indigo-400 font-bold mb-2 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Test Integration
                </h3>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-4">
                  Verify your Auth Key and "Appointment Booked" template mapping by sending a test SMS.
                </p>
                <button 
                  onClick={handleTestSms}
                  disabled={loading}
                  className="bg-white dark:bg-gray-800 text-indigo-600 px-6 py-2 rounded-xl text-sm font-black border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-50 transition-all"
                >
                  Send Test SMS
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="p-0">
            <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex flex-col md:flex-row md:justify-between md:items-center gap-4 bg-gray-50/50 dark:bg-gray-800/20">
              <div>
                <h2 className="text-xl font-bold">Trigger Mappings</h2>
                <p className="text-sm text-gray-500">Map system events to MSG91 Flow Template IDs</p>
              </div>
              <div className="flex gap-2">
                <div className="relative group">
                   <button className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg font-bold text-sm">
                     <AlertCircle className="w-4 h-4 text-indigo-600" /> Variables Help
                   </button>
                   <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-xl shadow-2xl invisible group-hover:visible z-10 transition-all">
                      <h4 className="font-black text-xs uppercase text-gray-400 mb-3 tracking-widest">Available Variables</h4>
                      <div className="space-y-3 text-xs">
                        <div>
                          <p className="font-bold text-indigo-600">Appointment Booked/Confirmed</p>
                          <p className="text-gray-500">patient_name, doctor_name, date, time</p>
                        </div>
                        <div>
                          <p className="font-bold text-indigo-600">Payment Received</p>
                          <p className="text-gray-500">patient_name, amount, invoice_number, balance</p>
                        </div>
                      </div>
                   </div>
                </div>
                <button 
                  onClick={() => { setEditingTemplate({}); setShowTemplateModal(true); }}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm"
                >
                  <Plus className="w-4 h-4" /> Add Mapping
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {templates.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Database className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white">No Templates Mapped</h3>
                  <p className="text-sm text-gray-500">Add your first template mapping to enable automated SMS.</p>
                </div>
              ) : (
                templates.map(tmpl => (
                  <div key={tmpl.id} className="p-6 flex items-start justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tmpl.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-black text-gray-900 dark:text-white capitalize truncate">{tmpl.trigger_type.replace(/_/g, ' ')}</h4>
                          {!tmpl.is_active && <span className="text-[10px] font-black uppercase bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">Paused</span>}
                        </div>
                        {tmpl.message_body && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2 italic">"{tmpl.message_body}"</p>
                        )}
                        <p className="text-[10px] text-gray-500 font-mono">MSG91 ID: <span className="text-indigo-600 font-bold">{tmpl.provider_template_id}</span></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => toggleTemplateStatus(tmpl)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${tmpl.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${tmpl.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
                      <button 
                        onClick={() => { setEditingTemplate(tmpl); setShowTemplateModal(true); }}
                        className="p-2 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteTemplate(tmpl.id)}
                        className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-gray-400">Time</th>
                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-gray-400">Recipient</th>
                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-gray-400">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-black uppercase tracking-widest text-gray-400">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-100 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {format(new Date(log.created_at), 'MMM dd, HH:mm')}
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                        {log.phone_number}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${
                          log.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 max-w-xs truncate">
                        {log.error_message || `Template: ${log.template_id}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-500">Total Logs: {logsCount}</p>
              <div className="flex gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  disabled={currentPage * itemsPerPage >= logsCount}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="font-black text-lg">Configure SMS Trigger</h3>
              <button onClick={() => setShowTemplateModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-2">Trigger Event</label>
                <select 
                  value={editingTemplate?.trigger_type || ''}
                  onChange={e => setEditingTemplate({...editingTemplate, trigger_type: e.target.value})}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-bold"
                  required
                >
                  <option value="">Select Event...</option>
                  <option value="appointment_booked">Appointment Booked</option>
                  <option value="appointment_confirmed">Appointment Confirmed</option>
                  <option value="payment_received">Payment Received</option>
                  <option value="patient_registered">Patient Registered</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-2">MSG91 Template ID</label>
                <input 
                  type="text"
                  value={editingTemplate?.provider_template_id || ''}
                  onChange={e => setEditingTemplate({...editingTemplate, provider_template_id: e.target.value})}
                  placeholder="e.g. 64f1234..."
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase text-gray-400 mb-2">Message Body (Reference)</label>
                <textarea 
                  value={editingTemplate?.message_body || ''}
                  onChange={e => setEditingTemplate({...editingTemplate, message_body: e.target.value})}
                  placeholder="Enter message content..."
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 min-h-[100px] text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-2">Use {'{variable}'} placeholders to match your MSG91 config.</p>
              </div>
              <div className="flex items-center gap-3 py-2">
                <input 
                  type="checkbox"
                  checked={editingTemplate?.is_active ?? true}
                  onChange={e => setEditingTemplate({...editingTemplate, is_active: e.target.checked})}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <span className="text-sm font-bold">Mapping is active</span>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl font-bold border border-gray-200 text-gray-500"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-black shadow-lg shadow-indigo-100"
                >
                  {loading ? 'Saving...' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
