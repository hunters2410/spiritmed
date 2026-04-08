import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
    Calculator, DollarSign, ArrowUpRight, ArrowDownRight, 
    Search, Filter, FileSpreadsheet, FileJson,
    ChevronLeft, ChevronRight, Activity,
    History, Building2, Stethoscope
} from 'lucide-react';
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, Legend, ResponsiveContainer, Area
} from 'recharts';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

interface Transaction {
    id: string;
    date: string;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    method: string;
    category: string;
    created_at: string;
}

interface ProcedureRecord {
    id: string;
    description: string;
    amount: number;
    quantity: number;
    date: string;
    invoice_number: string;
    patient_name: string;
    status: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";

export function Accounting() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'ledger' | 'procedures'>('ledger');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [procedures, setProcedures] = useState<ProcedureRecord[]>([]);
    const [chartData, setChartData] = useState<any[]>([]);
    const [branchId, setBranchId] = useState<string>(profile?.branch_id || '');
    const [branches, setBranches] = useState<any[]>([]);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    useEffect(() => {
        if (profile?.role === 'super_admin') {
            loadBranches();
        }
    }, [profile]);

    useEffect(() => {
        loadFinancialData();
        loadProcedureData();
    }, [branchId]);

    async function loadBranches() {
        const { data } = await supabase.from('branches').select('*').order('name');
        setBranches(data || []);
    }

