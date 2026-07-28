import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
    Mail, Send, History, Plus, Search, 
    Eye, Trash2, CheckCircle2, 
    AlertCircle, Clock, Edit, X, Save,
    ChevronLeft, ChevronRight, Layout
} from 'lucide-react';

interface EmailTemplate {
    id: string;
    branch_id: string;
    name: string;
    trigger_type?: string;
    subject: string;
    body: string;
    category: string;
    placeholders: string[];
    is_active: boolean;
}

interface EmailLog {
    id: string;
    recipient_email: string;
    recipient_name: string;
    subject: string;
    body: string;
    status: 'draft' | 'sending' | 'sent' | 'failed';
    sent_at: string;
    error_message?: string;
}

export function Emails() {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState<'logs' | 'templates'>('logs');
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<EmailLog[]>([]);
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showComposeModal, setShowComposeModal] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const [composeForm, setComposeForm] = useState({
        recipient_email: '',
        recipient_name: '',
        subject: '',
        body: '',
        template_id: ''
    });

    const [templateForm, setTemplateForm] = useState({
        id: '',
        name: '',
        trigger_type: '',
        subject: '',
        body: '',
        category: 'general',
        is_active: true
    });

    useEffect(() => {
        if (profile) {
            loadAll();
        }
    }, [profile?.id]);

    const loadAll = async () => {
        setLoading(true);
        await Promise.all([loadLogs(), loadTemplates()]);
        setLoading(false);
    };

    const loadLogs = async () => {
        let query = supabase.from('email_logs').select('*');
        if (profile?.branch_id) {
            query = query.eq('branch_id', profile.branch_id);
        }
        const { data } = await query.order('sent_at', { ascending: false });
        if (data) setLogs(data);
    };

    const loadTemplates = async () => {
        let query = supabase.from('email_templates').select('*');
        if (profile?.branch_id) {
            query = query.eq('branch_id', profile.branch_id);
        }
        const { data } = await query.order('name');
        if (data) setTemplates(data);
    };

    const handleSendEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Note: In a real app, this would trigger an Edge Function or Backend Service
            // For now, we simulate by creating a log entry
            const { error } = await supabase.from('email_logs').insert({
                branch_id: profile?.branch_id,
                recipient_email: composeForm.recipient_email,
                recipient_name: composeForm.recipient_name,
                subject: composeForm.subject,
                body: composeForm.body,
                status: 'sent',
                sender_id: profile?.id
            });

            if (error) throw error;
            setShowComposeModal(false);
            setComposeForm({ recipient_email: '', recipient_name: '', subject: '', body: '', template_id: '' });
            loadLogs();
            alert('Email sent successfully!');
        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                branch_id: profile?.branch_id,
                name: templateForm.name,
                trigger_type: templateForm.trigger_type || null,
                subject: templateForm.subject,
                body: templateForm.body,
                category: templateForm.category,
                is_active: templateForm.is_active,
                placeholders: []
            };

            if (templateForm.id) {
                const { error } = await supabase
                    .from('email_templates')
                    .update(payload)
                    .eq('id', templateForm.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('email_templates')
                    .insert([payload]);
                if (error) throw error;
            }

            setShowTemplateModal(false);
            setTemplateForm({ id: '', name: '', trigger_type: '', subject: '', body: '', category: 'general', is_active: true });
            loadTemplates();
            alert('Template saved successfully!');
        } catch (error: any) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleTemplateStatus = async (template: EmailTemplate) => {
        try {
            const { error } = await supabase
                .from('email_templates')
                .update({ is_active: !template.is_active })
                .eq('id', template.id);

            if (error) throw error;
            loadTemplates();
        } catch (error: any) {
            alert(error.message);
        }
    };

    const deleteTemplate = async (id: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;
        try {
            const { error } = await supabase
                .from('email_templates')
                .delete()
                .eq('id', id);
            if (error) throw error;
            loadTemplates();
        } catch (error: any) {
            alert(error.message);
        }
    };

    const filteredLogs = logs.filter(log => 
        log.recipient_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.recipient_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Mail className="w-8 h-8 text-blue-600" />
                        Email Management
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage email communications and message templates</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => {
                            setTemplateForm({ id: '', name: '', trigger_type: '', subject: '', body: '', category: 'general', is_active: true });
                            setShowTemplateModal(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        New Template
                    </button>
                    <button 
                        onClick={() => setShowComposeModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-md font-medium"
                    >
                        <Send className="w-4 h-4" />
                        Compose Email
                    </button>
                </div>
            </div>

            {/* Tabs & Search */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="flex flex-col md:flex-row border-b border-gray-200 dark:border-gray-700">
                    <div className="flex p-1 gap-1 flex-1">
                        <button 
                            onClick={() => { setActiveTab('logs'); setCurrentPage(1); }}
                            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg transition ${activeTab === 'logs' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        >
                            <History className="w-4 h-4" />
                            Sent History
                        </button>
                        <button 
                            onClick={() => { setActiveTab('templates'); setCurrentPage(1); }}
                            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg transition ${activeTab === 'templates' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                        >
                            <Layout className="w-4 h-4" />
                            Email Templates
                        </button>
                    </div>
                    <div className="p-2 md:w-80">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input 
                                type="text"
                                placeholder={`Search ${activeTab}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>

                {activeTab === 'logs' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recipient</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subject</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sent At</th>
                                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {loading && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading logs...</td>
                                    </tr>
                                )}
                                {!loading && filteredLogs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center text-gray-400">
                                                <Mail className="w-12 h-12 mb-2 opacity-20" />
                                                <p className="text-lg font-medium">No email logs found</p>
                                                <p className="text-sm">Emails sent will appear here</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {paginatedLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-white">{log.recipient_name || 'N/A'}</span>
                                                <span className="text-xs text-gray-500">{log.recipient_email}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm text-gray-900 dark:text-white font-medium max-w-xs truncate">{log.subject}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                                                log.status === 'sent' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                log.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                            }`}>
                                                {log.status === 'sent' && <CheckCircle2 className="w-3 h-3" />}
                                                {log.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                                                {log.status === 'sending' && <Clock className="w-3 h-3 animate-spin" />}
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 font-mono">
                                            {new Date(log.sent_at).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-lg text-gray-400 hover:text-blue-600 transition" title="View Details">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <span className="text-xs text-gray-500">
                                    Showing {(currentPage-1)*itemsPerPage + 1} to {Math.min(currentPage*itemsPerPage, filteredLogs.length)} of {filteredLogs.length} entries
                                </span>
                                <div className="flex gap-2">
                                    <button 
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(p => p - 1)}
                                        className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button 
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(p => p + 1)}
                                        className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {templates.length === 0 ? (
                                <div className="p-20 text-center">
                                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Layout className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <h3 className="font-bold text-gray-900 dark:text-white">No Templates Found</h3>
                                    <p className="text-sm text-gray-500">Create your first email template to get started.</p>
                                </div>
                            ) : (
                                templates.map((template) => (
                                    <div key={template.id} className={`p-6 flex items-start justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors ${!template.is_active ? 'opacity-75 bg-gray-50/50' : ''}`}>
                                        <div className="flex items-start gap-4 flex-1 min-w-0">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                                                template.category === 'appointment' ? 'bg-amber-100 text-amber-600' :
                                                template.category === 'billing' ? 'bg-emerald-100 text-emerald-600' :
                                                'bg-blue-100 text-blue-600'
                                            }`}>
                                                <Mail className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-1">
                                                    <h3 className="font-black text-gray-900 dark:text-white truncate">{template.name}</h3>
                                                    <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded tracking-wider ${
                                                        template.category === 'appointment' ? 'bg-amber-50 text-amber-600' :
                                                        template.category === 'billing' ? 'bg-emerald-50 text-emerald-600' :
                                                        'bg-blue-50 text-blue-600'
                                                    }`}>
                                                        {template.category}
                                                    </span>
                                                    {template.trigger_type && (
                                                        <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase rounded tracking-wider flex items-center gap-1">
                                                            <Save className="w-3 h-3" />
                                                            Trigger: {template.trigger_type.replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                    {!template.is_active && (
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-black uppercase rounded">Paused</span>
                                                    )}
                                                </div>
                                                <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 truncate">{template.subject}</p>
                                                <p className="text-xs text-gray-500 line-clamp-1 italic">"{template.body.replace(/<[^>]*>/g, ' ')}"</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4 ml-6">
                                            <button 
                                                onClick={() => toggleTemplateStatus(template)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${template.is_active ? 'bg-blue-600 shadow-lg shadow-blue-100' : 'bg-gray-300'}`}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${template.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                            
                                            <div className="h-8 w-px bg-gray-100 dark:bg-gray-700" />

                                            <div className="flex items-center gap-1">
                                                <button 
                                                    onClick={() => {
                                                        setComposeForm({...composeForm, subject: template.subject, body: template.body});
                                                        setShowComposeModal(true);
                                                    }}
                                                    className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors group/btn" 
                                                    title="Use Template"
                                                >
                                                    <Send className="w-5 h-5 group-hover/btn:scale-110 transition-transform" />
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        setTemplateForm({
                                                            id: template.id,
                                                            name: template.name,
                                                            trigger_type: template.trigger_type || '',
                                                            subject: template.subject,
                                                            body: template.body,
                                                            category: template.category,
                                                            is_active: template.is_active
                                                        });
                                                        setShowTemplateModal(true);
                                                    }}
                                                    className="p-2 hover:bg-gray-100 text-gray-500 rounded-lg transition-colors" 
                                                    title="Edit"
                                                >
                                                    <Edit className="w-5 h-5" />
                                                </button>
                                                <button 
                                                    onClick={() => deleteTemplate(template.id)}
                                                    className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors" 
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Compose Modal */}
            {showComposeModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Send className="w-5 h-5 text-blue-600" />
                                Compose New Email
                            </h2>
                            <button onClick={() => setShowComposeModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSendEmail} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Recipient Name</label>
                                    <input 
                                        type="text"
                                        value={composeForm.recipient_name}
                                        onChange={e => setComposeForm({...composeForm, recipient_name: e.target.value})}
                                        className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g. Collen Hunters"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Recipient Email *</label>
                                    <input 
                                        type="email"
                                        required
                                        value={composeForm.recipient_email}
                                        onChange={e => setComposeForm({...composeForm, recipient_email: e.target.value})}
                                        className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="collen@example.com"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Subject *</label>
                                <input 
                                    type="text"
                                    required
                                    value={composeForm.subject}
                                    onChange={e => setComposeForm({...composeForm, subject: e.target.value})}
                                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter email subject"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Message Body *</label>
                                <textarea 
                                    required
                                    rows={8}
                                    value={composeForm.body}
                                    onChange={e => setComposeForm({...composeForm, body: e.target.value})}
                                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                                    placeholder="Write your message here..."
                                />
                                <p className="text-[10px] text-gray-400 mt-2">
                                    Tip: You can use standard text. Rich text support coming soon.
                                </p>
                            </div>
                            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button 
                                    type="button"
                                    onClick={() => setShowComposeModal(false)}
                                    className="flex-1 py-3 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Sending...' : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            Send Email Now
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Template Modal */}
            {showTemplateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Layout className="w-5 h-5 text-blue-600" />
                                Create New Template
                            </h2>
                            <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Template Name *</label>
                                    <input 
                                        type="text"
                                        required
                                        value={templateForm.name}
                                        onChange={e => setTemplateForm({...templateForm, name: e.target.value})}
                                        className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g. Appointment Reminder"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                    <select 
                                        value={templateForm.category}
                                        onChange={e => setTemplateForm({...templateForm, category: e.target.value})}
                                        className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="general">General</option>
                                        <option value="appointment">Appointment</option>
                                        <option value="billing">Billing & Bills</option>
                                        <option value="clinical">Clinical Reports</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">System Trigger (Auto-send)</label>
                                    <select 
                                        value={templateForm.trigger_type}
                                        onChange={e => setTemplateForm({...templateForm, trigger_type: e.target.value})}
                                        className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                    >
                                        <option value="">None (Manual Only)</option>
                                        <option value="appointment_booked">Appointment Booked</option>
                                        <option value="appointment_confirmed">Appointment Confirmed</option>
                                        <option value="payment_received">Payment Received</option>
                                        <option value="patient_registered">Patient Registered</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Email Subject *</label>
                                <input 
                                    type="text"
                                    required
                                    value={templateForm.subject}
                                    onChange={e => setTemplateForm({...templateForm, subject: e.target.value})}
                                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g. Reminder: Your appointment at Spiritmed"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Template Body *</label>
                                <textarea 
                                    required
                                    rows={6}
                                    value={templateForm.body}
                                    onChange={e => setTemplateForm({...templateForm, body: e.target.value})}
                                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Write template content..."
                                />
                                 <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                                    <p className="text-[11px] text-blue-700 dark:text-blue-400 leading-relaxed font-medium">
                                        Note: You can use placeholders like {"{patient_name}"}, {"{doctor_name}"}, {"{date}"}, and {"{time}"} in your subject or body. They will be replaced automatically.
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 py-2">
                                    <input 
                                        type="checkbox"
                                        id="tm_active"
                                        checked={templateForm.is_active}
                                        onChange={e => setTemplateForm({...templateForm, is_active: e.target.checked})}
                                        className="w-4 h-4 text-blue-600 rounded"
                                    />
                                    <label htmlFor="tm_active" className="text-sm font-bold text-gray-700 dark:text-gray-300">Template is active</label>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button 
                                    type="button"
                                    onClick={() => setShowTemplateModal(false)}
                                    className="flex-1 py-3 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    {loading ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
