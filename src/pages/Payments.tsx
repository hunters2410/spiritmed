import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, CreditCard, Banknote, Wallet, X, Printer, Calendar, Filter, ChevronLeft, ChevronRight, FileSpreadsheet, FileJson, Pencil, Trash2 } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';
import { formatFileNumber, formatPatientNumber } from '../utils/patientUtils';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { ReceiptPrintView } from '../components/ReceiptPrintView';
import { ApprovalGate, RequestEditModal } from '../components/ApprovalGate';
import { approvalService, EditApprovalRequest } from '../utils/approvalService';
import { smsService } from '../utils/smsService';
import { emailService } from '../utils/emailService';
import { useToast } from '../contexts/ToastContext';
import { accountingSync } from '../utils/accountingSync';


interface MedicalAid {
    id: string;
    name: string;
}

interface Branch {
    id: string;
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    logo_url?: string;
}

interface Payment {
    id: string;
    bill_id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    discount_amount: number;
    target_portion: 'shortfall' | 'medical_aid';
    notes: string;
    bill: {
        bill_number: string;
        total_amount: number;
        paid_amount: number;
        balance: number;
        shortfall_amount?: number;
        medical_aid_amount?: number;
        shortfall_balance?: number;
        medical_aid_balance?: number;
        patient: {
            full_name: string;
            patient_number: string;
            file_number?: string;
            email?: string;
            medical_aid_id?: string | null;
            total_cumulative_balance?: number;
            medical_aid?: { id: string; name: string } | null;
        };
    };
}

interface SimpleBill {
    id: string;
    patient_id: string;
    bill_number: string;
    total_amount: number;
    discount_amount: number;
    medical_aid_amount?: number;
    shortfall_amount?: number;
    paid_amount: number;
    shortfall_balance?: number;
    medical_aid_balance?: number;
    balance: number;
    status: string;
    patient: {
        full_name: string;
        medical_aid_id?: string | null;
        medical_aid?: {
            id: string;
            name: string;
        } | null;
    };
}

// Server-side pagination: we no longer cache all payments in memory.
// Only the current page of data is held in state.

