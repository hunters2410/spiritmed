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
    is_active?: boolean;
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

    useEffect(() => { loadData(); }, [profile?.id]);

    async function loadData() {
        setLoading(true);
        const bid = profile?.branch_id;
        let query = supabase.from('payment_procedures').select('*');
        if (bid) {
            query = query.eq('branch_id', bid);
        }
        const { data, error } = await query.order('code');
        
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
        setSubmitting(true);
        setMessage(null);

        const payload = {
            ...form,
            price: parseFloat(form.price) || 0,
            branch_id: profile?.branch_id || null
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-lg shadow-lg">
                            <DollarSign className="w-5 h-5 text-white" />
                        </div>
                        Payment Procedures
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">Manage billable items, services, and procedure prices</p>
                </div>
                <button 
                    onClick={openAdd}
                    className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all font-bold text-sm shadow-md"
                >
                    <Plus className="w-4 h-4" /> Add Procedure
                </button>
            </div>

            {/* Search */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 relative">
                <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                    type="text" 
                    placeholder="Search by code, items or category..." 
                    value={search}
                    onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-sm focus:ring-2 focus:ring-blue-500 font-medium" 
                />
            </div>

            {/* Table section */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-gray-200 dark:border-gray-700">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 font-bold text-xs uppercase border-b border-gray-300 dark:border-gray-700">
                                <th className="border border-gray-200 dark:border-gray-700 px-5 py-3.5">Code</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-5 py-3.5">Item Name</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-5 py-3.5">Category</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-5 py-3.5 text-right">Price ($)</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-5 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="border border-gray-200 dark:border-gray-700 px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600/30 border-t-blue-600" />
                                            <p className="text-gray-400 font-medium animate-pulse">Fetching records...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginated.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="border border-gray-200 dark:border-gray-700 px-6 py-20 text-center">
                                        <div className="max-w-xs mx-auto space-y-3">
                                            <Search className="w-12 h-12 text-gray-200 dark:text-gray-700 mx-auto" />
                                            <p className="text-gray-500 dark:text-gray-400 font-bold">No records found</p>
                                            <p className="text-gray-400 dark:text-gray-500 text-xs">Try adjusting your search criteria or add a new procedure.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginated.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-colors">
                                    <td className="border border-gray-200 dark:border-gray-700 px-5 py-3 font-mono text-sm font-bold text-blue-600 dark:text-blue-400">
                                        {item.code}
                                    </td>
                                    <td className="border border-gray-200 dark:border-gray-700 px-5 py-3 font-bold text-gray-900 dark:text-white text-sm uppercase">
                                        {item.name}
                                    </td>
                                    <td className="border border-gray-200 dark:border-gray-700 px-5 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        {item.category || 'Standard'}
                                    </td>
                                    <td className="border border-gray-200 dark:border-gray-700 px-5 py-3 text-right font-black text-gray-900 dark:text-white text-sm">
                                        ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="border border-gray-200 dark:border-gray-700 px-5 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => openEdit(item)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                                                title="Edit"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(item.id)}
                                                className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
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
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                {editing ? 'Edit Procedure' : 'Add New Procedure'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {message && (
                                <div className={`p-3 rounded-lg flex items-center gap-3 border text-xs font-bold ${
                                    message.type === 'success' 
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
                                    : 'bg-rose-50 border-rose-100 text-rose-700'
                                }`}>
                                    {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    {message.text}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-1">
                                    <label className={labelCls}>Item Code</label>
                                    <input 
                                        required 
                                        value={form.code} 
                                        onChange={e => setForm(p => ({ ...p, code: e.target.value }))} 
                                        className={inputCls} 
                                        placeholder="e.g. 91300" 
                                        autoFocus 
                                    />
                                </div>
                                <div className="col-span-1">
                                    <label className={labelCls}>Category</label>
                                    <select 
                                        value={form.category} 
                                        onChange={e => setForm(p => ({ ...p, category: e.target.value }))} 
                                        className={inputCls}
                                    >
                                        <option value="">Normal</option>
                                        <option value="surgery">Surgery</option>
                                        <option value="consultation">Consultation</option>
                                        <option value="lab">Laboratory</option>
                                        <option value="radiology">Radiology</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Procedure Name</label>
                                <input 
                                    required 
                                    value={form.name} 
                                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))} 
                                    className={inputCls} 
                                    placeholder="Procedure name..." 
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Price ($)</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    required 
                                    value={form.price} 
                                    onChange={e => setForm(p => ({ ...p, price: e.target.value }))} 
                                    className={`${inputCls} font-bold`} 
                                    placeholder="0.00" 
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button 
                                    type="button" 
                                    onClick={() => setShowModal(false)} 
                                    className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold hover:bg-gray-200 transition"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={submitting} 
                                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : (editing ? 'Update' : 'Save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
