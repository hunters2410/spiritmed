import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Eye, Phone, Mail, Calendar, Download, Filter, Skull, X, FileSpreadsheet, FileJson, ChevronLeft, ChevronRight } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

interface Patient {
  id: string;
  patient_number: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  email: string;
  blood_group: string;
  deceased_date: string;
  deceased_reason: string;
  address: string;
  total_due?: number;
  created_at: string;
}

export function DeceasedPatients() {
  const { profile } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [filters, setFilters] = useState({
    gender: 'all',
    bloodGroup: 'all'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  useEffect(() => {
    loadPatients();
  }, [profile]);

  const loadPatients = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      let query = supabase
        .from('patients')
        .select('*, invoices(balance)')
        .eq('status', 'deceased')
        .order('deceased_date', { ascending: false });

      if (profile.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      const patientsWithDue = (data || []).map((p: any) => ({
        ...p,
        total_due: p.invoices?.reduce((sum: number, inv: any) => sum + (inv.balance || 0), 0) || 0
      }));

      setPatients(patientsWithDue);
    } catch (error) {
      console.error('Error loading deceased patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Patient Number', 'Full Name', 'Age at Death', 'Gender', 'Phone', 'Email', 'Blood Group', 'Death Date'];
    const csvData = filteredPatients.map(patient => [
      patient.patient_number,
      patient.full_name,
      patient.date_of_birth ? getAge(patient.date_of_birth) : '',
      patient.gender,
      patient.phone || '',
      patient.email || '',
      patient.blood_group || '',
      patient.deceased_date ? new Date(patient.deceased_date).toLocaleDateString() : '',
      patient.deceased_reason || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deceased_patients_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const data = filteredPatients.map(p => ({
      'Patient Number': p.patient_number,
      'Full Name': p.full_name,
      'Age at Death': p.date_of_birth ? getAge(p.date_of_birth) : 'N/A',
      'Gender': p.gender,
      'Phone': p.phone || '',
      'Due': p.total_due || 0,
      'Deceased Date': p.deceased_date ? new Date(p.deceased_date).toLocaleDateString() : 'N/A'
    }));
    exportToExcel(data, 'spiritmed_deceased_patients');
  };

  const handleExportPDF = () => {
    const headers = ['#', 'Name', 'Phone', 'Due', 'Gender', 'Deceased Date'];
    const data = filteredPatients.map((p, i) => [
      i + 1,
      p.full_name,
      p.phone || 'N/A',
      `$${(p.total_due || 0).toLocaleString()}`,
      p.gender,
      p.deceased_date ? new Date(p.deceased_date).toLocaleDateString() : 'N/A'
    ]);
    exportToPDF(headers, data, 'Spiritmed Deceased Patients', 'spiritmed_deceased_patients');
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch =
      patient.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.patient_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phone?.includes(searchQuery);

    const matchesGender = filters.gender === 'all' || patient.gender === filters.gender;
    const matchesBloodGroup = filters.bloodGroup === 'all' || patient.blood_group === filters.bloodGroup;

    return matchesSearch && matchesGender && matchesBloodGroup;
  });

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const paginated = filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getAge = (dob: string) => {
    if (!dob) return 'N/A';
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const openViewModal = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowViewModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Deceased Patients</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">View and manage records of deceased patients</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by name, patient number, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-300"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
          <div className="flex bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
            <button
              onClick={handleExportExcel}
              className="p-2 text-green-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition"
              title="Export to Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportPDF}
              className="p-2 text-red-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition"
              title="Export to PDF"
            >
              <FileJson className="w-4 h-4" />
            </button>
            <button
              onClick={exportToCSV}
              className="p-2 text-blue-600 hover:bg-white dark:hover:bg-gray-600 rounded-md transition"
              title="Export to CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                <select
                  value={filters.gender}
                  onChange={(e) => setFilters({ ...filters, gender: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Blood Group</label>
                <select
                  value={filters.bloodGroup}
                  onChange={(e) => setFilters({ ...filters, bloodGroup: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Blood Groups</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setFilters({ gender: 'all', bloodGroup: 'all' })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Total Deceased: {filteredPatients.length}</h2>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Patient Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Age at Death
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Blood Group
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-amber-600 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700 font-sans">
                  Total Due
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Deceased Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Reason for Death
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No deceased patients found
                  </td>
                </tr>
              ) : (
                paginated.map((patient, idx) => (
                  <tr key={patient.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-400">
                      {(currentPage - 1) * itemsPerPage + idx + 1}
                    </td>
                    <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                          <Skull className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{patient.full_name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{patient.patient_number}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white flex items-center">
                        <Phone className="w-3 h-3 mr-1 text-gray-400" />
                        {patient.phone || 'N/A'}
                      </div>
                      {patient.email && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                          <Mail className="w-3 h-3 mr-1 text-gray-400" />
                          {patient.email}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {patient.date_of_birth ? `${getAge(patient.date_of_birth)} years` : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                        {patient.blood_group || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className={`text-sm font-black ${ (patient.total_due || 0) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        ${(patient.total_due || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white flex items-center">
                        <Calendar className="w-3 h-3 mr-1 text-gray-400" />
                        {patient.deceased_date ? new Date(patient.deceased_date).toLocaleDateString() : 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white max-w-xs truncate" title={patient.deceased_reason}>
                        {patient.deceased_reason || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium border-b border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => openViewModal(patient)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {filteredPatients.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <p className="text-xs text-gray-500">
                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredPatients.length)} of {filteredPatients.length}
              </p>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                <select
                  value={itemsPerPage === filteredPatients.length ? 'all' : itemsPerPage}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'all') {
                      setItemsPerPage(filteredPatients.length || 1);
                    } else {
                      setItemsPerPage(Number(val));
                    }
                    setCurrentPage(1);
                  }}
                  className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value="all">ALL</option>
                </select>
              </div>
            </div>

            {itemsPerPage < filteredPatients.length && totalPages > 1 && (
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
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-red-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
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

      {showViewModal && selectedPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Deceased Patient Details</h2>
              <button
                onClick={() => { setShowViewModal(false); setSelectedPatient(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                  <Skull className="w-8 h-8 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{selectedPatient.full_name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{selectedPatient.patient_number}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Gender</label>
                  <div className="text-sm text-gray-900 dark:text-white">{selectedPatient.gender || 'N/A'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Date of Birth</label>
                  <div className="text-sm text-gray-900 dark:text-white">
                    {selectedPatient.date_of_birth ? new Date(selectedPatient.date_of_birth).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Age at Death</label>
                  <div className="text-sm text-gray-900 dark:text-white">
                    {selectedPatient.date_of_birth ? `${getAge(selectedPatient.date_of_birth)} years` : 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Blood Group</label>
                  <div className="text-sm text-gray-900 dark:text-white">{selectedPatient.blood_group || 'N/A'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Phone</label>
                  <div className="text-sm text-gray-900 dark:text-white flex items-center">
                    <Phone className="w-4 h-4 mr-2 text-gray-400" />
                    {selectedPatient.phone || 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Email</label>
                  <div className="text-sm text-gray-900 dark:text-white flex items-center">
                    <Mail className="w-4 h-4 mr-2 text-gray-400" />
                    {selectedPatient.email || 'N/A'}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Address</label>
                  <div className="text-sm text-gray-900 dark:text-white">{selectedPatient.address || 'N/A'}</div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Deceased Date</label>
                  <div className="text-sm text-gray-900 dark:text-white flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                    {selectedPatient.deceased_date ? new Date(selectedPatient.deceased_date).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Reason for Death</label>
                  <div className="text-sm text-gray-900 dark:text-white p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    {selectedPatient.deceased_reason || 'No reason provided'}
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => { setShowViewModal(false); setSelectedPatient(null); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
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
