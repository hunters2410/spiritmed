import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Search, Filter, Calendar, Database, ChevronLeft, ChevronRight,
  ShieldAlert, CheckCircle2, AlertCircle, Info, ExternalLink,
  History, User, Activity, Loader2, X, RefreshCw
} from 'lucide-react';

interface AuditLog {
  id: string;
  user_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'STATUS_CHANGE';
  table_name: string;
  record_id: string;
  details: string;
  old_values: any;
  new_values: any;
  created_at: string;
  profiles: {
    full_name: string;
    role: string;
  };
}

export function AuditLogs() {
  const { profile } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  // Detail Modal State
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, [profile?.id]);

  async function loadLogs() {
    if (!profile?.branch_id) return;
    setLoading(true);
    try {
      let allLogs: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        let query = supabase
          .from('audit_logs')
          .select(`
            *,
            profiles:user_id (full_name, role)
          `)
          .eq('branch_id', profile.branch_id)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allLogs = allLogs.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setLogs(allLogs);
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setLoading(false);
    }
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE': 
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 flex items-center gap-1 w-max"><CheckCircle2 className="w-3.5 h-3.5" /> CREATE</span>;
      case 'UPDATE': 
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center gap-1 w-max"><Info className="w-3.5 h-3.5" /> UPDATE</span>;
      case 'DELETE': 
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 flex items-center gap-1 w-max"><ShieldAlert className="w-3.5 h-3.5" /> DELETE</span>;
      case 'STATUS_CHANGE': 
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center gap-1 w-max"><AlertCircle className="w-3.5 h-3.5" /> STATUS</span>;
      default: 
        return <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{action}</span>;
    }
  };

  // Filter Logic
  const filtered = logs.filter(log => {
    const matchesSearch = 
      log.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.table_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  // Pagination Calculations
  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = filtered.slice(startIndex, startIndex + itemsPerPage);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(prev => prev - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(prev => prev + 1);
  };

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm text-center">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-4 opacity-80" />
        <h2 className="text-xl font-black text-gray-900 dark:text-white">Access Restricted</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mt-1">
          Only administrators have permissions to view system audit logs and data activity trails.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 🚀 Simple Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            <History className="w-7 h-7 text-green-600" />
            System Audit Trail
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Detailed chronological record of system operations, user mutations, and database activities.
          </p>
        </div>

        <button
          onClick={loadLogs}
          className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Logs
        </button>
      </div>

      {/* 📊 KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Total Activity Logs</p>
            <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{logs.length}</h3>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 rounded-xl">
            <History className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">User Actions</p>
            <h3 className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {logs.filter(l => l.action === 'CREATE' || l.action === 'UPDATE').length}
            </h3>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Deletions & Alerts</p>
            <h3 className="text-2xl font-black text-red-600 dark:text-red-400 mt-1">
              {logs.filter(l => l.action === 'DELETE').length}
            </h3>
          </div>
          <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 🔍 Search & Action Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search by user name, action, or log details..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }}
            className="px-3.5 py-2.5 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-semibold"
          >
            <option value="all">All Action Types</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="STATUS_CHANGE">STATUS_CHANGE</option>
          </select>
        </div>
      </div>

      {/* 📋 Audit Logs Table with Pagination */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-green-600 mb-2" />
            <p className="text-xs font-semibold">Loading system audit records...</p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <History className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-bold">No activity logs found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search query or action filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse border border-gray-200 dark:border-gray-700">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 uppercase font-black tracking-wider">
                  <th className="p-4 border-b border-r border-gray-200 dark:border-gray-700">Timestamp</th>
                  <th className="p-4 border-b border-r border-gray-200 dark:border-gray-700">User</th>
                  <th className="p-4 border-b border-r border-gray-200 dark:border-gray-700">Action</th>
                  <th className="p-4 border-b border-r border-gray-200 dark:border-gray-700">Object / Table</th>
                  <th className="p-4 border-b border-r border-gray-200 dark:border-gray-700">Details</th>
                  <th className="p-4 text-center border-b border-gray-200 dark:border-gray-700">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 font-medium bg-white dark:bg-gray-800">
                {paginated.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition">
                    <td className="p-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {new Date(log.created_at).toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-1 font-mono mt-0.5">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full flex items-center justify-center font-black text-xs border border-green-200 dark:border-green-800">
                          {log.profiles?.full_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 dark:text-white">{log.profiles?.full_name || 'System User'}</div>
                          <div className="text-[10px] text-gray-400 font-semibold uppercase">{log.profiles?.role?.replace('_', ' ') || 'User'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="p-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 font-mono font-bold uppercase">
                        <Database className="w-3.5 h-3.5 text-gray-400" />
                        {log.table_name?.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="p-4 max-w-md border-b border-r border-gray-200 dark:border-gray-700">
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed truncate">{log.details}</p>
                    </td>
                    <td className="p-4 text-center border-b border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition"
                        title="View Detailed Payload"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 📑 Simple Clean Pagination Bar */}
        {!loading && filtered.length > 0 && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/30">
            <div className="flex items-center space-x-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Showing <span className="font-bold text-gray-900 dark:text-white">{startIndex + 1}</span> to <span className="font-bold text-gray-900 dark:text-white">{Math.min(startIndex + itemsPerPage, filtered.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{filtered.length}</span> audit logs
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                <select
                  value={itemsPerPage === filtered.length ? 'all' : itemsPerPage}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemsPerPage(val === 'all' ? filtered.length || 1 : Number(val));
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

            <div className="flex items-center gap-1.5">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
                  .map((page, idx, arr) => {
                    const prev = arr[idx - 1];
                    const showEllipsis = prev && page - prev > 1;
                    return (
                      <React.Fragment key={page}>
                        {showEllipsis && <span className="px-1 text-gray-400 font-bold">...</span>}
                        <button
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 rounded-xl text-xs font-bold transition ${
                            currentPage === page
                              ? 'bg-green-600 text-white shadow-sm'
                              : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                          }`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 🔍 Detailed Log Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <h2 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-green-600" />
                Audit Log Record Details
              </h2>
              <button onClick={() => setSelectedLog(null)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto max-h-[80vh]">
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200 dark:border-gray-600">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Action</span>
                  <div className="mt-1">{getActionBadge(selectedLog.action)}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Object / Table</span>
                  <span className="font-mono font-bold text-gray-900 dark:text-white text-sm mt-1 block uppercase">
                    {selectedLog.table_name}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Performed By</span>
                  <span className="font-bold text-gray-900 dark:text-white mt-0.5 block">
                    {selectedLog.profiles?.full_name || 'System User'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">Timestamp</span>
                  <span className="font-medium text-gray-600 dark:text-gray-300 mt-0.5 block">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Details Summary</label>
                <p className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 font-medium leading-relaxed">
                  {selectedLog.details}
                </p>
              </div>

              {selectedLog.old_values && (
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Previous Values (Before Change)</label>
                  <pre className="p-3 bg-gray-900 text-green-400 rounded-xl text-[11px] font-mono overflow-x-auto max-h-36">
                    {JSON.stringify(selectedLog.old_values, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.new_values && (
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">New Values (After Change)</label>
                  <pre className="p-3 bg-gray-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto max-h-36">
                    {JSON.stringify(selectedLog.new_values, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
