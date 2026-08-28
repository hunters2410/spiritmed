import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllPatients } from '../utils/patientUtils';
import { 
    Plus, Search, CreditCard, Trash2, X, 
    ChevronLeft, ChevronRight, Printer,
    CheckCircle, Filter, Calendar, Pencil, DollarSign,
    Tag, Receipt, FileSpreadsheet, FileJson
} from 'lucide-react';
import { SearchDropdown } from '../components/SearchDropdown';
import { EstimatePrintView } from '../components/EstimatePrintView';

import { useToast } from '../contexts/ToastContext';
import { logActivity } from '../utils/auditLogger';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

interface BillItem {
    id?: string;
    procedure_id?: string;
    code?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface PatientBill {
    id: string;
    patient_id?: string;
    branch_id: string;
    estimate_number: string;
    estimate_date: string;
    payment_method: string;
    medical_aid_id?: string;
    medical_aid_amount?: number;
    shortfall_amount?: number;
    total_amount: number;
    discount_amount: number;
    status: 'pending' | 'invoiced' | 'cancelled';
    converted_invoice_id?: string;
    notes?: string;
    patient?: {
        full_name: string;
        patient_number: string;
        medical_aid_id?: string;
        email?: string;
    };
    estimate_bill_items: BillItem[];
}

const labelCls = "block text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5";

export function EstimateBills() {
    const { profile, hasPermission } = useAuth();
    const { showToast } = useToast();
    const [bills, setBills] = useState<PatientBill[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [procedures, setProcedures] = useState<any[]>([]);
    const [branch, setBranch] = useState<any>(null);
    const [medicalAids, setMedicalAids] = useState<any[]>([]);
    const [filterMedicalAid, setFilterMedicalAid] = useState('all');
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [editingBillId, setEditingBillId] = useState<string | null>(null);
    const [isConverting, setIsConverting] = useState(false);
    const [showPrintView, setShowPrintView] = useState(false);
    const [selectedBillForPrint, setSelectedBillForPrint] = useState<PatientBill | null>(null);
    const [estimateIdFromUrl, setEstimateIdFromUrl] = useState<string | null>(null);
    const [filterMethod, setFilterMethod] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [timeRange, setTimeRange] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const itemsPerPage = 8;

    const [formData, setFormData] = useState({
        patient_id: '',
        estimate_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash',
        medical_aid_id: '',
        shortfall_amount: '0',
        medical_aid_amount: '0',
        discount: '0',
        notes: '',
        items: [] as BillItem[]
    });

    useEffect(() => {
        if (profile) {
            loadBills();
            loadPatients();
            loadProcedures();
            loadBranch();
            loadMedicalAids();
        }

        // Check if URL is /estimates/invoice/{id} — restore estimate print view on refresh
        const pathParts = window.location.pathname.split('/');
        if (pathParts[1] === 'estimates' && pathParts[2] === 'invoice' && pathParts[3]) {
            setEstimateIdFromUrl(pathParts[3]);
        }
    }, [profile]);

    // Recalculate Medical Aid split when total changes
    useEffect(() => {
        if (formData.payment_method === 'medical_aid') {
            const total = calculateTotal();
            const shortfall = parseFloat(formData.shortfall_amount) || 0;
            const medicalAidAmt = Math.max(0, total - shortfall).toFixed(2);
            
            if (medicalAidAmt !== formData.medical_aid_amount) {
                setFormData(prev => ({
                    ...prev,
                    medical_aid_amount: medicalAidAmt
                }));
            }
        }
    }, [formData.items, formData.discount, formData.payment_method, formData.shortfall_amount]);

    const handleTimeRangeChange = (range: string) => {
        setTimeRange(range);
        if (range === 'all') {
            setStartDate('');
            setEndDate('');
            return;
        }
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - parseInt(range));
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
        setCurrentPage(1);
    };

    const loadBills = async () => {
        try {
            setLoading(true);
            let allEstimates: any[] = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                let query = supabase
                    .from('estimate_bills')
                    .select(`
                        *,
                        patient:patients(full_name, patient_number, medical_aid_id, email, medical_aid:medical_aids(name)),
                        estimate_bill_items(*)
                    `)
                    .order('created_at', { ascending: false })
                    .range(from, from + pageSize - 1);

                if (profile?.role !== 'super_admin' && profile?.branch_id) {
                    query = query.eq('branch_id', profile.branch_id);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allEstimates = allEstimates.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }
            setBills(allEstimates);
        } catch (error) {
            console.error('Error loading bills:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPatients = async () => {
        const data = await fetchAllPatients({
            branchId: profile?.branch_id,
            select: 'id, full_name, patient_number, medical_aid_id',
            activeOnly: true
        });
        setPatients(data || []);
    };

    const loadProcedures = async () => {
        const { data } = await supabase.from('payment_procedures').select('*').order('name');
        setProcedures(data || []);
    };

    const handleExportExcel = () => {
        const data = filteredBills.map(inv => ({
            'Estimate #': inv.estimate_number,
            'Date': new Date(inv.estimate_date).toLocaleDateString(),
            'Patient': inv.patient?.full_name || 'N/A',
            'Method': inv.payment_method.replace('_', ' ').toUpperCase(),
            'Total Amount': inv.total_amount,
            'Status': inv.status.toUpperCase()
        }));
        exportToExcel(data, 'spiritmed_estimates');
    };

    const handleExportPDF = () => {
        const headers = ['#', 'Estimate #', 'Date', 'Patient', 'Method', 'Total Amount', 'Status'];
        const data = filteredBills.map((inv, i) => [
            i + 1,
            inv.estimate_number,
            new Date(inv.estimate_date).toLocaleDateString(),
            inv.patient?.full_name || 'N/A',
            inv.payment_method.replace('_', ' ').toUpperCase(),
            `$${inv.total_amount.toLocaleString()}`,
            inv.status.toUpperCase()
        ]);
        exportToPDF(headers, data, 'Spiritmed Estimate Bill List', 'spiritmed_estimates');
    };

    const loadBranch = async () => {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('branches').select('*').eq('id', profile.branch_id).single();
        setBranch(data);
    };

    const loadMedicalAids = async () => {
        try {
            const { data, error } = await supabase
                .from('medical_aids')
                .select('*')
                .order('name');
            if (error) throw error;
            setMedicalAids(data || []);
        } catch (error) {
            console.error('Error loading medical aids:', error);
        }
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
                code: proc.code,
                description: proc.name,
                quantity: 1,
                unit_price: proc.price,
                total_price: proc.price
            }]
        }));
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, {
                description: '',
                quantity: 1,
                unit_price: 0,
                total_price: 0
            }]
        }));
    };

    const updateItem = (index: number, field: string, value: any) => {
        setFormData(prev => {
            const next = [...prev.items];
            next[index] = { ...next[index], [field]: value };
            
            if (field === 'quantity' || field === 'unit_price') {
                const qty = field === 'quantity' ? value : next[index].quantity;
                const price = field === 'unit_price' ? value : next[index].unit_price;
                next[index].total_price = qty * price;
            }
            
            return { ...prev, items: next };
        });
    };

    const removeItem = (index: number) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const calculateTotal = () => {
        const subtotal = formData.items.reduce((sum, item) => sum + item.total_price, 0);
        const discount = parseFloat(formData.discount) || 0;
        return Math.max(0, subtotal - discount);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isConverting && !formData.patient_id) {
            showToast('Please select a patient before converting to an invoice', 'warning');
            return;
        }

        if (formData.items.length === 0) return;

        try {
            setSubmitting(true);
            const total = calculateTotal();
            
            if (editingBillId) {
                // Update existing bill
                const { error: billErr } = await supabase
                    .from('estimate_bills')
                    .update({
                        patient_id: formData.patient_id,
                        estimate_date: formData.estimate_date || new Date().toISOString().split('T')[0],
                        payment_method: formData.payment_method,
                        medical_aid_id: formData.medical_aid_id || null,
                        medical_aid_amount: parseFloat(formData.medical_aid_amount) || 0,
                        shortfall_amount: parseFloat(formData.shortfall_amount) || 0,
                        total_amount: total,
                        discount_amount: parseFloat(formData.discount) || 0,
                        notes: formData.notes
                    })
                    .eq('id', editingBillId);

                if (billErr) throw billErr;

                // Simple approach: delete all items and re-insert
                await supabase.from('estimate_bill_items').delete().eq('estimate_id', editingBillId);
                const { error: itemsErr } = await supabase
                    .from('estimate_bill_items')
                    .insert(formData.items.map(item => ({
                        estimate_id: editingBillId,
                        procedure_id: item.procedure_id,
                        code: item.code,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.total_price
                    })));

                if (itemsErr) throw itemsErr;
            } else {
                // Create new bill
                const billNumber = `INV-${Date.now().toString().slice(-6)}`;
                const { data: bill, error: billErr } = await supabase
                    .from('estimate_bills')
                    .insert([{
                        branch_id: profile?.branch_id,
                        patient_id: formData.patient_id || null,
                        estimate_number: billNumber,
                        estimate_date: formData.estimate_date || new Date().toISOString().split('T')[0],
                        payment_method: formData.payment_method,
                        medical_aid_id: formData.medical_aid_id || null,
                        medical_aid_amount: parseFloat(formData.medical_aid_amount) || 0,
                        shortfall_amount: parseFloat(formData.shortfall_amount) || 0,
                        total_amount: total,
                        discount_amount: parseFloat(formData.discount) || 0,
                        status: 'pending',
                        notes: formData.notes,
                        created_by: profile?.id
                    }])
                    .select()
                    .single();

                if (billErr) throw billErr;

                const { error: itemsErr } = await supabase
                    .from('estimate_bill_items')
                    .insert(formData.items.map(item => ({
                        estimate_id: bill.id,
                        procedure_id: item.procedure_id,
                        code: item.code,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.total_price
                    })));

                if (itemsErr) throw itemsErr;

                /* Temporarily disabled notification due to RLS issues
                if (staffToNotify && staffToNotify.length > 0) {
                    const patientName = formData.patient_id ? (patients.find(p => p.id === formData.patient_id)?.full_name || 'Patient') : 'Walk-in Patient';
                    for (const staff of staffToNotify) {
                        await notificationService.send({
                            userId: staff.id,
                            title: 'New Bill Created',
                            message: `Pro-forma bill ${billNumber} for ${patientName} ($${total.toLocaleString()}) has been created.`,
                            type: 'info',
                            link: '/estimates',
                            branchId: profile?.branch_id
                        });
                    }
                }
                */
            }

            if (isConverting) {
                await finalizeConversion(editingBillId!, formData, total);
            }

            setShowModal(false);
            resetForm();
            loadBills();
            showToast(isConverting ? 'Estimate converted to Invoice successfully' : (editingBillId ? 'Estimate updated successfully' : 'Estimate created successfully'));
        } catch (error: any) {
            console.error('Error saving bill:', error);
            showToast(error.message || 'Failed to save bill', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const finalizeConversion = async (estimateId: string, data: any, total: number) => {
        const billNumber = `INV-${Date.now().toString().slice(-6)}`;
        
        // Create actual bill
        const { data: actualBill, error: invErr } = await supabase
            .from('bills')
            .insert([{
                branch_id: profile?.branch_id,
                patient_id: data.patient_id || null,
                bill_number: billNumber,
                subtotal: total,
                total_amount: total,
                discount_amount: parseFloat(data.discount) || 0,
                medical_aid_amount: parseFloat(data.medical_aid_amount) || 0,
                shortfall_amount: parseFloat(data.shortfall_amount) || 0,
                payment_method: data.payment_method,
                medical_aid_id: data.medical_aid_id || null,
                status: 'unpaid',
                due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                created_by: profile?.id
            }])
            .select()
            .single();

        if (invErr) throw invErr;

        // Create actual bill items
        const { error: itemsErr } = await supabase
            .from('bill_items')
            .insert(data.items.map((item: any) => ({
                bill_id: actualBill.id,
                code: item.code,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price
            })));

        if (itemsErr) throw itemsErr;

        // Update estimate status
        const { error: billUpdateErr } = await supabase
            .from('estimate_bills')
            .update({ 
                status: 'invoiced',
                converted_invoice_id: actualBill.id 
            })
            .eq('id', estimateId);

        if (billUpdateErr) throw billUpdateErr;
        
        if (profile?.id && profile?.branch_id) {
            await logActivity(supabase, {
                userId: profile.id,
                branchId: profile.branch_id,
                action: 'UPDATE',
                tableName: 'estimate_bills',
                recordId: estimateId,
                details: `Converted estimate to invoice ${billNumber}`
            });
        }
    };

    const openEdit = (bill: PatientBill) => {
        if (bill.status !== 'pending') {
            showToast('Cannot edit a bill that has been invoiced or cancelled.', 'warning');
            return;
        }
        setEditingBillId(bill.id);
        setFormData({
            patient_id: bill.patient_id || '',
            estimate_date: bill.estimate_date ? new Date(bill.estimate_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            payment_method: bill.payment_method,
            medical_aid_id: bill.medical_aid_id || '',
            shortfall_amount: bill.shortfall_amount?.toString() || '0',
            medical_aid_amount: bill.medical_aid_amount?.toString() || '0',
            notes: bill.notes || '',
            discount: (bill.discount_amount || 0).toString(),
            items: bill.estimate_bill_items.map((item: BillItem) => ({
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
            
            // Delete associated items first
            await supabase.from('estimate_bill_items').delete().eq('estimate_id', id);

            const { error } = await supabase.from('estimate_bills').delete().eq('id', id);
            if (error) throw error;

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'DELETE',
                    tableName: 'estimate_bills',
                    recordId: id,
                    details: `Deleted estimate bill`
                });
            }

            showToast('Estimate deleted successfully');
            loadBills();
        } catch (error: any) {
            console.error('Delete error:', error);
            showToast(error.message || 'Failed to delete bill', 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            patient_id: '',
            estimate_date: new Date().toISOString().split('T')[0],
            payment_method: 'cash',
            medical_aid_id: '',
            shortfall_amount: '0',
            medical_aid_amount: '0',
            discount: '0',
            notes: '',
            items: []
        });
        setEditingBillId(null);
        setIsConverting(false);
    };

    const convertToBill = (bill: PatientBill) => {
        if (bill.status === 'invoiced') {
            showToast('This estimate has already been converted to an invoice / bill.', 'warning');
            return;
        }
        setIsConverting(true);
        openEdit(bill);
    };

    const handlePrint = (bill: PatientBill) => {
        const fullBill = bills.find(b => b.id === bill.id);
        if (fullBill) {
            setSelectedBillForPrint(fullBill);
            setShowPrintView(true);
            window.history.pushState({}, '', `/estimates/invoice/${fullBill.id}`);
        }
    };

    const closeEstimatePrint = () => {
        setShowPrintView(false);
        setSelectedBillForPrint(null);
        window.history.pushState({}, '', '/estimates');
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    // Auto-restore estimate view from URL on refresh
    useEffect(() => {
        if (!estimateIdFromUrl || bills.length === 0) return;
        const match = bills.find(b => b.id === estimateIdFromUrl);
        if (match) {
            setSelectedBillForPrint(match);
            setShowPrintView(true);
            setEstimateIdFromUrl(null);
        }
    }, [estimateIdFromUrl, bills]);

    if (showPrintView && selectedBillForPrint && branch) {
        return (
            <EstimatePrintView 
                data={selectedBillForPrint} 
                branch={branch} 
                onBack={closeEstimatePrint} 
            />
        );
    }

    const filteredBills = bills.filter(b => {
        const matchesSearch = b.estimate_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             b.patient?.full_name.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesMethod = filterMethod === 'all' || b.payment_method === filterMethod;
        
        const bDate = new Date(b.estimate_date);
        const matchesStartDate = !startDate || bDate >= new Date(startDate);
        const matchesEndDate = !endDate || bDate <= new Date(endDate);
        
        const matchesStatus = filterStatus === 'all' || b.status === filterStatus;
        const matchesMedicalAid = filterMedicalAid === 'all' || b.medical_aid_id === filterMedicalAid || b.patient?.medical_aid_id === filterMedicalAid;
        
        return matchesSearch && matchesMethod && matchesStartDate && matchesEndDate && matchesStatus && matchesMedicalAid;
    });

    const paginated = filteredBills.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(filteredBills.length / itemsPerPage);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Estimate Bills</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage patient estimate bill records (Quotations)</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }} className="flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-all font-semibold text-sm shadow">
                    <Plus className="w-4 h-4" /> Create Bill
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    {/* Search - 3 cols */}
                    <div className="md:col-span-3 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Search Patient/INV..." 
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs focus:ring-2 focus:ring-blue-500 font-medium transition-all" 
                        />
                    </div>

                    {/* Status & Medical Aid - 3 cols */}
                    <div className="md:col-span-3 grid grid-cols-2 gap-2">
                        <select
                            value={filterStatus}
                            onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-600 uppercase tracking-tight"
                        >
                            <option value="all">Status</option>
                            <option value="pending">Pending</option>
                            <option value="invoiced">Invoiced</option>
                        </select>
                        <select
                            value={filterMedicalAid}
                            onChange={e => { setFilterMedicalAid(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-600 uppercase tracking-tight"
                        >
                            <option value="all">Insurers</option>
                            {medicalAids.map(aid => (
                                <option key={aid.id} value={aid.id}>{aid.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Range Preset - 2 cols */}
                    <div className="md:col-span-2">
                        <select
                            value={timeRange}
                            onChange={(e) => handleTimeRangeChange(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-600"
                        >
                            <option value="all">Time Range</option>
                            <option value="7">Last 7 Days</option>
                            <option value="14">Last 14 Days</option>
                            <option value="21">Last 21 Days</option>
                            <option value="30">Last 30 Days</option>
                            <option value="60">Last 60 Days</option>
                            <option value="90">Last 90 Days</option>
                        </select>
                    </div>

                    {/* Date Filters - 4 cols */}
                    <div className="md:col-span-4 flex gap-2">
                        <div className="relative flex-1">
                            <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                            <input 
                                type="date" 
                                value={startDate}
                                onChange={e => { setStartDate(e.target.value); setTimeRange('custom'); setCurrentPage(1); }}
                                className="w-full pl-7 pr-1 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                            />
                        </div>
                        <div className="relative flex-1">
                            <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                            <input 
                                type="date" 
                                value={endDate}
                                onChange={e => { setEndDate(e.target.value); setTimeRange('custom'); setCurrentPage(1); }}
                                className="w-full pl-7 pr-1 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                            />
                        </div>
                    </div>
                </div>

                {/* Second row: Method & Clear */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <Filter className="w-3.5 h-3.5 text-gray-400" />
                            <select
                                value={filterMethod}
                                onChange={e => { setFilterMethod(e.target.value); setCurrentPage(1); }}
                                className="bg-transparent text-[10px] font-black uppercase text-gray-500 outline-none border-none py-1"
                            >
                                <option value="all">Any Method</option>
                                <option value="cash">Cash</option>
                                <option value="card">Card</option>
                                <option value="medical_aid">Medical Aid</option>
                                <option value="bank_transfer">Bank Transfer</option>
                            </select>
                        </div>

                        {(searchQuery || filterMethod !== 'all' || filterStatus !== 'all' || filterMedicalAid !== 'all' || startDate || endDate) && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setFilterMethod('all');
                                    setFilterStatus('all');
                                    setFilterMedicalAid('all');
                                    setStartDate('');
                                    setEndDate('');
                                    setCurrentPage(1);
                                }}
                                className="text-[10px] text-gray-400 hover:text-rose-500 font-black uppercase tracking-widest flex items-center gap-1 px-2"
                            >
                                <X className="w-3 h-3" /> Reset Filters
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                            <button
                                onClick={handleExportExcel}
                                className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase text-green-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition shadow-sm"
                            >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>Excel</span>
                            </button>
                            <button
                                onClick={handleExportPDF}
                                className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase text-red-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition shadow-sm"
                            >
                                <FileJson className="w-3.5 h-3.5" />
                                <span>PDF</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse border border-gray-200 dark:border-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 border-b-2 border-gray-200 dark:border-gray-700">
                        <tr>
                            <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">INV #</th>
                            <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Patient</th>
                            <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Method</th>
                            <th className="px-5 py-3.5 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Amount</th>
                            <th className="px-5 py-3.5 text-right text-xs font-bold text-amber-500 uppercase tracking-wider">Discount</th>
                            <th className="px-5 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-5 py-3.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                        {loading && bills.length === 0 ? (
                            <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">Loading...</td></tr>
                        ) : paginated.length === 0 ? (
                            <tr><td colSpan={8} className="px-5 py-10 text-center text-sm font-medium text-gray-400">No records found</td></tr>
                        ) : paginated.map((bill) => (
                            <tr key={bill.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                                <td className="px-5 py-4 font-mono font-semibold text-blue-600">{bill.estimate_number}</td>
                                <td className="px-5 py-4">
                                    <div className="font-semibold text-gray-900 dark:text-white">{bill.patient?.full_name || <span className="text-gray-400 italic">Walk-in Patient</span>}</div>
                                    <div className="text-xs text-gray-400 font-mono">{bill.patient?.patient_number || 'N/A'}</div>
                                </td>
                                <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{new Date(bill.estimate_date).toLocaleDateString()}</td>
                                <td className="px-5 py-4">
                                    {bill.payment_method === 'medical_aid' ? (
                                        <span className="inline-block text-xs font-semibold uppercase py-0.5 px-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-md text-blue-600">{(bill.patient as any)?.medical_aid?.name || 'Medical Aid'}</span>
                                    ) : (
                                        <span className="inline-block text-xs font-semibold uppercase py-0.5 px-2.5 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-600 dark:text-gray-400">{bill.payment_method === 'standard' || !bill.payment_method ? 'Cash' : bill.payment_method.replace('_', ' ')}</span>
                                    )}
                                </td>
                                <td className="px-5 py-4 text-right font-bold text-gray-900 dark:text-white">${bill.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="px-5 py-4 text-right font-semibold text-amber-500">${(bill.discount_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="px-5 py-4 text-center">
                                    <span className={`text-xs font-semibold uppercase py-1 px-2.5 rounded-full ${
                                        bill.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                        bill.status === 'invoiced' ? 'bg-emerald-100 text-emerald-700' :
                                        'bg-rose-100 text-rose-700'}`}>{bill.status}</span>
                                </td>
                                <td className="px-5 py-4">
                                    <div className="flex justify-center gap-1">
                                        <button onClick={() => handlePrint(bill)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition" title="Print"><Printer className="w-4 h-4" /></button>
                                        {hasPermission('billing', 'edit') && <button onClick={() => openEdit(bill)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition" title="Edit"><Pencil className="w-4 h-4" /></button>}
                                        {hasPermission('billing', 'delete') && <button onClick={() => handleDelete(bill.id)} className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                                        {bill.status === 'pending' && <button onClick={() => convertToBill(bill)} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition" title="Convert to Invoice"><CheckCircle className="w-4 h-4" /></button>}
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
                    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-lg font-black uppercase text-gray-900 dark:text-white tracking-tight">{editingBillId ? 'Edit Bill' : 'New Bill Estimate'}</h2>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Patient & Date Details */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end px-1">
                                <div className="md:col-span-5 lg:col-span-4">
                                    <SearchDropdown 
                                        label={isConverting ? "Select Patient *" : "Patient (Optional)"}
                                        placeholder={isConverting ? "Patient mandatory for Invoice..." : "Search patient..."}
                                        items={patients}
                                        selectedId={formData.patient_id}
                                        onSelect={handlePatientSelect}
                                        displayFn={(p) => `${p.full_name} (${p.patient_number})`}
                                    />
                                </div>

                                <div className="md:col-span-3 lg:col-span-3">
                                    <label className={labelCls}>Estimate Date</label>
                                    <input
                                        type="date"
                                        value={formData.estimate_date}
                                        onChange={(e) => setFormData({ ...formData, estimate_date: e.target.value })}
                                        className="w-full px-3 h-[38px] border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-xs"
                                        required
                                    />
                                </div>

                                <div className="md:col-span-3 lg:col-span-4">
                                    <label className={labelCls}>Payment Method</label>
                                    <div className="flex gap-1 bg-gray-50 dark:bg-gray-900 p-1 rounded-lg border border-gray-100 dark:border-gray-700">
                                        {['cash', 'medical_aid'].map(m => (
                                            <button 
                                                key={m}
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, payment_method: m }))}
                                                className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition-all ${
                                                    formData.payment_method === m 
                                                    ? 'bg-blue-600 text-white shadow-sm' 
                                                    : 'text-gray-400 hover:bg-white dark:hover:bg-gray-800'
                                                }`}
                                            >
                                                {m.replace('_', ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Medical Aid Section */}
                            {formData.payment_method === 'medical_aid' && (
                                <div className="animate-in fade-in slide-in-from-top-2 grid grid-cols-1 md:grid-cols-12 gap-4 items-end border-t border-b border-gray-100 dark:border-gray-800 py-6 px-1">
                                    <div className="md:col-span-6 lg:col-span-5">
                                        <SearchDropdown
                                            label="Medical Aid Provider"
                                            placeholder="Search provider..."
                                            items={medicalAids}
                                            onSelect={(id) => setFormData({ ...formData, medical_aid_id: id })}
                                            displayFn={(aid) => aid.name}
                                            selectedId={formData.medical_aid_id}
                                        />
                                    </div>

                                    <div className="md:col-span-6 lg:col-span-7 grid grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelCls + " text-blue-600 mb-1"}>Shortfall</label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-500" />
                                                <input
                                                    type="number"
                                                    value={formData.shortfall_amount}
                                                    onChange={(e) => setFormData({ ...formData, shortfall_amount: e.target.value })}
                                                    className="w-full pl-9 pr-4 h-[38px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold text-xs"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className={labelCls + " text-indigo-600 mb-1"}>Insurer Amt</label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-500" />
                                                <input
                                                    type="number"
                                                    value={formData.medical_aid_amount}
                                                    readOnly
                                                    className="w-full pl-9 pr-4 h-[38px] bg-gray-50/50 dark:bg-gray-900/20 border border-gray-100 dark:border-gray-800 rounded-lg outline-none font-bold text-indigo-600 cursor-not-allowed text-xs"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Items Section */}
                            <div className="space-y-4">
                                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="w-full md:w-2/3">
                                        <SearchDropdown 
                                            label="Procedures (Quick Add)"
                                            placeholder="Search code or procedure name..."
                                            items={procedures}
                                            onSelect={addProcedure}
                                            displayFn={(p) => `[${p.code}] ${p.name} ($${p.price})`}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addItem}
                                        className="w-full md:w-auto h-[38px] mt-5 md:mt-2 px-6 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 text-blue-600 rounded-lg transition-all text-[11px] font-black uppercase tracking-widest border border-blue-100 dark:border-blue-800"
                                    >
                                        + Add Custom
                                    </button>
                                </div>

                                <div className="border border-gray-100 dark:border-gray-700 rounded-2xl overflow-hidden bg-white dark:bg-gray-800/50 shadow-sm">
                                    <div className="bg-gray-50 dark:bg-gray-900/80 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Invoice Line Items</h3>
                                        <span className="text-[10px] font-black px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">{formData.items.length} Items</span>
                                    </div>
                                    
                                    <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-[350px] overflow-y-auto">
                                        {formData.items.length === 0 ? (
                                            <div className="py-12 flex flex-col items-center justify-center text-gray-300 animate-pulse">
                                                <Receipt className="w-12 h-12 opacity-10 mb-2" />
                                                <p className="text-[10px] font-black uppercase tracking-widest">No Services Added</p>
                                            </div>
                                        ) : formData.items.map((item, index) => (
                                            <div key={index} className="p-4 grid grid-cols-12 gap-4 items-end group hover:bg-blue-50/10 dark:hover:bg-blue-900/5 transition-colors">
                                                <div className="col-span-12 md:col-span-1">
                                                    <label className="text-[11px] font-black uppercase text-gray-500 block mb-1 tracking-tight">Code</label>
                                                    <input 
                                                        type="text"
                                                        value={item.code || ''}
                                                        onChange={(e) => updateItem(index, 'code', e.target.value)}
                                                        className="w-full px-2 py-2 bg-gray-50 dark:bg-gray-900 border border-transparent rounded-lg text-[10px] font-bold outline-none"
                                                        placeholder="Code..."
                                                    />
                                                </div>
                                                <div className="col-span-12 md:col-span-5">
                                                    <label className="text-[11px] font-black uppercase text-gray-500 block mb-1">Description</label>
                                                    <input 
                                                        type="text"
                                                        value={item.description}
                                                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                                                        className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                        placeholder="Service description..."
                                                    />
                                                </div>
                                                <div className="col-span-4 md:col-span-2">
                                                    <label className="text-[11px] font-black uppercase text-gray-500 block mb-1">Unit Price</label>
                                                    <div className="relative">
                                                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                                        <input 
                                                            type="number"
                                                            value={item.unit_price}
                                                            onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                                            className="w-full pl-6 pr-2 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="col-span-4 md:col-span-2">
                                                    <label className="text-[11px] font-black uppercase text-gray-500 block mb-1">Quantity</label>
                                                    <div className="flex items-center bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                                        <button 
                                                            type="button" 
                                                            onClick={() => updateItem(index, 'quantity', Math.max(1, item.quantity - 1))}
                                                            className="px-2 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors font-black text-gray-400"
                                                        >-</button>
                                                        <input 
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                                                            className="w-10 bg-transparent text-center text-xs font-black focus:ring-0 outline-none"
                                                        />
                                                        <button 
                                                            type="button" 
                                                            onClick={() => updateItem(index, 'quantity', item.quantity + 1)}
                                                            className="px-2 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors font-black text-gray-400"
                                                        >+</button>
                                                    </div>
                                                </div>
                                                <div className="col-span-4 md:col-span-2 flex items-center justify-between pb-1">
                                                    <div className="text-right">
                                                        <label className="text-[11px] font-black uppercase text-gray-500 block mb-1">Total</label>
                                                        <span className="text-xs font-black text-blue-600">${item.total_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => removeItem(index)}
                                                        className="p-2 text-gray-300 hover:text-rose-500 transition-colors bg-gray-50 dark:bg-gray-900 rounded-lg"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Summary Footer */}
                                    <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-t border-gray-100 dark:border-gray-700">
                                        <div className="w-full md:w-64 space-y-4">
                                            <div>
                                                <label className="text-[11px] font-black uppercase text-amber-600 block mb-1 tracking-widest">Global Discount</label>
                                                <div className="relative">
                                                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                                                    <input
                                                        type="number"
                                                        value={formData.discount}
                                                        onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                                                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 font-bold text-xs text-amber-600"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-black uppercase text-gray-500 block mb-1 tracking-widest">Additional Notes</label>
                                                <textarea 
                                                    value={formData.notes}
                                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                                                    placeholder="Remarks..."
                                                />
                                            </div>
                                        </div>

                                        <div className="w-full md:w-auto text-right space-y-1">
                                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Total Valuation</p>
                                            <p className="text-4xl font-black text-blue-600 tracking-tighter">
                                                <span className="text-2xl mr-1 opacity-50">$</span>
                                                {calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-[10px] font-medium text-gray-500 italic">This estimate is valid for 30 days from date of issue.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                            <button 
                                type="button"
                                onClick={() => setShowModal(false)} 
                                className="px-6 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors"
                            >
                                Discard
                            </button>
                            <button 
                                type="submit"
                                disabled={submitting || formData.items.length === 0}
                                className="px-8 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-blue-700 disabled:opacity-50 transition-all active:scale-[0.98]"
                            >
                                {submitting ? 'Saving...' : isConverting ? 'Convert to Invoice' : editingBillId ? 'Update' : 'Save & Print'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
