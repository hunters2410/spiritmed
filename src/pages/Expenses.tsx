import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, DollarSign, ChevronLeft, ChevronRight, FileSpreadsheet, FileJson, Trash2, X, Activity, Layers } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { logActivity } from '../utils/auditLogger';
import { SearchDropdown } from '../components/SearchDropdown';
import { accountingSync } from '../utils/accountingSync';


interface Expense {
    id: string;
    branch_id: string;
    category_id: string;
    amount: number;
    description: string;
    expense_date: string;
    payment_method: string;
    recorded_by: string;
    created_at: string;
    category?: {
        name: string;
    };
    recorder?: {
        full_name: string;
    };
}

interface ExpenseCategory {
    id: string;
    name: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

export function Expenses() {
    const { profile } = useAuth();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [categories, setCategories] = useState<ExpenseCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    
    // Modal States
    const [showRecordModal, setShowRecordModal] = useState(false);
    const [showQuickCatModal, setShowQuickCatModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        amount: '',
        category_id: '',
        description: '',
        expense_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash'
    });

    const [quickCatData, setQuickCatData] = useState({ name: '', description: '' });

    useEffect(() => {
        loadExpenses();
        loadCategories();
    }, [profile?.id]);

    async function loadExpenses() {
        setLoading(true);
        try {
            const bid = profile?.branch_id;
            let query = supabase
                .from('expenses')
                .select(`
                    *,
                    category:expense_categories(name),
                    recorder:users!expenses_recorded_by_fkey(full_name)
                `)
                .order('expense_date', { ascending: false });

            if (bid) {
                query = query.eq('branch_id', bid);
            }

            const { data, error } = await query;
            if (error) throw error;
            setExpenses(data || []);
        } catch (err: any) {
            console.error('Error loading expenses:', err);
        } finally {
            setLoading(false);
        }
    }

    async function loadCategories() {
        try {
            const bid = profile?.branch_id;
            let query = supabase
                .from('expense_categories')
                .select('id, name')
                .order('name', { ascending: true });

            if (bid) {
                query = query.eq('branch_id', bid);
            }

            const { data, error } = await query;
            if (error) throw error;
            setCategories(data || []);
        } catch (err: any) {
            console.error('Error loading categories:', err);
        }
    }

