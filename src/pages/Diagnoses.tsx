import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Search, Activity, Pencil, Trash2, X,
    ChevronLeft, ChevronRight, Hash
} from 'lucide-react';

interface Diagnosis {
    id: string;
    name: string;
    icd10_code: string;
    description: string;
    created_at: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

export function Diagnoses() {
    const { profile } = useAuth();
    const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Diagnosis | null>(null);
    const [form, setForm] = useState({ name: '', icd10_code: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => { loadData(); }, [profile?.branch_id]);

    async function loadData() {
        if (!profile?.branch_id) return;
        setLoading(true);
        const { data } = await supabase
            .from('diagnoses')
            .select('*')
            .eq('branch_id', profile.branch_id)
            .order('name');
        setDiagnoses(data || []);
        setLoading(false);
    }

    function openAdd() {
        setEditing(null);
        setForm({ name: '', icd10_code: '', description: '' });
        setError(null);
        setShowModal(true);
    }

    function openEdit(d: Diagnosis) {
        setEditing(d);
        setForm({ name: d.name, icd10_code: d.icd10_code || '', description: d.description || '' });
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
            res = await supabase.from('diagnoses').update(form).eq('id', editing.id);
        } else {
            res = await supabase.from('diagnoses').insert([{ ...form, branch_id: profile.branch_id }]);
        }

        if (res.error) {
            setError(res.error.code === '23505' ? 'This diagnosis already exists.' : res.error.message);
        } else {
            setShowModal(false);
            loadData();
        }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this diagnosis?')) return;
        await supabase.from('diagnoses').delete().eq('id', id);
        loadData();
    }

    const filtered = diagnoses.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.icd10_code || '').toLowerCase().includes(search.toLowerCase()) ||
        (d.description || '').toLowerCase().includes(search.toLowerCase())
    );
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Activity className="w-8 h-8 text-rose-600" /> Diagnoses & ICD-10
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage diagnosis catalog and ICD-10 codes</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add Diagnosis
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Search by name or ICD-10 code..." value={search}
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">#</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Diagnosis Name</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">ICD-10 Code</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Description</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Options</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={5} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600 mx-auto" /></td></tr>
                            ) : paginated.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-500">No diagnoses found.</td></tr>
                            ) : paginated.map((d, idx) => (
                                <tr key={d.id} className="hover:bg-rose-50/30 dark:hover:bg-rose-900/10 transition-colors">
                                    <td className="px-6 py-4 text-gray-400 font-mono text-xs">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{d.name}</td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded-md text-xs font-bold border border-rose-200 dark:border-rose-800">
                                            {d.icd10_code || '—'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400 truncate max-w-xs">{d.description || '—'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => openEdit(d)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-200 transition">
                                                <Pencil className="w-3.5 h-3.5" /> Edit
                                            </button>
                                            <button onClick={() => handleDelete(d.id)}
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
                                <button key={i} onClick={() => setCurrentPage(i + 1)} className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-rose-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}>{i + 1}</button>
                            ))}
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-rose-50 dark:bg-rose-900/20 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Edit Diagnosis' : 'Add Diagnosis'}</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-center gap-2 text-red-600 text-xs font-bold"><Activity className="w-4 h-4" />{error}</div>}
                            <div>
                                <label className={labelCls}>Diagnosis Name</label>
                                <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Hypertension" autoFocus />
                            </div>
                            <div>
                                <label className={labelCls}>ICD-10 Code</label>
                                <div className="relative">
                                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input value={form.icd10_code} onChange={e => setForm(p => ({ ...p, icd10_code: e.target.value }))} className={`${inputCls} pl-10`} placeholder="e.g. I10" />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>Description (Optional)</label>
                                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className={`${inputCls} h-20 resize-none`} placeholder="Brief description..." />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700 transition disabled:opacity-50">{submitting ? 'Saving...' : (editing ? 'Update' : 'Add Diagnosis')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
