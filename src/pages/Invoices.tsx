import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Receipt, FileText, Trash2, X, DollarSign, ChevronLeft, ChevronRight, Calendar, Filter, FileSpreadsheet, FileJson } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { emailService } from '../utils/emailService';
import { InvoicePrintView } from '../components/InvoicePrintView';

interface InvoiceItem {
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface Invoice {
    id: string;
    patient_id: string;
    branch_id: string;
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
    paid_amount: number;
    balance: number;
    subtotal: number;
    tax_amount: number;
    status: string;
    due_date: string;
    created_at: string;
    patient: {
        full_name: string;
        patient_number: string;
        email?: string;
        total_cumulative_balance?: number;
    };
    invoice_items: InvoiceItem[];
}

export function Invoices() {
    const { profile } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showPrintView, setShowPrintView] = useState(false);
    const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<Invoice | null>(null);
    const [branch, setBranch] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDebtors, setFilterDebtors] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const [formData, setFormData] = useState({
        patient_id: '',
        due_date: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0],
        items: [{ description: 'General Consultation', quantity: 1, unit_price: 350, total_price: 350 }]
    });

    useEffect(() => {
        loadInvoices();
        loadPatients();
        loadBranch();

        // Check for query params
        const params = new URLSearchParams(window.location.search);
        const patientId = params.get('patientId');
        if (patientId) {
            setFormData(prev => ({ ...prev, patient_id: patientId }));
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

    const loadInvoices = async () => {
        try {
            let query = supabase
                .from('invoices')
                .select(`
          *,
          patient:patients(full_name, patient_number, email, invoices(balance)),
          invoice_items(*)
        `)
                .order('created_at', { ascending: false });

            if (profile?.role !== 'super_admin' && profile?.branch_id) {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;

            const structuredData = (data || []).map((inv: any) => ({
                ...inv,
                patient: {
                    ...inv.patient,
                    total_cumulative_balance: inv.patient?.invoices?.reduce((sum: number, i: any) => sum + (i.balance || 0), 0) || 0
                }
            }));

            setInvoices(structuredData);
        } catch (error) {
            console.error('Error loading invoices:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        const data = filteredInvoices.map(inv => ({
            'Invoice #': inv.invoice_number,
            'Patient': inv.patient?.full_name,
            'Date': new Date(inv.invoice_date).toLocaleDateString(),
            'Total Amount': inv.total_amount,
            'Paid Amount': inv.paid_amount,
            'Balance': inv.balance,
            'Status': inv.status
        }));
        exportToExcel(data, 'spiritmed_invoices');
    };

    const handleExportPDF = () => {
        const headers = ['#', 'Invoice', 'Patient', 'Total', 'Paid', 'Balance', 'Status'];
        const data = filteredInvoices.map((inv, i) => [
            i + 1,
            inv.invoice_number,
            inv.patient?.full_name || 'N/A',
            `$${inv.total_amount.toLocaleString()}`,
            `$${inv.paid_amount.toLocaleString()}`,
            `$${inv.balance.toLocaleString()}`,
            inv.status.toUpperCase()
        ]);
        exportToPDF(headers, data, 'Spiritmed Invoice List', 'spiritmed_invoices');
    };

    const loadPatients = async () => {
        try {
            const { data, error } = await supabase
                .from('patients')
                .select('id, full_name, patient_number, email')
                .eq('status', 'active')
                .order('full_name');
            if (error) throw error;
            setPatients(data || []);
        } catch (error) {
            console.error('Error loading patients:', error);
        }
    };

    const addItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { description: '', quantity: 1, unit_price: 0, total_price: 0 }]
        });
    };

    const removeItem = (index: number) => {
        const newItems = formData.items.filter((_, i) => i !== index);
        setFormData({ ...formData, items: newItems });
    };

    const updateItem = (index: number, field: string, value: any) => {
        const newItems = [...formData.items];
        const item = { ...newItems[index], [field]: value };

        if (field === 'quantity' || field === 'unit_price') {
            item.total_price = item.quantity * item.unit_price;
        }

        newItems[index] = item;
        setFormData({ ...formData, items: newItems });
    };

    const calculateTotal = () => {
        return formData.items.reduce((sum, item) => sum + item.total_price, 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const totalAmount = calculateTotal();
            const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

            // 1. Create Invoice
            const { data: invoiceData, error: invoiceError } = await supabase
                .from('invoices')
                .insert([{
                    patient_id: formData.patient_id,
                    branch_id: profile?.branch_id,
                    invoice_number: invoiceNumber,
                    total_amount: totalAmount,
                    status: 'unpaid',
                    due_date: formData.due_date
                }])
                .select()
                .single();

            if (invoiceError) throw invoiceError;

            // 2. Create Invoice Items
            const { error: itemsError } = await supabase
                .from('invoice_items')
                .insert(formData.items.map(item => ({
                    invoice_id: invoiceData.id,
                    ...item
                })));

            if (itemsError) throw itemsError;

            if (profile?.id && profile?.branch_id && invoiceData) {
                const patient = patients.find(p => p.id === formData.patient_id);
                const patientName = patient?.full_name || formData.patient_id;
                
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'CREATE',
                    tableName: 'invoices',
                    recordId: invoiceData.id,
                    details: `Generated new invoice ${invoiceNumber} for patient: ${patientName}`,
                    newValues: { ...formData, total_amount: totalAmount, invoice_number: invoiceNumber }
                });

                // Trigger Email Notification
                if (patient?.email) {
                    const { data: template } = await supabase
                        .from('email_templates')
                        .select('id')
                        .eq('name', 'Invoice Notification')
                        .maybeSingle();

                    await emailService.sendEmail({
                        recipientEmail: patient.email,
                        recipientName: patient.full_name,
                        subject: `New Invoice ${invoiceNumber}`,
                        body: `Dear ${patient.full_name},\n\nA new invoice for the amount of ${totalAmount.toLocaleString()} has been generated.\n\nThank you.`,
                        templateId: template?.id,
                        placeholders: {
                            patient_name: patient.full_name,
                            invoice_number: invoiceNumber,
                            amount: totalAmount.toLocaleString()
                        },
                        branchId: profile.branch_id,
                        senderId: profile.id,
                        referenceId: invoiceData.id,
                        referenceType: 'invoice'
                    });
                }
            }

            setShowModal(false);
            resetForm();
            loadInvoices();
            alert('Invoice created successfully!');
        } catch (error) {
            console.error('Error creating invoice:', error);
            alert('Failed to create invoice');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            patient_id: '',
            due_date: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0],
            items: [{ description: 'General Consultation', quantity: 1, unit_price: 350, total_price: 350 }]
        });
    };

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch = inv.patient?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            inv.invoice_number.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
        const matchesDebtor = !filterDebtors || (inv.patient?.total_cumulative_balance || 0) > 0;
        
        const invDate = new Date(inv.invoice_date);
        const matchesStartDate = !startDate || invDate >= new Date(startDate);
        const matchesEndDate = !endDate || invDate <= new Date(endDate);

        return matchesSearch && matchesStatus && matchesDebtor && matchesStartDate && matchesEndDate;
    });

    const totalInvoicesAmount = filteredInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const totalPaidAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
    const totalBalanceAmount = filteredInvoices.reduce((sum, inv) => sum + (inv.balance || 0), 0);

    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
    const paginated = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (showPrintView && selectedInvoiceForPrint && branch) {
        return (
            <InvoicePrintView 
                data={selectedInvoiceForPrint} 
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
                        <Receipt className="w-8 h-8 text-emerald-600" />
                        Billing & Invoices
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage patient billing and transaction records</p>
                </div>
                <button
                    onClick={() => window.location.href = '/bills'}
                    className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition shadow-md"
                >
                    <Plus className="w-5 h-5" />
                    <span>Create New Bill</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">Total Invoiced</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">${totalInvoicesAmount.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-green-500 uppercase font-bold mb-1">Total Paid</div>
                    <div className="text-2xl font-bold text-green-600">${totalPaidAmount.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-amber-500 uppercase font-bold mb-1">Total Balance</div>
                    <div className="text-2xl font-bold text-amber-600">${totalBalanceAmount.toLocaleString()}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search invoices..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
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
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                        className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-600"
                    >
                        <option value="all">All Status</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="partially_paid">Partially Paid</option>
                        <option value="paid">Paid</option>
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
                            className="w-full pl-8 pr-2 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-8 pr-2 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">#</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Invoice #</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Patient</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-amber-600 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700 font-sans">Total Debt</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Total Bill</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-green-600 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700 font-sans">Paid</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-amber-600 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700 font-sans">Balance</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-r border-b border-gray-200 dark:border-gray-700">Due Date</th>
                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredInvoices.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">No invoices found</td>
                                </tr>
                            ) : (
                                paginated.map((inv, idx) => (
                                    <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                        <td className="px-6 py-4 font-mono text-sm text-gray-400 border-r border-b border-gray-200 dark:border-gray-700">
                                            {(currentPage - 1) * itemsPerPage + idx + 1}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm font-bold text-gray-900 dark:text-white border-r border-b border-gray-200 dark:border-gray-700">
                                            {inv.invoice_number}
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{inv.patient?.full_name}</div>
                                            <div className="text-[10px] text-gray-400 font-mono tracking-tighter">{inv.patient?.patient_number}</div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-sm font-black text-amber-600">${(inv.patient?.total_cumulative_balance || 0).toLocaleString()}</div>
                                            <div className="text-[10px] text-gray-400 uppercase font-bold">Patient Total</div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-sm font-bold text-gray-900 dark:text-white">${inv.total_amount.toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-sm font-bold text-green-600">${(inv.paid_amount || 0).toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <div className="text-sm font-bold text-amber-600">${(inv.balance || 0).toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-4 border-r border-b border-gray-200 dark:border-gray-700">
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${inv.status === 'paid' ? 'bg-green-100 text-green-700' :
                                                inv.status === 'partially_paid' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>
                                                {inv.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 border-r border-b border-gray-200 dark:border-gray-700">
                                            {new Date(inv.due_date).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => window.location.href = `/payments?invoiceId=${inv.id}`}
                                                    className="p-1 hover:text-emerald-600 transition"
                                                    title="Record Payment"
                                                >
                                                    <DollarSign className="w-4 h-4" />
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        setSelectedInvoiceForPrint(inv);
                                                        setShowPrintView(true);
                                                    }}
                                                    className="p-1 hover:text-blue-600 transition" 
                                                    title="Print Invoice"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredInvoices.length > 0 && (
                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4 font-sans">
                        <div className="flex items-center space-x-4">
                            <p className="text-xs text-gray-500">
                                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredInvoices.length)} of {filteredInvoices.length}
                            </p>
                            <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                                <select
                                    value={itemsPerPage === filteredInvoices.length ? 'all' : itemsPerPage}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'all') {
                                            setItemsPerPage(filteredInvoices.length || 1);
                                        } else {
                                            setItemsPerPage(Number(val));
                                        }
                                        setCurrentPage(1);
                                    }}
                                    className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value="all">ALL</option>
                                </select>
                            </div>
                        </div>
                        
                        {itemsPerPage < filteredInvoices.length && totalPages > 1 && (
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
                                            className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-emerald-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
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
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Receipt className="w-6 h-6 text-emerald-600" />
                                New Invoice
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Patient *</label>
                                    <select
                                        value={formData.patient_id}
                                        onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    >
                                        <option value="">Select Patient</option>
                                        {patients.map(p => (
                                            <option key={p.id} value={p.id}>{p.full_name} ({p.patient_number})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date *</label>
                                    <input
                                        type="date"
                                        value={formData.due_date}
                                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Invoice Items</h3>
                                    <button
                                        type="button"
                                        onClick={addItem}
                                        className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded hover:bg-gray-200 transition"
                                    >
                                        + Add Item
                                    </button>
                                </div>

                                {formData.items.map((item, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-3 items-end">
                                        <div className="col-span-12 md:col-span-6">
                                            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Description</label>
                                            <input
                                                type="text"
                                                value={item.description}
                                                onChange={(e) => updateItem(index, 'description', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                placeholder="e.g., General Consultation"
                                                required
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-2">
                                            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Qty</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={item.quantity}
                                                onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                required
                                            />
                                        </div>
                                        <div className="col-span-4 md:col-span-2">
                                            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Unit Price</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={item.unit_price}
                                                onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                required
                                            />
                                        </div>
                                        <div className="col-span-3 md:col-span-1 border-b py-2 text-right">
                                            <span className="text-xs font-bold text-gray-500">${item.total_price}</span>
                                        </div>
                                        <div className="col-span-1 flex justify-end">
                                            <button
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="text-gray-400 hover:text-red-500 transition mb-2"
                                                disabled={formData.items.length === 1}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col items-end space-y-2 border-t pt-4">
                                <div className="flex gap-4 items-center">
                                    <span className="text-sm text-gray-500">Total Amount:</span>
                                    <span className="text-2xl font-bold text-emerald-600 font-mono">${calculateTotal().toLocaleString()}</span>
                                </div>
                            </div>

                            <div className="flex gap-4">
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
                                    className="flex-1 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Creating...' : 'Finalize Invoice'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
