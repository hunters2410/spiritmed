import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
    Plus, Search, CreditCard, Trash2, X, 
    Briefcase, ChevronLeft, ChevronRight, Edit3, Printer,
    CheckCircle, Filter, Calendar
} from 'lucide-react';
import { SearchDropdown } from '../components/SearchDropdown';
import { BillPrintView } from '../components/BillPrintView';

interface BillItem {
    id?: string;
    procedure_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface PatientBill {
    id: string;
    patient_id: string;
    branch_id: string;
    bill_number: string;
    bill_date: string;
    payment_method: string;
    medical_aid_id?: string;
    total_amount: number;
    status: 'pending' | 'invoiced' | 'cancelled';
    converted_invoice_id?: string;
    notes?: string;
    patient: {
        full_name: string;
        patient_number: string;
        medical_aid_id?: string;
        email?: string;
    };
    patient_bill_items: BillItem[];
}

const labelCls = "block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5";

export function PatientBills() {
    const { profile } = useAuth();
    const [bills, setBills] = useState<PatientBill[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [procedures, setProcedures] = useState<any[]>([]);
    const [branch, setBranch] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [editingBillId, setEditingBillId] = useState<string | null>(null);
    const [showPrintView, setShowPrintView] = useState(false);
    const [selectedBillForPrint, setSelectedBillForPrint] = useState<PatientBill | null>(null);
    const [filterMethod, setFilterMethod] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const itemsPerPage = 8;

    const [formData, setFormData] = useState({
        patient_id: '',
        payment_method: 'cash',
        medical_aid_id: '',
        notes: '',
        items: [] as BillItem[]
    });

    useEffect(() => {
        if (profile?.branch_id) {
            loadBills();
            loadPatients();
            loadProcedures();
            loadBranch();
        }
    }, [profile]);

    const loadBills = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('patient_bills')
                .select(`
                    *,
                    patient:patients(full_name, patient_number, medical_aid_id, email),
                    patient_bill_items(*)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setBills(data || []);
        } catch (error) {
            console.error('Error loading bills:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPatients = async () => {
        const { data } = await supabase.from('patients').select('id, full_name, patient_number, medical_aid_id').eq('status', 'active');
        setPatients(data || []);
    };

    const loadProcedures = async () => {
        const { data } = await supabase.from('payment_procedures').select('*').order('name');
        setProcedures(data || []);
    };

    const loadBranch = async () => {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('branches').select('*').eq('id', profile.branch_id).single();
        setBranch(data);
    };

    const handlePatientSelect = (id: string) => {
        const patient = patients.find(p => p.id === id);
        setFormData(prev => ({ 
            ...prev, 
            patient_id: id,
            medical_aid_id: patient?.medical_aid_id || '',
            payment_method: patient?.medical_aid_id ? 'medical_aid' : prev.payment_method
        }));
    };

    const addProcedure = (procId: string) => {
        const proc = procedures.find(p => p.id === procId);
        if (!proc) return;

        setFormData(prev => ({
            ...prev,
            items: [...prev.items, {
                procedure_id: proc.id,
                description: proc.name,
                quantity: 1,
                unit_price: proc.price,
                total_price: proc.price
            }]
        }));
    };

    const removeItem = (index: number) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const updateItemQuantity = (index: number, qty: number) => {
        setFormData(prev => {
            const next = [...prev.items];
            next[index] = { 
                ...next[index], 
                quantity: qty, 
                total_price: qty * next[index].unit_price 
            };
            return { ...prev, items: next };
        });
    };

    const calculateTotal = () => {
        return formData.items.reduce((sum, item) => sum + item.total_price, 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.patient_id || formData.items.length === 0) return;

        try {
            setSubmitting(true);
            const total = calculateTotal();
            
            if (editingBillId) {
                // Update existing bill
                const { error: billErr } = await supabase
                    .from('patient_bills')
                    .update({
                        patient_id: formData.patient_id,
                        payment_method: formData.payment_method,
                        medical_aid_id: formData.medical_aid_id || null,
                        total_amount: total,
                        notes: formData.notes
                    })
                    .eq('id', editingBillId);

                if (billErr) throw billErr;

                // Simple approach: delete all items and re-insert
                await supabase.from('patient_bill_items').delete().eq('bill_id', editingBillId);
                const { error: itemsErr } = await supabase
                    .from('patient_bill_items')
                    .insert(formData.items.map(item => ({
                        bill_id: editingBillId,
                        procedure_id: item.procedure_id,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.total_price
                    })));

                if (itemsErr) throw itemsErr;
            } else {
                // Create new bill
                const billNumber = `BILL-${Date.now().toString().slice(-6)}`;
                const { data: bill, error: billErr } = await supabase
                    .from('patient_bills')
                    .insert([{
                        branch_id: profile?.branch_id,
                        patient_id: formData.patient_id,
                        bill_number: billNumber,
                        payment_method: formData.payment_method,
                        medical_aid_id: formData.medical_aid_id || null,
                        total_amount: total,
                        status: 'pending',
                        notes: formData.notes,
                        created_by: profile?.id
                    }])
                    .select()
                    .single();

                if (billErr) throw billErr;

                const { error: itemsErr } = await supabase
                    .from('patient_bill_items')
                    .insert(formData.items.map(item => ({
                        bill_id: bill.id,
                        procedure_id: item.procedure_id,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.total_price
                    })));

                if (itemsErr) throw itemsErr;
            }

            setShowModal(false);
            resetForm();
            loadBills();
        } catch (error) {
            console.error('Error saving bill:', error);
            alert('Failed to save bill');
        } finally {
            setSubmitting(false);
        }
    };

    const openEdit = (bill: PatientBill) => {
        if (bill.status !== 'pending') {
            alert('Cannot edit a bill that has been invoiced or cancelled.');
            return;
        }
        setEditingBillId(bill.id);
        setFormData({
            patient_id: bill.patient_id,
            payment_method: bill.payment_method,
            medical_aid_id: bill.medical_aid_id || '',
            notes: bill.notes || '',
            items: bill.patient_bill_items.map(item => ({
                procedure_id: item.procedure_id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price
            }))
        });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        const bill = bills.find(b => b.id === id);
        if (bill?.status === 'invoiced') {
            if (!confirm('This bill has already been converted to an invoice. Deleting it will not remove the invoice. Continue?')) return;
        } else {
            if (!confirm('Are you sure you want to delete this bill?')) return;
        }

        try {
            setLoading(true);
            const { error } = await supabase.from('patient_bills').delete().eq('id', id);
            if (error) throw error;
            loadBills();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Failed to delete bill');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            patient_id: '',
            payment_method: 'cash',
            medical_aid_id: '',
            notes: '',
            items: []
        });
        setEditingBillId(null);
    };

    const convertToInvoice = async (bill: PatientBill) => {
        if (bill.status === 'invoiced') {
            alert('This bill has already been invoiced.');
            return;
        }
        if (!confirm('Convert this bill to a finalized invoice?')) return;

        try {
            setSubmitting(true);
            const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

            const { data: invoice, error: invErr } = await supabase
                .from('invoices')
                .insert([{
                    branch_id: bill.branch_id,
                    patient_id: bill.patient_id,
                    invoice_number: invoiceNumber,
                    subtotal: bill.total_amount,
                    total_amount: bill.total_amount,
                    status: 'unpaid',
                    due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    created_by: profile?.id
                }])
                .select()
                .single();

            if (invErr) throw invErr;

            const { error: itemsErr } = await supabase
                .from('invoice_items')
                .insert(bill.patient_bill_items.map(item => ({
                    invoice_id: invoice.id,
                    description: item.description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total_price: item.total_price
                })));

            if (itemsErr) throw itemsErr;

            const { error: billUpdateErr } = await supabase
                .from('patient_bills')
                .update({ 
                    status: 'invoiced',
                    converted_invoice_id: invoice.id 
                })
                .eq('id', bill.id);

            if (billUpdateErr) throw billUpdateErr;

            loadBills();
            alert('Bill converted to invoice successfully!');
        } catch (error) {
            console.error('Conversion error:', error);
            alert('Failed to convert bill to invoice');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePrint = (bill: PatientBill) => {
        const fullBill = bills.find(b => b.id === bill.id);
        if (fullBill) {
            setSelectedBillForPrint(fullBill);
            setShowPrintView(true);
        }
    };

    if (showPrintView && selectedBillForPrint && branch) {
        return (
            <BillPrintView 
                data={selectedBillForPrint} 
                branch={branch} 
                doctorSignature={profile?.signature_url || undefined}
                onBack={() => setShowPrintView(false)} 
            />
        );
    }

    const filteredBills = bills.filter(b => {
        const matchesSearch = b.bill_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             b.patient?.full_name.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesMethod = filterMethod === 'all' || b.payment_method === filterMethod;
        
        const bDate = new Date(b.bill_date);
        const matchesStartDate = !startDate || bDate >= new Date(startDate);
        const matchesEndDate = !endDate || bDate <= new Date(endDate);
        
        const matchesStatus = filterStatus === 'all' || b.status === filterStatus;
        
        return matchesSearch && matchesMethod && matchesStartDate && matchesEndDate && matchesStatus;
    });

    const paginated = filteredBills.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(filteredBills.length / itemsPerPage);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-6">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-lg shadow-lg">
                            <CreditCard className="w-5 h-5 text-white" />
                        </div>
                        Patient Bills
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm font-medium">Manage pro-forma billing records</p>
                </div>
                <button 
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all font-bold text-sm shadow-md"
                >
                    <Plus className="w-4 h-4" /> Create Bill
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="relative flex-1 md:col-span-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search bills..." 
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xs" 
                    />
                </div>

                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select
                        value={filterMethod}
                        onChange={e => { setFilterMethod(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xs appearance-none font-bold uppercase tracking-wider"
                    >
                        <option value="all">All Methods</option>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="medical_aid">Medical Aid</option>
                        <option value="bank_transfer">Bank Transfer</option>
                    </select>
                </div>

                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select
                        value={filterStatus}
                        onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xs appearance-none font-bold uppercase tracking-wider"
                    >
                        <option value="all">All Status</option>
                        <option value="pending">Pending</option>
                        <option value="invoiced">Invoiced</option>
                    </select>
                </div>

                <div className="flex gap-2 md:col-span-1">
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                            type="date" 
                            value={startDate}
                            onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-[10px] font-bold"
                            placeholder="Start"
                        />
                    </div>
                </div>

                <div className="flex gap-2 md:col-span-1">
                    <div className="relative flex-1">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                            type="date" 
                            value={endDate}
                            onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-[10px] font-bold"
                            placeholder="End"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse table-auto divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                        <tr className="text-gray-500 font-black text-[10px] uppercase tracking-widest border-b border-gray-200 dark:border-gray-700">
                            <th className="px-4 py-4 border-r border-gray-200 dark:border-gray-700">Bill #</th>
                            <th className="px-4 py-4 border-r border-gray-200 dark:border-gray-700">Patient</th>
                            <th className="px-4 py-4 border-r border-gray-200 dark:border-gray-700">Date</th>
                            <th className="px-4 py-4 border-r border-gray-200 dark:border-gray-700">Payment Method</th>
                            <th className="px-4 py-4 border-r border-gray-200 dark:border-gray-700 text-right">Amount</th>
                            <th className="px-4 py-4 border-r border-gray-200 dark:border-gray-700 text-center">Status</th>
                            <th className="px-4 py-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                        {loading && bills.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">Loading...</td></tr>
                        ) : paginated.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 font-bold uppercase tracking-widest text-[10px]">No records found</td></tr>
                        ) : paginated.map((bill) => (
                            <tr key={bill.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors border-b border-gray-200 dark:divide-gray-700">
                                <td className="px-4 py-3 font-mono font-bold text-blue-600 border-r border-gray-200 dark:border-gray-700">{bill.bill_number}</td>
                                <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                    <div className="font-bold text-gray-900 dark:text-white uppercase truncate max-w-[150px]">{bill.patient?.full_name}</div>
                                    <div className="text-[10px] text-gray-400 font-mono">{bill.patient?.patient_number}</div>
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs border-r border-gray-200 dark:border-gray-700">
                                    {new Date(bill.bill_date).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                    <span className="text-[10px] font-bold uppercase py-0.5 px-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                                        {bill.payment_method.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-black text-gray-900 dark:text-white text-right border-r border-gray-200 dark:border-gray-700">
                                    ${bill.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td className="px-4 py-3 text-center border-r border-gray-200 dark:border-gray-700">
                                    <span className={`text-[10px] font-black uppercase py-0.5 px-2 rounded-full ${
                                        bill.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                        bill.status === 'invoiced' ? 'bg-emerald-100 text-emerald-700' :
                                        'bg-rose-100 text-rose-700'
                                    }`}>
                                        {bill.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex justify-center gap-1">
                                        <button onClick={() => handlePrint(bill)} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors" title="Print Bill"><Printer className="w-4 h-4" /></button>
                                        <button onClick={() => openEdit(bill)} className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors" title="Edit Bill"><Edit3 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(bill.id)} className="p-1.5 text-gray-400 hover:text-rose-600 transition-colors" title="Delete Bill"><Trash2 className="w-4 h-4" /></button>
                                        {bill.status === 'pending' && (
                                            <button onClick={() => convertToInvoice(bill)} className="p-1.5 text-emerald-500 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 rounded transition-colors" title="Convert to Invoice"><CheckCircle className="w-4 h-4" /></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {totalPages > 1 && (
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-xs">
                        <div className="text-gray-400 font-bold uppercase tracking-widest text-[9px]">
                            Showing {(currentPage-1)*itemsPerPage + 1} - {Math.min(currentPage*itemsPerPage, filteredBills.length)} of {filteredBills.length}
                        </div>
                        <div className="flex gap-1">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded disabled:opacity-30 flex items-center gap-1 hover:bg-gray-50 transition-all font-bold uppercase text-[9px]">
                                <ChevronLeft className="w-3 h-3" /> Prev
                            </button>
                            {[...Array(totalPages)].map((_, i) => (
                                <button key={i} onClick={() => setCurrentPage(i+1)} className={`w-6 h-6 rounded flex items-center justify-center font-bold tracking-tighter ${currentPage === i+1 ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 text-gray-500 px-1'}`}>
                                    {i+1}
                                </button>
                            ))}
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded disabled:opacity-30 flex items-center gap-1 hover:bg-gray-50 transition-all font-bold uppercase text-[9px]">
                                Next <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-lg font-black uppercase text-gray-900 dark:text-white tracking-tight">{editingBillId ? 'Edit Bill' : 'New Bill'}</h2>
                                <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 opacity-70">Healthcare Financials</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <SearchDropdown 
                                    label="Patient"
                                    placeholder="Select patient..."
                                    items={patients}
                                    selectedId={formData.patient_id}
                                    onSelect={handlePatientSelect}
                                    displayFn={(p) => `${p.full_name} (${p.patient_number})`}
                                />

                                <div>
                                    <label className={labelCls}>Payment Method</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['cash', 'card', 'medical_aid'].map(m => (
                                            <button 
                                                key={m}
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, payment_method: m }))}
                                                className={`py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${
                                                    formData.payment_method === m 
                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                                                    : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500'
                                                }`}
                                            >
                                                {m.replace('_', ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {formData.payment_method === 'medical_aid' && (
                                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 rounded-xl flex items-center gap-3">
                                        <div className="p-1.5 bg-emerald-200 dark:bg-emerald-800 rounded-lg"><Briefcase className="w-4 h-4 text-emerald-700" /></div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-emerald-800">Medical Aid Policy</p>
                                            <p className="text-[9px] text-emerald-600 italic">Bill will be sent to the patient's provider.</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-6">
                                <SearchDropdown 
                                    label="Items & Procedures"
                                    placeholder="Add service..."
                                    items={procedures}
                                    onSelect={addProcedure}
                                    displayFn={(p) => `${p.name} ($${p.price})`}
                                />

                                <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col min-h-[250px] text-xs">
                                    <div className="bg-gray-50 dark:bg-gray-900/50 p-2 border-b border-gray-100 dark:border-gray-700 flex justify-between font-black uppercase tracking-widest text-[9px] text-gray-400">
                                        <span>Invoice Items</span>
                                        <span className="text-blue-600">{formData.items.length}</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                        {formData.items.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2 font-black uppercase text-[10px]">
                                                <Plus className="w-6 h-6 opacity-20" />
                                                <span>No items added</span>
                                            </div>
                                        ) : formData.items.map((item, idx) => (
                                            <div key={idx} className="bg-white dark:bg-gray-700 p-2 rounded-lg border border-gray-100 dark:border-gray-600 flex items-center justify-between group shadow-sm">
                                                <div className="truncate max-w-[120px]">
                                                    <p className="font-bold text-gray-800 dark:text-white uppercase truncate">{item.description}</p>
                                                    <p className="text-[9px] text-gray-400 font-mono tracking-tighter">${item.unit_price} x {item.quantity}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center border border-gray-100 dark:border-gray-600 rounded overflow-hidden">
                                                        <button type="button" onClick={() => updateItemQuantity(idx, Math.max(1, item.quantity - 1))} className="w-5 h-5 bg-gray-50 dark:bg-gray-800 text-[10px] font-black">-</button>
                                                        <span className="px-2 font-black text-[10px] min-w-[20px] text-center">{item.quantity}</span>
                                                        <button type="button" onClick={() => updateItemQuantity(idx, item.quantity + 1)} className="w-5 h-5 bg-gray-50 dark:bg-gray-800 text-[10px] font-black">+</button>
                                                    </div>
                                                    <button type="button" onClick={() => removeItem(idx)} className="text-rose-400 hover:text-rose-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black text-gray-400 uppercase">Total Bill</span>
                                            <span className="text-xl font-black text-blue-600">${calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                            <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-black uppercase text-gray-500 hover:bg-gray-50">Cancel</button>
                            <button 
                                onClick={handleSubmit}
                                disabled={submitting || !formData.patient_id || formData.items.length === 0}
                                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-black uppercase shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50"
                            >
                                {submitting ? 'Processing...' : 'Save Bill'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
