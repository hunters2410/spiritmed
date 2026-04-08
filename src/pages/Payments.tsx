import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, DollarSign, CreditCard, Banknote, Wallet, X, Printer, Calendar, Filter, ChevronLeft, ChevronRight, FileSpreadsheet, FileJson } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { ReceiptPrintView } from '../components/ReceiptPrintView';

interface Payment {
    id: string;
    invoice_id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    notes: string;
    invoice: {
        invoice_number: string;
        total_amount: number;
        paid_amount: number;
        balance: number;
        patient: {
            full_name: string;
            patient_number: string;
            email?: string;
            total_cumulative_balance?: number;
        };
    };
}

interface SimpleInvoice {
    id: string;
    patient_id: string;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    balance: number;
    status: string;
    patient: {
        full_name: string;
    };
}

export function Payments() {
    const { profile } = useAuth();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [invoices, setInvoices] = useState<SimpleInvoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showPrintView, setShowPrintView] = useState(false);
    const [selectedPaymentForPrint, setSelectedPaymentForPrint] = useState<Payment | null>(null);
    const [branch, setBranch] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterMethod, setFilterMethod] = useState('all');
    const [filterDebtors, setFilterDebtors] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const [formData, setFormData] = useState({
        invoice_id: '',
        amount: '',
        payment_method: 'cash',
        notes: ''
    });

    useEffect(() => {
        loadPayments();
        loadUnpaidInvoices();
        loadBranch();

        // Check for invoiceId in URL
        const params = new URLSearchParams(window.location.search);
        const invoiceId = params.get('invoiceId');
        if (invoiceId) {
            setFormData(prev => ({ ...prev, invoice_id: invoiceId }));
            setShowModal(true);
        }
    }, [profile]);

    const loadBranch = async () => {
        if (!profile?.branch_id) return;
        try {
            const { data, error } = await supabase
                .from('branches')
                .select('*')
                .eq('id', profile.branch_id)
                .single();
            if (error) throw error;
            setBranch(data);
        } catch (error) {
            console.error('Error loading branch:', error);
        }
    };

    const loadPayments = async () => {
        try {
            let query = supabase
                .from('payments')
                .select(`
          *,
          invoice:invoices(
            invoice_number,
            total_amount,
            paid_amount,
            balance,
            patient:patients(full_name, patient_number, email, invoices(balance))
          )
        `)
                .order('payment_date', { ascending: false });

            if (profile?.role !== 'super_admin' && profile?.branch_id) {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            
            const structuredData = (data || []).map((p: any) => ({
                ...p,
                invoice: {
                    ...p.invoice,
                    patient: {
                        ...p.invoice?.patient,
                        total_cumulative_balance: p.invoice?.patient?.invoices?.reduce((sum: number, i: any) => sum + (i.balance || 0), 0) || 0
                    }
                }
            }));

            setPayments(structuredData);
        } catch (error) {
            console.error('Error loading payments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        const data = filteredPayments.map(p => ({
            'Date': new Date(p.payment_date).toLocaleString(),
            'Patient': p.invoice?.patient?.full_name,
            'Invoice #': p.invoice?.invoice_number,
            'Amount': p.amount,
            'Method': p.payment_method,
            'Notes': p.notes
        }));
        exportToExcel(data, 'spiritmed_payments');
    };

    const handleExportPDF = () => {
        const headers = ['#', 'Date', 'Patient', 'Invoice', 'Amount', 'Method'];
        const data = filteredPayments.map((p, i) => [
            i + 1,
            new Date(p.payment_date).toLocaleDateString(),
            p.invoice?.patient?.full_name || 'N/A',
            p.invoice?.invoice_number,
            `$${p.amount.toLocaleString()}`,
            p.payment_method.toUpperCase()
        ]);
        exportToPDF(headers, data, 'Spiritmed Payment History', 'spiritmed_payments');
    };

    const loadUnpaidInvoices = async () => {
        try {
            let query = supabase
                .from('invoices')
                .select(`
          id, 
          patient_id,
          invoice_number, 
          total_amount, 
          paid_amount,
          balance,
          status,
          patient:patients(full_name)
        `)
                .in('status', ['unpaid', 'partially_paid']);

            if (profile?.role !== 'super_admin' && profile?.branch_id) {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setInvoices((data || []) as unknown as SimpleInvoice[]);
        } catch (error) {
            console.error('Error loading invoices:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const amount = parseFloat(formData.amount);

            const selectedInvoice = invoices.find(inv => inv.id === formData.invoice_id);
            if (!selectedInvoice) throw new Error('Selected invoice not found');

            // 1. Record Payment
            const { data: paymentData, error: paymentError } = await supabase
                .from('payments')
                .insert([{
                    ...formData,
                    payment_method: formData.payment_method === 'eft' ? 'bank_transfer' : formData.payment_method,
                    amount,
                    patient_id: selectedInvoice.patient_id,
                    payment_date: new Date().toISOString(),
                    branch_id: profile?.branch_id,
                    received_by: profile?.id
                }])
                .select()
                .single();

            if (paymentError) throw paymentError;

            if (profile?.id && profile?.branch_id && paymentData) {
                const selectedInvoice = invoices.find(inv => inv.id === formData.invoice_id);
                const patientName = selectedInvoice?.patient?.full_name || 'Unknown Patient';
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'CREATE',
                    tableName: 'payments',
                    recordId: paymentData.id,
                    details: `Recorded payment of ${amount} for invoice ${selectedInvoice?.invoice_number || ''} (Patient: ${patientName})`,
                    newValues: { ...formData, amount, payment_date: paymentData.payment_date }
                });
            }

            // 2. Update Invoice Fields (paid_amount, balance, status)
            const newPaidAmount = (selectedInvoice.paid_amount || 0) + amount;
            const newBalance = selectedInvoice.total_amount - newPaidAmount;
            
            let newStatus = 'partially_paid';
            if (newPaidAmount >= selectedInvoice.total_amount) {
                newStatus = 'paid';
            }

            await supabase
                .from('invoices')
                .update({ 
                    paid_amount: newPaidAmount,
                    balance: newBalance,
                    status: newStatus 
                })
                .eq('id', formData.invoice_id);

            setShowModal(false);
            resetForm();
            loadPayments();
            loadUnpaidInvoices();
            alert('Payment recorded successfully!');
        } catch (error) {
            console.error('Error recording payment:', error);
            alert('Failed to record payment');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            invoice_id: '',
            amount: '',
            payment_method: 'cash',
            notes: ''
        });
        setInvoiceSearch('');
    };

    const filteredPayments = payments.filter(p => {
        const matchesSearch = (p.invoice?.patient?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.invoice?.invoice_number || '').toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesMethod = filterMethod === 'all' || p.payment_method === filterMethod;
        const matchesDebtor = !filterDebtors || (p.invoice?.patient?.total_cumulative_balance || 0) > 0;
        
        const payDate = new Date(p.payment_date);
        const matchesStartDate = !startDate || payDate >= new Date(startDate);
        const matchesEndDate = !endDate || payDate <= new Date(endDate);

        return matchesSearch && matchesMethod && matchesDebtor && matchesStartDate && matchesEndDate;
    });

    const filteredInvoices = invoices.filter(inv => 
        inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
        inv.patient?.full_name.toLowerCase().includes(invoiceSearch.toLowerCase())
    );

    const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
    const paginated = filteredPayments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (showPrintView && selectedPaymentForPrint && branch) {
        return (
            <ReceiptPrintView 
                data={selectedPaymentForPrint} 
                branch={branch} 
                onBack={() => setShowPrintView(false)} 
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <DollarSign className="w-8 h-8 text-cyan-600" />
                        Revenue & Payments
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Track payments and financial transactions</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center space-x-2 bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 transition shadow-md"
                >
                    <Plus className="w-5 h-5" />
                    <span>Record Payment</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search transactions..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFilterDebtors(!filterDebtors)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm ${filterDebtors ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                    >
                        <Filter className="w-4 h-4" />
                        <span>{filterDebtors ? 'Showing Patients with Dues' : 'All Patients'}</span>
                    </button>
                    <select
                        value={filterMethod}
                        onChange={(e) => { setFilterMethod(e.target.value); setCurrentPage(1); }}
                        className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-500 font-bold text-gray-600"
                    >
                        <option value="all">All Methods</option>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="eft">EFT / Transfer</option>
                        <option value="wallet">Mobile Wallet</option>
                    </select>
                    <div className="flex bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1 shrink-0">
                        <button
                            onClick={handleExportExcel}
                            className="p-2 text-green-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition"
                            title="Export to Excel"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="p-2 text-red-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition"
                            title="Export to PDF"
                        >
                            <FileJson className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-8 pr-2 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-cyan-500 shadow-sm"
                        />
                    </div>
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-8 pr-2 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-cyan-500 shadow-sm"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Date/Time</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Patient</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-amber-600 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700 font-sans">Patient Debt</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Invoice #</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700 font-sans">Total Bill</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700 font-sans">Payment</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700 font-sans">Bal. After</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Method</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Notes</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredPayments.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">No payments found</td>
                                </tr>
                            ) : (
                                paginated.map((p) => (
                                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                        <td className="px-6 py-4 text-xs text-gray-500 border-r border-b border-gray-200 dark:border-gray-700">
                                            {new Date(p.payment_date).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-[10px] text-gray-400 font-mono tracking-tighter">{p.invoice?.patient?.patient_number}</div>
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{p.invoice?.patient?.full_name}</div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-sm font-black text-amber-600">${(p.invoice?.patient?.total_cumulative_balance || 0).toLocaleString()}</div>
                                            <div className="text-[10px] text-gray-400 uppercase font-bold">Total Remaining</div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm text-gray-600 border-r border-b border-gray-200 dark:border-gray-700">
                                            {p.invoice?.invoice_number}
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-400">
                                            ${(p.invoice?.total_amount || 0).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-sm font-bold text-cyan-600">${p.amount.toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-sm font-bold text-amber-600">${(p.invoice?.balance || 0).toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                                {p.payment_method === 'cash' ? <Banknote className="w-3 h-3 text-green-600" /> :
                                                    p.payment_method === 'card' ? <CreditCard className="w-3 h-3 text-blue-600" /> :
                                                        <Wallet className="w-3 h-3 text-purple-600" />}
                                                {p.payment_method.toUpperCase()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 italic max-w-xs truncate border-r border-b border-gray-200 dark:border-gray-700">
                                            {p.notes || '-'}
                                        </td>
                                        <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                            <button
                                                onClick={() => {
                                                    setSelectedPaymentForPrint(p);
                                                    setShowPrintView(true);
                                                }}
                                                className="p-1 hover:text-cyan-600 transition"
                                                title="Print Receipt"
                                            >
                                                <Printer className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredPayments.length > 0 && (
                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4 font-sans">
                        <div className="flex items-center space-x-4">
                            <p className="text-xs text-gray-500">
                                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredPayments.length)} of {filteredPayments.length}
                            </p>
                            <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                                <select
                                    value={itemsPerPage === filteredPayments.length ? 'all' : itemsPerPage}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'all') {
                                            setItemsPerPage(filteredPayments.length || 1);
                                        } else {
                                            setItemsPerPage(Number(val));
                                        }
                                        setCurrentPage(1);
                                    }}
                                    className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-cyan-500"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value="all">ALL</option>
                                </select>
                            </div>
                        </div>
                        
                        {itemsPerPage < filteredPayments.length && totalPages > 1 && (
                            <div className="flex gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                                >
                                    <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                </button>
                                <div className="flex gap-1">
                                    {[...Array(totalPages)].map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setCurrentPage(i + 1)}
                                            className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-cyan-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                                >
                                    <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-6 h-6 text-cyan-600" />
                                Record Payment
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="relative">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Invoice (Search by Patient or Invoice #) *</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        type="text"
                                        placeholder="Type patient name or invoice number..."
                                        value={invoiceSearch}
                                        onFocus={() => setIsDropdownOpen(true)}
                                        onChange={(e) => {
                                            setInvoiceSearch(e.target.value);
                                            setIsDropdownOpen(true);
                                            if (!e.target.value) setFormData({ ...formData, invoice_id: '' });
                                        }}
                                        className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        required
                                    />
                                    {isDropdownOpen && (
                                        <div className="absolute z-[60] left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                            {filteredInvoices.length > 0 ? (
                                                filteredInvoices.map((inv) => (
                                                    <button
                                                        key={inv.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData({ ...formData, invoice_id: inv.id });
                                                            setInvoiceSearch(`${inv.invoice_number} - ${inv.patient?.full_name}`);
                                                            setIsDropdownOpen(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 border-b border-gray-100 dark:border-gray-700 last:border-0 transition"
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <div className="text-sm font-bold text-gray-900 dark:text-white">{inv.invoice_number}</div>
                                                                <div className="text-xs text-gray-500">{inv.patient?.full_name}</div>
                                                            </div>
                                                            <div className="text-xs font-bold text-cyan-600 text-right">
                                                                <div>Bill: ${inv.total_amount.toLocaleString()}</div>
                                                                <div className="text-[10px] text-amber-600">Bal: ${(inv.balance || 0).toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-4 py-3 text-sm text-gray-500 text-center">No matching invoices found</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {formData.invoice_id && (
                                    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex justify-between text-xs font-medium">
                                        <div className="text-gray-500">Current Balance:</div>
                                        <div className="text-amber-600 font-bold">
                                            ${(invoices.find(i => i.id === formData.invoice_id)?.balance || 0).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                                {isDropdownOpen && (
                                    <div 
                                        className="fixed inset-0 z-[55]" 
                                        onClick={() => setIsDropdownOpen(false)}
                                    ></div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Amount *</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</div>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Method *</label>
                                <select
                                    value={formData.payment_method}
                                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                >
                                    <option value="cash">Cash</option>
                                    <option value="card">Card</option>
                                    <option value="eft">EFT / Bank Transfer</option>
                                    <option value="medical_aid">Medical Aid</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={2}
                                    placeholder="e.g., Reference number, partial payment reason..."
                                />
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Processing...' : 'Record Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
