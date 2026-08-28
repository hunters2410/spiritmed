import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Search, Filter, 
  Phone, ExternalLink, ChevronLeft, ChevronRight
} from 'lucide-react';

interface Appointment {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  appointment_type: string;
  status: string;
  notes: string;
  patient_id: string;
  doctor_id: string;
  patients: {
    full_name: string;
    phone: string;
    patient_number: string;
  };
  users: {
    full_name: string;
  };
}

export function FollowUps() {
  const { profile } = useAuth();
  const [followUps, setFollowUps] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  useEffect(() => {
    loadFollowUps();
  }, [profile?.id]);

  async function loadFollowUps() {
    if (!profile?.branch_id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patients!left (full_name, phone, patient_number),
          users:doctor_id!left (full_name)
        `)
        .eq('branch_id', profile.branch_id)
        .eq('appointment_type', 'follow_up')
        .order('appointment_date', { ascending: true });

      if (error) throw error;
      setFollowUps(data || []);
    } catch (err) {
      console.error('Error loading follow-ups:', err);
    } finally {
      setLoading(false);
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Confirmed</span>;
      case 'pending_confirmation': return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Pending Confirmation</span>;
      case 'cancelled': return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Cancelled</span>;
      default: return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  const filtered = followUps.filter(f => 
    f.patients?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.users?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.notes?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Follow-up Appointments</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage and monitor patient recovery sessions</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by patient, ID, or phone..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white transition-all"
            />
          </div>
          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm text-gray-700 dark:text-gray-300">
            <Filter className="w-4 h-4" />
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full border-collapse text-left border border-gray-200 dark:border-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">Patient</th>
              <th className="px-6 py-3 text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">Contact</th>
              <th className="px-6 py-3 text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">Schedule</th>
              <th className="px-6 py-3 text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">Doctor</th>
              <th className="px-6 py-3 text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">Status</th>
              <th className="px-6 py-3 text-xs font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <div className="flex justify-center mb-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                  Loading follow-ups...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500 italic">No follow-up appointments found.</td>
              </tr>
            ) : (
              paginated.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{item.patients?.full_name}</div>
                    <div className="text-xs text-gray-400 font-mono tracking-tighter uppercase">{item.patients?.patient_number}</div>
                  </td>
                  <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      {item.patients?.phone}
                    </div>
                  </td>
                  <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                    <div className="text-sm text-gray-900 dark:text-white font-medium">
                      {new Date(item.appointment_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(item.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700">
                    {item.users?.full_name}
                  </td>
                  <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                    {getStatusBadge(item.status)}
                  </td>
                  <td className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <button className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4 font-sans">
            <div className="flex items-center space-x-4">
              <span className="text-xs text-gray-500">Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}</span>
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
            {totalPages > 1 && (
              <div className="flex space-x-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-1 border border-gray-300 rounded hover:bg-white disabled:opacity-30 transition-all shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-1 border border-gray-300 rounded hover:bg-white disabled:opacity-30 transition-all shadow-sm"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
