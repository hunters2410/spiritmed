import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Search, DollarSign, Pencil, Trash2, X,
    ChevronLeft, ChevronRight, Hash, Tag, AlertCircle, CheckCircle
} from 'lucide-react';

interface PaymentProcedure {
    id: string;
    branch_id: string;
    code: string;
    name: string;
    price: number;
    category?: string;
    created_at: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

export function PaymentProcedures() {
    const { profile } = useAuth();
    const [dataList, setDataList] = useState<PaymentProcedure[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<PaymentProcedure | null>(null);
    const [form, setForm] = useState({ code: '', name: '', price: '0', category: '' });
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12;

    useEffect(() => { loadData(); }, [profile?.branch_id]);

    async function loadData() {
        if (!profile?.branch_id) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('payment_procedures')
            .select('*')
            .eq('branch_id', profile.branch_id)
            .order('code');
        
        if (error) {
            console.error('Error loading procedures:', error);
        } else {
            setDataList(data || []);
        }
        setLoading(false);
    }

    function openAdd() {
        setEditing(null);
        setForm({ code: '', name: '', price: '0', category: '' });
        setMessage(null);
        setShowModal(true);
    }

    function openEdit(item: PaymentProcedure) {
        setEditing(item);
        setForm({ 
            code: item.code, 
            name: item.name, 
            price: item.price.toString(), 
            category: item.category || '' 
        });
        setMessage(null);
        setShowModal(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!profile?.branch_id) return;
        setSubmitting(true);
        setMessage(null);

        const payload = {
            ...form,
            price: parseFloat(form.price) || 0,
            branch_id: profile.branch_id
        };

        let res;
        if (editing) {
            res = await supabase.from('payment_procedures').update(payload).eq('id', editing.id);
        } else {
            res = await supabase.from('payment_procedures').insert([payload]);
        }

        if (res.error) {
            setMessage({ 
                type: 'error', 
                text: res.error.code === '23505' ? 'This procedure code already exists.' : res.error.message 
            });
        } else {
            setMessage({ type: 'success', text: `Procedure ${editing ? 'updated' : 'added'} successfully!` });
            setTimeout(() => setShowModal(false), 1500);
            loadData();
        }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this payment procedure?')) return;
        const { error } = await supabase.from('payment_procedures').delete().eq('id', id);
        if (error) {
            alert('Error deleting procedure: ' + error.message);
        } else {
            loadData();
        }
    }

    const filtered = dataList.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        (item.category || '').toLowerCase().includes(search.toLowerCase())
    );

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/30">
                            <DollarSign className="w-6 h-6 text-white" />
                        </div>
                        Payment Procedures
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1 font-medium">Configure billable items, services, and surgery prices</p>
                </div>
                <button 
                    onClick={openAdd}
                    className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-blue-600/40 font-bold transform hover:-translate-y-0.5 active:scale-95"
                >
                    <Plus className="w-5 h-5" /> Add Procedure
                </button>
            </div>

            {/* Search */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex items-center">
                <div className="relative w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="Search by code, item name, or category..." 
                        value={search}
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-gray-900 dark:text-white" 
                    />
                </div>
            </div>

            {/* Table section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-xl overflow-hidden relative">
                <div className="overflow-x-auto text-sm">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50/50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 font-bold text-[10px] uppercase tracking-widest border-b border-gray-100 dark:border-gray-700">
                                <th className="px-6 py-5">#</th>
                                <th className="px-6 py-5">Code</th>
                                <th className="px-6 py-5">Procedure / Item Name</th>
                                <th className="px-6 py-5">Category</th>
                                <th className="px-6 py-5 text-right font-black text-blue-600 dark:text-blue-400">Price ($)</th>
                                <th className="px-6 py-5 text-center">Options</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600/30 border-t-blue-600" />
                                            <p className="text-gray-400 font-medium animate-pulse">Fetching records...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginated.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center">
                                        <div className="max-w-xs mx-auto space-y-3">
                                            <Search className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto" />
                                            <p className="text-gray-500 dark:text-gray-400 font-bold">No records found</p>
                                            <p className="text-gray-400 dark:text-gray-500 text-xs">Try adjusting your search criteria or add a new procedure.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginated.map((item, idx) => (
                                <tr key={item.id} className="group hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all duration-300">
                                    <td className="px-6 py-4 text-gray-400 font-mono text-[10px]">
                                        {((currentPage - 1) * itemsPerPage + idx + 1).toString().padStart(2, '0')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded text-[11px] font-bold border border-gray-200 dark:border-gray-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-500 transition-colors">
                                            {item.code}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900 dark:text-white uppercase tracking-tighter text-xs group-hover:text-blue-600 transition-colors">
                                            {item.name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-500 uppercase tracking-widest italic opacity-60">
                                            {item.category || 'Standard'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="font-black text-gray-900 dark:text-white text-base">
                                                ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-1 transition-opacity">
                                            <button 
                                                onClick={() => openEdit(item)}
                                                className="p-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg transition-all shadow-sm"
                                                title="Edit item"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(item.id)}
                                                className="p-2 bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white dark:bg-rose-900/30 dark:text-rose-400 rounded-lg transition-all shadow-sm"
                                                title="Delete item"
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

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-6 py-6 bg-gray-50/30 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                            Showing <span className="text-blue-600">{(currentPage - 1) * itemsPerPage + 1}</span>–<span className="text-blue-600">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of {filtered.length} entries
                        </p>
                        <div className="flex gap-1">
                            <button 
                                disabled={currentPage === 1} 
                                onClick={() => setCurrentPage(p => p - 1)} 
                                className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl disabled:opacity-30 hover:shadow-lg transition-all active:scale-95"
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            
                            <div className="flex gap-1">
                                {[...Array(totalPages)].map((_, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => setCurrentPage(i + 1)} 
                                        className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all transform active:scale-90 ${
                                            currentPage === i + 1 
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50' 
                                            : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50'
                                        }`}
                                    >
                                        {i + 1}
                                    </button>
                                ))}
                            </div>

                            <button 
                                disabled={currentPage === totalPages} 
                                onClick={() => setCurrentPage(p => p + 1)} 
                                className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl disabled:opacity-30 hover:shadow-lg transition-all active:scale-95"
                            >
                                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl transform transition-all animate-in zoom-in-95 duration-300 overflow-hidden border border-white/20">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-8 py-6 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600">
                            <div>
                                <h2 className="text-xl font-black text-white">{editing ? 'Edit Procedure' : 'Create Payment Procedure'}</h2>
                                <p className="text-blue-100 text-xs font-semibold uppercase tracking-widest mt-0.5">Finance Department</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="bg-white/10 p-2 rounded-xl text-white hover:bg-white/20 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="p-8 space-y-6">
                            {message && (
                                <div className={`p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 border ${
                                    message.type === 'success' 
                                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400' 
                                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900 text-rose-700 dark:text-rose-400'
                                }`}>
                                    {message.type === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                                    <p className="text-xs font-bold">{message.text}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-1">
                                    <label className={labelCls}>Item Code</label>
                                    <div className="relative">
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <input 
                                            required 
                                            value={form.code} 
                                            onChange={e => setForm(p => ({ ...p, code: e.target.value }))} 
                                            className={`${inputCls} pl-10`} 
                                            placeholder="e.g. 91300" 
                                            autoFocus 
                                        />
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <label className={labelCls}>Category</label>
                                    <div className="relative">
                                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        <select 
                                            value={form.category} 
                                            onChange={e => setForm(p => ({ ...p, category: e.target.value }))} 
                                            className={`${inputCls} pl-10 appearance-none`}
                                        >
                                            <option value="">Normal Procedure</option>
                                            <option value="surgery">Surgery</option>
                                            <option value="consultation">Consultation</option>
                                            <option value="lab">Laboratory</option>
                                            <option value="radiology">Radiology</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Payment Item Name</label>
                                <input 
                                    required 
                                    value={form.name} 
                                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))} 
                                    className={inputCls} 
                                    placeholder="e.g. ENDOSCOPY" 
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Standard Price ($)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-blue-600">$</span>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        required 
                                        value={form.price} 
                                        onChange={e => setForm(p => ({ ...p, price: e.target.value }))} 
                                        className={`${inputCls} pl-10 text-lg font-black text-right pr-6 focus:ring-emerald-500`} 
                                        placeholder="0.00" 
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setShowModal(false)} 
                                    className="flex-1 py-4 bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 rounded-2xl text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition active:scale-95"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={submitting} 
                                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-sm font-black hover:bg-blue-700 transition shadow-xl shadow-blue-500/40 disabled:opacity-50 active:scale-95"
                                >
                                    {submitting ? 'Processing...' : (editing ? 'Update Record' : 'Save Procedure')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
