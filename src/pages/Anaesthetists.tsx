import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Search, UserCheck, Pencil, Trash2, X,
    ChevronLeft, ChevronRight, Briefcase
} from 'lucide-react';

interface Anaesthetist {
    id: string;
    full_name: string;
    specialization: string;
    created_at: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

export function Anaesthetists() {
    const { profile } = useAuth();
    const [dataList, setDataList] = useState<Anaesthetist[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Anaesthetist | null>(null);
    const [form, setForm] = useState({ full_name: '', specialization: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => { loadData(); }, [profile?.id]);

    async function loadData() {
        if (!profile?.branch_id) return;
        setLoading(true);
        const { data } = await supabase
            .from('anaesthetists')
            .select('*')
            .eq('branch_id', profile.branch_id)
            .order('full_name');
        setDataList(data || []);
        setLoading(false);
    }

    function openAdd() {
        setEditing(null);
        setForm({ full_name: '', specialization: '' });
        setError(null);
        setShowModal(true);
    }

    function openEdit(item: Anaesthetist) {
        setEditing(item);
        setForm({ full_name: item.full_name, specialization: item.specialization || '' });
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
            res = await supabase.from('anaesthetists').update(form).eq('id', editing.id);
        } else {
            res = await supabase.from('anaesthetists').insert([{ ...form, branch_id: profile.branch_id }]);
        }

        if (res.error) {
            setError(res.error.code === '23505' ? 'This record already exists.' : res.error.message);
        } else {
            setShowModal(false);
            loadData();
        }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this record?')) return;
        await supabase.from('anaesthetists').delete().eq('id', id);
        loadData();
    }

    const filtered = dataList.filter(item =>
        item.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (item.specialization || '').toLowerCase().includes(search.toLowerCase())
    );
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <UserCheck className="w-8 h-8 text-blue-600" /> Anaesthetists
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage anaesthesia specialists for operation reports</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add Anaesthetist
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Search by name or specialization..." value={search}
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">#</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Full Name</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Specialization</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></td></tr>
                            ) : paginated.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-500">No records found.</td></tr>
                            ) : paginated.map((item, idx) => (
                                <tr key={item.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                                    <td className="px-6 py-4 text-gray-400 font-mono text-xs">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{item.full_name}</td>
                                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{item.specialization || '—'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => openEdit(item)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(item.id)}
                                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition">
                                                <Trash2 className="w-4 h-4" />
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
                                <button key={i} onClick={() => setCurrentPage(i + 1)} className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}>{i + 1}</button>
                            ))}
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edit Anaesthetist' : 'Add Anaesthetist'}</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-xs font-bold"><Plus className="w-4 h-4" />{error}</div>}
                            <div>
                                <label className={labelCls}>Full Name</label>
                                <input required value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} className={inputCls} placeholder="Dr. John Smith" autoFocus />
                            </div>
                            <div>
                                <label className={labelCls}>Specialization (Optional)</label>
                                <div className="relative">
                                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input value={form.specialization} onChange={e => setForm(p => ({ ...p, specialization: e.target.value }))} className={`${inputCls} pl-10`} placeholder="e.g. Cardiac Anaesthesia" />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition disabled:opacity-50">{submitting ? 'Saving...' : (editing ? 'Update' : 'Add Anaesthetist')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
