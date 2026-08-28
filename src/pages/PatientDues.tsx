import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  Search, Download, DollarSign, FileText, Phone, Mail, 
  FileSpreadsheet, ChevronLeft, ChevronRight, RefreshCw, 
  AlertCircle, TrendingUp, TrendingDown, Receipt, X, CreditCard,
  User, CheckCircle, ArrowUpDown, Filter
} from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { autoAllocateCredits } from '../utils/creditAllocation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PatientDueRecord {
  id: string;
  patient_number: string;
  file_number?: string | null;
  full_name: string;
  title?: string;
  phone?: string;
  email?: string;
  national_id?: string;
  status: string;
  created_at: string;
  total_billed: number;
  total_paid: number;
  balance: number;
  bills_count: number;
  payments_count: number;
  is_medical_aid: boolean;
  medical_aid_balance: number;
  shortfall_balance: number;
}

export function PatientDues() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [patientsWithDues, setPatientsWithDues] = useState<PatientDueRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [minBalanceFilter, setMinBalanceFilter] = useState<'all' | '50' | '100' | '500' | '1000'>('all');
  const [sortBy, setSortBy] = useState<'balance_desc' | 'balance_asc' | 'name_asc' | 'recent'>('balance_desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Statement / Ledger Modal State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<PatientDueRecord | null>(null);
  const [patientBills, setPatientBills] = useState<any[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [billSummary, setBillSummary] = useState({
    totalBilled: 0,
    totalPaid: 0,
    balance: 0,
    medicalAidBilled: 0,
    medicalAidBalance: 0
  });

  const branchId = profile?.branch_id;
  const isSuperAdmin = profile?.role === 'super_admin';

  // Navigate to bills page via sessionStorage
  const navigateToBills = (state: Record<string, any>) => {
    sessionStorage.setItem('billsNavState', JSON.stringify(state));
    window.history.pushState({}, '', '/bills');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  /**
   * Fetch all patients with embedded bills across the entire database (no limits),
   * compute true balance (total_billed - total_paid),
   * and isolate ONLY patients with positive dues.
   */
  const loadPatientDues = useCallback(async (isSilent = false) => {
    if (!branchId && !isSuperAdmin) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Fetch ALL patients in the database without any limits (paginated in chunks)
      const CHUNK_SIZE = 1000;
      let allPatients: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('patients')
          .select(`
            id, patient_number, file_number, full_name, title,
            phone, email, national_id, status, created_at, branch_id, medical_aid_id,
            bills(total_amount, paid_amount, medical_aid_balance, shortfall_balance)
          `)
          .order('id', { ascending: true })
          .range(from, from + CHUNK_SIZE - 1);

        if (!isSuperAdmin && branchId) {
          query = query.eq('branch_id', branchId);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allPatients = allPatients.concat(data);
          from += data.length;
          // If returned rows is less than requested chunk, we've reached the very end
          if (data.length < CHUNK_SIZE) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      // 2. Compute balance per patient — exact same formula as AllPatients line 470
      const duesList: PatientDueRecord[] = allPatients
        .map((p: any) => {
          const totalBilled = (p.bills || []).reduce((s: number, b: any) => s + (Number(b.total_amount) || 0), 0);
          const totalPaid = (p.bills || []).reduce((s: number, b: any) => s + (Number(b.paid_amount) || 0), 0);
          const balance = Math.max(0, totalBilled - totalPaid);
          const medAidBal = (p.bills || []).reduce((s: number, b: any) => s + (Number(b.medical_aid_balance) || 0), 0);
          const shortfallBal = (p.bills || []).reduce((s: number, b: any) => s + (Number(b.shortfall_balance) || 0), 0);

          return {
            id: p.id,
            patient_number: p.patient_number || 'N/A',
            file_number: p.file_number ? p.file_number.split('-')[0].trim() : null,
            full_name: p.full_name || 'Unnamed Patient',
            title: p.title || '',
            phone: p.phone || '',
            email: p.email || '',
            national_id: p.national_id || '',
            status: p.status || 'active',
            created_at: p.created_at || '',
            total_billed: totalBilled,
            total_paid: totalPaid,
            balance,
            bills_count: (p.bills || []).length,
            payments_count: 0,
            is_medical_aid: !!p.medical_aid_id,
            medical_aid_balance: medAidBal,
            shortfall_balance: shortfallBal,
          } as PatientDueRecord;
        })
        .filter(pt => pt.balance > 0.009); // Only patients with active outstanding balance

      setPatientsWithDues(duesList);
    } catch (err: any) {
      console.error('Error loading patient dues:', err);
      showToast('Failed to load patient dues: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId, isSuperAdmin, showToast]);

  useEffect(() => {
    loadPatientDues();
  }, [loadPatientDues]);

  // Filter & Sort
  const filteredAndSortedPatients = useMemo(() => {
    let list = [...patientsWithDues];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(p => 
        p.full_name.toLowerCase().includes(q) ||
        p.patient_number.toLowerCase().includes(q) ||
        (p.phone && p.phone.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.file_number && p.file_number.toLowerCase().includes(q)) ||
        (p.national_id && p.national_id.toLowerCase().includes(q))
      );
    }

    // Min balance threshold
    if (minBalanceFilter !== 'all') {
      const minVal = Number(minBalanceFilter);
      list = list.filter(p => p.balance >= minVal);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'balance_desc') return b.balance - a.balance;
      if (sortBy === 'balance_asc') return a.balance - b.balance;
      if (sortBy === 'name_asc') return a.full_name.localeCompare(b.full_name);
      if (sortBy === 'recent') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return 0;
    });

    return list;
  }, [patientsWithDues, searchQuery, minBalanceFilter, sortBy]);

  // Statistics — always reflects current filter state
  const isFiltered = searchQuery.trim() !== '' || minBalanceFilter !== 'all';

  const stats = useMemo(() => {
    // Use filtered list so cards update when filters are applied
    const list = filteredAndSortedPatients;
    const totalCount = list.length;
    const totalBalance = list.reduce((sum, p) => sum + p.balance, 0);
    const avgBalance = totalCount > 0 ? totalBalance / totalCount : 0;
    const maxPatient = list.length > 0
      ? [...list].sort((a, b) => b.balance - a.balance)[0]
      : null;

    return {
      totalCount,
      totalBalance,
      avgBalance,
      maxBalance: maxPatient?.balance || 0,
      maxPatientName: maxPatient?.full_name || 'N/A',
      maxPatientFile: maxPatient?.file_number || maxPatient?.patient_number || ''
    };
  }, [filteredAndSortedPatients]);

  // Always-visible unfiltered totals (for reference in footer/subtitle)
  const totalPatientCount = patientsWithDues.length;
  const totalOutstanding = patientsWithDues.reduce((sum, p) => sum + p.balance, 0);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedPatients.length / itemsPerPage));
  const paginatedPatients = useMemo(() => {
    if (itemsPerPage >= filteredAndSortedPatients.length) return filteredAndSortedPatients;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedPatients.slice(start, start + itemsPerPage);
  }, [filteredAndSortedPatients, currentPage, itemsPerPage]);

  // Statement / Ledger Loading
  const loadPatientHistory = async (patientId: string) => {
    try {
      setHistoryLoading(true);
      setHistorySearch('');
      setBillSummary({ totalBilled: 0, totalPaid: 0, balance: 0, medicalAidBilled: 0, medicalAidBalance: 0 });

      const fetchBills = () => supabase
        .from('bills')
        .select('id, bill_number, bill_date, due_date, total_amount, paid_amount, discount_amount, balance, medical_aid_amount, medical_aid_balance, shortfall_amount, shortfall_balance, payment_method, status')
        .eq('patient_id', patientId)
        .order('bill_date', { ascending: true });

      let { data: bills } = await fetchBills();

      if (bills && bills.length > 0) {
        const totalPaidCheck = bills.reduce((s, b) => s + (b.paid_amount || 0), 0);
        const totalOwedCheck = bills.reduce((s, b) => s + Math.max(0, (b.total_amount || 0) - (b.discount_amount || 0)), 0);
        const hasUnpaid = bills.some(b => b.status !== 'paid');
        if (totalPaidCheck > totalOwedCheck && hasUnpaid) {
          await autoAllocateCredits(patientId, profile?.branch_id ?? null);
          const { data: refreshed } = await fetchBills();
          bills = refreshed;
        }
      }

      setPatientBills(bills || []);
      const bIds = (bills || []).map(b => b.id);

      const totalBilled = (bills || []).reduce((s, b) => s + (b.total_amount || 0), 0);
      const totalPaid   = (bills || []).reduce((s, b) => s + (b.paid_amount || 0), 0);
      const balance     = Math.max(0, totalBilled - totalPaid);
      const medicalAidBilled  = (bills || []).reduce((s, b) => s + (b.medical_aid_amount || 0), 0);
      const medicalAidBalance = (bills || []).reduce((s, b) => s + (b.medical_aid_balance || 0), 0);
      setBillSummary({ totalBilled, totalPaid, balance, medicalAidBilled, medicalAidBalance });

      if (bIds.length === 0) {
        setPaymentHistory([]);
        return;
      }

      const { data: pmts, error } = await supabase
        .from('payments')
        .select('id, amount, payment_method, payment_date, created_at, target_portion, notes, bill_id, discount_amount')
        .in('bill_id', bIds)
        .order('payment_date', { ascending: true });

      if (error) throw error;

      setPaymentHistory((pmts || []).map(p => {
        const b = (bills || []).find(x => x.id === p.bill_id);
        return { ...p, bill_number: b?.bill_number, bill_date: b?.bill_date };
      }));
    } catch (err) {
      console.error('Error loading patient history:', err);
      showToast('Failed to load payment history', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenLedger = (patient: PatientDueRecord) => {
    setSelectedPatientForHistory(patient);
    setPaymentHistory([]);
    setShowHistoryModal(true);
    loadPatientHistory(patient.id);
  };

  // Export Table to Excel
  const handleExportDuesExcel = () => {
    const data = filteredAndSortedPatients.map((p, idx) => ({
      '#': idx + 1,
      'Patient Name': p.full_name,
      'Patient ID': p.patient_number,
      'File No': p.file_number || 'N/A',
      'Phone': p.phone || 'N/A',
      'Email': p.email || 'N/A',
      'Total Billed ($)': Number(p.total_billed.toFixed(2)),
      'Total Paid ($)': Number(p.total_paid.toFixed(2)),
      'Balance Due ($)': Number(p.balance.toFixed(2)),
      'Med Aid Balance ($)': p.is_medical_aid ? Number(p.medical_aid_balance.toFixed(2)) : '',
      'Shortfall Balance ($)': p.is_medical_aid ? Number(p.shortfall_balance.toFixed(2)) : '',
    }));
    exportToExcel(data, 'spiritmed_patient_dues_report');
  };

  // Export Table to PDF
  const handleExportDuesPDF = () => {
    const headers = ['#', 'Patient Name', 'Patient ID', 'File No', 'Contact', 'Balance Due', 'Med Aid Bal', 'Shortfall Bal'];
    const rows = filteredAndSortedPatients.map((p, idx) => [
      idx + 1,
      p.full_name,
      p.patient_number,
      p.file_number || 'N/A',
      p.phone || p.email || 'N/A',
      `$${p.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      p.is_medical_aid ? `$${p.medical_aid_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
      p.is_medical_aid ? `$${p.shortfall_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
    ]);

    // Summary Total row
    const totalBal = filteredAndSortedPatients.reduce((sum, p) => sum + p.balance, 0);
    const totalMedAid = filteredAndSortedPatients.reduce((sum, p) => sum + p.medical_aid_balance, 0);
    const totalShortfall = filteredAndSortedPatients.reduce((sum, p) => sum + p.shortfall_balance, 0);
    rows.push([
      '',
      'TOTAL OUTSTANDING',
      `${filteredAndSortedPatients.length} Patients`,
      '',
      '',
      `$${totalBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `$${totalMedAid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `$${totalShortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ]);

    exportToPDF(headers, rows, 'SpiritMed - Patient Dues & Outstanding Balances Report', 'spiritmed_patient_dues_report');
  };

  // Statement PDF Export inside modal
  const handleExportStatement = (format: 'pdf' | 'excel') => {
    if (!selectedPatientForHistory) return;
    const patient = selectedPatientForHistory;
    const fname = `${patient.full_name.replace(/\s+/g, '_')}_Statement`;
    const allEventsBase = [
      ...patientBills.map(b => ({ _type: 'bill', _date: new Date(b.bill_date), ...b })),
      ...paymentHistory.map(p => ({ _type: 'payment', _date: new Date(p.payment_date), ...p }))
    ].sort((a, b) => a._date.getTime() - b._date.getTime());

    if (format === 'excel') {
      let running = 0;
      const rows = allEventsBase.map(e => {
        let debit = '', credit = '';
        if (e._type === 'bill') { running += (e.total_amount || 0); debit = `$${(e.total_amount || 0).toFixed(2)}`; }
        else { running -= (e.amount || 0); credit = `$${(e.amount || 0).toFixed(2)}`; }
        const bal = running < 0 ? `-$${Math.abs(running).toFixed(2)} CR` : `$${running.toFixed(2)}`;
        return {
          'Date': e._type === 'bill' ? new Date(e.bill_date).toLocaleDateString() : new Date(e.payment_date).toLocaleDateString(),
          'Reference': e.bill_number || '',
          'Type': e._type === 'bill' ? 'Invoice' : 'Payment',
          'Details': e._type === 'payment' ? (e.payment_method || 'cash').replace(/_/g, ' ') : (e.status || 'unpaid').replace(/_/g, ' '),
          'Debit (+)': debit,
          'Credit (-)': credit,
          'Balance': bal,
        };
      });
      const summaryRows = [
        { 'Date': 'SUMMARY', 'Reference': '', 'Type': 'Total Billed', 'Details': '', 'Debit (+)': `$${billSummary.totalBilled.toFixed(2)}`, 'Credit (-)': '', 'Balance': '' },
        { 'Date': '', 'Reference': '', 'Type': 'Total Paid', 'Details': '', 'Debit (+)': '', 'Credit (-)': `$${billSummary.totalPaid.toFixed(2)}`, 'Balance': '' },
        { 'Date': '', 'Reference': '', 'Type': billSummary.balance < 0 ? 'Credit Balance' : 'Outstanding', 'Details': '', 'Debit (+)': '', 'Credit (-)': '', 'Balance': billSummary.balance < 0 ? `-$${Math.abs(billSummary.balance).toFixed(2)} CR` : `$${billSummary.balance.toFixed(2)}` },
        { 'Date': '', 'Reference': '', 'Type': '', 'Details': '', 'Debit (+)': '', 'Credit (-)': '', 'Balance': '' },
      ];
      exportToExcel([...summaryRows, ...rows], fname);
    } else {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      doc.setFontSize(18); doc.setTextColor(30, 30, 30);
      doc.text('Patient Statement', 14, 18);
      doc.setFontSize(11); doc.setTextColor(80, 80, 80);
      doc.text(patient.full_name, 14, 26);
      doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      const subParts = [`Patient #: ${patient.patient_number || 'N/A'}`, patient.file_number ? `File #: ${patient.file_number}` : ''].filter(Boolean);
      doc.text(subParts.join('   ·   '), 14, 32);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);

      let pdfRunning = 0;
      for (const e of allEventsBase) {
        if (e._type === 'bill') pdfRunning += (e.total_amount || 0);
        else pdfRunning -= (e.amount || 0);
      }
      const finalLedgerBalance = pdfRunning;

      const cards = [
        { label: 'Total Billed', value: `$${billSummary.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: [219, 234, 254] as [number,number,number], textColor: [29, 78, 216] as [number,number,number] },
        { label: 'Total Paid', value: `$${billSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: [209, 250, 229] as [number,number,number], textColor: [4, 120, 87] as [number,number,number] },
        ...(finalLedgerBalance < 0 ? [{ label: 'Credit Balance', value: `-$${Math.abs(finalLedgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: [237, 233, 254] as [number,number,number], textColor: [109, 40, 217] as [number,number,number] }] : []),
        { label: 'Outstanding', value: `$${billSummary.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: billSummary.balance > 0 ? [254, 243, 199] as [number,number,number] : [243, 244, 246] as [number,number,number], textColor: billSummary.balance > 0 ? [146, 64, 14] as [number,number,number] : [75, 85, 99] as [number,number,number] },
        { label: 'Med Aid Bal', value: `$${billSummary.medicalAidBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: [224, 231, 255] as [number,number,number], textColor: [67, 56, 202] as [number,number,number] },
        { label: 'Bills / Pmts', value: `${patientBills.length} / ${paymentHistory.length}`, color: [243, 244, 246] as [number,number,number], textColor: [55, 65, 81] as [number,number,number] },
      ];
      const cardW = (pageW - 28 - (cards.length - 1) * 3) / cards.length;
      const cardY = 44; const cardH = 18;
      cards.forEach((card, i) => {
        const x = 14 + i * (cardW + 3);
        doc.setFillColor(...card.color);
        doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'F');
        doc.setFontSize(6); doc.setTextColor(100, 100, 100);
        doc.text(card.label.toUpperCase(), x + 3, cardY + 5);
        doc.setFontSize(9); doc.setTextColor(...card.textColor);
        doc.setFont(undefined, 'bold'); doc.text(card.value, x + 3, cardY + 13);
        doc.setFont(undefined, 'normal');
      });

      let running = 0;
      const tableBody = allEventsBase.map(e => {
        let debit = '', credit = '', typeStr = '', details = '';
        if (e._type === 'bill') { running += (e.total_amount || 0); debit = `$${(e.total_amount || 0).toFixed(2)}`; typeStr = 'Invoice'; details = (e.status || 'unpaid').replace(/_/g, ' ').toUpperCase(); }
        else { running -= (e.amount || 0); credit = `$${(e.amount || 0).toFixed(2)}`; typeStr = 'Payment'; details = (e.payment_method || 'cash').replace(/_/g, ' '); }
        const bal = running < 0 ? `-$${Math.abs(running).toFixed(2)}` : `$${running.toFixed(2)}`;
        const dateStr = e._type === 'bill' ? new Date(e.bill_date).toLocaleDateString() : new Date(e.payment_date).toLocaleDateString();
        return [dateStr, e.bill_number || '', typeStr, details, debit, credit, bal];
      });
      const finalBal = finalLedgerBalance < 0 ? `-$${Math.abs(finalLedgerBalance).toFixed(2)} CR` : `$${finalLedgerBalance.toFixed(2)}`;
      tableBody.push(['', '', 'TOTALS', '', `$${billSummary.totalBilled.toFixed(2)}`, `$${billSummary.totalPaid.toFixed(2)}`, finalBal]);
      autoTable(doc, {
        head: [['Date', 'Reference', 'Type', 'Details', 'Debit (+)', 'Credit (-)', 'Balance']],
        body: tableBody,
        startY: cardY + cardH + 6,
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 24 }, 2: { cellWidth: 20 }, 3: { cellWidth: 34 }, 4: { cellWidth: 26, halign: 'right' }, 5: { cellWidth: 26, halign: 'right' }, 6: { cellWidth: 26, halign: 'right' } },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      doc.save(`${fname}_${new Date().toISOString().split('T')[0]}.pdf`);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center font-bold">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Patient Due</h1>
              <p className="text-xs text-gray-500 font-medium">Patients with outstanding balances & receivables</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadPatientDues(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition disabled:opacity-50"
            title="Refresh patient dues list"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExportDuesExcel}
            disabled={filteredAndSortedPatients.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </button>
          <button
            onClick={handleExportDuesPDF}
            disabled={filteredAndSortedPatients.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      {/* ── KPI Statistic Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Total Patients with Dues */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Patients With Dues</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600">
              <User className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {stats.totalCount.toLocaleString()}
            {isFiltered && (
              <span className="ml-2 text-sm font-bold text-amber-500">
                / {totalPatientCount.toLocaleString()} total
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            {isFiltered ? 'Matching filter · ' : ''}
            {totalPatientCount.toLocaleString()} total debtor accounts
          </p>
        </div>

        {/* Total Outstanding Balance */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border-2 border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Total Outstanding</span>
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-400">
            ${stats.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-amber-600/70 dark:text-amber-400/60 mt-1">
            {isFiltered
              ? `Filtered · Total: $${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : 'Sum of all patient receivables'
            }
          </p>
        </div>
      </div>

      {/* ── Search & Filter Bar (always visible) ── */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by patient name, patient #, file #, contact phone..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Balance threshold filter */}
            <div className={`flex items-center gap-1.5 border rounded-xl px-3 py-1.5 transition ${
              minBalanceFilter !== 'all'
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-400 dark:border-amber-700'
                : 'bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600'
            }`}>
              <Filter className={`w-3.5 h-3.5 ${minBalanceFilter !== 'all' ? 'text-amber-500' : 'text-gray-400'}`} />
              <span className="text-[10px] font-bold text-gray-500 uppercase">Min Due:</span>
              <select
                value={minBalanceFilter}
                onChange={e => { setMinBalanceFilter(e.target.value as any); setCurrentPage(1); }}
                className="bg-transparent text-xs font-bold text-gray-800 dark:text-gray-200 outline-none cursor-pointer"
              >
                <option value="all">All Dues ($0+)</option>
                <option value="50">Over $50</option>
                <option value="100">Over $100</option>
                <option value="500">Over $500</option>
                <option value="1000">Over $1,000</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] font-bold text-gray-500 uppercase">Sort:</span>
              <select
                value={sortBy}
                onChange={e => { setSortBy(e.target.value as any); setCurrentPage(1); }}
                className="bg-transparent text-xs font-bold text-gray-800 dark:text-gray-200 outline-none cursor-pointer"
              >
                <option value="balance_desc">Highest Balance First</option>
                <option value="balance_asc">Lowest Balance First</option>
                <option value="name_asc">Patient Name (A-Z)</option>
                <option value="recent">Recently Added</option>
              </select>
            </div>

            {/* Reset Filters — only shown when a filter is active */}
            {isFiltered && (
              <button
                onClick={() => { setSearchQuery(''); setMinBalanceFilter('all'); setCurrentPage(1); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 rounded-xl text-[10px] font-bold uppercase tracking-wide hover:bg-rose-100 transition"
              >
                <X className="w-3 h-3" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Active filter summary */}
        {isFiltered && (
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
            <span className="text-[10px] font-bold text-gray-400 uppercase">Active Filters:</span>
            {searchQuery.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-bold">
                Search: &ldquo;{searchQuery.trim()}&rdquo;
              </span>
            )}
            {minBalanceFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 rounded-lg text-[10px] font-bold">
                Min Due: Over ${Number(minBalanceFilter).toLocaleString()}
              </span>
            )}
            <span className="ml-auto text-[10px] font-bold text-gray-500">
              Showing {filteredAndSortedPatients.length.toLocaleString()} of {totalPatientCount.toLocaleString()} patients
            </span>
          </div>
        )}
      </div>

      {/* ── Main Data Table with Visible Borders ── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-2 border-gray-300 dark:border-gray-600 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-900 border-b-2 border-gray-300 dark:border-gray-600">
              <tr className="divide-x divide-gray-300 dark:divide-gray-600">
                <th className="px-4 py-3.5 text-center text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider w-12 border-b border-gray-300 dark:border-gray-600">#</th>
                <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider border-b border-gray-300 dark:border-gray-600">Patient Name</th>
                <th className="px-5 py-3.5 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider border-b border-gray-300 dark:border-gray-600">Patient Contact</th>
                <th className="px-4 py-3.5 text-center text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider w-36 border-b border-gray-300 dark:border-gray-600">File Number</th>
                <th className="px-5 py-3.5 text-right text-xs font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider w-44 border-b border-gray-300 dark:border-gray-600">Patient Balance</th>
                <th className="px-5 py-3.5 text-center text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider w-44 border-b border-gray-300 dark:border-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Loading patient dues...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedPatients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <CheckCircle className="w-10 h-10 text-emerald-500" />
                      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">No Patient Dues Found</p>
                      <p className="text-xs text-gray-400 max-w-sm">All patient accounts are fully settled or no patients match your search criteria.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedPatients.map((patient, idx) => {
                  const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                  return (
                    <tr 
                      key={patient.id} 
                      className="hover:bg-amber-50/40 dark:hover:bg-amber-950/10 transition divide-x divide-gray-200 dark:divide-gray-700"
                    >
                      {/* # Index */}
                      <td className="px-4 py-3.5 text-center text-xs font-bold text-gray-400 font-mono">
                        {globalIdx}
                      </td>

                      {/* Patient Name */}
                      <td className="px-5 py-3.5">
                        <div>
                          <div className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">
                            {patient.full_name}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded">
                              {patient.patient_number}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Patient Contact */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-0.5">
                          {patient.phone ? (
                            <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 font-medium">
                              <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span>{patient.phone}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-[11px] italic">No phone</span>
                          )}

                        </div>
                      </td>

                      {/* Patient File Number */}
                      <td className="px-4 py-3.5 text-center">
                        {patient.file_number ? (
                          <span className="inline-block px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-black rounded-lg">
                            {patient.file_number}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px] font-medium">—</span>
                        )}
                      </td>

                      {/* Patient Balance */}
                      <td className="px-5 py-3.5 text-right bg-amber-50/30 dark:bg-amber-950/10">
                        {patient.is_medical_aid ? (
                          <div className="space-y-1">
                            {patient.shortfall_balance > 0 && (
                              <div className="flex justify-end items-center gap-2">
                                <span className="text-[10px] font-extrabold text-rose-500 dark:text-rose-400 uppercase tracking-wider">Shortfall</span>
                                <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                                  ${patient.shortfall_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                            {patient.medical_aid_balance > 0 && (
                              <div className="flex justify-end items-center gap-2">
                                <span className="text-[10px] font-extrabold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">Med Aid</span>
                                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                                  ${patient.medical_aid_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-end items-center gap-2">
                              <span className="text-[10px] font-extrabold text-amber-500 dark:text-amber-400 uppercase tracking-wider">Total</span>
                              <span className={`text-sm font-black ${patient.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}>
                                ${patient.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className={`text-sm font-black text-right ${patient.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}>
                            ${patient.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
                      </td>

                      {/* Action: Payment History / Ledger */}
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenLedger(patient)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition shadow-sm"
                            title="View Payment History & Patient Statement"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            Ledger
                          </button>
                          <button
                            onClick={() => navigateToBills({ preselectedPatient: patient, openPayment: true })}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl transition"
                            title="Record Payment"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer Totals */}
            {paginatedPatients.length > 0 && (
              <tfoot className="bg-gray-100 dark:bg-gray-900 border-t-2 border-gray-300 dark:border-gray-600 font-black">
                <tr className="divide-x divide-gray-300 dark:divide-gray-600">
                  <td colSpan={4} className="px-5 py-3 text-right uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    Total Dues ({filteredAndSortedPatients.length} patients):
                  </td>
                  <td className="px-5 py-3 text-right text-amber-700 dark:text-amber-400 text-sm">
                    ${filteredAndSortedPatients.reduce((sum, p) => sum + p.balance, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ── Pagination Bar (Default 25 Rows) ── */}
        {filteredAndSortedPatients.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t-2 border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <p className="text-xs text-gray-500 font-medium">
                Showing <span className="font-bold text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filteredAndSortedPatients.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{filteredAndSortedPatients.length}</span> patients with dues
              </p>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                <select
                  value={itemsPerPage === filteredAndSortedPatients.length ? 'all' : itemsPerPage}
                  onChange={e => {
                    const v = e.target.value;
                    setItemsPerPage(v === 'all' ? filteredAndSortedPatients.length || 1 : Number(v));
                    setCurrentPage(1);
                  }}
                  className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1 text-gray-800 dark:text-gray-200 outline-none cursor-pointer"
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
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>

                {[...Array(Math.min(totalPages, 7))].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                      currentPage === i + 1
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}

                {totalPages > 7 && (
                  <span className="text-xs text-gray-400 px-1 font-bold">... {totalPages}</span>
                )}

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Patient Statement & Payment History / Ledger Modal ── */}
      {showHistoryModal && selectedPatientForHistory && (() => {
        const searchQ = historySearch.toLowerCase();
        const allEvents: any[] = [
          ...patientBills.map(b => ({ ...b, _type: 'bill', _date: new Date(b.bill_date) })),
          ...paymentHistory.map(p => ({ ...p, _type: 'payment', _date: new Date(p.payment_date) }))
        ]
          .sort((a, b) => a._date.getTime() - b._date.getTime())
          .filter(e => {
            if (!searchQ) return true;
            if (e._type === 'bill') return (e.bill_number || '').toLowerCase().includes(searchQ) || (e.status || '').toLowerCase().includes(searchQ);
            return (e.bill_number || '').toLowerCase().includes(searchQ) || (e.payment_method || '').toLowerCase().includes(searchQ) || (e.notes || '').toLowerCase().includes(searchQ);
          });

        let running = 0;
        const eventsWithRunning = allEvents.map(e => {
          if (e._type === 'bill') { running += (e.total_amount || 0); }
          else { running -= (e.amount || 0); }
          return { ...e, _running: running };
        });

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[92vh]">
              {/* Modal Header */}
              <div className="flex justify-between items-start px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-2xl flex-shrink-0">
                <div>
                  <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-500" />
                    Patient Statement & Ledger
                  </h2>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">
                    <span className="text-amber-600 font-black uppercase">{selectedPatientForHistory.full_name}</span>
                    {' · '}{selectedPatientForHistory.patient_number}
                    {selectedPatientForHistory.file_number && (
                      <span className="ml-2 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded text-[9px] font-black uppercase">
                        File: {selectedPatientForHistory.file_number}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowHistoryModal(false);
                      setSelectedPatientForHistory(null);
                      navigateToBills({ preselectedPatient: selectedPatientForHistory });
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wide transition shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" /> New Bill
                  </button>
                  <button
                    onClick={() => {
                      setShowHistoryModal(false);
                      setSelectedPatientForHistory(null);
                      navigateToBills({ preselectedPatient: selectedPatientForHistory, openPayment: true });
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wide transition shadow-sm"
                  >
                    <DollarSign className="w-3.5 h-3.5" /> Record Payment
                  </button>
                  <button
                    onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); }}
                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition ml-1"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Statement Summary Strip */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 px-6 py-4 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800/40 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-0.5">Total Billed</p>
                  <p className="text-base font-black text-blue-700 dark:text-blue-300">
                    ${billSummary.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-800/40 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-0.5">Total Paid</p>
                  <p className="text-base font-black text-green-700 dark:text-green-300">
                    ${billSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className={`rounded-xl p-3 border ${billSummary.balance > 0 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-800/40' : 'bg-gray-50 dark:bg-gray-900/20 border-gray-100 dark:border-gray-700'}`}>
                  <p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${billSummary.balance > 0 ? 'text-amber-400' : 'text-gray-400'}`}>Outstanding</p>
                  <p className={`text-base font-black ${billSummary.balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500'}`}>
                    ${billSummary.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800/40 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-0.5">Med Aid Bal</p>
                  <p className="text-base font-black text-indigo-700 dark:text-indigo-300">
                    ${billSummary.medicalAidBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Bills / Pmts</p>
                  <p className="text-base font-black text-gray-700 dark:text-gray-300">
                    {patientBills.length} / {paymentHistory.length}
                  </p>
                </div>
              </div>

              {/* Statement Toolbar */}
              <div className="px-6 py-3 flex gap-3 items-center justify-between flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                <p className="text-[10px] text-gray-400 font-medium">
                  {patientBills.length} invoice{patientBills.length !== 1 ? 's' : ''} · {paymentHistory.length} payment{paymentHistory.length !== 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExportStatement('excel')}
                    disabled={patientBills.length === 0 && paymentHistory.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-100 transition border border-green-200 dark:border-green-800/50 disabled:opacity-40"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                  </button>
                  <button
                    onClick={() => handleExportStatement('pdf')}
                    disabled={patientBills.length === 0 && paymentHistory.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition border border-red-200 dark:border-red-800/50 disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </div>

              {/* Statement Transactions Table */}
              <div className="flex-1 overflow-y-auto">
                {historyLoading ? (
                  <div className="py-20 flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading statement...</p>
                  </div>
                ) : eventsWithRunning.length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center gap-3">
                    <CreditCard className="w-10 h-10 text-gray-200" />
                    <p className="text-xs font-bold text-gray-400">No transactions found</p>
                  </div>
                ) : (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 border-b dark:border-gray-700">
                      <tr className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                        <th className="px-4 py-3 w-28">Date</th>
                        <th className="px-4 py-3 w-32">Reference</th>
                        <th className="px-4 py-3">Type / Details</th>
                        <th className="px-4 py-3 text-right w-28">Debit (+)</th>
                        <th className="px-4 py-3 text-right w-28">Credit (−)</th>
                        <th className="px-4 py-3 text-right w-28">Balance</th>
                        <th className="px-4 py-3 text-center w-20">Act.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {eventsWithRunning.map(e => e._type === 'bill' ? (
                        <tr key={`b-${e.id}`} className="bg-blue-50/30 dark:bg-blue-950/10 hover:bg-blue-50/60 transition">
                          <td className="px-4 py-3 text-gray-500 font-medium">{new Date(e.bill_date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 font-mono font-bold text-gray-800 dark:text-gray-200 text-[11px]">{e.bill_number}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <TrendingUp className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                              <span className="font-bold text-blue-700 dark:text-blue-300">Invoice</span>
                              <span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-black uppercase ${e.status === 'paid' ? 'bg-green-100 text-green-700' : e.status === 'partially_paid' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                {(e.status || 'unpaid').replace('_', ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-blue-700">
                            ${(e.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300">—</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-black ${e._running > 0 ? 'text-amber-600' : e._running < 0 ? 'text-violet-600' : 'text-green-600'}`}>
                              {e._running < 0 ? `-$${Math.abs(e._running).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `$${e._running.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            </span>
                            {e._running < 0 && <span className="ml-1 px-1 py-0.5 bg-violet-100 text-violet-600 text-[8px] font-black uppercase rounded tracking-widest">CR</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              {e.status !== 'paid' && (
                                <button
                                  onClick={() => {
                                    setShowHistoryModal(false);
                                    setSelectedPatientForHistory(null);
                                    navigateToBills({ preselectedPatient: selectedPatientForHistory, openPayment: true, preselectedBillId: e.id });
                                  }}
                                  title="Record Payment"
                                  className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={`p-${e.id}`} className="bg-green-50/30 dark:bg-green-950/10 hover:bg-green-50/60 transition">
                          <td className="px-4 py-3 text-gray-500 font-medium">{new Date(e.payment_date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 font-mono font-bold text-gray-600 dark:text-gray-400 text-[11px]">{e.bill_number}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <TrendingDown className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                              <span className="font-bold text-green-700 dark:text-green-300">Payment</span>
                              <span className="ml-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 rounded text-[9px] font-black uppercase">
                                {(e.payment_method || 'cash').replace(/_/g, ' ')}
                              </span>
                              {e.target_portion === 'medical_aid' && (
                                <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black uppercase">Med Aid</span>
                              )}
                              {e.notes && <span className="ml-2 text-gray-400 italic text-[10px]">{e.notes}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300">—</td>
                          <td className="px-4 py-3 text-right font-black text-green-700">
                            ${(e.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-black ${e._running > 0 ? 'text-amber-600' : e._running < 0 ? 'text-violet-600' : 'text-green-600'}`}>
                              {e._running < 0 ? `-$${Math.abs(e._running).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `$${e._running.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                            </span>
                            {e._running < 0 && <span className="ml-1 px-1 py-0.5 bg-violet-100 text-violet-600 text-[8px] font-black uppercase rounded tracking-widest">CR</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center">
                              <button
                                onClick={() => {
                                  setShowHistoryModal(false);
                                  setSelectedPatientForHistory(null);
                                  navigateToBills({ viewReceiptPaymentId: e.id });
                                }}
                                title="View Receipt"
                                className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 text-gray-600 transition"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-600 sticky bottom-0">
                      <tr className="text-xs font-black">
                        <td colSpan={3} className="px-4 py-3 uppercase tracking-widest text-gray-500">Totals</td>
                        <td className="px-4 py-3 text-right text-blue-700">${billSummary.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right text-green-700">${billSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={billSummary.balance > 0 ? 'text-amber-600' : billSummary.balance < 0 ? 'text-violet-600' : 'text-green-600'}>
                            {billSummary.balance < 0 ? `-$${Math.abs(billSummary.balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `$${billSummary.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                          </span>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
                <p className="text-[10px] text-gray-400">
                  {eventsWithRunning.length} transaction{eventsWithRunning.length !== 1 ? 's' : ''} · {new Date().toLocaleString()}
                </p>
                <button
                  onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); }}
                  className="px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-xs font-black uppercase hover:scale-105 transition shadow-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