    async function handleRecordExpense(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const amount = parseFloat(formData.amount);
            if (isNaN(amount) || amount < 0) throw new Error('Invalid amount');

            const { data, error } = await supabase.from('expenses').insert([{
                ...formData,
                amount,
                branch_id: profile?.branch_id || null,
                recorded_by: profile?.id
            }]).select().single();

            if (error) throw error;

            const category = categories.find(c => c.id === formData.category_id);
            if (data) {
                await accountingSync.postExpenseJournalEntry({
                    ...data,
                    category: category ? { name: category.name } : 'Expense'
                });
            }

            if (profile?.id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id || '',
                    action: 'CREATE',
                    tableName: 'expenses',
                    recordId: data.id,
                    details: `Recorded expense: ${formData.description} ($${amount})`,
                    newValues: { ...formData, amount }
                });
            }

            setShowRecordModal(false);
            resetForm();
            loadExpenses();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleQuickCatSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const { data, error } = await supabase.from('expense_categories').insert([{
                ...quickCatData,
                branch_id: profile?.branch_id || null
            }]).select().single();

            if (error) throw error;

            setCategories(prev => [...prev, { id: data.id, name: data.name }].sort((a,b) => a.name.localeCompare(b.name)));
            setFormData(prev => ({ ...prev, category_id: data.id }));
            setShowQuickCatModal(false);
            setQuickCatData({ name: '', description: '' });
        } catch (err: any) {
            alert('Error creating category: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    }

    const resetForm = () => {
        setFormData({
            amount: '',
            category_id: '',
            description: '',
            expense_date: new Date().toISOString().split('T')[0],
            payment_method: 'cash'
        });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this expense record?')) return;
        try {
            const { error } = await supabase.from('expenses').delete().eq('id', id);
            if (error) throw error;
            await accountingSync.deleteJournalEntry('expense', id, profile?.branch_id || '');
            loadExpenses();
        } catch (err: any) {
            alert('Error deleting: ' + err.message);
        }
    };

    const handleExportExcel = () => {
        const data = filtered.map(e => ({
            'Date': e.expense_date,
            'Category': e.category?.name || 'Uncategorized',
            'Description': e.description,
            'Amount': e.amount,
            'Method': e.payment_method.toUpperCase(),
            'Recorded By': e.recorder?.full_name || 'N/A'
        }));
        exportToExcel(data, 'hospital_expenses');
    };

    const handleExportPDF = () => {
        const headers = ['#', 'Date', 'Category', 'Description', 'Amount', 'Method'];
        const data = filtered.map((e, i) => [
            i + 1,
            e.expense_date,
            e.category?.name || 'N/A',
            e.description,
            `$${e.amount.toLocaleString()}`,
            e.payment_method.toUpperCase()
        ]);
        exportToPDF(headers, data, 'Hospital Expense Report', 'hospital_expenses');
    };

    const filtered = expenses.filter(e => {
        const matchesSearch = e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (e.category?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCat = filterCategory === 'all' || e.category_id === filterCategory;
        const eDate = new Date(e.expense_date);
        const matchesStart = !startDate || eDate >= new Date(startDate);
        const matchesEnd = !endDate || eDate <= new Date(endDate);
        return matchesSearch && matchesCat && matchesStart && matchesEnd;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalAmount = filtered.reduce((sum, e) => sum + e.amount, 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <DollarSign className="w-8 h-8 text-blue-600" /> Financial Expenses
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Record and track hospital expenditures</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExportExcel} className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-sm font-semibold">
                        <FileSpreadsheet className="w-4 h-4" /> <span>Excel</span>
                    </button>
                    <button onClick={handleExportPDF} className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition shadow-sm font-semibold">
                        <FileJson className="w-4 h-4" /> <span>PDF</span>
                    </button>
                    <button onClick={() => setShowRecordModal(true)} className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-sm font-semibold ml-2">
                        <Plus className="w-5 h-5" /> <span>Record Expense</span>
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input type="text" placeholder="Search records..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                    </div>
                    <div>
                        <SearchDropdown
                            placeholder="Filter by Category..."
                            items={categories}
                            selectedId={filterCategory === 'all' ? null : filterCategory}
                            onSelect={(id) => { setFilterCategory(id || 'all'); setCurrentPage(1); }}
                        />
                    </div>
                    <div>
                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                    </div>
                    <div>
                        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center text-sm">
                   <div className="font-bold text-gray-700 dark:text-gray-300">Total Selection: <span className="text-blue-600">${totalAmount.toLocaleString()}</span></div>
                   <div className="text-gray-500 italic">Showing {filtered.length} records</div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">
                                <th className="px-6 py-3 text-left border-b border-r border-gray-200 dark:border-gray-700">Date</th>
                                <th className="px-6 py-3 text-left border-b border-r border-gray-200 dark:border-gray-700">Category</th>
                                <th className="px-6 py-3 text-left border-b border-r border-gray-200 dark:border-gray-700">Description</th>
                                <th className="px-6 py-3 text-left border-b border-r border-gray-200 dark:border-gray-700">Amount</th>
                                <th className="px-6 py-3 text-left border-b border-r border-gray-200 dark:border-gray-700">Method</th>
                                <th className="px-6 py-3 text-center border-b border-gray-200 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></td></tr>
                            ) : paginated.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">No records found matching your filters</td></tr>
                            ) : paginated.map(e => (
                                <tr key={e.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/30 transition-colors">
                                    <td className="px-6 py-4 border-r border-gray-200 dark:border-gray-700 align-top">{new Date(e.expense_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 border-r border-gray-200 dark:border-gray-700 align-top">
                                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs font-semibold text-gray-600 dark:text-gray-400">{e.category?.name || 'Uncategorized'}</span>
                                    </td>
                                    <td className="px-6 py-4 border-r border-gray-200 dark:border-gray-700 align-top">
                                        <div className="font-medium text-gray-900 dark:text-white">{e.description}</div>
                                        <div className="text-[10px] text-gray-400 mt-1 uppercase font-bold">Recorded By: {e.recorder?.full_name || 'N/A'}</div>
                                    </td>
                                    <td className="px-6 py-4 border-r border-gray-200 dark:border-gray-700 align-top font-bold text-blue-600">${e.amount.toLocaleString()}</td>
                                    <td className="px-6 py-4 border-r border-gray-200 dark:border-gray-700 align-top">
                                        <div className="capitalize">{e.payment_method.replace('_', ' ')}</div>
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <div className="flex justify-center">
                                            <button onClick={() => handleDelete(e.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition" title="Delete record">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filtered.length > 0 && (
                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center space-x-4">
                            <p className="text-xs text-gray-500">
                                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
                            </p>
                            <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-400 uppercase font-bold">Rows:</span>
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
                                    className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value="all">ALL</option>
                                </select>
                            </div>
                        </div>

                        {itemsPerPage < filtered.length && totalPages > 1 && (
                            <div className="flex gap-1">
                                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-700 transition disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                                {[...Array(totalPages)].map((_, i) => (
                                    <button key={i} onClick={() => setCurrentPage(i + 1)} className={`w-8 h-8 rounded text-xs font-bold transition ${currentPage === i + 1 ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-white dark:hover:bg-gray-700'}`}>{i + 1}</button>
                                ))}
                                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-700 transition disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Record Expense Modal */}
            {showRecordModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-blue-600" /> Record Expense
                            </h2>
                            <button onClick={() => setShowRecordModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleRecordExpense} className="p-6 space-y-4">
                            {error && <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-lg border border-red-100 flex items-center gap-2"><Activity className="w-4 h-4" />{error}</div>}
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Date</label>
                                    <input type="date" required value={formData.expense_date} onChange={e => setFormData(d => ({ ...d, expense_date: e.target.value }))} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Amount ($)</label>
                                    <input type="number" step="0.01" required value={formData.amount} onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))} className={inputCls} placeholder="0.00" />
                                </div>
                            </div>

                            <div>
                                <SearchDropdown
                                    label="Category Allocation"
                                    placeholder="Search or Select Category..."
                                    items={categories}
                                    selectedId={formData.category_id}
                                    onSelect={(id) => setFormData(d => ({ ...d, category_id: id }))}
                                    onAddNew={() => setShowQuickCatModal(true)}
                                    addNewLabel="Add New Category"
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Payment Method</label>
                                <select required value={formData.payment_method} onChange={e => setFormData(d => ({ ...d, payment_method: e.target.value }))} className={inputCls}>
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="card">Card</option>
                                    <option value="medical_aid">Medical Aid</option>
                                </select>
                            </div>

                            <div>
                                <label className={labelCls}>Description</label>
                                <textarea required value={formData.description} onChange={e => setFormData(d => ({ ...d, description: e.target.value }))} className={`${inputCls} h-24 resize-none`} placeholder="Details of the expenditure..." />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowRecordModal(false)} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancel</button>
                                <button type="submit" disabled={submitting} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition disabled:opacity-50">
                                    {submitting ? 'Saving...' : 'Save Record'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick Category Modal */}
            {showQuickCatModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 font-sans">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm uppercase">
                                <Layers className="w-4 h-4 text-blue-600" /> New category
                            </h3>
                            <button onClick={() => setShowQuickCatModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleQuickCatSubmit} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Name</label>
                                <input type="text" required value={quickCatData.name} onChange={e => setQuickCatData(d => ({ ...d, name: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Notes</label>
                                <input type="text" value={quickCatData.description} onChange={e => setQuickCatData(d => ({ ...d, description: e.target.value }))} className={inputCls} />
                            </div>
                            <button type="submit" disabled={submitting} className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-bold shadow hover:bg-blue-700 transition uppercase text-xs">
                                {submitting ? 'Saving...' : 'Add & Select'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