export function Payments() {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [totalPaymentCount, setTotalPaymentCount] = useState(0);
    const [bills, setBills] = useState<SimpleBill[]>([]);
    const [medicalAids, setMedicalAids] = useState<MedicalAid[]>([]);
    const [filterMedicalAid, setFilterMedicalAid] = useState('all');
    const [loading, setLoading] = useState(true);
    const [loadedCount, setLoadedCount] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
    const [showPrintView, setShowPrintView] = useState(false);
    const [selectedPaymentForPrint, setSelectedPaymentForPrint] = useState<Payment | null>(null);
    const [receiptIdFromUrl, setReceiptIdFromUrl] = useState<string | null>(null);
    const [branch, setBranch] = useState<Branch | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasLoadedOnce = useRef(false);
    const [filterMethod, setFilterMethod] = useState('all');
    const [filterDebtors, setFilterDebtors] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [timeRange, setTimeRange] = useState('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [billSearch, setBillSearch] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    // Approval gate state (accountant edit flow)
    const [pendingEditPayment, setPendingEditPayment] = useState<Payment | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [approvalRequest, setApprovalRequest] = useState<EditApprovalRequest | null>(null);
    const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
    const isAccountant = profile?.role === 'accountant';

    const [formData, setFormData] = useState({
        bill_id: '',
        payment_date: new Date().toISOString().split('T')[0],
        amount: '',
        discount: '0',
        payment_method: 'cash',
        target_portion: 'shortfall' as 'shortfall' | 'medical_aid',
        notes: ''
    });

    // Debounce search input
    const handleSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => {
            setDebouncedSearch(value);
            setCurrentPage(1);
        }, 300);
    }, []);

    // Initial data load (non-paginated reference data)
    useEffect(() => {
        if (!profile) return;
        loadUnpaidBills();
        loadBranch();
        loadMedicalAids();

        // Check for billId in URL query param
        const params = new URLSearchParams(window.location.search);
        const billId = params.get('billId');
        if (billId) {
            setFormData(prev => ({ ...prev, bill_id: billId }));
            setShowModal(true);
        }

        // Check if URL is /payments/receipt/{id} — restore receipt view on refresh
        const pathParts = window.location.pathname.split('/');
        if (pathParts[1] === 'payments' && pathParts[2] === 'receipt' && pathParts[3]) {
            setReceiptIdFromUrl(pathParts[3]);
        }
    }, [profile]);

    // Re-fetch page whenever page, search, or filters change
    useEffect(() => {
        if (profile) loadPayments();
    }, [currentPage, debouncedSearch, filterMethod, filterDebtors, startDate, endDate, filterMedicalAid, itemsPerPage, profile]);

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
    // Auto-open receipt when URL contains a receipt ID (handles browser refresh)
    useEffect(() => {
        if (!receiptIdFromUrl || payments.length === 0) return;
        const match = payments.find(p => p.id === receiptIdFromUrl);
        if (match) {
            setSelectedPaymentForPrint(match);
            setShowPrintView(true);
            setReceiptIdFromUrl(null); // consumed
        }
    }, [receiptIdFromUrl, payments]);

    // Open a receipt and update the URL
    const openReceiptView = (payment: Payment) => {
        setSelectedPaymentForPrint(payment);
        setShowPrintView(true);
        window.history.pushState({}, '', `/payments/receipt/${payment.id}`);
    };

    // Close receipt and restore URL
    const closeReceiptView = () => {
        setShowPrintView(false);
        setSelectedPaymentForPrint(null);
        window.history.pushState({}, '', '/payments');
        window.dispatchEvent(new PopStateEvent('popstate'));
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


    const loadPayments = async (forceRefresh = false) => {
        if (!profile) return;
        // Show skeleton on first load; subtle indicator on subsequent fetches
        if (!hasLoadedOnce.current) { setLoading(true); } else { setLoadedCount(-1); }

        try {
            const from = (currentPage - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            let query = supabase
                .from('payments')
                .select(`
                  id, bill_id, amount, payment_method, payment_date, discount_amount, target_portion, notes, branch_id,
                  bill:bills(
                    bill_number,
                    total_amount,
                    paid_amount,
                    balance,
                    payment_method,
                    shortfall_amount,
                    medical_aid_amount,
                    shortfall_balance,
                    medical_aid_balance,
                    bill_items!bill_items_bill_id_fkey(id, description, quantity, unit_price, total_price),
                    patient:patients(full_name, patient_number, file_number, email, medical_aid_id, outstanding_balance, medical_aid:medical_aids(id, name))
                  )
                `, { count: 'exact' })
                .order('payment_date', { ascending: false })
                .range(from, to);

            if (profile.role !== 'super_admin' && profile.branch_id) {
                query = query.eq('branch_id', profile.branch_id);
            }

            // Server-side filters
            if (filterMethod !== 'all') {
                query = query.eq('payment_method', filterMethod);
            }
            if (startDate) {
                query = query.gte('payment_date', startDate);
            }
            if (endDate) {
                const endDatePlusOne = new Date(endDate);
                endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
                query = query.lt('payment_date', endDatePlusOne.toISOString().split('T')[0]);
            }

            const { data, error, count } = await query;
            if (error) throw error;
            
            const structuredData = (data || []).map((p: any) => ({
                ...p,
                bill: {
                    ...p.bill,
                    patient: {
                        ...p.bill?.patient,
                        total_cumulative_balance: p.bill?.patient?.outstanding_balance ?? 0
                    }
                }
            }));

            setPayments(structuredData);
            setTotalPaymentCount(count || 0);
            hasLoadedOnce.current = true;
        } catch (error) {
            console.error('Error loading payments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExportExcel = () => {
        const data = filteredPayments.map(p => ({
            'Date': new Date(p.payment_date).toLocaleString(),
            'Patient': p.bill?.patient?.full_name,
            'File No': p.bill?.patient?.file_number ? p.bill.patient.file_number.split('-')[0] : 'NO FILE',
            'INV #': p.bill?.bill_number,
            'Amount': p.amount,
            'Method': p.payment_method === 'medical_aid' ? (p.bill?.patient?.medical_aid?.name || 'Medical Aid') : (p.payment_method === 'standard' ? 'Cash' : p.payment_method),
            'Notes': p.notes
        }));
        exportToExcel(data, 'spiritmed_payments');
    };

    const handleExportPDF = () => {
        const headers = ['#', 'Date', 'Patient', 'File No', 'Bill', 'Amount', 'Method'];
        const data = filteredPayments.map((p, i) => [
            i + 1,
            new Date(p.payment_date).toLocaleDateString(),
            p.bill?.patient?.full_name || 'N/A',
            p.bill?.patient?.file_number ? p.bill.patient.file_number.split('-')[0] : 'NO FILE',
            p.bill?.bill_number,
            `$${p.amount.toLocaleString()}`,
            p.payment_method === 'medical_aid' ? (p.bill?.patient?.medical_aid?.name || 'MEDICAL AID') : (p.payment_method === 'standard' ? 'CASH' : p.payment_method.toUpperCase())
        ]);
        exportToPDF(headers, data, 'Spiritmed Payment History', 'spiritmed_payments');
    };

    const loadUnpaidBills = async () => {
        try {
            let allBills: any[] = [];
            let from = 0;
            const pageSize = 1000;

            while (true) {
                let query = supabase
                    .from('bills')
                    .select(`
                      id, 
                      patient_id,
                      bill_number, 
                      total_amount, 
                      paid_amount,
                      balance,
                      shortfall_amount,
                      medical_aid_amount,
                      shortfall_balance,
                      medical_aid_balance,
                      status,
                      patient:patients(full_name, patient_number, file_number, medical_aid:medical_aids(id, name))
                    `)
                    .in('status', ['unpaid', 'partially_paid'])
                    .order('created_at', { ascending: false })
                    .range(from, from + pageSize - 1);

                if (profile?.role !== 'super_admin' && profile?.branch_id) {
                    query = query.eq('branch_id', profile.branch_id);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allBills = allBills.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }

            setBills(allBills as unknown as SimpleBill[]);
        } catch (error) {
            console.error('Error loading invoices:', error);
        }
    };

    const handleDeletePayment = async (payment: Payment) => {
        if (!window.confirm('Are you sure you want to delete this payment? This will revert the bill balance.')) return;

        try {
            setLoading(true);
            
            // 1. Get current bill state
            const { data: bill, error: billFetchError } = await supabase
                .from('bills')
                .select('*')
                .eq('id', payment.bill_id)
                .single();
            
            if (billFetchError) throw billFetchError;

            // 2. Revert bill amounts
            // Note: Since discount reduces total_amount, we add it back
            const newTotalAmount = (bill.total_amount || 0) + (payment.discount_amount || 0);
            const newDiscountAmount = Math.max(0, (bill.discount_amount || 0) - (payment.discount_amount || 0));
            const newPaidAmount = Math.max(0, (bill.paid_amount || 0) - payment.amount);
            const newBalance = Math.max(0, newTotalAmount - newPaidAmount);
            
            const newStatus = newBalance <= 0 ? 'paid' : newPaidAmount > 0 ? 'partially_paid' : 'unpaid';

            // Revert balances
            let newShortfallBalance = bill.shortfall_balance || 0;
            let newMedicalAidBalance = bill.medical_aid_balance || 0;

            if (payment.target_portion === 'shortfall') {
                newShortfallBalance += (payment.amount + (payment.discount_amount || 0));
            } else {
                newMedicalAidBalance += (payment.amount + (payment.discount_amount || 0));
            }

            const { error: billUpdateError } = await supabase
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
                .eq('id', payment.bill_id);

            if (billUpdateError) throw billUpdateError;

            // 3. Delete payment record
            const { error: deleteError } = await supabase
                .from('payments')
                .delete()
                .eq('id', payment.id);

            if (deleteError) throw deleteError;

            await accountingSync.deleteJournalEntry('payment', payment.id, profile?.branch_id || '');

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'DELETE',
                    tableName: 'payments',
                    recordId: payment.id,
                    details: `Deleted payment of ${payment.amount} for bill ${payment.bill?.bill_number}`
                });
            }

            showToast('Payment deleted and balance reverted');
            loadPayments();
            loadUnpaidBills();
        } catch (error: any) {
            console.error('Error deleting payment:', error);
            showToast(error.message || 'Failed to delete payment', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleEditPayment = (payment: Payment) => {
        if (isAccountant) {
            // Accountants must request approval first
            setPendingEditPayment(payment);
            setShowRequestModal(true);
        } else {
            // Admins/super_admins can edit directly
            openEditModal(payment);
        }
    };

    const openEditModal = (payment: Payment) => {
        setEditingPaymentId(payment.id);
        const method = payment.payment_method === 'bank_transfer' ? 'eft' : payment.payment_method;
        setFormData({
            bill_id: payment.bill_id,
            payment_date: payment.payment_date ? new Date(payment.payment_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            amount: payment.amount.toString(),
            discount: (payment.discount_amount || 0).toString(),
            payment_method: method,
            target_portion: payment.target_portion || 'shortfall',
            notes: payment.notes || ''
        });
        setBillSearch(`${payment.bill?.bill_number} - ${payment.bill?.patient?.full_name}`);
        setShowModal(true);
    };

    const handleApprovalSubmit = async (reason: string) => {
        if (!pendingEditPayment || !profile?.branch_id) return;
        setIsSubmittingApproval(true);
        const context = `Payment of $${pendingEditPayment.amount.toLocaleString()} — ${pendingEditPayment.bill?.bill_number || ''} (${pendingEditPayment.bill?.patient?.full_name || 'Unknown Patient'})`;
        const request = await approvalService.requestApproval({
            branchId: profile.branch_id,
            requestorId: profile.id,
            requestorName: profile.full_name,
            recordType: 'payment',
            recordId: pendingEditPayment.id,
            recordContext: context,
            reason,
        });
        setIsSubmittingApproval(false);
        if (request) {
            setShowRequestModal(false);
            setApprovalRequest(request);
        } else {
            showToast('Failed to send approval request. Please try again.', 'error');
        }
    };

    const handleApprovalGranted = () => {
        if (pendingEditPayment) openEditModal(pendingEditPayment);
        setApprovalRequest(null);
        setPendingEditPayment(null);
    };

    const handleApprovalDismissed = (msg?: string) => {
        setApprovalRequest(null);
        setPendingEditPayment(null);
        if (msg) showToast(msg, 'warning');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const amount = parseFloat(formData.amount);
            const discount = parseFloat(formData.discount) || 0;

            const selectedBill = bills.find(inv => inv.id === formData.bill_id);
            if (!selectedBill && !editingPaymentId) throw new Error('Selected bill not found');

            // Overpayments are allowed — a negative balance means credit on the account

            let paymentData: any;
            let paymentError: any;

            if (editingPaymentId) {
                // UPDATE logic
                const originalPayment = payments.find(p => p.id === editingPaymentId);
                if (!originalPayment) throw new Error('Original payment not found');

                const { data: currentBill, error: billFetchError } = await supabase
                    .from('bills')
                    .select('*')
                    .eq('id', originalPayment.bill_id)
                    .single();
                
                if (billFetchError) throw billFetchError;

                const amountDiff = amount - originalPayment.amount;
                const discountDiff = discount - (originalPayment.discount_amount || 0);

                const newTotalAmount = Math.max(0, (currentBill.total_amount || 0) - discountDiff);
                const newDiscountAmount = Math.max(0, (currentBill.discount_amount || 0) + discountDiff);
                const newPaidAmount = (currentBill.paid_amount || 0) + amountDiff;
                const newBalance = newTotalAmount - newPaidAmount;
                const newStatus = newBalance <= 0 ? 'paid' : newPaidAmount > 0 ? 'partially_paid' : 'unpaid';

                // Revert old payment influence
                let currentSF = currentBill.shortfall_balance ?? 0;
                let currentMA = currentBill.medical_aid_balance ?? 0;

                // Fallback for uninitialized older bills
                if (currentSF === 0 && currentMA === 0 && (currentBill.balance || 0) > 0) {
                    currentSF = currentBill.shortfall_amount || 0;
                    currentMA = currentBill.medical_aid_amount || 0;
                }

                let newShortfallBalance = currentSF;
                let newMedicalAidBalance = currentMA;

                // Revert old payment influence
                // For split bills, discount always came off shortfall — revert that way
                const wasSplitBill = (currentBill.medical_aid_amount || 0) > 0;
                if (originalPayment.target_portion === 'shortfall') {
                    newShortfallBalance += (originalPayment.amount + (originalPayment.discount_amount || 0));
                } else {
                    // MA payment: only the amount reduced MA balance; discount reduced SF balance
                    newMedicalAidBalance += originalPayment.amount;
                    if (wasSplitBill) {
                        newShortfallBalance += (originalPayment.discount_amount || 0);
                    } else {
                        newMedicalAidBalance += (originalPayment.discount_amount || 0);
                    }
                }

                // Apply new payment influence
                const isSplitBill = (currentBill.medical_aid_amount || 0) > 0;
                if (formData.target_portion === 'shortfall') {
                    newShortfallBalance -= (amount + discount);
                } else {
                    // MA payment: amount reduces MA balance; discount always reduces SF on split bills
                    newMedicalAidBalance -= amount;
                    if (isSplitBill) {
                        newShortfallBalance -= discount;
                    } else {
                        newMedicalAidBalance -= discount;
                    }
                }

                await supabase.from('bills').update({
                    total_amount: newTotalAmount,
                    discount_amount: newDiscountAmount,
                    paid_amount: newPaidAmount,
                    balance: newBalance,
                    shortfall_balance: Math.max(0, newShortfallBalance),
                    medical_aid_balance: Math.max(0, newMedicalAidBalance),
                    status: newStatus
                }).eq('id', currentBill.id);

                const { data, error } = await supabase
                    .from('payments')
                    .update({
                        amount,
                        discount_amount: discount,
                        payment_method: formData.payment_method === 'eft' ? 'bank_transfer' : formData.payment_method,
                        payment_date: formData.payment_date || new Date().toISOString(),
                        notes: formData.notes
                    })
                    .eq('id', editingPaymentId)
                    .select()
                    .single();
                
                paymentData = data;
                paymentError = error;
            } else {
                // CREATE logic
                const { data, error } = await supabase
                    .from('payments')
                    .insert([{
                        bill_id: formData.bill_id,
                        amount,
                        discount_amount: discount,
                        payment_method: formData.payment_method === 'eft' ? 'bank_transfer' : formData.payment_method,
                        target_portion: formData.target_portion,
                        patient_id: selectedBill!.patient_id,
                        notes: formData.notes,
                        payment_date: formData.payment_date || new Date().toISOString(),
                        branch_id: profile?.branch_id,
                        received_by: profile?.id
                    }])
                    .select()
                    .single();
                
                paymentData = data;
                paymentError = error;

                if (!paymentError) {
                    const newTotalAmount = Math.max(0, (selectedBill!.total_amount || 0) - discount);
                    const newDiscountAmount = (selectedBill!.discount_amount || 0) + discount;
                    const newPaidAmount = (selectedBill!.paid_amount || 0) + amount;
                    // Allow negative balance (credit/overpayment)
                    const newBalance = newTotalAmount - newPaidAmount;
                    
                    let newStatus = newBalance <= 0 ? 'paid' : newPaidAmount > 0 ? 'partially_paid' : 'unpaid';

                    // Update MA/SF balances
                    let currentSF = selectedBill!.shortfall_balance ?? 0;
                    let currentMA = selectedBill!.medical_aid_balance ?? 0;

                    // Fallback for older bills
                    if (currentSF === 0 && currentMA === 0 && (selectedBill!.balance || 0) > 0) {
                        currentSF = selectedBill!.shortfall_amount || 0;
                        currentMA = selectedBill!.medical_aid_amount || 0;
                    }

                    let newShortfallBalance = currentSF;
                    let newMedicalAidBalance = currentMA;

                    const isSplitBill = (selectedBill!.medical_aid_amount || 0) > 0;

                    if (formData.target_portion === 'shortfall') {
                        // Allow negative (overpayment credit)
                        newShortfallBalance = newShortfallBalance - (amount + discount);
                    } else {
                        // Medical Aid payment: amount reduces MA balance
                        // Discount ALWAYS goes to patient shortfall on split bills
                        newMedicalAidBalance = newMedicalAidBalance - amount;
                        if (isSplitBill) {
                            newShortfallBalance = newShortfallBalance - discount;
                        } else {
                            // Patient-only bill: discount reduces MA balance (no split)
                            newMedicalAidBalance = newMedicalAidBalance - discount;
                        }
                    }

                    await supabase.from('bills').update({ 
                        total_amount: newTotalAmount,
                        discount_amount: newDiscountAmount,
                        paid_amount: newPaidAmount,
                        balance: newBalance,
                        shortfall_balance: newShortfallBalance,
                        medical_aid_balance: newMedicalAidBalance,
                        status: newStatus 
                    }).eq('id', formData.bill_id);

                    // SEND SMS: Payment Received
                    const patient = selectedBill?.patient;
                    if (patient && (patient as any).phone && profile?.branch_id) {
                       await smsService.sendSms({
                           recipientPhone: (patient as any).phone,
                           triggerType: 'payment_received',
                           variables: {
                               patient_name: patient.full_name,
                               amount: amount.toLocaleString(),
                               bill_number: selectedBill!.bill_number,
                               balance: newBalance.toLocaleString()
                           },
                           branchId: profile.branch_id,
                           patientId: selectedBill!.patient_id
                       });
                    }

                    // SEND EMAIL: Payment Received
                    if (patient && (patient as any).email && profile?.branch_id) {
                       await emailService.sendEmail({
                           recipientEmail: (patient as any).email,
                           recipientName: patient.full_name,
                           triggerType: 'payment_received',
                           placeholders: {
                               patient_name: patient.full_name,
                               amount: amount.toLocaleString(),
                               bill_number: selectedBill!.bill_number,
                               balance: newBalance.toLocaleString()
                           },
                           branchId: profile.branch_id
                       });
                    }
                }
            }

            if (paymentError) throw paymentError;

            if (paymentData) {
                await accountingSync.postPaymentJournalEntry(paymentData);
            }

            if (profile?.id && profile?.branch_id && paymentData) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: editingPaymentId ? 'UPDATE' : 'CREATE',
                    tableName: 'payments',
                    recordId: paymentData.id,
                    details: `${editingPaymentId ? 'Updated' : 'Recorded'} payment of ${amount} (Discount: ${discount})`,
                    newValues: { ...formData, amount, discount, payment_date: paymentData.payment_date }
                });
            }

            setShowModal(false);
            resetForm();
            loadPayments(true);
            loadUnpaidBills();
            showToast(editingPaymentId ? 'Payment updated successfully!' : 'Payment recorded successfully!');
        } catch (error: any) {
            console.error('Error recording payment:', error);
            showToast(error.message || 'Failed to record payment', 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            bill_id: '',
            payment_date: new Date().toISOString().split('T')[0],
            amount: '',
            discount: '0',
            payment_method: 'cash',
            target_portion: 'shortfall',
            notes: ''
        });
        setBillSearch('');
        setEditingPaymentId(null);
        setIsDropdownOpen(false);
    };

    // Client-side secondary filters (search + debtor + medical aid applied on the already-paginated data)
    const filteredPayments = useMemo(() => {
        let result = payments;
        if (debouncedSearch.trim()) {
            const q = debouncedSearch.toLowerCase();
            result = result.filter(p =>
                (p.bill?.patient?.full_name || '').toLowerCase().includes(q) ||
                (p.bill?.bill_number || '').toLowerCase().includes(q) ||
                (p.bill?.patient?.file_number || '').toLowerCase().includes(q)
            );
        }
        if (filterDebtors) {
            result = result.filter(p => (p.bill?.patient?.total_cumulative_balance || 0) > 0);
        }
        if (filterMedicalAid !== 'all') {
            result = result.filter(p => p.bill?.patient?.medical_aid_id === filterMedicalAid);
        }
        return result;
    }, [payments, debouncedSearch, filterDebtors, filterMedicalAid]);

    const filteredBills = useMemo(() => bills.filter(inv => 
        inv.bill_number.toLowerCase().includes(billSearch.toLowerCase()) ||
        inv.patient?.full_name.toLowerCase().includes(billSearch.toLowerCase())
    ), [bills, billSearch]);

    const totalPages = Math.ceil(totalPaymentCount / itemsPerPage);
    // Data is already paginated from the server — use directly
    const paginated = filteredPayments;

    if (showPrintView && selectedPaymentForPrint && branch) {
        return (
            <ReceiptPrintView 
                data={selectedPaymentForPrint} 
                branch={branch} 
                onBack={closeReceiptView} 
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* ── Accountant Edit Approval Flow ────────────────────────────────── */}
            {showRequestModal && pendingEditPayment && (
                <RequestEditModal
                    recordType="payment"
                    recordContext={`Payment of $${pendingEditPayment.amount.toLocaleString()} — ${pendingEditPayment.bill?.bill_number || ''} (${pendingEditPayment.bill?.patient?.full_name || ''})`}
                    onSubmit={handleApprovalSubmit}
                    onCancel={() => { setShowRequestModal(false); setPendingEditPayment(null); }}
                    isSubmitting={isSubmittingApproval}
                />
            )}
            {approvalRequest && (
                <ApprovalGate
                    request={approvalRequest}
                    onApproved={handleApprovalGranted}
                    onDenied={handleApprovalDismissed}
                    onCancelled={() => handleApprovalDismissed()}
                />
            )}
            {/* ─────────────────────────────────────────────────────────────────── */}

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Revenue &amp; Payments</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Track payments and financial transactions</p>
                </div>
                <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-cyan-600 text-white px-5 py-2.5 rounded-lg hover:bg-cyan-700 transition font-semibold text-sm shadow">
                    <Plus className="w-4 h-4" /> Record Payment
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    {/* Search - 3 cols */}
                    <div className="md:col-span-3 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search Patients..."
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-cyan-500 transition-all font-medium"
                        />
                    </div>

                    {/* Method & Medical Aid - 3 cols */}
                    <div className="md:col-span-3 grid grid-cols-2 gap-2">
                        <select
                            value={filterMethod}
                            onChange={(e) => { setFilterMethod(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-cyan-500 font-bold text-gray-600"
                        >
                            <option value="all">Methods</option>
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                            <option value="eft">EFT</option>
                        </select>
                        <select
                            value={filterMedicalAid}
                            onChange={(e) => { setFilterMedicalAid(e.target.value); setCurrentPage(1); }}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-cyan-500 font-bold text-gray-600"
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
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-cyan-500 font-bold text-gray-600"
                        >
                            <option value="all">Time Range</option>
                            <option value="7">Last 7 Days</option>
                            <option value="14">Last 14 Days</option>
                            <option value="21">Last 21 Days</option>
                            <option value="30">Last 30 Days</option>
                            <option value="60">Last 60 Days</option>
                            <option value="90">Last 90 Days</option>
                            <option value="custom" disabled>Custom Range</option>
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
                                className="w-full pl-7 pr-1 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
                            />
                        </div>
                        <div className="relative flex-1">
                            <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setTimeRange('custom'); setCurrentPage(1); }}
                                className="w-full pl-7 pr-1 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] outline-none focus:ring-2 focus:ring-cyan-500 font-bold"
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
                        
                        {(searchQuery || filterMethod !== 'all' || filterMedicalAid !== 'all' || startDate || endDate || filterDebtors) && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    setFilterMethod('all');
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
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Patient</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">File No</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">INV #</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Bill Total</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-right text-xs font-bold text-cyan-600 uppercase tracking-wider">Payment</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-right text-xs font-bold text-amber-500 uppercase tracking-wider">Discount</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-right text-xs font-bold text-orange-600 uppercase tracking-wider">Balance</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Method</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Notes</th>
                                <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-center text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={11} className="border border-gray-200 dark:border-gray-700 px-6 py-10 text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600 mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredPayments.length === 0 ? (
                                <tr><td colSpan={11} className="border border-gray-200 dark:border-gray-700 px-5 py-16 text-center text-sm font-medium text-gray-400">No payments found</td></tr>
                            ) : (
                                paginated.map((p) => (
                                    <tr key={p.id} className="hover:bg-cyan-50/40 dark:hover:bg-cyan-900/10 transition">
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                            {new Date(p.payment_date).toLocaleDateString()}
                                            <div className="text-xs text-gray-400">{new Date(p.payment_date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5">
                                            <div className="text-sm font-semibold text-gray-900 dark:text-white">{p.bill?.patient?.full_name}</div>
                                            <div className="text-xs text-blue-600 font-mono">{formatPatientNumber(p.bill?.patient?.patient_number)}</div>
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                            {p.bill?.patient?.file_number ? formatFileNumber(p.bill.patient.file_number) : <span className="text-gray-400 font-normal">NO FILE</span>}
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5 font-mono text-sm font-semibold text-gray-700 dark:text-gray-300">{p.bill?.bill_number}</td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-right text-sm font-semibold text-gray-600 dark:text-gray-300">${(p.bill?.total_amount || 0).toLocaleString()}</td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-right"><span className="text-sm font-bold text-cyan-600">${p.amount.toLocaleString()}</span></td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-right"><span className="text-sm font-semibold text-amber-600">${(p.discount_amount || 0).toLocaleString()}</span></td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-right">
                                            {(() => {
                                                const stored = p.bill?.balance ?? 0;
                                                const paid = p.bill?.paid_amount ?? 0;
                                                const eff = stored > 0 ? stored : Math.max(0, (p.bill?.total_amount || 0) - paid);
                                                return eff > 0
                                                    ? <span className="text-sm font-bold text-orange-600">${eff.toLocaleString()}</span>
                                                    : <span className="text-sm font-bold text-green-600">Settled</span>;
                                            })()}
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5">
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 uppercase border border-gray-200">
                                                {(p.payment_method === 'cash' || p.payment_method === 'standard') ? <Banknote className="w-3 h-3 text-green-600" /> : p.payment_method === 'card' ? <CreditCard className="w-3 h-3 text-blue-600" /> : <Wallet className="w-3 h-3 text-purple-600" />}
                                                {p.payment_method === 'medical_aid' ? (p.bill?.patient?.medical_aid?.name || 'Medical Aid') : (p.payment_method === 'standard' || !p.payment_method) ? 'Cash' : p.payment_method.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400 max-w-[160px] truncate">{p.notes || '—'}</td>
                                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-2.5">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => openReceiptView(p)} className="p-1.5 text-gray-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-md transition" title="Print"><Printer className="w-4 h-4" /></button>
                                                {profile?.role === 'admin' && (<>
                                                    <button onClick={() => handleEditPayment(p)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition" title="Edit"><Pencil className="w-4 h-4" /></button>
                                                    <button onClick={() => handleDeletePayment(p)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                                </>)}
                                            </div>
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
                                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, totalPaymentCount)} of {totalPaymentCount}
                            </p>
                            <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                                <select
                                    value={itemsPerPage === totalPaymentCount ? 'all' : itemsPerPage}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === 'all') {
                                            setItemsPerPage(totalPaymentCount || 1);
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
                        
                        {totalPages > 1 && (
                            <div className="flex gap-2">
                                <button
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                                >
                                    <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                </button>
                                <div className="flex gap-1">
                                    {(() => {
                                        const pages: (number | 'ellipsis')[] = [];
                                        if (totalPages <= 7) {
                                            for (let i = 1; i <= totalPages; i++) pages.push(i);
                                        } else {
                                            pages.push(1);
                                            if (currentPage > 3) pages.push('ellipsis');
                                            for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                                            if (currentPage < totalPages - 2) pages.push('ellipsis');
                                            pages.push(totalPages);
                                        }
                                        return pages.map((page, idx) =>
                                            page === 'ellipsis'
                                                ? <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400">…</span>
                                                : <button
                                                    key={page}
                                                    onClick={() => setCurrentPage(page)}
                                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === page ? 'bg-cyan-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
                                                >{page}</button>
                                        );
                                    })()}
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
                                {editingPaymentId ? <Pencil className="w-5 h-5 text-amber-500" /> : <Plus className="w-6 h-6 text-cyan-600" />}
                                {editingPaymentId ? 'Edit Payment' : 'Record Payment'}
                            </h2>
                            <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="relative">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Bill (Search by Patient or INV #) *</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <input
                                        type="text"
                                        placeholder="Type patient name or INV number..."
                                        value={billSearch}
                                        onFocus={() => setIsDropdownOpen(true)}
                                        onChange={(e) => {
                                            setBillSearch(e.target.value);
                                            setIsDropdownOpen(true);
                                            if (!e.target.value) setFormData({ ...formData, bill_id: '' });
                                        }}
                                        className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        required
                                    />
                                    {isDropdownOpen && (
                                        <div className="absolute z-[60] left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                            {filteredBills.length > 0 ? (
                                                filteredBills.map((bill) => (
                                                    <button
                                                        key={bill.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData({ ...formData, bill_id: bill.id });
                                                            setBillSearch(`${bill.bill_number} - ${bill.patient?.full_name}`);
                                                            setIsDropdownOpen(false);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 border-b border-gray-100 dark:border-gray-700 last:border-0 transition"
                                                    >
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <div className="text-sm font-bold text-gray-900 dark:text-white">{bill.bill_number}</div>
                                                                <div className="text-xs text-gray-500">{bill.patient?.full_name}</div>
                                                            </div>
                                                            <div className="text-xs font-bold text-cyan-600 text-right">
                                                                <div>Bill: ${bill.total_amount.toLocaleString()}</div>
                                                                <div className="text-[10px] text-amber-600">Bal: ${(bill.balance || 0).toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="px-4 py-3 text-sm text-gray-500 text-center">No matching bills found</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {formData.bill_id && (
                                    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex justify-between text-xs font-medium">
                                        <div className="text-gray-500">Current Balance:</div>
                                        <div className="text-amber-600 font-bold">
                                            ${(bills.find(i => i.id === formData.bill_id)?.balance || 0).toLocaleString()}
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
                            <div className="grid grid-cols-2 gap-4">
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
                                    <label className="block text-sm font-medium text-amber-600 mb-1">Discount Amount</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-amber-400">$</div>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.discount}
                                            onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                                            className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-amber-600"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Live Overpayment / Credit indicator */}
                            {(() => {
                                if (!formData.bill_id) return null;
                                const selectedBill = bills.find(i => i.id === formData.bill_id);
                                if (!selectedBill) return null;
                                const effectiveBal = (selectedBill.balance ?? 0) > 0
                                    ? (selectedBill.balance ?? 0)
                                    : Math.max(0, (selectedBill.total_amount || 0) - (selectedBill.paid_amount || 0));
                                const enteredAmt = parseFloat(formData.amount) || 0;
                                const credit = enteredAmt - effectiveBal;
                                if (credit <= 0) return null;
                                return (
                                    <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg">
                                        <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-800 flex items-center justify-center flex-shrink-0">
                                            <span className="text-violet-600 font-black text-sm">↑</span>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-violet-600 tracking-widest">Overpayment / Credit</p>
                                            <p className="text-sm font-black text-violet-700 dark:text-violet-300">
                                                +${credit.toLocaleString(undefined, { minimumFractionDigits: 2 })} credit will be recorded on this account
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}

                                 <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Date *</label>
                                    <input
                                        type="date"
                                        value={formData.payment_date}
                                        onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Method *</label>
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
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Portion *</label>
                                    <select
                                        value={formData.target_portion}
                                        onChange={(e) => setFormData({ ...formData, target_portion: e.target.value as 'shortfall' | 'medical_aid' })}
                                        className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    >
                                        <option value="shortfall">Patient Shortfall</option>
                                        <option value="medical_aid">Medical Aid Portion</option>
                                    </select>
                                </div>
                            </div>

                            {(formData.payment_method === 'medical_aid' || formData.target_portion === 'medical_aid') && formData.bill_id && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-wider mb-1">
                                        <CreditCard className="w-3.5 h-3.5" />
                                        Medical Aid Billing
                                    </div>
                                    <div className="text-sm font-black text-gray-900 dark:text-white">
                                        {bills.find(i => i.id === formData.bill_id)?.patient?.medical_aid?.name || (
                                            <span className="text-amber-600 italic">No medical aid assigned to this patient</span>
                                        )}
                                    </div>
                                </div>
                            )}


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
                                    onClick={() => { setShowModal(false); resetForm(); }}
                                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Processing...' : (editingPaymentId ? 'Update Payment' : 'Record Payment')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
