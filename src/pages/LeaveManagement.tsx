import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Search,
  Filter,
  X,
  Calendar,
  Check,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle as RejectIcon
} from 'lucide-react';

interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  rejection_reason?: string;
  approver_remarks?: string;
  created_at: string;
  updated_at?: string;
  users: {
    id: string;
    full_name: string;
    role: string;
    email?: string;
  };
  approver?: {
    id: string;
    full_name: string;
    role: string;
  } | null;
}

export function LeaveManagement() {
  const { profile } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'pending' | 'approved' | 'rejected'>('all');
  
  // Modal states
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [decisionType, setDecisionType] = useState<'approved' | 'rejected'>('approved');
  const [decisionReason, setDecisionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all'
  });

  const [formData, setFormData] = useState({
    leave_type: 'annual',
    start_date: '',
    end_date: '',
    reason: ''
  });

  // Check if current user is an Approver (Admin, Super Admin, or Doctor)
  const canApproveDecline = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'doctor';

  useEffect(() => {
    loadLeaves();
  }, [profile]);

  const loadLeaves = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          users:user_id (
            id,
            full_name,
            role,
            email
          ),
          approver:approved_by (
            id,
            full_name,
            role
          )
        `)
        .order('created_at', { ascending: false });

      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLeaves(data || []);
    } catch (error) {
      console.error('Error loading leaves:', error);
    } finally {
      setLoading(false);
    }
  };

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.start_date || !formData.end_date || !formData.reason.trim()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      showToast('End date cannot be earlier than start date.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('leave_requests')
        .insert([{
          user_id: profile?.id,
          branch_id: profile?.branch_id,
          leave_type: formData.leave_type,
          start_date: formData.start_date,
          end_date: formData.end_date,
          reason: formData.reason,
          status: 'pending'
        }]);

      if (error) throw error;

      setShowRequestModal(false);
      resetForm();
      showToast('Successful! Leave request submitted.');
      loadLeaves();
    } catch (error: any) {
      console.error('Error creating leave request:', error);
      showToast(error.message || 'Failed to submit leave request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDecisionModal = (leave: LeaveRequest, type: 'approved' | 'rejected') => {
    setSelectedLeave(leave);
    setDecisionType(type);
    setDecisionReason('');
    setShowDecisionModal(true);
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeave) return;

    if (decisionType === 'rejected' && !decisionReason.trim()) {
      showToast('Please provide a reason for declining this leave request.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: decisionType,
          approved_by: profile?.id,
          rejection_reason: decisionReason,
          approver_remarks: decisionReason,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedLeave.id);

      if (error) throw error;

      setShowDecisionModal(false);
      setSelectedLeave(null);
      setDecisionReason('');
      showToast(`Successful! Leave request ${decisionType === 'approved' ? 'approved' : 'declined'}.`);
      loadLeaves();
    } catch (error: any) {
      console.error('Error updating leave decision:', error);
      showToast(error.message || 'Failed to record decision.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDetailsModal = (leave: LeaveRequest) => {
    setSelectedLeave(leave);
    setShowDetailsModal(true);
  };

  const resetForm = () => {
    setFormData({
      leave_type: 'annual',
      start_date: '',
      end_date: '',
      reason: ''
    });
  };

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    const diffTime = Math.abs(e.getTime() - s.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return isNaN(diffDays) ? 0 : diffDays;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="px-2.5 py-0.5 inline-flex items-center text-xs font-black uppercase rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-0.5 inline-flex items-center text-xs font-black uppercase rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
            <RejectIcon className="w-3 h-3 mr-1 text-red-600 dark:text-red-400" />
            Declined
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 inline-flex items-center text-xs font-black uppercase rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3 mr-1 text-amber-600 dark:text-amber-400" />
            Pending Approval
          </span>
        );
    }
  };

  // Filter logic
  const filteredLeaves = leaves.filter(leave => {
    const staffName = leave.users?.full_name || '';
    const staffRole = leave.users?.role || '';
    const matchesSearch =
      staffName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      staffRole.toLowerCase().includes(searchQuery.toLowerCase()) ||
      leave.reason.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatusFilter = filters.status === 'all' || leave.status === filters.status;
    const matchesTypeFilter = filters.type === 'all' || leave.leave_type === filters.type;

    let matchesTab = true;
    if (activeTab === 'my') {
      matchesTab = leave.user_id === profile?.id;
    } else if (activeTab === 'pending') {
      matchesTab = leave.status === 'pending';
    } else if (activeTab === 'approved') {
      matchesTab = leave.status === 'approved';
    } else if (activeTab === 'rejected') {
      matchesTab = leave.status === 'rejected';
    }

    return matchesSearch && matchesStatusFilter && matchesTypeFilter && matchesTab;
  });

  const totalPages = Math.ceil(filteredLeaves.length / itemsPerPage) || 1;
  const paginatedLeaves = filteredLeaves.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 relative">
      {toast && (
        <div className={`fixed top-5 right-5 z-[9999] flex items-center space-x-2 px-5 py-3 rounded-lg shadow-2xl text-white font-bold text-sm transition-all duration-300 ${
          toast.type === 'success' ? 'bg-emerald-600 border border-emerald-400' : 'bg-rose-600 border border-rose-400'
        }`}>
          <CheckCircle2 className="w-5 h-5 text-white" />
          <span>{toast.message}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leave Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Apply for leave or manage staff leave requests
          </p>
        </div>
        <button
          onClick={() => setShowRequestModal(true)}
          className="flex items-center justify-center space-x-2 bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 transition shadow-md font-semibold text-sm"
        >
          <Plus className="w-5 h-5" />
          <span>Apply For Leave</span>
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center space-x-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-1">
        <button
          onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition ${
            activeTab === 'all'
              ? 'bg-green-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          All Requests ({leaves.length})
        </button>
        <button
          onClick={() => { setActiveTab('my'); setCurrentPage(1); }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition ${
            activeTab === 'my'
              ? 'bg-green-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          My Leave Applications ({leaves.filter(l => l.user_id === profile?.id).length})
        </button>
        <button
          onClick={() => { setActiveTab('pending'); setCurrentPage(1); }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition ${
            activeTab === 'pending'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Pending ({leaves.filter(l => l.status === 'pending').length})
        </button>
        <button
          onClick={() => { setActiveTab('approved'); setCurrentPage(1); }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition ${
            activeTab === 'approved'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Approved ({leaves.filter(l => l.status === 'approved').length})
        </button>
        <button
          onClick={() => { setActiveTab('rejected'); setCurrentPage(1); }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-t-lg transition ${
            activeTab === 'rejected'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Declined ({leaves.filter(l => l.status === 'rejected').length})
        </button>
      </div>

      {/* Search & Filter bar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by staff name, role, or reason..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-300"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Declined</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Leave Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => { setFilters({ ...filters, type: e.target.value }); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Leave Types</option>
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="maternity">Maternity Leave</option>
                  <option value="paternity">Paternity Leave</option>
                  <option value="compassionate">Compassionate Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => { setFilters({ status: 'all', type: 'all' }); setCurrentPage(1); }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Leave Requests Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">
                  Staff Member
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">
                  Leave Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">
                  Reason / Remarks
                </th>
                <th className="px-6 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedLeaves.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 font-medium">
                    No leave requests found matching criteria
                  </td>
                </tr>
              ) : (
                paginatedLeaves.map((leave) => {
                  const numDays = calculateDays(leave.start_date, leave.end_date);
                  const isOwnRequest = leave.user_id === profile?.id;
                  const approverName = leave.approver?.full_name || 'Admin / Doctor';

                  return (
                    <tr key={leave.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-700 dark:text-green-300 font-bold">
                            {leave.users?.full_name ? leave.users.full_name.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                              {leave.users?.full_name || 'Unknown Staff'}
                              {isOwnRequest && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-black px-1.5 py-0.5 rounded">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize font-medium">
                              Role: {leave.users?.role || 'Staff'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                          {leave.leave_type} Leave
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-0.5">
                          <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                          {new Date(leave.start_date).toLocaleDateString()} – {new Date(leave.end_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2.5 py-1 text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md">
                          {numDays} {numDays === 1 ? 'Day' : 'Days'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate" title={leave.reason}>
                          {leave.reason}
                        </div>
                        {(leave.rejection_reason || leave.approver_remarks) && (
                          <div className="text-xs text-rose-600 dark:text-rose-400 font-medium mt-1 truncate" title={leave.rejection_reason || leave.approver_remarks}>
                            Decision Note: {leave.rejection_reason || leave.approver_remarks}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(leave.status)}
                        {leave.status !== 'pending' && leave.approver && (
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-medium">
                            By {approverName} ({leave.approver.role})
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-center">
                        <div className="flex items-center justify-center space-x-2">
                          {/* Approve / Decline Buttons for Doctors and Admins on Pending Requests */}
                          {leave.status === 'pending' && canApproveDecline ? (
                            <div className="flex space-x-1.5">
                              <button
                                onClick={() => openDecisionModal(leave, 'approved')}
                                className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition shadow-sm"
                                title="Approve with Reason"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => openDecisionModal(leave, 'rejected')}
                                className="flex items-center space-x-1 px-2.5 py-1 bg-rose-600 text-white rounded text-xs font-bold hover:bg-rose-700 transition shadow-sm"
                                title="Decline with Reason"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Decline</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => openDetailsModal(leave)}
                              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                            >
                              View Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredLeaves.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4 font-sans">
            <div className="flex items-center space-x-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredLeaves.length)} of {filteredLeaves.length}
              </p>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                <select
                  value={itemsPerPage === filteredLeaves.length ? 'all' : itemsPerPage}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemsPerPage(val === 'all' ? filteredLeaves.length || 1 : Number(val));
                    setCurrentPage(1);
                  }}
                  className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none text-gray-700 dark:text-gray-200"
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
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                {[...Array(Math.min(totalPages, 7))].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-green-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
                  >
                    {i + 1}
                  </button>
                ))}
                {totalPages > 7 && <span className="text-xs text-gray-400 px-1">... {totalPages}</span>}
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

      {/* 1. APPLY LEAVE MODAL FOR STAFF */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-xl w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Apply For Leave</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Submit a leave request for Admin / Doctor approval</p>
                </div>
              </div>
              <button
                onClick={() => { setShowRequestModal(false); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 dark:text-gray-300 mb-1">
                  Leave Type *
                </label>
                <select
                  value={formData.leave_type}
                  onChange={(e) => setFormData({ ...formData, leave_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                  required
                >
                  <option value="annual">Annual Leave</option>
                  <option value="sick">Sick Leave</option>
                  <option value="maternity">Maternity Leave</option>
                  <option value="paternity">Paternity Leave</option>
                  <option value="compassionate">Compassionate Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 dark:text-gray-300 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-700 dark:text-gray-300 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                    required
                  />
                </div>
              </div>

              {formData.start_date && formData.end_date && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center justify-between text-xs">
                  <span className="font-bold text-green-900 dark:text-green-200 uppercase">Calculated Duration:</span>
                  <span className="font-black text-sm text-green-700 dark:text-green-300">
                    {calculateDays(formData.start_date, formData.end_date)} Days
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 dark:text-gray-300 mb-1">
                  Reason for Leave *
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Please state the detailed reason for your leave request..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                  required
                />
              </div>

              <div className="flex space-x-3 mt-6 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => { setShowRequestModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md font-bold disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. APPROVE / DECLINE MODAL FOR ADMIN & DOCTOR */}
      {showDecisionModal && selectedLeave && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${decisionType === 'approved' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30'}`}>
                  {decisionType === 'approved' ? <Check className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white capitalize">
                    {decisionType === 'approved' ? 'Approve Leave Request' : 'Decline Leave Request'}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Decision by {profile?.full_name} ({profile?.role})
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowDecisionModal(false); setSelectedLeave(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/50 p-3.5 rounded-lg border border-gray-200 dark:border-gray-700 mb-4 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 font-bold uppercase">Staff Member:</span>
                <span className="font-bold text-gray-900 dark:text-white">{selectedLeave.users?.full_name} ({selectedLeave.users?.role})</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 font-bold uppercase">Leave Type & Dates:</span>
                <span className="font-bold text-gray-900 dark:text-white capitalize">
                  {selectedLeave.leave_type} ({calculateDays(selectedLeave.start_date, selectedLeave.end_date)} days)
                </span>
              </div>
              <div className="text-xs">
                <span className="text-gray-500 font-bold uppercase block mb-0.5">Staff Reason:</span>
                <p className="text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 italic">
                  "{selectedLeave.reason}"
                </p>
              </div>
            </div>

            <form onSubmit={handleDecisionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-700 dark:text-gray-300 mb-1">
                  Reason / Remarks for {decisionType === 'approved' ? 'Approval' : 'Declining'} {decisionType === 'rejected' ? '*' : '(Optional)'}
                </label>
                <textarea
                  value={decisionReason}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  placeholder={
                    decisionType === 'approved'
                      ? 'Add any comments or instructions (e.g. Coverage assigned to Nurse Sarah)...'
                      : 'State the reason for declining this request (e.g. Peak shift requirement, short notice)...'
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  rows={3}
                  required={decisionType === 'rejected'}
                />
              </div>

              <div className="flex space-x-3 mt-6 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => { setShowDecisionModal(false); setSelectedLeave(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex-1 px-4 py-2 text-white rounded-lg transition shadow-md font-bold disabled:opacity-50 ${
                    decisionType === 'approved'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSubmitting
                    ? 'Processing...'
                    : decisionType === 'approved'
                    ? 'Confirm Approval'
                    : 'Confirm Decline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. VIEW DECISION DETAILS MODAL */}
      {showDetailsModal && selectedLeave && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Leave Application Details</h2>
              <button
                onClick={() => { setShowDetailsModal(false); setSelectedLeave(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase">Staff Member</span>
                  <div className="text-base font-bold text-gray-900 dark:text-white">{selectedLeave.users?.full_name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">Role: {selectedLeave.users?.role}</div>
                </div>
                <div>
                  {getStatusBadge(selectedLeave.status)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                <div>
                  <span className="text-gray-400 font-bold uppercase">Leave Type:</span>
                  <div className="font-bold text-gray-900 dark:text-white capitalize">{selectedLeave.leave_type} Leave</div>
                </div>
                <div>
                  <span className="text-gray-400 font-bold uppercase">Duration:</span>
                  <div className="font-bold text-gray-900 dark:text-white">
                    {calculateDays(selectedLeave.start_date, selectedLeave.end_date)} Days
                  </div>
                </div>
                <div>
                  <span className="text-gray-400 font-bold uppercase">Start Date:</span>
                  <div className="font-medium text-gray-900 dark:text-white">{new Date(selectedLeave.start_date).toLocaleDateString()}</div>
                </div>
                <div>
                  <span className="text-gray-400 font-bold uppercase">End Date:</span>
                  <div className="font-medium text-gray-900 dark:text-white">{new Date(selectedLeave.end_date).toLocaleDateString()}</div>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-gray-500 uppercase block mb-1">Reason for Request:</span>
                <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  {selectedLeave.reason}
                </p>
              </div>

              {selectedLeave.status !== 'pending' && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-1">
                  <div className="text-xs font-bold uppercase text-blue-900 dark:text-blue-200">
                    Decision Details:
                  </div>
                  <div className="text-xs text-blue-800 dark:text-blue-300 font-medium">
                    Decision by: <span className="font-bold">{selectedLeave.approver?.full_name || 'Admin / Doctor'} ({selectedLeave.approver?.role || 'Staff'})</span>
                  </div>
                  {(selectedLeave.rejection_reason || selectedLeave.approver_remarks) && (
                    <div className="text-xs text-blue-900 dark:text-blue-100 font-semibold mt-1">
                      Reason / Remarks: "{selectedLeave.rejection_reason || selectedLeave.approver_remarks}"
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 pt-3 border-t border-gray-100 dark:border-gray-700 text-right">
              <button
                onClick={() => { setShowDetailsModal(false); setSelectedLeave(null); }}
                className="px-5 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
