import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Receipt, FileText, Trash2, X, DollarSign, ChevronLeft, ChevronRight, Calendar, Filter, FileSpreadsheet, FileJson, Pencil, Tag } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { emailService } from '../utils/emailService';
import { BillPrintView } from '../components/BillPrintView';
import { ReceiptPrintView } from '../components/ReceiptPrintView';
import { SearchDropdown } from '../components/SearchDropdown';
import { smsService } from '../utils/smsService';
import { useToast } from '../contexts/ToastContext';
import { ApprovalGate, RequestEditModal } from '../components/ApprovalGate';
import { approvalService, EditApprovalRequest } from '../utils/approvalService';
import { Printer as PrintIcon } from 'lucide-react';
import { accountingSync } from '../utils/accountingSync';


interface BillItem {
    id?: string;
    code?: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface Bill {
    id: string;
    patient_id: string;
    branch_id: string;
    bill_number: string;
    bill_date: string;
    total_amount: number;
    discount_amount: number;
    medical_aid_amount: number;
    shortfall_amount: number;
    paid_amount: number;
    shortfall_balance?: number;
    medical_aid_balance?: number;
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
        phone?: string;
        total_cumulative_balance?: number;
    };
    payment_method?: string;
    medical_aid_id?: string | null;
    medical_aid?: {
        name: string;
    } | null;
    bill_items: BillItem[];
}

