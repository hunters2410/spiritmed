import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Layers, Pencil, Trash2, X, ChevronLeft, ChevronRight, Activity } from 'lucide-react';

interface Category {
    id: string;
    branch_id: string;
    name: string;
    description: string;
    created_at: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

export function InventoryCategories() {
    const { profile } = useAuth();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingCat, setEditingCat] = useState<Category | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        loadCategories();
    }, [profile?.id]);

    async function loadCategories() {
        if (!profile?.branch_id) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('inventory_categories')
            .select('*')
            .eq('branch_id', profile.branch_id)
            .order('name', { ascending: true });
        if (!error) setCategories(data || []);
        setLoading(false);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!profile?.branch_id) return;
        setSubmitting(true);
        setError(null);
        const payload = { ...formData, branch_id: profile.branch_id };

        let res;
        if (editingCat) {
            res = await supabase.from('inventory_categories').update(payload).eq('id', editingCat.id);
        } else {
            res = await supabase.from('inventory_categories').insert([payload]);
        }

        if (res.error) {
            setError(res.error.message);
        } else {
            setShowModal(false);
            setFormData({ name: '', description: '' });
            setEditingCat(null);
            loadCategories();
        }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this category? Items linked to it may be affected.')) return;
        const { error } = await supabase.from('inventory_categories').delete().eq('id', id);
        if (!error) loadCategories();
    }

    const filtered = categories.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Layers className="w-8 h-8 text-indigo-600" /> Inventory Categories
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Organize your stock into logical groups (e.g. Medicine, Surgical, Consumables)</p>
                </div>
                <button onClick={() => { setEditingCat(null); setFormData({ name: '', description: '' }); setError(null); setShowModal(true); }}
                    className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /><span>Add Category</span>
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Search categories..." value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Category Name</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Description</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={3} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto" /></td></tr>
                            ) : paginated.length === 0 ? (
                                <tr><td colSpan={3} className="px-6 py-10 text-center text-gray-500">No categories found</td></tr>
                            ) : paginated.map(c => (
                                <tr key={c.id} className="hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{c.name}</td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{c.description || '—'}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => { setEditingCat(c); setFormData({ name: c.name, description: c.description || '' }); setError(null); setShowModal(true); }}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition" title="Edit">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(c.id)}
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

                {totalPages > 1 && (
                    <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="text-xs text-gray-500">Showing {Math.min(filtered.length, (currentPage - 1) * itemsPerPage + 1)} to {Math.min(filtered.length, currentPage * itemsPerPage)} of {filtered.length}</div>
                        <div className="flex gap-2">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 border border-gray-300 rounded-lg disabled:opacity-30 transition"><ChevronLeft className="w-4 h-4" /></button>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 border border-gray-300 rounded-lg disabled:opacity-30 transition"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/20 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                {editingCat ? <Pencil className="w-5 h-5 text-indigo-600" /> : <Plus className="w-5 h-5 text-indigo-600" />}
                                {editingCat ? 'Edit Category' : 'Add New Category'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-lg flex items-center gap-2"><Activity className="w-4 h-4" />{error}</div>}
                            <div>
                                <label className={labelCls}>Category Name</label>
                                <input type="text" required value={formData.name} onChange={e => setFormData(d => ({ ...d, name: e.target.value }))} className={inputCls} placeholder="e.g. Surgical Supplies" />
                            </div>
                            <div>
                                <label className={labelCls}>Description</label>
                                <textarea value={formData.description} onChange={e => setFormData(d => ({ ...d, description: e.target.value }))} className={`${inputCls} h-24 resize-none`} placeholder="Optional details..." />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-semibold">Cancel</button>
                                <button type="submit" disabled={submitting} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md disabled:opacity-50">{submitting ? '...' : (editingCat ? 'Update' : 'Save')}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
