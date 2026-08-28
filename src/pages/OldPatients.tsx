import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  Search, Eye, Phone, Mail, Calendar, Download, Filter, 
  UserX, X, ChevronLeft, ChevronRight, RotateCcw, Trash2, 
  FileText, FolderOpen, CreditCard, Stethoscope, HeartPulse, History
} from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { formatFileNumber, formatPatientNumber } from '../utils/patientUtils';

interface Patient {
  id: string;
  patient_number: string;
  file_number?: string | null;
  full_name: string;
  title?: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  status: string;
  clinical_history?: string;
  allergies?: string;
  chronic_conditions?: string;
  total_due?: number;
  updated_at?: string;
  created_at: string;
}

export function OldPatients() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  
  // Patient Files State
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [selectedPatientForFiles, setSelectedPatientForFiles] = useState<Patient | null>(null);
  const [patientFiles, setPatientFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileCategoryFilter, setFileCategoryFilter] = useState<'all' | 'imaging' | 'invoices' | 'other'>('all');

  const getFileCategory = (file: { file_name?: string; title?: string; file_type?: string; notes?: string }): 'imaging' | 'invoices' | 'other' => {
    const text = `${file.title || ''} ${file.file_name || ''} ${file.file_type || ''} ${file.notes || ''}`.toLowerCase();
    if (/(ultrasound|mri|ct\b|ctscan|scan|xray|x-ray|imaging|sonar|radiology|mammogram|echo|echocardiogram|cxr|radiography)/i.test(text)) {
      return 'imaging';
    }
    if (/(invoice|invoices|receipt|bill\b|bills|payment|quotation|estimate|statement|fee)/i.test(text)) {
      return 'invoices';
    }
    return 'other';
  };
  
  const [filters, setFilters] = useState({
    gender: 'all',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  useEffect(() => {
    loadPatients();
  }, [profile]);

  const loadPatients = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      setLoading(true);
      let allPatients: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        let query = supabase
          .from('patients')
          .select('*, bills(balance)')
          .in('status', ['inactive', 'old_patient', 'old'])
          .order('updated_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile.role !== 'super_admin') {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allPatients = allPatients.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      
      const patientsWithDue = allPatients.map((p: any) => ({
        ...p,
        total_due: p.bills?.reduce((sum: number, inv: any) => sum + (inv.balance || 0), 0) || 0
      }));

      setPatients(patientsWithDue);
    } catch (error) {
      console.error('Error loading old patients:', error);
      showToast('Failed to load old patient records', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPatientFiles = async (patientId: string) => {
    try {
      setLoadingFiles(true);
      const { data, error } = await supabase
        .from('patient_files')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPatientFiles(data || []);
    } catch (err: any) {
      console.error('Error loading patient files:', err);
      showToast('Failed to load patient uploaded files', 'error');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleOpenFiles = (patient: Patient) => {
    setSelectedPatientForFiles(patient);
    setShowFilesModal(true);
    loadPatientFiles(patient.id);
  };

  const handleDownloadFile = async (file: any) => {
    try {
      const response = await fetch(file.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.title || file.file_name;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      showToast('Failed to download file', 'error');
    }
  };

  const handleReactivate = async (patient: Patient) => {
    if (!confirm(`Are you sure you want to restore "${patient.full_name}" back to Active Patients status?`)) return;

    try {
      setReactivatingId(patient.id);
      const { error } = await supabase
        .from('patients')
        .update({ 
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', patient.id);

      if (error) throw error;

      if (profile?.id && profile?.branch_id) {
        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id,
          action: 'UPDATE',
          tableName: 'patients',
          recordId: patient.id,
          details: `Restored old patient: ${patient.full_name} (${patient.patient_number}) back to Active Patients status`,
          newValues: { status: 'active' }
        });
      }

      showToast(`Patient ${patient.full_name} restored to Active status successfully!`);
      if (showViewModal) setShowViewModal(false);
      loadPatients();
    } catch (err: any) {
      console.error('Error reactivating patient:', err);
      showToast(err?.message || 'Failed to restore patient', 'error');
    } finally {
      setReactivatingId(null);
    }
  };

  const handleDelete = async (patientId: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete patient "${name}"? This action cannot be undone.`)) return;

    try {
      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', patientId);

      if (error) throw error;
      showToast(`Patient record deleted`);
      loadPatients();
    } catch (error: any) {
      console.error('Error deleting patient:', error);
      showToast('Failed to delete patient record', 'error');
    }
  };

  const getAge = (dob: string) => {
    if (!dob) return 'N/A';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return `${age} YRS`;
  };

  const exportToCSV = () => {
    const headers = ['Patient Number', 'File Number', 'Full Name', 'Gender', 'Date of Birth', 'Phone', 'Email', 'Total Due ($)', 'Date Archived'];
    const csvData = filteredPatients.map(patient => [
      patient.patient_number,
      patient.file_number || 'Released',
      patient.full_name,
      patient.gender,
      patient.date_of_birth || '',
      patient.phone || '',
      patient.email || '',
      patient.total_due || 0,
      patient.updated_at ? new Date(patient.updated_at).toLocaleDateString() : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `old_patients_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const data = filteredPatients.map(p => ({
      'Patient Number': p.patient_number,
      'File Number': p.file_number || 'Released',
      'Full Name': p.full_name,
      'Age': p.date_of_birth ? getAge(p.date_of_birth) : 'N/A',
      'Gender': p.gender,
      'Phone': p.phone || '',
      'Total Due ($)': p.total_due || 0,
      'Date Archived': p.updated_at ? new Date(p.updated_at).toLocaleDateString() : 'N/A'
    }));
    exportToExcel(data, 'spiritmed_old_patients');
  };

  const handleExportPDF = () => {
    const headers = ['#', 'Patient ID', 'Name', 'Phone', 'File #', 'Due', 'Gender', 'Archived Date'];
    const data = filteredPatients.map((p, i) => [
      i + 1,
      p.patient_number,
      p.full_name,
      p.phone || 'N/A',
      p.file_number || 'Released',
      `$${(p.total_due || 0).toLocaleString()}`,
      p.gender,
      p.updated_at ? new Date(p.updated_at).toLocaleDateString() : 'N/A'
    ]);
    exportToPDF(headers, data, 'Spiritmed Old Patient Records', 'spiritmed_old_patients');
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch =
      patient.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.patient_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (patient.file_number && patient.file_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      patient.phone?.includes(searchQuery);

    const matchesGender = filters.gender === 'all' || patient.gender === filters.gender;

    return matchesSearch && matchesGender;
  });

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage) || 1;
  const paginated = filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <UserX className="w-7 h-7 text-amber-600 dark:text-amber-400" />
            Old Patients
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View and manage archived / old patient records and released file numbers
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition shadow-md text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            <span>Excel</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition shadow-md text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by patient name, ID, file number, or phone..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-white text-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition text-sm font-medium ${
              showFilters
                ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase">Gender</label>
                <select
                  value={filters.gender}
                  onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="all">All Genders</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 📱 Mobile Card View (< md) */}
      <div className="md:hidden space-y-3">
        {paginated.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
            No old patient records found
          </div>
        ) : (
          paginated.map((patient) => (
            <div key={patient.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">{patient.full_name}</h3>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">{formatPatientNumber(patient.patient_number)}</span>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <span className="text-xs font-mono text-gray-500">{patient.file_number ? `File ${formatFileNumber(patient.file_number)}` : 'File Released'}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Old Patient
                </span>
              </div>

              <div className="text-xs border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1 text-gray-600 dark:text-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-400">Contact:</span>
                  <span className="font-medium">{patient.phone || patient.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Age / Gender:</span>
                  <span className="font-medium">{getAge(patient.date_of_birth)} · {patient.gender}</span>
                </div>
                {patient.total_due !== undefined && patient.total_due > 0 && (
                  <div className="flex justify-between font-bold text-red-600 dark:text-red-400">
                    <span>Balance Due:</span>
                    <span>${patient.total_due.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => { setSelectedPatient(patient); setShowViewModal(true); loadPatientFiles(patient.id); }}
                  className="px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-xs font-bold flex items-center space-x-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View</span>
                </button>
                <button
                  onClick={() => window.location.href = `/patient-history?patientId=${patient.id}`}
                  className="px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold flex items-center space-x-1"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>History</span>
                </button>
                <button
                  onClick={() => handleOpenFiles(patient)}
                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold flex items-center space-x-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Files</span>
                </button>
                <button
                  onClick={() => handleReactivate(patient)}
                  disabled={reactivatingId === patient.id}
                  className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-bold flex items-center space-x-1 hover:bg-amber-100 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore</span>
                </button>
                <button
                  onClick={() => handleDelete(patient.id, patient.full_name)}
                  className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold flex items-center space-x-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 💻 Desktop Table View (>= md) */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider border border-gray-200 dark:border-gray-700">Patient</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider border border-gray-200 dark:border-gray-700">Patient ID</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider border border-gray-200 dark:border-gray-700">File Number</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider border border-gray-200 dark:border-gray-700">Gender / Age</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider border border-gray-200 dark:border-gray-700">Contact</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider border border-gray-200 dark:border-gray-700">Balance Due</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider border border-gray-200 dark:border-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No old patient records found
                  </td>
                </tr>
              ) : (
                paginated.map((patient) => (
                  <tr key={patient.id} className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition">
                    <td className="px-5 py-3.5 border border-gray-200 dark:border-gray-700">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">{patient.full_name}</div>
                      <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">Status: Old Patient</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border border-gray-200 dark:border-gray-700">
                      <span className="text-sm font-mono font-bold text-blue-700 dark:text-blue-400">{formatPatientNumber(patient.patient_number)}</span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border border-gray-200 dark:border-gray-700">
                      {patient.file_number ? (
                        <span className="text-sm font-mono font-bold text-green-700 dark:text-green-400">{formatFileNumber(patient.file_number)}</span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Released</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white capitalize">{patient.gender}</div>
                      <div className="text-xs text-gray-500">{getAge(patient.date_of_birth)}</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">{patient.phone || 'N/A'}</div>
                      <div className="text-xs text-gray-500">{patient.email || ''}</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border border-gray-200 dark:border-gray-700">
                      <div className={`text-sm font-bold ${patient.total_due && patient.total_due > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
                        ${(patient.total_due || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-right text-sm font-medium border border-gray-200 dark:border-gray-700">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => { setSelectedPatient(patient); setShowViewModal(true); loadPatientFiles(patient.id); }}
                          className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/20 rounded-lg transition"
                          title="View Details & Files"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.location.href = `/patient-history?patientId=${patient.id}`}
                          className="p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 rounded-lg transition"
                          title="Patient History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenFiles(patient)}
                          className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded-lg transition"
                          title="Uploaded Patient Files"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleReactivate(patient)}
                          disabled={reactivatingId === patient.id}
                          className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 rounded-lg transition flex items-center gap-1"
                          title="Restore Patient to Active Status"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(patient.id, patient.full_name)}
                          className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition"
                          title="Delete Patient Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination — Always Visible */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center space-x-3 text-sm text-gray-600 dark:text-gray-400">
            <span>
              Showing <strong className="font-semibold text-gray-900 dark:text-white">{filteredPatients.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong className="font-semibold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filteredPatients.length)}</strong> of <strong className="font-semibold text-gray-900 dark:text-white">{filteredPatients.length}</strong> old patients
            </span>
            <span className="text-gray-300 dark:text-gray-700">|</span>
            <div className="flex items-center space-x-2">
              <span>Per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || filteredPatients.length === 0}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm font-semibold text-gray-800 dark:text-gray-200">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage >= totalPages || filteredPatients.length === 0}
              className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Patient View Modal */}
      {showViewModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  {selectedPatient.full_name}
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    Old Patient
                  </span>
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                  Patient ID: {formatPatientNumber(selectedPatient.patient_number)} · File #: {selectedPatient.file_number ? formatFileNumber(selectedPatient.file_number) : 'Released'}
                </p>
              </div>
              <button
                onClick={() => setShowViewModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <span className="text-xs text-gray-400 font-bold uppercase block">Gender & Age</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200 capitalize">{selectedPatient.gender} · {getAge(selectedPatient.date_of_birth)}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-bold uppercase block">Phone</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedPatient.phone || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-bold uppercase block">Email</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedPatient.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-bold uppercase block">Outstanding Balance</span>
                  <span className={`font-bold ${selectedPatient.total_due && selectedPatient.total_due > 0 ? 'text-red-600' : 'text-gray-800 dark:text-gray-200'}`}>
                    ${(selectedPatient.total_due || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {selectedPatient.address && (
                <div>
                  <span className="text-xs text-gray-400 font-bold uppercase block mb-1">Address</span>
                  <p className="text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    {selectedPatient.address}
                  </p>
                </div>
              )}

              {selectedPatient.clinical_history && (
                <div>
                  <span className="text-xs text-gray-400 font-bold uppercase block mb-1">Clinical History</span>
                  <p className="text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    {selectedPatient.clinical_history}
                  </p>
                </div>
              )}

              {selectedPatient.allergies && (
                <div>
                  <span className="text-xs text-gray-400 font-bold uppercase block mb-1 text-red-500">Allergies</span>
                  <p className="text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg border border-red-200 dark:border-red-900/50 font-medium">
                    {selectedPatient.allergies}
                  </p>
                </div>
              )}

              {/* Uploaded Patient Files Section */}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-indigo-500" />
                    Uploaded Documents & Files ({patientFiles.length})
                  </h4>
                  <button
                    onClick={() => handleOpenFiles(selectedPatient)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    View All Files
                  </button>
                </div>
                {loadingFiles ? (
                  <div className="py-4 text-center text-xs text-gray-500">Loading files...</div>
                ) : patientFiles.length === 0 ? (
                  <div className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg text-xs text-gray-500 text-center italic border border-gray-200 dark:border-gray-700">
                    No uploaded files found for this patient
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {patientFiles.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                        <div className="flex items-center space-x-2 truncate">
                          <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                          <span className="font-bold text-gray-900 dark:text-white truncate">{file.title || file.file_name}</span>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <a
                            href={file.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded font-bold hover:bg-blue-100 transition"
                          >
                            View
                          </a>
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="px-2 py-1 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded font-bold hover:bg-gray-300 transition"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-5 mt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => handleReactivate(selectedPatient)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm flex items-center space-x-2 shadow-sm transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restore Patient to Active Status</span>
              </button>
              <button
                onClick={() => setShowViewModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Files Dedicated Modal */}
      {showFilesModal && selectedPatientForFiles && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FolderOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  Uploaded Patient Files
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                  Patient: {selectedPatientForFiles.full_name} (#{selectedPatientForFiles.patient_number})
                </p>
              </div>
              <button
                onClick={() => setShowFilesModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {loadingFiles ? (
              <div className="py-12 text-center text-sm font-bold text-gray-500">Loading patient files...</div>
            ) : patientFiles.length === 0 ? (
              <div className="p-8 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-center space-y-2 border border-gray-200 dark:border-gray-700">
                <FileText className="w-10 h-10 text-gray-400 mx-auto" />
                <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No Uploaded Files Found</p>
                <p className="text-xs text-gray-500">There are no document scans or files uploaded for this patient yet.</p>
              </div>
            ) : (() => {
              const imgFiles = patientFiles.filter(f => getFileCategory(f) === 'imaging');
              const invFiles = patientFiles.filter(f => getFileCategory(f) === 'invoices');
              const othFiles = patientFiles.filter(f => getFileCategory(f) === 'other');
              const displayed = patientFiles.filter(f => fileCategoryFilter === 'all' || getFileCategory(f) === fileCategoryFilter);

              const renderRow = (file: any) => {
                const cat = getFileCategory(file);
                const catBadge = cat === 'imaging' 
                  ? { label: 'Imaging', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' }
                  : cat === 'invoices'
                  ? { label: 'Invoice', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' }
                  : { label: 'Other', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' };

                return (
                  <div key={file.id} className="p-3.5 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 bg-indigo-100 dark:bg-indigo-950/60 rounded-lg text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-gray-900 dark:text-white">{file.title || file.file_name}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${catBadge.bg}`}>
                            {catBadge.label}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 space-x-2 mt-0.5 font-mono">
                          <span>{file.upload_date ? new Date(file.upload_date).toLocaleDateString() : 'N/A'}</span>
                          {file.file_size && <span>• {(file.file_size / 1024).toFixed(1)} KB</span>}
                        </div>
                        {file.notes && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 italic">{file.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 justify-end">
                      <a
                        href={file.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                      >
                        View
                      </a>
                      <button
                        onClick={() => handleDownloadFile(file)}
                        className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg text-xs font-bold hover:bg-gray-300 transition"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-4">
                  {/* Category Pills */}
                  <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => setFileCategoryFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        fileCategoryFilter === 'all'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <span>All ({patientFiles.length})</span>
                    </button>
                    <button
                      onClick={() => setFileCategoryFilter('imaging')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        fileCategoryFilter === 'imaging'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300'
                      }`}
                    >
                      <span>Imaging ({imgFiles.length})</span>
                    </button>
                    <button
                      onClick={() => setFileCategoryFilter('invoices')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        fileCategoryFilter === 'invoices'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                      }`}
                    >
                      <span>Invoices ({invFiles.length})</span>
                    </button>
                    <button
                      onClick={() => setFileCategoryFilter('other')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        fileCategoryFilter === 'other'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300'
                      }`}
                    >
                      <span>Other ({othFiles.length})</span>
                    </button>
                  </div>

                  {fileCategoryFilter === 'all' ? (
                    <div className="space-y-4">
                      {imgFiles.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider border-b pb-1">
                            Imaging ({imgFiles.length})
                          </h4>
                          <div className="space-y-2">{imgFiles.map(renderRow)}</div>
                        </div>
                      )}
                      {invFiles.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider border-b pb-1">
                            Invoices ({invFiles.length})
                          </h4>
                          <div className="space-y-2">{invFiles.map(renderRow)}</div>
                        </div>
                      )}
                      {othFiles.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-black text-purple-600 dark:text-purple-400 uppercase tracking-wider border-b pb-1">
                            Other Files ({othFiles.length})
                          </h4>
                          <div className="space-y-2">{othFiles.map(renderRow)}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayed.map(renderRow)}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex justify-end pt-4 mt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowFilesModal(false)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 text-sm font-medium"
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