export function ActualBills() {
    const { profile, hasPermission } = useAuth();
    const { showToast } = useToast();
    const [bills, setBills] = useState<Bill[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [procedures, setProcedures] = useState<any[]>([]);
    const [medicalAids, setMedicalAids] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBillId, setEditingBillId] = useState<string | null>(null);
    const [showPrintView, setShowPrintView] = useState(false);
    const [selectedBillForPrint, setSelectedBillForPrint] = useState<Bill | null>(null);
    const [branch, setBranch] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDueType, setFilterDueType] = useState('all');
    const [filterDebtors, setFilterDebtors] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [timeRange, setTimeRange] = useState('all');
    const [filterMedicalAid, setFilterMedicalAid] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedBillForPayment, setSelectedBillForPayment] = useState<Bill | null>(null);
    const [showReceiptView, setShowReceiptView] = useState(false);
    const [lastRecordedPayment, setLastRecordedPayment] = useState<any | null>(null);
    const [paymentFormData, setPaymentFormData] = useState({
        amount: '',
        discount: '0',
        payment_method: 'cash',
        target_portion: 'shortfall' as 'shortfall' | 'medical_aid',
        notes: ''
    });

    // Approval gate state (accountant edit flow)
    const [pendingEditBill, setPendingEditBill] = useState<Bill | null>(null);
    const [showBillRequestModal, setShowBillRequestModal] = useState(false);
    const [billApprovalRequest, setBillApprovalRequest] = useState<EditApprovalRequest | null>(null);
    const [isSubmittingBillApproval, setIsSubmittingBillApproval] = useState(false);
    const isAccountant = profile?.role === 'accountant';

    const [formData, setFormData] = useState({
        patient_id: '',
        bill_date: new Date().toISOString().split('T')[0],
        due_date: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0],
        discount: '0',
        payment_method: 'cash',
        medical_aid_id: '',
        shortfall_amount: '0',
        medical_aid_amount: '0',
        items: [] as any[],
        notes: ''
    });

    useEffect(() => {
        loadBills();
        loadPatients();
        loadProcedures();
        loadMedicalAids();
        loadBranch();

        // Check for query params
        const params = new URLSearchParams(window.location.search);
        const patientId = params.get('patientId');
        if (patientId) {
            setFormData(prev => ({ ...prev, patient_id: patientId }));
            setShowModal(true);
        }
        const statusParam = params.get('status');
        if (statusParam) {
            if (statusParam === 'pending' || statusParam === 'unpaid') {
                setFilterStatus('unpaid');
            } else if (statusParam === 'paid') {
                setFilterStatus('paid');
            } else {
                setFilterStatus(statusParam);
            }
        }
        const dueTypeParam = params.get('dueType');
        if (dueTypeParam) {
            setFilterDueType(dueTypeParam);
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

    const filteredBills = bills.filter(inv => {
        const matchesSearch = (inv.patient?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (inv.bill_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (inv.patient?.patient_number || '').toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesStatus = filterStatus === 'all' || 
            (filterStatus === 'unpaid' ? (inv.status === 'unpaid' || inv.status === 'partially_paid') : inv.status === filterStatus);
        const matchesDebtor = !filterDebtors || (inv.patient?.total_cumulative_balance || 0) > 0;
        const matchesMedicalAid = filterMedicalAid === 'all' || inv.medical_aid_id === filterMedicalAid;
        const matchesDueType = filterDueType === 'all' ||
            (filterDueType === 'medical_aid' ? (inv.medical_aid_balance || 0) > 0 :
             filterDueType === 'shortfall' ? (inv.shortfall_balance || 0) > 0 : true);
        
        const invDate = new Date(inv.bill_date);
        const matchesStartDate = !startDate || invDate >= new Date(startDate);
        const matchesEndDate = !endDate || invDate <= new Date(endDate);

        return matchesSearch && matchesStatus && matchesDebtor && matchesMedicalAid && matchesDueType && matchesStartDate && matchesEndDate;
    });

    const totalBillsAmount = filteredBills.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    const totalPaidAmount = filteredBills.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0);
    const totalBalanceAmount = filteredBills.reduce((sum, inv) => sum + (inv.balance || 0), 0);
    const totalShortfallBalance = filteredBills.reduce((sum, inv) => sum + (inv.shortfall_balance || 0), 0);
    const totalMedicalAidBalance = filteredBills.reduce((sum, inv) => sum + (inv.medical_aid_balance || 0), 0);

    const totalPages = Math.ceil(filteredBills.length / itemsPerPage);

    const loadBills = async () => {
        try {
            let query = supabase
                .from('bills')
                .select(`
          *,
          patient:patients(full_name, patient_number, email, phone, outstanding_balance, medical_aid:medical_aids(name)),
          bill_items(*)
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
                    total_cumulative_balance: inv.patient?.outstanding_balance ?? 0
                }
            }));

            setBills(structuredData);
        } catch (error) {
            console.error('Error loading bills:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        const data = filteredBills.map((inv: Bill) => ({
            'INV #': inv.bill_number,
            'Patient': inv.patient?.full_name,
            'Date': new Date(inv.bill_date).toLocaleDateString(),
            'Total Amount': inv.total_amount,
            'Paid Amount': inv.paid_amount,
            'Balance': inv.balance,
            'Status': inv.status
        }));
        exportToExcel(data, 'spiritmed_bills');
    };

    const handleExportPDF = () => {
        const headers = ['#', 'Bill', 'Patient', 'Total', 'Paid', 'Balance', 'Status'];
        const data = filteredBills.map((inv: Bill, i) => [
            i + 1,
            inv.bill_number,
            inv.patient?.full_name || 'N/A',
            `$${inv.total_amount.toLocaleString()}`,
            `$${inv.paid_amount.toLocaleString()}`,
            `$${inv.balance.toLocaleString()}`,
            inv.status.toUpperCase()
        ]);
        exportToPDF(headers, data, 'Spiritmed Bill List', 'spiritmed_bills');
    };

    const loadPatients = async () => {
        try {
            const { data, error } = await supabase
                .from('patients')
                .select('id, full_name, patient_number, email, medical_aid_id, default_payment_method')
                .order('full_name');
            if (error) throw error;
            setPatients(data || []);
        } catch (error) {
            console.error('Error loading patients:', error);
        }
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

    const loadProcedures = async () => {
        try {
            const { data, error } = await supabase
                .from('payment_procedures')
                .select('*')
                .order('name');
            if (error) throw error;
            setProcedures(data || []);
        } catch (error) {
            console.error('Error loading procedures:', error);
        }
    };

    const addProcedure = (procId: string) => {
        const proc = procedures.find(p => p.id === procId);
        if (!proc) return;

        setFormData(prev => ({
            ...prev,
            items: [...prev.items, {
                code: proc.code,
                description: proc.name,
                quantity: 1,
                unit_price: proc.price,
                total_price: proc.price
            }]
        }));
    };

    const addItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, { code: '', description: '', quantity: 1, unit_price: 0, total_price: 0 }]
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
        const subtotal = formData.items.reduce((sum, item) => sum + item.total_price, 0);
        const discount = parseFloat(formData.discount) || 0;
        return Math.max(0, subtotal - discount);
    };

    const handleEdit = (bill: Bill) => {
        if (isAccountant) {
            setPendingEditBill(bill);
            setShowBillRequestModal(true);
        } else {
            openBillEditModal(bill);
        }
    };

    const openBillEditModal = (bill: Bill) => {
        setEditingBillId(bill.id);

        if (bill.patient && bill.patient_id) {
            setPatients(prev => {
                if (!prev.some(p => p.id === bill.patient_id)) {
                    return [...prev, {
                        id: bill.patient_id,
                        full_name: bill.patient.full_name,
                        patient_number: bill.patient.patient_number || ''
                    }];
                }
                return prev;
            });
        }

        setFormData({
            patient_id: bill.patient_id,
            bill_date: bill.bill_date ? new Date(bill.bill_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            due_date: bill.due_date ? new Date(bill.due_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            discount: (bill.discount_amount || 0).toString(),
            payment_method: (bill as any).payment_method || 'cash',
            medical_aid_id: (bill as any).medical_aid_id || '',
            shortfall_amount: (bill as any).shortfall_amount?.toString() || '0',
            medical_aid_amount: (bill as any).medical_aid_amount?.toString() || '0',
            notes: (bill as any).notes || '',
            items: (bill.bill_items || []).map(i => ({
                code: (i as any).code || '',
                description: i.description,
                quantity: i.quantity,
                unit_price: i.unit_price,
                total_price: i.total_price
            }))
        });
        setShowModal(true);
    };

    const handleBillApprovalSubmit = async (reason: string) => {
        if (!pendingEditBill || !profile?.branch_id) return;
        setIsSubmittingBillApproval(true);
        const context = `Invoice ${pendingEditBill.bill_number} — ${pendingEditBill.patient?.full_name} ($${pendingEditBill.total_amount.toLocaleString()})`;        const request = await approvalService.requestApproval({
            branchId: profile.branch_id,
            requestorId: profile.id,
            requestorName: profile.full_name,
            recordType: 'bill',
            recordId: pendingEditBill.id,
            recordContext: context,
            reason,
        });
        setIsSubmittingBillApproval(false);
        if (request) {
            setShowBillRequestModal(false);
            setBillApprovalRequest(request);
        } else {
            showToast('Failed to send approval request. Please try again.', 'error');
        }
    };

    const handleBillApprovalGranted = () => {
        if (pendingEditBill) openBillEditModal(pendingEditBill);
        setBillApprovalRequest(null);
        setPendingEditBill(null);
    };

    const handleBillApprovalDismissed = (msg?: string) => {
        setBillApprovalRequest(null);
        setPendingEditBill(null);
        if (msg) showToast(msg, 'warning');
    };

    const handleDelete = async (id: string, billNumber: string) => {
        if (!window.confirm(`Are you sure you want to delete bill ${billNumber}? This action cannot be undone.`)) return;

        try {
            setLoading(true);
            
            // Delete associated items first (in case CASCADE is not set in DB)
            await supabase.from('bill_items').delete().eq('bill_id', id);

            const { error } = await supabase
                .from('bills')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await accountingSync.deleteJournalEntry('bill', id, profile?.branch_id || '');

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'DELETE',
                    tableName: 'bills',
                    recordId: id,
                    details: `Deleted bill ${billNumber}`
                });
            }

            showToast('Bill deleted successfully');
            loadBills();
        } catch (error: any) {
            console.error('Error deleting bill:', error);
            showToast(error.message || 'Failed to delete bill', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const totalAmount = calculateTotal();
            const discountAmount = parseFloat(formData.discount) || 0;
            
            if (editingBillId) {
                // UPDATE
                const { error: billError } = await supabase
                    .from('bills')
                    .update({
                        patient_id: formData.patient_id,
                        total_amount: totalAmount,
                        discount_amount: discountAmount,
                        medical_aid_amount: parseFloat(formData.medical_aid_amount) || 0,
                        shortfall_amount: parseFloat(formData.shortfall_amount) || 0,
                        payment_method: formData.payment_method,
                        medical_aid_id: formData.medical_aid_id || null,
                        due_date: formData.due_date,
                        notes: formData.notes || null
                    })
                    .eq('id', editingBillId);
                
                if (billError) throw billError;

                // Simple approach: delete and re-insert items
                await supabase.from('bill_items').delete().eq('bill_id', editingBillId);
                const { error: itemsError } = await supabase
                    .from('bill_items')
                    .insert(formData.items.map(item => ({
                        bill_id: editingBillId,
                        ...item
                    })));
                
                if (itemsError) throw itemsError;

                const patName = patients.find(p => p.id === formData.patient_id)?.full_name || 'Patient';
                const { data: updatedBill } = await supabase
                    .from('bills')
                    .select('*')
                    .eq('id', editingBillId)
                    .single();
                if (updatedBill) {
                    await accountingSync.postBillJournalEntry(updatedBill, patName);
                }

                showToast('Bill updated successfully!');
                setShowModal(false);
                setLoading(false);
                resetForm();
                loadBills();
            } else {
                // CREATE
                const billNumber = `INV-${Date.now().toString().slice(-6)}`;

                // 1. Create Bill
                const { data: billData, error: billError } = await supabase
                    .from('bills')
                    .insert([{
                        patient_id: formData.patient_id,
                        branch_id: profile?.branch_id,
                        bill_number: billNumber,
                        bill_date: formData.bill_date || new Date().toISOString().split('T')[0],
                        total_amount: totalAmount,
                        discount_amount: discountAmount,
                        medical_aid_amount: parseFloat(formData.medical_aid_amount) || 0,
                        shortfall_amount: parseFloat(formData.shortfall_amount) || 0,
                        payment_method: formData.payment_method,
                        medical_aid_id: formData.medical_aid_id || null,
                        medical_aid_balance: parseFloat(formData.medical_aid_amount) || 0,
                        shortfall_balance: parseFloat(formData.shortfall_amount) || 0,
                        status: 'unpaid',
                        due_date: formData.due_date,
                        notes: formData.notes || null
                    }])
                    .select()
                    .single();

                if (billError) throw billError;

                // 2. Create Bill Items
                const { error: itemsError } = await supabase
                    .from('bill_items')
                    .insert(formData.items.map(item => ({
                        bill_id: billData.id,
                        code: item.code,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total_price: item.total_price
                    })));

                if (itemsError) throw itemsError;

                const patient = patients.find(p => p.id === formData.patient_id);
                const patientName = patient?.full_name || 'Patient';
                if (billData) {
                    await accountingSync.postBillJournalEntry(billData, patientName);
                }

                // 3. Sync Patient Profile (If payment method or medical aid was chosen/changed)
                if (patient && (patient.default_payment_method !== formData.payment_method || patient.medical_aid_id !== formData.medical_aid_id)) {
                    await supabase
                        .from('patients')
                        .update({
                            default_payment_method: formData.payment_method,
                            medical_aid_id: formData.medical_aid_id || null
                        })
                        .eq('id', formData.patient_id);
                    // Reload patients to reflect changes in-memory
                    loadPatients();
                }

                // SUCCESS: Close modal early for better UX
                showToast('Bill created successfully!');
                setShowModal(false);
                setLoading(false);
                resetForm();
                loadBills();

                // 4. Background tasks (Non-critical logging & notifications)

                if (profile?.id && profile?.branch_id && billData) {
                    const patientName = patient?.full_name || formData.patient_id;
                    
                    await logActivity(supabase, {
                        userId: profile.id,
                        branchId: profile.branch_id,
                        action: 'CREATE',
                        tableName: 'bills',
                        recordId: billData.id,
                        details: `Generated new bill ${billNumber} for patient: ${patientName}`,
                        newValues: { ...formData, total_amount: totalAmount, bill_number: billNumber }
                    });

                    // Trigger Email Notification
                    if (patient?.email) {
                        const { data: template } = await supabase
                            .from('email_templates')
                            .select('id')
                            .eq('name', 'Bill Notification')
                            .maybeSingle();

                        await emailService.sendEmail({
                            recipientEmail: patient.email,
                            recipientName: patient.full_name,
                            subject: `New Bill ${billNumber}`,
                            body: `Dear ${patient.full_name},\n\nA new bill for the amount of ${totalAmount.toLocaleString()} has been generated.\n\nThank you.`,
                            templateId: template?.id,
                            placeholders: {
                                patient_name: patient.full_name,
                                bill_number: billNumber,
                                amount: totalAmount.toLocaleString()
                            },
                            branchId: profile.branch_id,
                            senderId: profile.id,
                            referenceId: billData.id,
                            referenceType: 'bill'
                        });
                    }
                }
            }
        } catch (error: any) {
            console.error('Error creating bill:', error);
            showToast(error.message || 'Failed to create bill', 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEditingBillId(null);
        setFormData({
            patient_id: '',
            bill_date: new Date().toISOString().split('T')[0],
            due_date: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0],
            discount: '0',
            payment_method: 'cash',
            medical_aid_id: '',
            shortfall_amount: '0',
            medical_aid_amount: '0',
            items: [],
            notes: ''
        });
    };

    const handleRecordPayment = (bill: Bill) => {
        setSelectedBillForPayment(bill);
        setPaymentFormData({
            amount: (bill.balance || 0).toString(),
            discount: '0',
            payment_method: 'cash',
            target_portion: (bill as any).payment_method === 'medical_aid' ? 'medical_aid' : 'shortfall',
            notes: ''
        });
        setShowPaymentModal(true);
    };

    const submitPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBillForPayment) return;

        try {
            setLoading(true);
            const amount = parseFloat(paymentFormData.amount);
            const discount = parseFloat(paymentFormData.discount) || 0;

            if (isNaN(amount) || amount < 0) {
                showToast('Please enter a valid payment amount', 'warning');
                return;
            }

            // 1. Record Payment
            const { data: paymentData, error: paymentError } = await supabase
                .from('payments')
                .insert([{
                    bill_id: selectedBillForPayment.id,
                    patient_id: selectedBillForPayment.patient_id,
                    amount,
                    discount_amount: discount,
                    payment_method: paymentFormData.payment_method,
                    target_portion: paymentFormData.target_portion,
                    notes: paymentFormData.notes,
                    payment_date: new Date().toISOString(),
                    branch_id: profile?.branch_id,
                    received_by: profile?.id
                }])
                .select(`
                    *,
                    bill:bills(
                        bill_number,
                        total_amount,
                        paid_amount,
                        balance,
                        patient:patients(full_name, patient_number, phone)
                    )
                `)
                .single();

            if (paymentError) throw paymentError;

            if (paymentData) {
                await accountingSync.postPaymentJournalEntry(paymentData);
            }

            // 2. Update Bill (Factor in payment + discount)
            const newTotalAmount = Math.max(0, (selectedBillForPayment.total_amount || 0) - discount);
            const newDiscountAmount = (selectedBillForPayment.discount_amount || 0) + discount;
            const newPaidAmount = (selectedBillForPayment.paid_amount || 0) + amount;
            const newBalance = Math.max(0, newTotalAmount - newPaidAmount);

            // Calculate individualized balances
            let currentSF = selectedBillForPayment.shortfall_balance ?? 0;
            let currentMA = selectedBillForPayment.medical_aid_balance ?? 0;

            // FALLBACK: If individual balances are 0 but the bill has overall dues,
            // initialize them from the original amounts (fixes older records)
            if (currentSF === 0 && currentMA === 0 && (selectedBillForPayment.balance || 0) > 0) {
                currentSF = selectedBillForPayment.shortfall_amount || 0;
                currentMA = selectedBillForPayment.medical_aid_amount || 0;
            }

            let newShortfallBalance = currentSF;
            let newMedicalAidBalance = currentMA;

            const isSplitBill = (selectedBillForPayment.medical_aid_amount || 0) > 0;

            if (paymentFormData.target_portion === 'shortfall') {
                // Shortfall payment: both amount and discount reduce the shortfall balance
                newShortfallBalance = Math.max(0, newShortfallBalance - (amount + discount));
            } else if (paymentFormData.target_portion === 'medical_aid') {
                // Medical Aid payment: amount reduces MA balance only
                // Discount ALWAYS goes to patient shortfall on split bills
                newMedicalAidBalance = Math.max(0, newMedicalAidBalance - amount);
                if (isSplitBill) {
                    newShortfallBalance = Math.max(0, newShortfallBalance - discount);
                } else {
                    newMedicalAidBalance = Math.max(0, newMedicalAidBalance - discount);
                }
            }
            
            let newStatus = 'partially_paid';
            if (newBalance <= 0) {
                newStatus = 'paid';
            }

            const { error: billError } = await supabase
                .from('bills')
                .update({
                    total_amount: newTotalAmount,
                    discount_amount: newDiscountAmount,
                    paid_amount: newPaidAmount,
                    balance: newBalance,
                    shortfall_balance: newShortfallBalance,
                    medical_aid_balance: newMedicalAidBalance,
                    status: newStatus
                })
                .eq('id', selectedBillForPayment.id);

            if (billError) throw billError;

            // Log activity
            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'CREATE',
                    tableName: 'payments',
                    recordId: paymentData.id,
                    details: `Recorded payment of ${amount} for bill ${selectedBillForPayment.bill_number}`
                });
            }

            // Send SMS
            if (selectedBillForPayment.patient?.phone && profile?.branch_id) {
                await smsService.sendSms({
                    recipientPhone: selectedBillForPayment.patient.phone,
                    triggerType: 'payment_received',
                    variables: {
                        patient_name: selectedBillForPayment.patient.full_name,
                        amount: amount.toLocaleString(),
                        bill_number: selectedBillForPayment.bill_number,
                        balance: newBalance.toLocaleString()
                    },
                    branchId: profile.branch_id,
                    patientId: selectedBillForPayment.patient_id
                });
            }

            showToast('Payment recorded successfully!');
            setLastRecordedPayment(paymentData);
            setShowPaymentModal(false);
            setShowReceiptView(true);
            loadBills();
        } catch (error: any) {
            console.error('Error recording payment:', error);
            showToast(error.message || 'Failed to record payment', 'error');
        } finally {
            setLoading(false);
        }
    };

    const paginated = filteredBills.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (showPrintView && selectedBillForPrint && branch) {
        return (
            <BillPrintView 
                data={selectedBillForPrint as any} 
                branch={branch} 
                onBack={() => setShowPrintView(false)} 
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* ── Accountant Invoice Edit Approval Flow ──────────────────────── */}
            {showBillRequestModal && pendingEditBill && (
                <RequestEditModal
                    recordType="bill"
                    recordContext={`Invoice ${pendingEditBill.bill_number} — ${pendingEditBill.patient?.full_name} ($${pendingEditBill.total_amount.toLocaleString()})`}
                    onSubmit={handleBillApprovalSubmit}
                    onCancel={() => { setShowBillRequestModal(false); setPendingEditBill(null); }}
                    isSubmitting={isSubmittingBillApproval}
                />
            )}
            {billApprovalRequest && (
                <ApprovalGate
                    request={billApprovalRequest}
                    onApproved={handleBillApprovalGranted}
                    onDenied={handleBillApprovalDismissed}
                    onCancelled={() => handleBillApprovalDismissed()}
                />
            )}
            {/* ─────────────────────────────────────────────────────────────────── */}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Billing &amp; Invoices</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage patient billing and transaction records</p>
                </div>
                {hasPermission('billing', 'add') && (
                    <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg hover:bg-emerald-700 transition font-semibold text-sm shadow">
                        <Plus className="w-4 h-4" /> Create New Bill
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">Total Billed</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">${totalBillsAmount.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-green-500 uppercase font-bold mb-1">Total Paid</div>
                    <div className="text-2xl font-bold text-green-600">${totalPaidAmount.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-amber-500 uppercase font-bold mb-1">Total Dues</div>
                    <div className="text-2xl font-bold text-amber-600">${totalBalanceAmount.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-blue-500 uppercase font-bold mb-1">Medical Aid Dues</div>
                    <div className="text-2xl font-bold text-blue-600">${totalMedicalAidBalance.toLocaleString()}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-rose-500 uppercase font-bold mb-1">Shortfall Dues</div>
                    <div className="text-2xl font-bold text-rose-600">${totalShortfallBalance.toLocaleString()}</div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    {/* Search - 3 cols */}
                    <div className="md:col-span-3 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search Patient/INV..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                        />
                    </div>

                    {/* Status, Dues & MA - 4 cols */}
                    <div className="md:col-span-4 grid grid-cols-3 gap-2">
                        <select
                            value={filterStatus}
                            onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                            className="px-2 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-600 dark:text-gray-300"
                        >
                            <option value="all">All Status</option>
                            <option value="unpaid">Unpaid / Partial</option>
                            <option value="paid">Paid</option>
                        </select>
                        <select
                            value={filterDueType}
                            onChange={(e) => { setFilterDueType(e.target.value); setCurrentPage(1); }}
                            className="px-2 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-600 dark:text-gray-300"
                        >
                            <option value="all">All Dues</option>
                            <option value="medical_aid">Medical Aid Dues</option>
                            <option value="shortfall">Shortfall Dues</option>
                        </select>
                        <select
                            value={filterMedicalAid}
                            onChange={(e) => { setFilterMedicalAid(e.target.value); setCurrentPage(1); }}
                            className="px-2 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-600 dark:text-gray-300"
                        >
                            <option value="all">Insurers</option>
                            {medicalAids.map(aid => (
                                <option key={aid.id} value={aid.id}>{aid.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Range Presets - 2 cols */}
                    <div className="md:col-span-2">
                        <select
                            value={timeRange}
                            onChange={(e) => handleTimeRangeChange(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-gray-600"
                        >
                            <option value="all">All Time</option>
                            <option value="7">Last 7 Days</option>
                            <option value="14">Last 14 Days</option>
                            <option value="21">Last 21 Days</option>
                            <option value="30">Last 30 Days</option>
                            <option value="60">Last 60 Days</option>
                            <option value="90">Last 90 Days</option>
                        </select>
                    </div>

                    {/* Custom Dates - 4 cols */}
                    <div className="md:col-span-4 flex gap-2">
                        <div className="relative flex-1">
                            <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setTimeRange('custom'); setCurrentPage(1); }}
                                className="w-full pl-7 pr-1 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                            />
                        </div>
                        <div className="relative flex-1">
                            <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setTimeRange('custom'); setCurrentPage(1); }}
                                className="w-full pl-7 pr-1 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                            />
                        </div>
                    </div>
                </div>

                {/* Second row: Buttons & Export */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setFilterDebtors(!filterDebtors)}
                            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${filterDebtors ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                        >
                            <Filter className="w-3.5 h-3.5" />
                            <span>{filterDebtors ? 'Showing Patients with Dues' : 'All Patients'}</span>
                        </button>
                        
                        {(searchQuery || filterStatus !== 'all' || filterMedicalAid !== 'all' || startDate || endDate || filterDebtors) && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setFilterStatus('all');
                                    setFilterMedicalAid('all');
                                    setStartDate('');
                                    setEndDate('');
                                    setTimeRange('all');
                                    setFilterDebtors(false);
                                    setCurrentPage(1);
                                }}
                                className="text-xs text-gray-400 hover:text-rose-500 font-bold flex items-center gap-1 px-2"
                            >
                                <X className="w-3 h-3" /> Clear Filters
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-[10px] items-center uppercase font-black text-gray-400 mr-2 tracking-widest hidden sm:block">Export Options</span>
                        <div className="flex bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                            <button
                                onClick={handleExportExcel}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-green-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition"
                            >
                                <FileSpreadsheet className="w-4 h-4" />
                                <span>Excel</span>
                            </button>
                            <button
                                onClick={handleExportPDF}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition"
                            >
                                <FileJson className="w-4 h-4" />
                                <span>PDF</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
                        <thead className="bg-gray-100 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
                            <tr>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">#</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">INV #</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Patient</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Invoice Date</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Method</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-xs font-bold text-indigo-600 uppercase tracking-wider">MA Owing</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-xs font-bold text-purple-600 uppercase tracking-wider">Shortfall</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-xs font-bold text-amber-500 uppercase tracking-wider">Discount</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Total</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-xs font-bold text-green-600 uppercase tracking-wider">Paid</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-xs font-bold text-blue-600 uppercase tracking-wider">MA Bal</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-xs font-bold text-rose-600 uppercase tracking-wider">SF Bal</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-xs font-bold text-amber-600 uppercase tracking-wider">Total Bal</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Due Date</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={16} className="border border-gray-200 dark:border-gray-700 px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600/30 border-t-emerald-600" />
                                            <p className="text-gray-400 font-medium animate-pulse">Fetching records...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredBills.length === 0 ? (
                                <tr><td colSpan={16} className="border border-gray-200 dark:border-gray-700 px-5 py-16 text-center text-sm font-medium text-gray-400">No bills found</td></tr>
                            ) : (
                                paginated.map((bill, idx) => (
                                    <tr key={bill.id} className="hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10 transition">
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-400 font-mono">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">{bill.bill_number}</td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                                            <div className="text-sm font-semibold text-gray-900 dark:text-white">{bill.patient?.full_name}</div>
                                            <div className="text-xs text-gray-400 font-mono">{bill.patient?.patient_number}</div>
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-600 dark:text-gray-300">
                                            {bill.bill_date || (bill as any).created_at ? new Date(bill.bill_date || (bill as any).created_at).toLocaleDateString() : '—'}
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                                            <span className="text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                                                {bill.payment_method === 'medical_aid' ? <span className="text-blue-600">{(bill as any).patient?.medical_aid?.name || 'Medical Aid'}</span> : (bill.payment_method === 'standard' || !bill.payment_method) ? 'Cash' : bill.payment_method.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-right">
                                            {bill.payment_method === 'medical_aid' && (bill.medical_aid_amount || 0) > 0 ? <span className="text-sm font-bold text-indigo-600">${(bill.medical_aid_amount || 0).toLocaleString()}</span> : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-right">
                                            {bill.payment_method === 'medical_aid' && (bill.shortfall_amount || 0) > 0 ? <span className="text-sm font-bold text-purple-600">${(bill.shortfall_amount || 0).toLocaleString()}</span> : <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-right"><span className="text-sm font-semibold text-amber-500">${(bill.discount_amount || 0).toLocaleString()}</span></td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-right"><span className="text-sm font-bold text-gray-800 dark:text-white">${bill.total_amount.toLocaleString()}</span></td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-right"><span className="text-sm font-bold text-green-600">${(bill.paid_amount || 0).toLocaleString()}</span></td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-right"><span className="text-sm font-bold text-blue-600">${(bill.medical_aid_balance || 0).toLocaleString()}</span></td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-right"><span className="text-sm font-bold text-rose-600">${(bill.shortfall_balance || 0).toLocaleString()}</span></td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-right"><span className="text-sm font-bold text-amber-600">${(bill.balance || 0).toLocaleString()}</span></td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                                                bill.status === 'paid' ? 'bg-green-100 text-green-700 border border-green-200' :
                                                bill.status === 'partially_paid' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                'bg-amber-100 text-amber-700 border border-amber-200'}`}>{bill.status.replace('_', ' ')}</span>
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">{new Date(bill.due_date).toLocaleDateString()}</td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                                            <div className="flex items-center justify-center gap-1">
                                                {hasPermission('billing', 'edit') && <button onClick={() => handleEdit(bill)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition" title="Edit"><Pencil className="w-4 h-4" /></button>}
                                                {hasPermission('billing', 'edit') && <button onClick={() => handleRecordPayment(bill)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition" title="Record Payment"><DollarSign className="w-4 h-4" /></button>}
                                                {hasPermission('billing', 'delete') && <button onClick={() => handleDelete(bill.id, bill.bill_number)} className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                                                <button onClick={() => { setSelectedBillForPrint(bill as any); setShowPrintView(true); }} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition" title="Print"><FileText className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {filteredBills.length > 0 && (
                    <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4 font-sans">
                        <div className="flex items-center space-x-4">
                            <p className="text-xs text-gray-500">
                                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredBills.length)} of {filteredBills.length}
                            </p>
                            <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                                <select
                                    value={itemsPerPage === filteredBills.length ? 'all' : itemsPerPage}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'all') {
                                            setItemsPerPage(filteredBills.length || 1);
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
                        
                        {itemsPerPage < filteredBills.length && totalPages > 1 && (
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
                                {editingBillId ? 'Edit Invoice / Bill' : 'New Invoice / Bill'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <SearchDropdown
                                        label="Patient *"
                                        placeholder="Select Patient"
                                        items={patients}
                                        selectedId={formData.patient_id}
                                        onSelect={(id) => {
                                            const p = patients.find(pat => pat.id === id);
                                            setFormData({ 
                                                ...formData, 
                                                patient_id: id,
                                                payment_method: p?.default_payment_method || 'cash',
                                                medical_aid_id: p?.medical_aid_id || ''
                                            });
                                        }}
                                        displayFn={(p) => `${p.full_name} (${p.patient_number})`}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bill Date *</label>
                                        <input
                                            type="date"
                                            value={formData.bill_date}
                                            onChange={(e) => setFormData({ ...formData, bill_date: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            required
                                        />
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
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <SearchDropdown
                                        label="Select Procedure (Quick Add)"
                                        placeholder="Search code or procedure name..."
                                        items={procedures}
                                        onSelect={addProcedure}
                                        displayFn={(p) => `[${p.code}] ${p.name} ($${p.price})`}
                                    />
                                </div>
                                <div className="flex items-center justify-between border-b pb-2">
                                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Bill Items</h3>
                                    <button
                                        type="button"
                                        onClick={addItem}
                                        className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded hover:bg-gray-200 transition font-bold"
                                    >
                                        + Add Custom Item
                                    </button>
                                </div>

                                {formData.items.length === 0 ? (
                                    <div className="py-8 text-center border-2 border-dashed border-gray-100 dark:border-gray-700 rounded-xl">
                                        <p className="text-sm text-gray-500 italic">No items added yet. Search a procedure above or add a custom item.</p>
                                    </div>
                                ) : formData.items.map((item, index) => (
                                    <div key={index} className="grid grid-cols-12 gap-3 items-end p-2 bg-gray-50/30 dark:bg-gray-900/10 rounded-lg">
                                        <div className="col-span-12 md:col-span-2">
                                            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Code</label>
                                            <input
                                                type="text"
                                                value={item.code || ''}
                                                onChange={(e) => updateItem(index, 'code', e.target.value)}
                                                className="w-full px-2 py-2 border border-gray-100 dark:border-gray-700 rounded-lg outline-none text-[10px] font-bold bg-white dark:bg-gray-800"
                                                placeholder="N/A"
                                            />
                                        </div>
                                        <div className="col-span-12 md:col-span-4">
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
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                             <div className="border-t pt-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 uppercase tracking-widest text-[10px]">Payment Method</label>
                                        <select
                                            value={formData.payment_method}
                                            onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold"
                                        >
                                            <option value="cash">Cash / Private</option>
                                            <option value="medical_aid">Medical Aid</option>
                                        </select>
                                    </div>
                                    {formData.payment_method === 'medical_aid' && (
                                        <div>
                                            <SearchDropdown
                                                label="Medical Aid Provider *"
                                                placeholder="Search medical aid..."
                                                items={medicalAids}
                                                onSelect={(id) => setFormData({ ...formData, medical_aid_id: id })}
                                                displayFn={(aid) => aid.name}
                                                selectedId={formData.medical_aid_id}
                                            />
                                        </div>
                                    )}
                                </div>

                                {formData.payment_method === 'medical_aid' && (
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-200 dark:border-blue-800 grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                                        <div>
                                            <label className="block text-[10px] font-black text-blue-600 uppercase mb-1">Patient Shortfall</label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
                                                <input
                                                    type="number"
                                                    value={formData.shortfall_amount}
                                                    onChange={(e) => {
                                                        const shortfall = parseFloat(e.target.value) || 0;
                                                        const total = calculateTotal();
                                                        // Medical aid stays fixed; shortfall is user-controlled
                                                        // Ensure shortfall doesn't exceed total
                                                        const clampedShortfall = Math.min(shortfall, total);
                                                        const medicalAidPortion = Math.max(0, total - clampedShortfall);
                                                        setFormData({ 
                                                            ...formData, 
                                                            shortfall_amount: e.target.value,
                                                            medical_aid_amount: medicalAidPortion.toFixed(2)
                                                        });
                                                    }}
                                                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-indigo-600 uppercase mb-1">Medical Aid Amount</label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500" />
                                                <input
                                                    type="number"
                                                    value={formData.medical_aid_amount}
                                                    readOnly
                                                    className="w-full pl-10 pr-4 py-2 bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg outline-none font-bold text-indigo-600 cursor-not-allowed"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-col items-end space-y-4">
                                    <div className="flex items-center gap-4 w-full justify-end">
                                        <label className="text-sm font-bold text-amber-600 uppercase tracking-widest font-mono">Overall Discount:</label>
                                        <div className="relative w-48">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={formData.discount}
                                                onChange={(e) => {
                                                    const newDiscount = e.target.value;
                                                    const discVal = parseFloat(newDiscount) || 0;
                                                    const subtotal = formData.items.reduce((sum, item) => sum + item.total_price, 0);
                                                    const total = Math.max(0, subtotal - discVal);
                                                    
                                                    // Discount always comes off the patient shortfall.
                                                    // Medical Aid amount stays fixed; shortfall absorbs the discount.
                                                    let newShortfall = formData.shortfall_amount;
                                                    if (formData.payment_method === 'medical_aid') {
                                                        const medAid = parseFloat(formData.medical_aid_amount) || 0;
                                                        newShortfall = Math.max(0, total - medAid).toFixed(2);
                                                    }

                                                    setFormData({ 
                                                        ...formData, 
                                                        discount: newDiscount,
                                                        shortfall_amount: newShortfall
                                                    });
                                                }}
                                                className="w-full pl-10 pr-4 py-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg text-amber-600"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-4 items-center">
                                        <span className="text-sm text-gray-500 uppercase font-bold">Final Total:</span>
                                        <span className="text-3xl font-black text-emerald-600 font-mono">${calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Notes / Remarks</label>
                                    <textarea
                                        value={formData.notes || ''}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        rows={2}
                                        placeholder="Add additional bill notes or reference details..."
                                    />
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
                                    {loading ? (editingBillId ? 'Updating...' : 'Creating...') : (editingBillId ? 'Update Bill' : 'Finalize Bill')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && selectedBillForPayment && (
                <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-lg font-black uppercase text-gray-900 dark:text-white tracking-tight">Record Payment</h2>
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 opacity-70">INV: {selectedBillForPayment.bill_number}</p>
                            </div>
                            <button onClick={() => setShowPaymentModal(false)} className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
                        </div>

                        <form onSubmit={submitPayment} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Patient</label>
                                <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-600 text-sm font-bold">
                                    {selectedBillForPayment.patient?.full_name}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-center">
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                                    <p className="text-[9px] font-black uppercase text-blue-600">Total Amount</p>
                                    <p className="text-base font-black text-blue-700 dark:text-blue-300">${(selectedBillForPayment.total_amount || 0).toLocaleString()}</p>
                                </div>
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800/50">
                                    <p className="text-[9px] font-black uppercase text-amber-600">Current Balance</p>
                                    <p className="text-base font-black text-amber-700 dark:text-amber-300">${(selectedBillForPayment.balance || 0).toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Amount to Pay *</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={paymentFormData.amount}
                                            onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-lg text-emerald-600"
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 text-amber-600">Discount</label>
                                    <div className="relative">
                                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={paymentFormData.discount}
                                            onChange={(e) => setPaymentFormData({ ...paymentFormData, discount: e.target.value })}
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-black text-lg text-amber-600"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Payment Method</label>
                                    <select
                                        value={paymentFormData.payment_method}
                                        onChange={(e) => setPaymentFormData({ ...paymentFormData, payment_method: e.target.value })}
                                        className="w-full p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold"
                                    >
                                        <option value="cash">Cash</option>
                                        <option value="bank_transfer">Bank Transfer</option>
                                        <option value="mobile_money">Mobile Money</option>
                                        <option value="card">Card</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Target Portion</label>
                                    <select
                                        value={paymentFormData.target_portion}
                                        onChange={(e) => setPaymentFormData({ ...paymentFormData, target_portion: e.target.value as any })}
                                        className="w-full p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                                    >
                                        <option value="shortfall">Patient Shortfall</option>
                                        <option value="medical_aid">Medical Aid Portion</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Notes</label>
                                <textarea
                                    value={paymentFormData.notes}
                                    onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm min-h-[80px]"
                                    placeholder="Optional notes..."
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all disabled:opacity-50 mt-4"
                            >
                                {loading ? 'Recording...' : 'Record Payment'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showReceiptView && lastRecordedPayment && branch && (
                <div className="fixed inset-0 z-[110] bg-white dark:bg-gray-900 overflow-y-auto">
                    <div className="max-w-4xl mx-auto p-4 py-8">
                        <div className="flex justify-between items-center mb-6 no-print">
                            <button
                                onClick={() => setShowReceiptView(false)}
                                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-bold flex items-center gap-2"
                            >
                                <X className="w-4 h-4" /> Close
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-lg font-bold flex items-center gap-2"
                            >
                                <PrintIcon className="w-4 h-4" /> Print Receipt
                            </button>
                        </div>
                        <ReceiptPrintView 
                            data={lastRecordedPayment} 
                            branch={branch} 
                            onBack={() => setShowReceiptView(false)} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