    async function loadFinancialData() {
        setLoading(true);
        try {
            const filter = branchId ? { branch_id: branchId } : {};

            const [paymentsRes, expensesRes] = await Promise.all([
                supabase.from('payments').select('id, amount, payment_date, notes, payment_method, created_at').match(filter),
                supabase.from('expenses').select('id, amount, expense_date, description, payment_method, created_at, category:expense_categories(name)').match(filter)
            ]);

            const merged: Transaction[] = [
                ...(paymentsRes.data || []).map(p => ({
                    id: p.id,
                    date: p.payment_date,
                    type: 'income' as const,
                    amount: Number(p.amount),
                    description: p.notes || 'Hospital Payment',
                    method: p.payment_method || 'N/A',
                    category: 'Patient Billing',
                    created_at: p.created_at
                })),
                ...(expensesRes.data || []).map((e: any) => ({
                    id: e.id,
                    date: e.expense_date,
                    type: 'expense' as const,
                    amount: Number(e.amount),
                    description: e.description || 'Hospital Expense',
                    method: e.payment_method || 'N/A',
                    category: e.category?.name || 'General Expense',
                    created_at: e.created_at
                }))
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            setTransactions(merged);
            processChartData(merged);
        } catch (err) {
            console.error('Error loading financial data:', err);
        } finally {
            setLoading(false);
        }
    }

    async function loadProcedureData() {
        try {
            let query = supabase
                .from('invoice_items')
                .select(`
                    id, description, quantity, unit_price, total_price, created_at,
                    invoice:invoices!inner (
                        invoice_number, status, invoice_date, branch_id,
                        patient:patients (full_name)
                    )
                `);

            if (branchId) {
                query = query.eq('invoice.branch_id', branchId);
            }

            const { data, error } = await query;
            if (error) throw error;

            const formatted: ProcedureRecord[] = (data || []).map((item: any) => ({
                id: item.id,
                description: item.description,
                amount: Number(item.total_price),
                quantity: Number(item.quantity),
                date: item.invoice?.invoice_date,
                invoice_number: item.invoice?.invoice_number || 'N/A',
                patient_name: item.invoice?.patient?.full_name || 'Generic Patient',
                status: item.invoice?.status || 'unknown'
            })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            setProcedures(formatted);
        } catch (err) {
            console.error('Error loading procedures:', err);
        }
    }

    function processChartData(data: Transaction[]) {
        const last6Months: any[] = [];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            last6Months.push({
                name: `${months[d.getMonth()]} ${d.getFullYear()}`,
                income: 0,
                expense: 0,
                profit: 0,
                month: d.getMonth(),
                year: d.getFullYear()
            });
        }

        data.forEach(t => {
            const d = new Date(t.date);
            const monthData = last6Months.find(m => m.month === d.getMonth() && m.year === d.getFullYear());
            if (monthData) {
                if (t.type === 'income') monthData.income += t.amount;
                else monthData.expense += t.amount;
                monthData.profit = monthData.income - monthData.expense;
            }
        });

        setChartData(last6Months);
    }

    const filteredLedger = transactions.filter(t => {
        const matchesSearch = t.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             t.category.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'all' || t.type === filterType;
        const matchesStart = !startDate || new Date(t.date) >= new Date(startDate);
        const matchesEnd = !endDate || new Date(t.date) <= new Date(endDate);
        return matchesSearch && matchesType && matchesStart && matchesEnd;
    });

    const filteredProcedures = procedures.filter(p => {
        const matchesSearch = p.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             p.patient_name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStart = !startDate || new Date(p.date) >= new Date(startDate);
        const matchesEnd = !endDate || new Date(p.date) <= new Date(endDate);
        return matchesSearch && matchesStart && matchesEnd;
    });

    const totalIncome = filteredLedger.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = filteredLedger.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netProfit = totalIncome - totalExpense;

    const currentList = activeTab === 'ledger' ? filteredLedger : filteredProcedures;
    const totalPages = Math.ceil(currentList.length / itemsPerPage);
    const paginated = currentList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleExportExcel = () => {
        if (activeTab === 'ledger') {
            const data = filteredLedger.map(t => ({
                'Date': new Date(t.date).toLocaleDateString(),
                'Type': t.type.toUpperCase(),
                'Category': t.category,
                'Description': t.description,
                'Amount': t.amount,
                'Method': t.method.toUpperCase()
            }));
            exportToExcel(data, 'hospital_financial_report');
        } else {
            const data = filteredProcedures.map(p => ({
                'Date': new Date(p.date).toLocaleDateString(),
                'Procedure': p.description,
                'Patient': p.patient_name,
                'Invoice': p.invoice_number,
                'Quantity': p.quantity,
                'Amount': p.amount,
                'Status': p.status.toUpperCase()
            }));
            exportToExcel(data, 'hospital_procedures_report');
        }
    };

    const handleExportPDF = () => {
        if (activeTab === 'ledger') {
            const headers = ['#', 'Date', 'Type', 'Description', 'Amount', 'Method'];
            const data = filteredLedger.map((t, i) => [
                i + 1,
                new Date(t.date).toLocaleDateString(),
                t.type.toUpperCase(),
                t.description,
                `$${t.amount.toLocaleString()}`,
                t.method.toUpperCase()
            ]);
            exportToPDF(headers, data, 'General Ledger & Financial Report', 'hospital_ledger');
        } else {
            const headers = ['#', 'Date', 'Procedure', 'Patient', 'Invoice', 'Amount'];
            const data = filteredProcedures.map((p, i) => [
                i + 1,
                new Date(p.date).toLocaleDateString(),
                p.description,
                p.patient_name,
                p.invoice_number,
                `$${p.amount.toLocaleString()}`
            ]);
            exportToPDF(headers, data, 'Payment Procedures Analytics', 'procedures_report');
        }
    };

    return (
        <div className="space-y-6 pb-12" style={{ fontFamily: "'Roboto', sans-serif" }}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Calculator className="w-8 h-8 text-indigo-600" /> Accounting & Reports
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">Consolidated financial data and clinical procedure analytics</p>
                </div>

                <div className="flex items-center gap-3">
                    {profile?.role === 'super_admin' && (
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <select
                                value={branchId}
                                onChange={(e) => setBranchId(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm font-semibold"
                            >
                                <option value="">Consolidated (All Branches)</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    )}
                    <button onClick={() => { loadFinancialData(); loadProcedureData(); }} className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
                        <Activity className="w-5 h-5 text-indigo-600" />
                    </button>
                    <div className="flex bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1 gap-1 shadow-sm">
                        <button onClick={handleExportExcel} className="p-1 px-3 text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition flex items-center gap-1.5 border border-emerald-100 dark:border-emerald-900/30">
                            <FileSpreadsheet className="w-3.5 h-3.5" /> EXCEL
                        </button>
                        <button onClick={handleExportPDF} className="p-1 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition flex items-center gap-1.5 border border-rose-100 dark:border-rose-900/30">
                            <FileJson className="w-3.5 h-3.5" /> PDF REPORT
                        </button>
                    </div>
                </div>
            </div>

            {/* Financial Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: 'Consolidated Incomes', value: totalIncome, icon: ArrowUpRight, color: 'emerald', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400' },
                    { label: 'Consolidated Expenses', value: totalExpense, icon: ArrowDownRight, color: 'rose', bg: 'bg-rose-50 dark:bg-rose-900/20', text: 'text-rose-700 dark:text-rose-400' },
                    { label: 'Current Net Balance', value: netProfit, icon: DollarSign, color: netProfit >= 0 ? 'indigo' : 'amber', bg: netProfit >= 0 ? 'bg-indigo-50' : 'bg-amber-50', text: netProfit >= 0 ? 'text-indigo-700' : 'text-amber-700' }
                ].map((kpi, i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 ${kpi.bg} rounded-xl`}>
                                <kpi.icon className={`w-6 h-6 ${kpi.text}`} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">{kpi.label}</p>
                                <h3 className={`text-2xl font-black ${kpi.text} mt-1 leading-none`}>${kpi.value.toLocaleString()}</h3>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="flex items-center p-2 bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-700">
                    <button 
                        onClick={() => { setActiveTab('ledger'); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'ledger' ? 'bg-white dark:bg-gray-800 text-indigo-600 shadow-sm border border-gray-200 dark:border-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <History className="w-4 h-4" /> Financial Ledger
                    </button>
                    <button 
                        onClick={() => { setActiveTab('procedures'); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'procedures' ? 'bg-white dark:bg-gray-800 text-emerald-600 shadow-sm border border-gray-200 dark:border-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        <Stethoscope className="w-4 h-4" /> Procedure Performance
                    </button>
                </div>

                <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {activeTab === 'ledger' && (
                        <div className="lg:col-span-8">
                            <div className="h-[350px] w-full mt-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }} />
                                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                                        <Legend verticalAlign="top" align="right" height={36} formatter={(v) => <span className="text-[10px] font-black uppercase text-gray-500">{v}</span>} />
                                        <Area type="monotone" dataKey="profit" fill="#4f46e5" fillOpacity={0.05} stroke="#4f46e5" strokeWidth={0} />
                                        <Bar dataKey="income" fill="#10b981" radius={[6, 6, 0, 0]} barSize={25} />
                                        <Bar dataKey="expense" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={25} />
                                        <Line type="monotone" dataKey="profit" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    <div className={`${activeTab === 'ledger' ? 'lg:col-span-4' : 'lg:col-span-12'} space-y-6`}>
                        <div className="bg-gray-50 dark:bg-gray-900/20 p-6 rounded-2xl border border-gray-100 dark:border-gray-700">
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Filter className="w-3.5 h-3.5 text-indigo-600" /> Audit Parameters
                            </h3>
                            <div className="space-y-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input type="text" placeholder={activeTab === 'ledger' ? "Search ledger..." : "Search procedures/patients..."} value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }} className={inputCls} />
                                </div>
                                {activeTab === 'ledger' && (
                                    <select value={filterType} onChange={e => { setFilterType(e.target.value as any); setCurrentPage(1); }} className={inputCls}>
                                        <option value="all">Consolidated Ledger</option>
                                        <option value="income">Credits (Incomes)</option>
                                        <option value="expense">Debits (Expenses)</option>
                                    </select>
                                )}
                                <div className={`grid ${activeTab === 'ledger' ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'} gap-4`}>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 px-1">From</label>
                                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 px-1">To</label>
                                        <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }} className={inputCls} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        {activeTab === 'ledger' ? (
                            <>
                                <thead>
                                    <tr className="bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 text-[10px] font-black uppercase tracking-widest text-left">
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Date</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Details</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Type</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Credit (+)</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Debit (-)</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Method</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={6} className="px-8 py-20 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto" /></td></tr>
                                    ) : paginated.length === 0 ? (
                                        <tr><td colSpan={6} className="px-8 py-20 text-center text-gray-400 italic font-medium">No transactions match filters</td></tr>
                                    ) : paginated.map((t: any) => (
                                        <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors border-b border-gray-50 dark:border-gray-700">
                                            <td className="px-8 py-4 font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">{new Date(t.date).toLocaleDateString()}</td>
                                            <td className="px-8 py-4">
                                                <div className="font-bold text-gray-800 dark:text-gray-200">{t.description}</div>
                                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tight italic">{t.category}</div>
                                            </td>
                                            <td className="px-8 py-4">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${t.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{t.type}</span>
                                            </td>
                                            <td className="px-8 py-4 font-mono font-bold text-emerald-600">{t.type === 'income' ? `+$${t.amount.toLocaleString()}` : '--'}</td>
                                            <td className="px-8 py-4 font-mono font-bold text-rose-600">{t.type === 'expense' ? `-$${t.amount.toLocaleString()}` : '--'}</td>
                                            <td className="px-8 py-4 uppercase text-[10px] font-black opacity-60 underline underline-offset-4">{t.method.replace('_', ' ')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </>
                        ) : (
                            <>
                                <thead>
                                    <tr className="bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 text-[10px] font-black uppercase tracking-widest text-left">
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Date Perform</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Procedure Description</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Patient</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Invoice #</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Fee</th>
                                        <th className="px-8 py-4 border-b border-gray-200 dark:border-gray-700">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={6} className="px-8 py-20 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto" /></td></tr>
                                    ) : paginated.length === 0 ? (
                                        <tr><td colSpan={6} className="px-8 py-20 text-center text-gray-400 italic font-medium">No procedure data found</td></tr>
                                    ) : paginated.map((p: any) => (
                                        <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors border-b border-gray-50 dark:border-gray-700">
                                            <td className="px-8 py-4 font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">{new Date(p.date).toLocaleDateString()}</td>
                                            <td className="px-8 py-4 font-black text-gray-700 dark:text-gray-300">{p.description} <span className="text-gray-400 ml-1 font-bold">x{p.quantity}</span></td>
                                            <td className="px-8 py-4 font-bold text-indigo-600 underline underline-offset-2 decoration-indigo-200">{p.patient_name}</td>
                                            <td className="px-8 py-4 font-mono font-bold text-gray-400">{p.invoice_number}</td>
                                            <td className="px-8 py-4 font-mono font-black text-emerald-600">${p.amount.toLocaleString()}</td>
                                            <td className="px-8 py-4">
                                                <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-center w-fit flex items-center gap-1.5 border ${p.status === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : p.status === 'partially_paid' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                                    <div className={`w-1 h-1 rounded-full ${p.status === 'paid' ? 'bg-emerald-600' : p.status === 'partially_paid' ? 'bg-amber-600' : 'bg-rose-600'}`} />
                                                    {p.status.replace('_', ' ')}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </>
                        )}
                    </table>
                </div>

                {paginated.length > 0 && (
                    <div className="px-8 py-6 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center space-x-6">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, currentList.length)} of {currentList.length} items
                            </p>
                            <select
                                value={itemsPerPage === currentList.length ? 'all' : itemsPerPage}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'all') setItemsPerPage(currentList.length || 1);
                                    else setItemsPerPage(Number(val));
                                    setCurrentPage(1);
                                }}
                                className="text-[10px] font-black bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value="all">ALL</option>
                            </select>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex gap-2">
                                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-xl disabled:opacity-30 hover:bg-white transition shadow-sm"><ChevronLeft className="w-5 h-5" /></button>
                                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-xl disabled:opacity-30 hover:bg-white transition shadow-sm"><ChevronRight className="w-5 h-5" /></button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
