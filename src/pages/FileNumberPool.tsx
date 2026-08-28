import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ── Module-level cache for file number pool (5 min TTL) ────────────────────
const _fnCache: { data: any[] | null; ts: number; branchId: string | null } = {
  data: null, ts: 0, branchId: null,
};
const FN_CACHE_TTL = 5 * 60 * 1000;
function isFnCacheValid(branchId: string | null) {
  return _fnCache.data !== null
    && _fnCache.branchId === branchId
    && Date.now() - _fnCache.ts < FN_CACHE_TTL;
}
// ────────────────────────────────────────────────────────────────────────────
import { 
  FileText, Plus, Trash2, Search, 
  CheckCircle, XCircle, AlertCircle, Loader2,
  ChevronLeft, ChevronRight, UserCheck, UserX, RefreshCw
} from 'lucide-react';
import { logActivity } from '../utils/auditLogger';

export function FileNumberPool() {
  const { profile } = useAuth();
  const [fileNumbers, setFileNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFileNumber, setNewFileNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'discharged_deceased' | 'occupied'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  useEffect(() => {
    if (profile) {
      loadFileNumbers();
    }
  }, [profile]);

  const loadFileNumbers = useCallback(async (force = false) => {
    const branchId = profile?.branch_id ?? null;

    // Serve from cache unless forced or stale
    if (!force && isFnCacheValid(branchId)) {
      setFileNumbers(_fnCache.data!);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Fetch manual entries in file_number_pool
      const { data: poolData } = await supabase
        .from('file_number_pool')
        .select('*')
        .order('created_at', { ascending: false });

      // 2. Fetch all patients (paged to fetch all status types: active, discharged, deceased)
      let allPatients: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        let query = supabase
          .from('patients')
          .select('id, full_name, patient_number, file_number, status, created_at')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data: pData, error: pError } = await query;
        if (pError || !pData || pData.length === 0) break;
        allPatients = allPatients.concat(pData);
        if (pData.length < pageSize) break;
        from += pageSize;
      }

      // Map combined list
      const poolMap = new Map<string, any>();

      // A) Add manual pool entries
      (poolData || []).forEach((item: any) => {
        const fn = item.file_number ? item.file_number.split('-')[0].trim() : '';
        if (fn) {
          poolMap.set(fn, {
            id: item.id,
            file_number: fn,
            is_occupied: item.is_occupied,
            origin: 'manual_pool',
            patient_status: 'unallocated',
            patient_name: null,
            patient_number: null,
            created_at: item.created_at
          });
        }
      });

      // B) Add patient file numbers (overriding/augmenting)
      allPatients.forEach((p: any) => {
        if (!p.file_number) return;
        const cleanFn = p.file_number.split('-')[0].trim();
        if (!cleanFn) return;

        const isOccupied = p.status === 'active';
        poolMap.set(cleanFn, {
          id: p.id,
          file_number: cleanFn,
          is_occupied: isOccupied,
          origin: p.status === 'discharged' ? 'discharged' : p.status === 'deceased' ? 'deceased' : p.status === 'old_patient' ? 'old_patient' : 'active_patient',
          patient_status: p.status,
          patient_name: p.full_name,
          patient_number: p.patient_number ? p.patient_number : '',
          created_at: p.created_at
        });
      });

      const combinedList = Array.from(poolMap.values());
      // Sort unallocated / available first, then by file_number
      combinedList.sort((a, b) => {
        if (a.is_occupied === b.is_occupied) {
          return a.file_number.localeCompare(b.file_number, undefined, { numeric: true });
        }
        return a.is_occupied ? 1 : -1;
      });

      // Store in cache
      _fnCache.data = combinedList;
      _fnCache.ts = Date.now();
      _fnCache.branchId = branchId;
      setFileNumbers(combinedList);
    } catch (error) {
      console.error('Error loading file numbers:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const handleAddFileNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileNumber.trim() || !profile?.branch_id) return;

    try {
      setIsSubmitting(true);
      const cleanFn = newFileNumber.trim().toUpperCase();
      const { error } = await supabase
        .from('file_number_pool')
        .insert([{
          file_number: cleanFn,
          branch_id: profile.branch_id,
          is_occupied: false
        }]);

      if (error) {
        if (error.code === '23505') {
          alert('This file number already exists in the pool.');
        } else {
          throw error;
        }
        return;
      }

      await logActivity(supabase, {
        userId: profile.id,
        branchId: profile.branch_id,
        action: 'CREATE',
        tableName: 'file_number_pool',
        recordId: cleanFn,
        details: `Added new file number to pool: ${cleanFn}`
      });

      setNewFileNumber('');
      loadFileNumbers();
    } catch (error) {
      console.error('Error adding file number:', error);
      alert('Failed to add file number');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFileNumber = async (fileNumber: string) => {
    if (!confirm(`Are you sure you want to remove ${fileNumber} from the pool?`)) return;

    try {
      const { error } = await supabase
        .from('file_number_pool')
        .delete()
        .eq('file_number', fileNumber)
        .eq('is_occupied', false);

      if (error) throw error;

      await logActivity(supabase, {
        userId: profile?.id || '',
        branchId: profile?.branch_id || '',
        action: 'DELETE',
        tableName: 'file_number_pool',
        recordId: fileNumber,
        details: `Removed file number from pool: ${fileNumber}`
      });

      loadFileNumbers();
    } catch (error) {
      console.error('Error deleting file number:', error);
      alert('Failed to delete file number. It may be currently occupied.');
    }
  };

  const handleAllocateToNewPatient = (fileNumber: string) => {
    window.location.href = `/patients?newFileNumber=${encodeURIComponent(fileNumber)}`;
  };

  const filteredNumbers = fileNumbers.filter(f => {
    const matchesSearch = 
      f.file_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.patient_name && f.patient_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (f.patient_number && f.patient_number.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesFilter = 
      filter === 'all' ? true :
      filter === 'available' ? !f.is_occupied : 
      filter === 'discharged_deceased' ? (f.patient_status === 'discharged' || f.patient_status === 'deceased' || f.patient_status === 'old_patient') :
      f.is_occupied;

    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredNumbers.length / rowsPerPage);
  const paginatedNumbers = filteredNumbers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const availableCount = fileNumbers.filter(f => !f.is_occupied).length;
  const dischargedDeceasedCount = fileNumbers.filter(f => f.patient_status === 'discharged' || f.patient_status === 'deceased' || f.patient_status === 'old_patient').length;
  const occupiedCount = fileNumbers.filter(f => f.is_occupied).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-8 h-8 text-green-600" />
            File Number Pool
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage manual file numbers and track unallocated numbers from discharged, deceased & old patients.</p>
        </div>
        <button 
          onClick={() => loadFileNumbers(true)} 
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-lg text-xs font-bold transition self-start md:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Pool</span>
        </button>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-gray-500 uppercase font-bold mb-1">Total File Numbers</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{fileNumbers.length.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-emerald-600 dark:text-emerald-400 uppercase font-bold mb-1">Available / Unallocated</div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{availableCount.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold mb-1">Discharged & Deceased</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{dischargedDeceasedCount.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="text-xs text-amber-600 dark:text-amber-400 uppercase font-bold mb-1">Occupied (Active)</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{occupiedCount.toLocaleString()}</div>
        </div>
      </div>

      {/* Add New Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add New Manual File Number
        </h2>
        <form onSubmit={handleAddFileNumber} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={newFileNumber}
              onChange={(e) => setNewFileNumber(e.target.value)}
              placeholder="Enter File Number (e.g. F-1001 or 0999)"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold text-sm"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !newFileNumber.trim()}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition shadow-sm flex items-center gap-2 disabled:opacity-50 text-sm"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add to Pool
          </button>
        </form>
      </div>

      {/* List Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative flex-1 w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search file numbers, patient name, or ID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button
              onClick={() => { setFilter('all'); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${filter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}
            >
              All ({fileNumbers.length})
            </button>
            <button
              onClick={() => { setFilter('available'); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${filter === 'available' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'}`}
            >
              Available / Unallocated ({availableCount})
            </button>
            <button
              onClick={() => { setFilter('discharged_deceased'); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${filter === 'discharged_deceased' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100'}`}
            >
              Discharged & Deceased ({dischargedDeceasedCount})
            </button>
            <button
              onClick={() => { setFilter('occupied'); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${filter === 'occupied' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'}`}
            >
              Occupied ({occupiedCount})
            </button>
          </div>
        </div>

        {/* 📱 Mobile Card View (< md) */}
        <div className="md:hidden space-y-3 p-4">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 text-green-600 animate-spin mx-auto" />
            </div>
          ) : paginatedNumbers.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm font-medium text-gray-500">
              No file numbers found matching your criteria
            </div>
          ) : (
            paginatedNumbers.map((file) => (
              <div key={file.file_number} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-gray-900 dark:text-white font-mono">{file.file_number}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {file.patient_name ? file.patient_name : 'Unassigned Manual Pool Number'}
                    </p>
                  </div>
                  <div>
                    {file.patient_status === 'discharged' ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Unallocated (Discharged)
                      </span>
                    ) : file.patient_status === 'deceased' ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                        Unallocated (Deceased)
                      </span>
                    ) : file.patient_status === 'old_patient' || file.patient_status === 'old' ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        Unallocated (Old Patient)
                      </span>
                    ) : file.is_occupied ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        Occupied (Active)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Unallocated (Pool)
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-400">
                    Added: {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                  {!file.is_occupied && (
                    <button
                      onClick={() => handleAllocateToNewPatient(file.file_number)}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-xs transition"
                    >
                      Allocate File
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 💻 Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-900 text-xs font-extrabold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="border border-gray-200 dark:border-gray-700 px-6 py-3.5">File Number</th>
                <th className="border border-gray-200 dark:border-gray-700 px-6 py-3.5">Allocation Status</th>
                <th className="border border-gray-200 dark:border-gray-700 px-6 py-3.5">Associated Record / Patient</th>
                <th className="border border-gray-200 dark:border-gray-700 px-6 py-3.5">Added / Registered</th>
                <th className="border border-gray-200 dark:border-gray-700 px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-green-600 animate-spin mx-auto saturate-150" />
                  </td>
                </tr>
              ) : paginatedNumbers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500 font-bold">
                    No file numbers found matching your criteria
                  </td>
                </tr>
              ) : (
                paginatedNumbers.map((file) => (
                  <tr key={file.file_number} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="border border-gray-200 dark:border-gray-700 px-6 py-4 font-extrabold text-gray-900 dark:text-white font-mono text-sm">
                      {file.file_number}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-6 py-4">
                      {file.patient_status === 'discharged' ? (
                        <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          UNALLOCATED (DISCHARGED)
                        </span>
                      ) : file.patient_status === 'deceased' ? (
                        <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-black bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700">
                          <UserX className="w-3.5 h-3.5 text-purple-600" />
                          UNALLOCATED (DECEASED)
                        </span>
                      ) : file.patient_status === 'old_patient' || file.patient_status === 'old' ? (
                        <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                          <UserX className="w-3.5 h-3.5 text-amber-600" />
                          UNALLOCATED (OLD PATIENT)
                        </span>
                      ) : file.is_occupied ? (
                        <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          OCCUPIED (ACTIVE)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          UNALLOCATED (MANUAL POOL)
                        </span>
                      )}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-6 py-4">
                      {file.patient_name ? (
                        <div>
                          <div className="font-extrabold text-gray-900 dark:text-white text-xs uppercase">{file.patient_name}</div>
                          {file.patient_number && <div className="text-[10px] text-gray-400 font-mono">Patient ID: {file.patient_number}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 font-bold italic">Unassigned Manual Pool Number</span>
                      )}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400">
                      {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="border border-gray-200 dark:border-gray-700 px-6 py-4 text-right">
                      {!file.is_occupied && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAllocateToNewPatient(file.file_number)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded text-xs transition shadow-sm"
                            title="Allocate this file number to a new patient"
                          >
                            Allocate File
                          </button>
                          {file.origin === 'manual_pool' && (
                            <button
                              onClick={() => handleDeleteFileNumber(file.file_number)}
                              className="p-1 text-gray-400 hover:text-rose-600 transition"
                              title="Remove from pool"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                      {file.is_occupied && (
                        <span className="p-1 text-gray-400 dark:text-gray-600 text-xs font-bold cursor-not-allowed">
                          In Use
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredNumbers.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4 bg-gray-100 dark:bg-gray-900/60">
            <div className="flex items-center gap-4 text-xs font-bold text-gray-500 dark:text-gray-400">
              <div>
                Showing <span className="text-gray-900 dark:text-white font-extrabold">{filteredNumbers.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}</span> to <span className="text-gray-900 dark:text-white font-extrabold">{Math.min(currentPage * rowsPerPage, filteredNumbers.length)}</span> of <span className="text-gray-900 dark:text-white font-extrabold">{filteredNumbers.length.toLocaleString()}</span> entries
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black text-gray-400">Per Page:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-bold outline-none"
                >
                  <option value={25}>25 items</option>
                  <option value={50}>50 items</option>
                  <option value={100}>100 items</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-gray-400 uppercase tracking-wider mr-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(1)} 
                  disabled={currentPage === 1} 
                  className="px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                  title="First Page"
                >
                  First
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                  disabled={currentPage === 1} 
                  className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                  disabled={currentPage === totalPages} 
                  className="p-1.5 border border-gray-300 dark:border-gray-700 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setCurrentPage(totalPages)} 
                  disabled={currentPage === totalPages} 
                  className="px-2.5 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-bold disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                  title="Last Page"
                >
                  Last
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
