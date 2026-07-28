import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Search, FlaskConical, Pencil, Trash2, X,
    ChevronLeft, ChevronRight, Activity
} from 'lucide-react';

interface Investigation { id: string; name: string; description: string; created_at: string; }

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

export function Investigations() {
    const { profile } = useAuth();
    const [investigations, setInvestigations] = useState<Investigation[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Investigation | null>(null);
    const [form, setForm] = useState({ name: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => { loadData(); }, [profile?.id]);

    async function loadData() {
        if (!profile?.branch_id) return;
        setLoading(true);
        const { data } = await supabase
            .from('investigations')
            .select('*')
            .eq('branch_id', profile.branch_id)
            .order('name');
        setInvestigations(data || []);
        setLoading(false);
    }

    function openAdd() {
        setEditing(null);
        setForm({ name: '', description: '' });
        setError(null);
        setShowModal(true);
    }

    function openEdit(inv: Investigation) {
        setEditing(inv);
        setForm({ name: inv.name, description: inv.description || '' });
        setError(null);
        setShowModal(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!profile?.branch_id) return;
        setSubmitting(true);
        setError(null);
        let res;
        if (editing) {
            res = await supabase.from('investigations').update(form).eq('id', editing.id);
        } else {
            res = await supabase.from('investigations').insert([{ ...form, branch_id: profile.branch_id }]);
        }
        if (res.error) {
            setError(res.error.code === '23505' ? 'This investigation already exists.' : res.error.message);
        } else {
            setShowModal(false);
            loadData();
        }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this investigation?')) return;
        await supabase.from('investigations').delete().eq('id', id);
        loadData();
    }

    const filtered = investigations.filter(inv =>
        inv.name.toLowerCase().includes(search.toLowerCase()) ||
        (inv.description || '').toLowerCase().includes(search.toLowerCase())
    );
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FlaskConical className="w-8 h-8 text-teal-600" /> Investigations
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage the list of medical investigations</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add Investigation
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Search investigations..." value={search}
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm clinical-table border-collapse border border-gray-200 dark:border-gray-700">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">#</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Investigation Name</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Description</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Options</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto" /></td></tr>
                            ) : paginated.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-500">No investigations found. Click "Add Investigation" to create one.</td></tr>
                            ) : paginated.map((inv, idx) => (
                                <tr key={inv.id} className="hover:bg-teal-50/30 dark:hover:bg-teal-900/10 transition-colors">
                                    <td className="px-6 py-4 text-gray-400 font-mono text-xs">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{inv.name}</td>
                                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{inv.description || '—'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => openEdit(inv)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-100 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg text-xs font-bold hover:bg-teal-200 transition">
                                                <Pencil className="w-3.5 h-3.5" /> Edit
                                            </button>
                                            <button onClick={() => handleDelete(inv.id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 transition">
                                                <Trash2 className="w-3.5 h-3.5" /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <p className="text-xs text-gray-500">Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}</p>
                        <div className="flex gap-2">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"><ChevronLeft className="w-4 h-4" /></button>
                            {[...Array(totalPages)].map((_, i) => (
                                <button key={i} onClick={() => setCurrentPage(i + 1)} className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-teal-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}>{i + 1}</button>
                            ))}
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-teal-50 dark:bg-teal-900/20 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edit Investigation' : 'Add Investigation'}</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-xs font-bold"><Activity className="w-4 h-4" />{error}</div>}
                            <div>
                                <label className={labelCls}>Investigation Name</label>
                                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Full Blood Count" autoFocus />
                            </div>
                            <div>
                                <label className={labelCls}>Description (Optional)</label>
                                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={`${inputCls} h-20 resize-none`} placeholder="Brief description..." />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition disabled:opacity-50">{submitting ? 'Saving...' : (editing ? 'Update' : 'Add Investigation')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
