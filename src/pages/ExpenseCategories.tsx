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

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5";

export function ExpenseCategories() {
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
    const [itemsPerPage, setItemsPerPage] = useState(25);

    useEffect(() => {
        loadCategories();
    }, [profile?.branch_id]);

    async function loadCategories() {
        if (!profile?.branch_id) return;
        setLoading(true);
        try {
            let query = supabase
                .from('expense_categories')
                .select('*')
                .order('name', { ascending: true });

            if (profile.role !== 'super_admin') {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setCategories(data || []);
        } catch (err: any) {
            console.error('Error loading categories:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!profile?.branch_id) return;
        setSubmitting(true);
        setError(null);
        
        try {
            const payload = { 
                ...formData, 
                branch_id: profile.branch_id 
            };

            if (editingCat) {
                const { error } = await supabase.from('expense_categories').update(payload).eq('id', editingCat.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('expense_categories').insert([payload]);
                if (error) throw error;
            }

            setShowModal(false);
            setFormData({ name: '', description: '' });
            setEditingCat(null);
            loadCategories();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this category? Expenses linked to it may be affected.')) return;
        try {
            const { error } = await supabase.from('expense_categories').delete().eq('id', id);
            if (error) throw error;
            loadCategories();
        } catch (err: any) {
            alert('Error deleting category: ' + err.message);
        }
    }

    const filtered = categories.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                            <Layers className="w-8 h-8" />
                        </div>
                        Expense Categories
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">Define and manage categories for hospital expenditure</p>
                </div>
                <button 
                    onClick={() => { setEditingCat(null); setFormData({ name: '', description: '' }); setError(null); setShowModal(true); }}
                    className="flex items-center justify-center space-x-2 bg-emerald-600 text-white px-6 py-3 rounded-xl hover:bg-emerald-700 transition shadow-lg shadow-emerald-600/20 font-bold"
                >
                    <Plus className="w-5 h-5" />
                    <span>Add Category</span>
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search categories..." 
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900 dark:text-white text-sm" 
                    />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-widest">
                                <th className="px-6 py-5 text-left font-black border-b border-gray-100 dark:border-gray-700">Category Name</th>
                                <th className="px-6 py-5 text-left font-black border-b border-gray-100 dark:border-gray-700">Description</th>
                                <th className="px-6 py-5 text-center font-black border-b border-gray-100 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
                                            <span className="text-gray-400 font-medium">Loading categories...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginated.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2 text-gray-400">
                                            <Activity className="w-12 h-12 opacity-20" />
                                            <span className="font-medium text-lg text-gray-400">No categories found</span>
                                            <p className="text-sm">Start by adding a new expense category</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginated.map(c => (
                                <tr key={c.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition-colors">
                                    <td className="px-6 py-4">
                                        <span className="font-bold text-gray-900 dark:text-white text-base">{c.name}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-gray-500 dark:text-gray-400 max-w-md">{c.description || 'No description provided'}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-3">
                                            <button 
                                                onClick={() => { setEditingCat(c); setFormData({ name: c.name, description: c.description || '' }); setError(null); setShowModal(true); }}
                                                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition shadow-sm bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700" 
                                                title="Edit"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(c.id)}
                                                className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition shadow-sm bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700" 
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Pattern */}
                {filtered.length > 0 && (
                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <p className="text-xs text-gray-500 font-medium">
                                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
                            </p>
                            <div className="flex items-center space-x-2">
                                <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Rows:</span>
                                <select
                                    value={itemsPerPage === filtered.length ? 'all' : itemsPerPage}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'all') {
                                            setItemsPerPage(filtered.length || 1);
                                        } else {
                                            setItemsPerPage(Number(val));
                                        }
                                        setCurrentPage(1);
                                    }}
                                    className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value="all">ALL</option>
                                </select>
                            </div>
                        </div>

                        {itemsPerPage < filtered.length && totalPages > 1 && (
                            <div className="flex gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition shadow-sm"
                                >
                                    <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                </button>
                                <div className="flex gap-1 text-[10px] font-bold">
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setCurrentPage(i + 1)}
                                            className={`w-8 h-8 rounded-lg transition ${currentPage === i + 1 ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-white dark:hover:bg-gray-700'}`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition shadow-sm"
                                >
                                    <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg text-emerald-600">
                                    {editingCat ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                </div>
                                {editingCat ? 'Edit Category' : 'Create Category'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {error && (
                                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-sm font-bold rounded-xl border border-rose-100 dark:border-rose-900/30 flex items-center gap-3 animate-pulse">
                                    <Activity className="w-5 h-5" />
                                    {error}
                                </div>
                            )}
                            <div>
                                <label className={labelCls}>Category Name <span className="text-rose-500">*</span></label>
                                <input 
                                    type="text" 
                                    required 
                                    value={formData.name} 
                                    onChange={e => setFormData(d => ({ ...d, name: e.target.value }))} 
                                    className={inputCls} 
                                    placeholder="e.g. Utility Bills, Medical Supplies" 
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Description</label>
                                <textarea 
                                    value={formData.description} 
                                    onChange={e => setFormData(d => ({ ...d, description: e.target.value }))} 
                                    className={`${inputCls} h-32 resize-none pt-3`} 
                                    placeholder="Provide more context about this category..." 
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setShowModal(false)} 
                                    className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={submitting} 
                                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-50"
                                >
                                    {submitting ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span>Processing...</span>
                                        </div>
                                    ) : (editingCat ? 'Update Category' : 'Create Category')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
