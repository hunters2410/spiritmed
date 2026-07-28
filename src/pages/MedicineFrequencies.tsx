import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Clock, Pencil, Trash2, X, ChevronLeft, ChevronRight, Activity } from 'lucide-react';

interface Frequency {
    id: string;
    branch_id: string;
    name: string;
    description: string;
    created_at: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

export function MedicineFrequencies() {
    const { profile } = useAuth();
    const [frequencies, setFrequencies] = useState<Frequency[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingFreq, setEditingFreq] = useState<Frequency | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* ─── pagination state ─── */
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        loadFrequencies();
    }, [profile?.id]);

    async function loadFrequencies() {
        setLoading(true);
        const bid = profile?.branch_id;
        let query = supabase.from('medicine_frequencies').select('*');
        if (bid) {
            query = query.or(`branch_id.eq.${bid},branch_id.is.null`);
        }
        const { data, error } = await query.order('name', { ascending: true });
        if (!error) setFrequencies(data || []);
        setLoading(false);
    }

    const filtered = frequencies.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    /* ─── pagination logic ─── */
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        const payload = { ...formData, branch_id: profile?.branch_id || null };

        let res;
        if (editingFreq) {
            res = await supabase.from('medicine_frequencies').update(payload).eq('id', editingFreq.id);
        } else {
            res = await supabase.from('medicine_frequencies').insert([payload]);
        }

        if (res.error) {
            if (res.error.code === '23505') setError('This frequency name already exists.');
            else setError(res.error.message);
        } else {
            setShowModal(false);
            setFormData({ name: '', description: '' });
            setEditingFreq(null);
            loadFrequencies();
        }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this frequency?')) return;
        const { error } = await supabase.from('medicine_frequencies').delete().eq('id', id);
        if (!error) loadFrequencies();
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Clock className="w-8 h-8 text-green-600" /> Prescription Frequencies
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage common dosage frequencies (e.g., OD, BD, QID)</p>
                </div>
                <button onClick={() => { setEditingFreq(null); setFormData({ name: '', description: '' }); setError(null); setShowModal(true); }}
                    className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /><span>Add Frequency</span>
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Search frequencies..." value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Code/Name</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Description</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={3} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" /></td></tr>
                            ) : paginated.length === 0 ? (
                                <tr><td colSpan={3} className="px-6 py-10 text-center text-gray-500">No frequencies found</td></tr>
                            ) : paginated.map(f => (
                                <tr key={f.id} className="hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors">
                                    <td className="px-6 py-4 font-bold text-green-600 dark:text-green-400">{f.name}</td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{f.description || '—'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => { setEditingFreq(f); setFormData({ name: f.name, description: f.description || '' }); setError(null); setShowModal(true); }}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition" title="Edit">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(f.id)}
                                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition" title="Delete">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ─── pagination controls ─── */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="text-xs text-gray-500 font-medium tracking-wide">
                            Showing <span className="text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="text-gray-900 dark:text-white">{filtered.length}</span> records
                        </div>
                        <div className="flex gap-2">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                                className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition shadow-sm">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="flex gap-1">
                                {[...Array(totalPages)].map((_, i) => (
                                    <button key={i} onClick={() => setCurrentPage(i + 1)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition shadow-sm ${currentPage === i + 1 ? 'bg-green-600 text-white' : 'border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}
                                className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition shadow-sm">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/20 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                {editingFreq ? <Pencil className="w-5 h-5 text-green-600" /> : <Plus className="w-5 h-5 text-green-600" />}
                                {editingFreq ? 'Edit Frequency' : 'Add New Frequency'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-bold">
                                    <Activity className="w-4 h-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}
                            <div>
                                <label className={labelCls}>Frequency Name (e.g. OD, BD)</label>
                                <input type="text" required value={formData.name} onChange={e => setFormData(d => ({ ...d, name: e.target.value }))} className={inputCls} placeholder="e.g. QID" />
                            </div>
                            <div>
                                <label className={labelCls}>Description (Optional)</label>
                                <textarea value={formData.description} onChange={e => setFormData(d => ({ ...d, description: e.target.value }))} className={`${inputCls} h-24 resize-none`} placeholder="e.g. Four times daily" />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition shadow-md disabled:opacity-50">
                                    {submitting ? 'Saving...' : (editingFreq ? 'Update Frequency' : 'Save Frequency')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
