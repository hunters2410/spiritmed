import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Filter, X, ArrowLeft, Users, Loader2, Calendar, ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

interface MedicalAid {
  id: string;
  name: string;
  is_active: boolean;
  branch_id: string;
  created_at: string;
}

interface MemberSummary {
  patient_id: string;
  full_name: string;
  patient_number: string;
  medical_aid_name: string;
  medical_aid_number?: string;
  total_billed: number;
  medical_aid_amount: number;
  shortfall_amount: number;
  medical_aid_paid: number;
  shortfall_paid: number;
  total_paid: number;
  medical_aid_balance: number;
  shortfall_balance: number;
  total_balance: number;
  bill_count: number;
}

interface Branch {
  id: string;
  name: string;
}

export function MedicalAids() {
  const { profile } = useAuth();
  const [medicalAids, setMedicalAids] = useState<MedicalAid[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMedicalAid, setSelectedMedicalAid] = useState<MedicalAid | null>(null);
  const [detailAid, setDetailAid] = useState<MedicalAid | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [mainCurrentPage, setMainCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [filters, setFilters] = useState({
    branch: 'all',
    status: 'all'
  });

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<MemberSummary | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    branch_id: ''
  });

  useEffect(() => {
    loadMedicalAids();
    loadBranches();
  }, [profile]);

  const loadMedicalAids = async () => {
    try {
      let query = supabase
        .from('medical_aids')
        .select('*')
        .order('created_at', { ascending: false });

      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMedicalAids(data || []);
    } catch (error) {
      console.error('Error loading medical aids:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setBranches(data || []);
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('medical_aids')
        .insert([{
          name: formData.name,
          branch_id: formData.branch_id || profile?.branch_id,
          is_active: true
        }]);
      if (error) throw error;
      setShowModal(false);
      resetForm();
      loadMedicalAids();
    } catch (error) {
      console.error('Error creating medical aid:', error);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedicalAid) return;
    try {
      const { error } = await supabase
        .from('medical_aids')
        .update({
          name: formData.name,
          branch_id: formData.branch_id || selectedMedicalAid.branch_id
        })
        .eq('id', selectedMedicalAid.id);
      if (error) throw error;
      setShowEditModal(false);
      setSelectedMedicalAid(null);
      resetForm();
      loadMedicalAids();
    } catch (error) {
      console.error('Error updating medical aid:', error);
    }
  };

  const handleDelete = async (medicalAid: MedicalAid) => {
    if (!confirm(`Are you sure you want to delete ${medicalAid.name}?`)) return;
    try {
      const { error } = await supabase
        .from('medical_aids')
        .delete()
        .eq('id', medicalAid.id);
      if (error) throw error;
      loadMedicalAids();
    } catch (error) {
      console.error('Error deleting medical aid:', error);
    }
  };

  const handleToggleActive = async (medicalAid: MedicalAid) => {
    try {
      const { error } = await supabase
        .from('medical_aids')
        .update({ is_active: !medicalAid.is_active })
        .eq('id', medicalAid.id);
      if (error) throw error;
      loadMedicalAids();
    } catch (error: any) {
      console.error('Error updating medical aid status:', error?.message || error);
    }
  };

  const openViewModal = (medicalAid: MedicalAid) => {
    setSelectedMedicalAid(medicalAid);
    setShowViewModal(true);
  };

  const openMembersDetail = async (aid: MedicalAid, days?: string | null, customFrom?: string, customTo?: string) => {
    setDetailAid(aid);
    setMembers([]);
    setMembersLoading(true);
    setCurrentPage(1);
    try {
      let dateFrom: string | null = customFrom || null;
      let dateTo: string | null = customTo || null;
      if (!customFrom && days && days !== 'all' && days !== 'custom') {
        const d = new Date();
        d.setDate(d.getDate() - parseInt(days));
        dateFrom = d.toISOString().split('T')[0];
      }

      let billQuery = supabase
        .from('bills')
        .select(`
          id, patient_id, total_amount, medical_aid_amount, shortfall_amount, paid_amount, balance, bill_date,
          created_at, medical_aid_id, patient:patients(full_name, patient_number, medical_aid_id, medical_aid_number)
        `)
        .not('medical_aid_id', 'is', null);

      if (dateFrom) billQuery = billQuery.gte('bill_date', dateFrom);
      if (dateTo) billQuery = billQuery.lte('bill_date', dateTo);

      const { data: billData, error: billError } = await billQuery;
      if (billError) throw billError;

      const billMap: Record<string, any> = {};
      const relevantBillIds: string[] = [];
      for (const bill of (billData || []) as any[]) {
        const billAidId = bill.medical_aid_id || bill.patient?.medical_aid_id;
        if (billAidId !== aid.id) continue;
        relevantBillIds.push(bill.id);
        billMap[bill.id] = bill;
      }

      let pmtByBill: Record<string, { ma: number; sf: number }> = {};
      if (relevantBillIds.length > 0) {
        const { data: pmtData } = await supabase
          .from('payments')
          .select('bill_id, amount, target_portion')
          .in('bill_id', relevantBillIds);
        for (const p of (pmtData || []) as any[]) {
          if (!pmtByBill[p.bill_id]) pmtByBill[p.bill_id] = { ma: 0, sf: 0 };
          if (p.target_portion === 'medical_aid') pmtByBill[p.bill_id].ma += p.amount || 0;
          else pmtByBill[p.bill_id].sf += p.amount || 0;
        }
      }

      const map: Record<string, MemberSummary> = {};
      for (const bill of Object.values(billMap) as any[]) {
        const pid = bill.patient_id;
        const pmt = pmtByBill[bill.id] || { ma: 0, sf: 0 };
        if (!map[pid]) {
          map[pid] = {
            patient_id: pid, full_name: bill.patient?.full_name || 'Unknown',
            patient_number: bill.patient?.patient_number || '—', medical_aid_name: aid.name,
            medical_aid_number: bill.patient?.medical_aid_number || '-', total_billed: 0,
            medical_aid_amount: 0, shortfall_amount: 0, medical_aid_paid: 0, shortfall_paid: 0,
            total_paid: 0, medical_aid_balance: 0, shortfall_balance: 0, total_balance: 0, bill_count: 0
          };
        }
        map[pid].total_billed += bill.total_amount || 0;
        map[pid].medical_aid_amount += bill.medical_aid_amount || 0;
        map[pid].shortfall_amount += bill.shortfall_amount || 0;
        map[pid].medical_aid_paid += pmt.ma;
        map[pid].shortfall_paid += pmt.sf;
        map[pid].total_paid += bill.paid_amount || 0;
        map[pid].medical_aid_balance += Math.max(0, (bill.medical_aid_amount || 0) - pmt.ma);
        map[pid].shortfall_balance += Math.max(0, (bill.shortfall_amount || 0) - pmt.sf);
        map[pid].total_balance += bill.balance || 0;
        map[pid].bill_count += 1;
      }
      setMembers(Object.values(map));
    } catch (err) {
      console.error('Error loading members:', err);
    } finally {
      setMembersLoading(false);
    }
  };

  const openPatientHistory = async (member: MemberSummary) => {
    setSelectedPatient(member);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setHistorySearch('');
    try {
      const { data: bills } = await supabase
        .from('bills')
        .select('id, bill_number, bill_date')
        .eq('patient_id', member.patient_id);
      const bIds = (bills || []).map(b => b.id);
      if (bIds.length === 0) { setPaymentHistory([]); return; }
      const { data: pmts } = await supabase
        .from('payments')
        .select('id, amount, payment_method, payment_date, created_at, target_portion, notes, bill_id')
        .in('bill_id', bIds)
        .order('payment_date', { ascending: false });
      setPaymentHistory((pmts || []).map(p => {
        const b = (bills || []).find(x => x.id === p.bill_id);
        return { ...p, bill_number: b?.bill_number, bill_date: b?.bill_date };
      }));
    } catch (err) { console.error('Error:', err); } finally { setHistoryLoading(false); }
  };

  const handleExportHistory = (format: 'pdf' | 'excel', filteredItems: any[]) => {
    if (!selectedPatient) return;
    const title = `Payment History - ${selectedPatient.full_name}`;
    const fname = `${selectedPatient.full_name.replace(/\s+/g, '_')}_History`;
    if (format === 'excel') {
      const data = filteredItems.map(p => ({
        'INV #': p.bill_number,
        'Date': new Date(p.payment_date).toLocaleDateString(),
        'Method': p.payment_method?.replace(/_/g, ' '),
        'Portion': p.target_portion === 'medical_aid' ? 'Medical Aid' : 'Patient',
        'Amount': p.amount.toFixed(2),
        'Notes': p.notes || ''
      }));
      exportToExcel(data, fname);
    } else {
      const headers = ['INV #', 'Date', 'Method', 'Portion', 'Amount'];
      const data = filteredItems.map(p => [
        p.bill_number,
        new Date(p.payment_date).toLocaleDateString(),
        p.payment_method?.replace(/_/g, ' '),
        p.target_portion === 'medical_aid' ? 'Medical Aid' : 'Patient',
        `$${p.amount.toFixed(2)}`
      ]);
      exportToPDF(headers, data, title, fname);
    }
  };

  const handleExportMembersExcel = (rows: MemberSummary[], aidName: string) => {
    const fname = `${aidName.replace(/\s+/g, '_')}_Members`;
    const data = rows.map(m => ({
      'Medical Aid': m.medical_aid_name,
      'Member Name': m.full_name,
      'Member #': m.medical_aid_number || '-',
      'Bills': m.bill_count,
      'Total Billed': m.total_billed.toFixed(2),
      'Med Aid Paid': m.medical_aid_paid.toFixed(2),
      'Med Aid Owing': m.medical_aid_balance.toFixed(2),
      'Shortfall Paid': m.shortfall_paid.toFixed(2),
      'Shortfall Owing': m.shortfall_balance.toFixed(2),
      'Total Balance': m.total_balance.toFixed(2)
    }));
    exportToExcel(data, fname);
  };

  const handleExportMembersPDF = (rows: MemberSummary[], aidName: string) => {
    const title = `${aidName} - Member Financial Summary`;
    const fname = `${aidName.replace(/\s+/g, '_')}_Members`;
    const headers = ['Medical Aid', 'Member', 'Member #', 'Bills', 'Billed', 'MA Paid', 'MA Due', 'SF Due'];
    const data = rows.map(m => [
      m.medical_aid_name,
      m.full_name,
      m.medical_aid_number || '-',
      m.bill_count,
      `$${m.total_billed.toLocaleString()}`,
      `$${m.medical_aid_paid.toLocaleString()}`,
      `$${m.medical_aid_balance.toLocaleString()}`,
      `$${m.shortfall_balance.toLocaleString()}`
    ]);
    exportToPDF(headers, data, title, fname);
  };

  const openEditModal = (medicalAid: MedicalAid) => {
    setSelectedMedicalAid(medicalAid);
    setFormData({ name: medicalAid.name, branch_id: medicalAid.branch_id });
    setShowEditModal(true);
  };

  const resetForm = () => setFormData({ name: '', branch_id: '' });

  const filteredAids = medicalAids.filter(aid => {
    const mSearch = aid.name.toLowerCase().includes(searchQuery.toLowerCase());
    const mBranch = filters.branch === 'all' || aid.branch_id === filters.branch;
    const mStatus = filters.status === 'all' || (filters.status === 'active' && aid.is_active) || (filters.status === 'inactive' && !aid.is_active);
    return mSearch && mBranch && mStatus;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-12 h-12 animate-spin text-green-600" /></div>;

  return (
    <div className="space-y-4">
      {detailAid ? (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => { setDetailAid(null); setMembers([]); setMemberSearch(''); setDateFilter('all'); setStartDate(''); setEndDate(''); }} className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white transition font-bold">
              <ArrowLeft className="w-4 h-4" /> Medical Aids
            </button>
            <span className="text-gray-300 dark:text-gray-600">/</span><span className="font-bold text-gray-900 dark:text-white">{detailAid.name}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center"><Users className="w-7 h-7 text-blue-600" /></div>
              <div><h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase">{detailAid.name}</h1><p className="text-gray-400 text-xs uppercase tracking-widest">Medical Aid Financials</p></div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1.5 shadow-sm gap-2">
                <div className="flex items-center gap-2 px-2 border-r border-gray-100 dark:border-gray-700">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <select value={dateFilter} onChange={(e) => { const v = e.target.value; setDateFilter(v); if (v === 'all') { setStartDate(''); setEndDate(''); openMembersDetail(detailAid, 'all'); } else if (v !== 'custom') { setStartDate(''); setEndDate(''); openMembersDetail(detailAid, v); } }} className="bg-transparent text-xs font-bold text-gray-700 dark:text-gray-200 outline-none pr-8">
                    <option value="all">All Time</option><option value="7">7 Days</option><option value="30">30 Days</option><option value="60">60 Days</option><option value="90">90 Days</option><option value="custom">Custom</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setDateFilter('custom'); openMembersDetail(detailAid, 'custom', e.target.value, endDate); }} className="bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded text-[10px] font-bold outline-none"/>
                  <span className="text-gray-300">-</span>
                  <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setDateFilter('custom'); openMembersDetail(detailAid, 'custom', startDate, e.target.value); }} className="bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded text-[10px] font-bold outline-none"/>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button onClick={() => handleExportMembersExcel(members.filter(m => m.full_name.toLowerCase().includes(memberSearch.toLowerCase())), detailAid.name)} disabled={members.length === 0} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-40"><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</button>
                <button onClick={() => handleExportMembersPDF(members.filter(m => m.full_name.toLowerCase().includes(memberSearch.toLowerCase())), detailAid.name)} disabled={members.length === 0} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-40"><FileText className="w-3.5 h-3.5" /> PDF</button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search member..." value={memberSearch} onChange={e => { setMemberSearch(e.target.value); setCurrentPage(1); }} className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
            </div>
            {membersLoading ? <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700">
                  <thead className="bg-gray-100 dark:bg-gray-900">
                    <tr className="text-[10px] uppercase font-black tracking-widest text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-700">
                      <th className="border border-gray-200 dark:border-gray-700 px-4 py-3 text-left">Member</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left">Member #</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-left">Medical Aid</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-center">Bills</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right">Billed</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-indigo-600">MA Portion</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-green-600">MA Paid</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-red-500">MA Due</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-purple-600">Shortfall</th>
                      <th className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right text-amber-600">SF Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.filter(m => m.full_name.toLowerCase().includes(memberSearch.toLowerCase())).slice((currentPage-1)*rowsPerPage, currentPage*rowsPerPage).map(m => (
                      <tr key={m.patient_id} className="hover:bg-gray-100 dark:hover:bg-gray-900/40 transition">
                        <td className="border border-gray-200 dark:border-gray-700 px-4 py-3"><button onClick={() => openPatientHistory(m)} className="text-left group"><div className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 group-hover:underline">{m.full_name}</div><div className="text-[10px] text-gray-400">{m.patient_number}</div></button></td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-xs font-bold font-mono">{m.medical_aid_number}</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3"><span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-full">{m.medical_aid_name}</span></td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-center text-xs font-black">{m.bill_count}</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right font-bold">${m.total_billed.toLocaleString()}</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right font-bold text-indigo-600">${m.medical_aid_amount.toLocaleString()}</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right font-bold text-green-600">${m.medical_aid_paid.toLocaleString()}</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right font-black text-red-500">${m.medical_aid_balance.toLocaleString()}</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right font-bold text-purple-600">${m.shortfall_amount.toLocaleString()}</td>
                        <td className="border border-gray-200 dark:border-gray-700 px-3 py-3 text-right font-black text-amber-600">${m.shortfall_balance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {Math.ceil(members.filter(m => m.full_name.toLowerCase().includes(memberSearch.toLowerCase())).length / rowsPerPage) > 1 && (
              <div className="px-6 py-4 border-t dark:border-gray-700 flex items-center justify-between bg-gray-50/30 dark:bg-gray-900/10">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Page {currentPage} of {Math.ceil(members.filter(m => m.full_name.toLowerCase().includes(memberSearch.toLowerCase())).length / rowsPerPage)}</div>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border dark:border-gray-700 rounded-lg disabled:opacity-30 hover:bg-white transition"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setCurrentPage(p => Math.min(Math.ceil(members.filter(m => m.full_name.toLowerCase().includes(memberSearch.toLowerCase())).length / rowsPerPage), p + 1))} disabled={currentPage === Math.ceil(members.filter(m => m.full_name.toLowerCase().includes(memberSearch.toLowerCase())).length / rowsPerPage)} className="p-2 border dark:border-gray-700 rounded-lg disabled:opacity-30 hover:bg-white transition"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Medical Aids</h1><p className="text-gray-600 dark:text-gray-400 mt-1">Manage providers and insurance</p></div>
            <button onClick={() => setShowModal(true)} className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-md"><Plus className="w-5 h-5" /><span>Add Providers</span></button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
            <div className="flex gap-3">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" /><input type="text" placeholder="Search providers..." value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setMainCurrentPage(1); }} className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" /></div>
              <button onClick={() => setShowFilters(!showFilters)} className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-2"><Filter className="w-4 h-4" /><span>Filters</span></button>
            </div>
            {showFilters && (
              <div className="mt-4 pt-4 border-t dark:border-gray-700 grid md:grid-cols-3 gap-4">
                {profile?.role === 'super_admin' && (<div><label className="text-[10px] font-black text-gray-400 uppercase">Branch</label><select value={filters.branch} onChange={e => setFilters({...filters, branch: e.target.value})} className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-transparent text-sm">{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>)}
                <div><label className="text-[10px] font-black text-gray-400 uppercase">Status</label><select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className="w-full mt-1 px-3 py-2 border dark:border-gray-600 rounded-lg bg-transparent text-sm"><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-900">
                <tr className="text-[10px] font-black uppercase text-gray-700 dark:text-gray-300 tracking-widest">
                  <th className="border border-gray-200 dark:border-gray-700 px-6 py-3 text-left">Name</th>
                  <th className="border border-gray-200 dark:border-gray-700 px-6 py-3 text-left">Status</th>
                  <th className="border border-gray-200 dark:border-gray-700 px-6 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAids.slice((mainCurrentPage-1)*rowsPerPage, mainCurrentPage*rowsPerPage).map(a => (
                  <tr key={a.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/40 transition">
                    <td className="border border-gray-200 dark:border-gray-700 px-6 py-3.5"><button onClick={() => openMembersDetail(a)} className="text-left group"><div className="text-sm font-bold group-hover:text-blue-600 group-hover:underline">{a.name}</div><div className="text-[10px] text-gray-400">Click to view members</div></button></td>
                    <td className="border border-gray-200 dark:border-gray-700 px-6 py-3.5"><span onClick={() => handleToggleActive(a)} className={`px-2 py-1 text-[10px] font-black rounded-full cursor-pointer transition ${a.is_active ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>{a.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    <td className="border border-gray-200 dark:border-gray-700 px-6 py-3.5 flex gap-3 text-[10px] font-black uppercase"><button onClick={() => openViewModal(a)} className="text-blue-600 hover:underline">View</button><button onClick={() => openEditModal(a)} className="text-amber-600 hover:underline">Edit</button><button onClick={() => handleDelete(a)} className="text-red-600 hover:underline">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {Math.ceil(filteredAids.length / rowsPerPage) > 1 && (
              <div className="px-6 py-4 border-t dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/20">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Page {mainCurrentPage} of {Math.ceil(filteredAids.length / rowsPerPage)}</div>
                <div className="flex gap-2">
                  <button onClick={() => setMainCurrentPage(p => Math.max(1, p - 1))} disabled={mainCurrentPage === 1} className="p-2 border dark:border-gray-700 rounded-lg disabled:opacity-30 hover:bg-white transition"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={() => setMainCurrentPage(p => Math.min(Math.ceil(filteredAids.length / rowsPerPage), p + 1))} disabled={mainCurrentPage === Math.ceil(filteredAids.length / rowsPerPage)} className="p-2 border dark:border-gray-700 rounded-lg disabled:opacity-30 hover:bg-white transition"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b dark:border-gray-700 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Payment History</h3>
                <p className="text-[11px] font-bold text-blue-500 uppercase">{selectedPatient.full_name} • {selectedPatient.patient_number}</p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="px-6 py-3 bg-gray-50/50 dark:bg-gray-900/20 border-b dark:border-gray-700 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search in history..." 
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 border dark:border-gray-700 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800" 
                />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleExportHistory('excel', paymentHistory.filter(p => !historySearch || p.bill_number?.toLowerCase().includes(historySearch.toLowerCase()) || p.payment_method?.toLowerCase().includes(historySearch.toLowerCase()) || p.target_portion?.toLowerCase().includes(historySearch.toLowerCase())))} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-100 transition border border-green-200 dark:border-green-800"><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</button>
                <button onClick={() => handleExportHistory('pdf', paymentHistory.filter(p => !historySearch || p.bill_number?.toLowerCase().includes(historySearch.toLowerCase()) || p.payment_method?.toLowerCase().includes(historySearch.toLowerCase()) || p.target_portion?.toLowerCase().includes(historySearch.toLowerCase())))} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition border border-red-200 dark:border-red-800"><FileText className="w-3.5 h-3.5" /> PDF</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-0">
              {historyLoading ? <div className="py-20 flex flex-col items-center gap-2"><Loader2 className="animate-spin text-blue-500" /><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fetching records...</p></div> : 
               paymentHistory.length === 0 ? <div className="py-20 text-center"><p className="text-sm font-bold text-gray-400">No payment records found</p></div> : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0">
                    <tr className="text-[10px] font-black uppercase text-gray-400 border-b dark:border-gray-700">
                      <th className="px-6 py-3">INV #</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Portion</th><th className="px-6 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {paymentHistory
                      .filter(p => !historySearch || p.bill_number?.toLowerCase().includes(historySearch.toLowerCase()) || p.payment_method?.toLowerCase().includes(historySearch.toLowerCase()) || p.target_portion?.toLowerCase().includes(historySearch.toLowerCase()) || p.notes?.toLowerCase().includes(historySearch.toLowerCase()))
                      .map(p => (
                      <tr key={p.id} className="hover:bg-gray-100 dark:hover:bg-gray-800/30 transition">
                        <td className="px-6 py-4 font-bold text-gray-700 dark:text-gray-300">#{p.bill_number}</td>
                        <td className="px-4 py-4 text-gray-500">{new Date(p.payment_date).toLocaleDateString()}</td>
                        <td className="px-4 py-4"><span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[9px] font-black uppercase">{p.payment_method?.replace(/_/g, ' ')}</span></td>
                        <td className="px-4 py-4"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${p.target_portion === 'medical_aid' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20' : 'bg-green-50 text-green-600 dark:bg-green-900/20'}`}>{p.target_portion === 'medical_aid' ? 'Medical Aid' : 'Patient'}</span></td>
                        <td className="px-6 py-4 text-right font-black text-gray-900 dark:text-white text-sm">${p.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-900/50"><button onClick={() => setShowHistoryModal(false)} className="px-8 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition shadow-lg">Close</button></div>
          </div>
        </div>
      )}

      {/* Main Add Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-black uppercase tracking-tight">Add Medical Aid</h2><button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X /></button></div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="text-[10px] font-black text-gray-400 uppercase">Provider Name *</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-transparent outline-none focus:ring-2 focus:ring-green-500" required /></div>
              {profile?.role === 'super_admin' && (<div><label className="text-[10px] font-black text-gray-400 uppercase">Branch *</label><select value={formData.branch_id} onChange={e => setFormData({...formData, branch_id: e.target.value})} className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-transparent" required>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>)}
              <div className="flex gap-3 pt-4"><button type="submit" className="flex-1 py-2 bg-green-600 text-white rounded-lg font-black uppercase text-xs hover:bg-green-700">Save</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedMedicalAid && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase tracking-tight">Edit Medical Aid</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase">Provider Name *</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 px-3 py-2 border dark:border-gray-700 rounded-lg bg-transparent outline-none focus:ring-2 focus:ring-blue-500" required />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-black uppercase text-xs hover:bg-blue-700">Update Provider</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Modal */}
      {showViewModal && selectedMedicalAid && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase tracking-tight">Provider Details</h2>
              <button onClick={() => setShowViewModal(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl border dark:border-gray-700">
                <div className="text-[10px] font-black text-gray-400 uppercase mb-1">Provider Name</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white uppercase">{selectedMedicalAid.name}</div>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl border dark:border-gray-700">
                <div className="text-[10px] font-black text-gray-400 uppercase mb-1">Status</div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${selectedMedicalAid.is_active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <div className="font-bold text-sm uppercase">{selectedMedicalAid.is_active ? 'Active Provider' : 'Inactive'}</div>
                </div>
              </div>
              <button onClick={() => setShowViewModal(false)} className="w-full py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-black uppercase text-xs">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
