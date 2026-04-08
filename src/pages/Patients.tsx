import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Edit2, Eye, FileText, Phone, Mail, Calendar, Download, Filter, X, Trash2, HeartPulse, Stethoscope, Skull, LogOut, ChevronLeft, ChevronRight, FileSpreadsheet, FileJson } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';
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
  status: string;
  total_due?: number;
  created_at: string;
}

interface Doctor {
  id: string;
  full_name: string;
}

interface MedicalAid {
  id: string;
  name: string;
}

interface ReferralDoctor {
  id: string;
  full_name: string;
}

export function Patients() {
  const { profile } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [medicalAids, setMedicalAids] = useState<MedicalAid[]>([]);
  const [referralDoctors, setReferralDoctors] = useState<ReferralDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentTab, setCurrentTab] = useState('personal');
  const [filters, setFilters] = useState({
    gender: 'all',
    bloodGroup: 'all',
    hasBalance: 'all'
  });
  const [showDeceasedModal, setShowDeceasedModal] = useState(false);
  const [showDischargedModal, setShowDischargedModal] = useState(false);
  const [selectedPatientForStatus, setSelectedPatientForStatus] = useState<Patient | null>(null);
  const [statusFormData, setStatusFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: ''
  });
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    full_name: '',
    gender: 'male',
    email: '',
    password: '',
    address: '',
    phone: '',
    date_of_birth: '',
    doctor_id: '',
    clinical_history: '',
    chronic_medications: '',
    smoke: 'never',
    alcohol: 'never',
    flags: '',
    allergies: '',
    chronic_conditions: '',
    occupation: '',
    blood_group: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    next_of_kin_address: '',
    next_of_kin_relation: '',
    next_of_kin_email: '',
    responsible_person_name: '',
    responsible_person_address: '',
    responsible_person_phone: '',
    responsible_person_id_number: '',
    responsible_person_email: '',
    payment_method: 'cash',
    medical_aid_id: '',
    medical_aid_number: '',
    medical_aid_suffix: '',
    medical_aid_main_member: '',
    referral_doctor_id: '',
    send_sms: false
  });

  useEffect(() => {
    loadPatients();
    loadDoctors();
    loadMedicalAids();
    loadReferralDoctors();
  }, [profile]);

  const loadPatients = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      let query = supabase
        .from('patients')
        .select('*, invoices(balance)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

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
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      let query = supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'doctor')
        .eq('is_active', true);

      if (profile.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDoctors(data || []);
    } catch (error) {
      console.error('Error loading doctors:', error);
    }
  };

  const loadMedicalAids = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      let query = supabase
        .from('medical_aids')
        .select('id, name')
        .eq('is_active', true);

      if (profile.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMedicalAids(data || []);
    } catch (error) {
      console.error('Error loading medical aids:', error);
    }
  };

  const loadReferralDoctors = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      let query = supabase
        .from('referral_doctors')
        .select('id, full_name')
        .eq('is_active', true);

      if (profile.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReferralDoctors(data || []);
    } catch (error) {
      console.error('Error loading referral doctors:', error);
    }
  };

  const generatePatientNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `P${timestamp}${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPatient) {
        const { error } = await supabase
          .from('patients')
          .update({
            ...formData,
            // Don't update password if it's empty
            ...(formData.password ? { password: formData.password } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPatient.id);

        if (error) throw error;

        if (profile?.id && profile?.branch_id) {
            await logActivity(supabase, {
                userId: profile.id,
                branchId: profile.branch_id,
                action: 'UPDATE',
                tableName: 'patients',
                recordId: editingPatient.id,
                details: `Updated patient details for ${formData.full_name}`,
                newValues: formData
            });
        }
      } else {
        const patientNumber = generatePatientNumber();
        const { error, data } = await supabase
          .from('patients')
          .insert([{
            ...formData,
            branch_id: profile?.branch_id,
            patient_number: patientNumber,
            status: 'active',
            doctor_id: formData.doctor_id || null,
            medical_aid_id: formData.medical_aid_id || null,
            referral_doctor_id: formData.referral_doctor_id || null
          }])
          .select()
          .single();

        if (error) throw error;

        if (profile?.id && profile?.branch_id && data) {
            await logActivity(supabase, {
                userId: profile.id,
                branchId: profile.branch_id,
                action: 'CREATE',
                tableName: 'patients',
                recordId: data.id,
                details: `Registered new patient: ${formData.full_name} (${patientNumber})`,
                newValues: formData
            });
        }
      }

      setShowModal(false);
      resetForm();
      loadPatients();
    } catch (error) {
      console.error('Error saving patient:', error);
      alert('Failed to save patient');
    }
  };

  const handleEdit = (patient: any) => {
    setEditingPatient(patient);
    setFormData({
      title: patient.title || '',
      full_name: patient.full_name || '',
      gender: patient.gender || 'male',
      email: patient.email || '',
      password: '',
      address: patient.address || '',
      phone: patient.phone || '',
      date_of_birth: patient.date_of_birth || '',
      doctor_id: patient.doctor_id || '',
      clinical_history: patient.clinical_history || '',
      chronic_medications: patient.chronic_medications || '',
      smoke: patient.smoke || 'never',
      alcohol: patient.alcohol || 'never',
      flags: patient.flags || '',
      allergies: patient.allergies || '',
      chronic_conditions: patient.chronic_conditions || '',
      occupation: patient.occupation || '',
      blood_group: patient.blood_group || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      next_of_kin_address: patient.next_of_kin_address || '',
      next_of_kin_relation: patient.next_of_kin_relation || '',
      next_of_kin_email: patient.next_of_kin_email || '',
      responsible_person_name: patient.responsible_person_name || '',
      responsible_person_address: patient.responsible_person_address || '',
      responsible_person_phone: patient.responsible_person_phone || '',
      responsible_person_id_number: patient.responsible_person_id_number || '',
      responsible_person_email: patient.responsible_person_email || '',
      payment_method: patient.payment_method || 'cash',
      medical_aid_id: patient.medical_aid_id || '',
      medical_aid_number: patient.medical_aid_number || '',
      medical_aid_suffix: patient.medical_aid_suffix || '',
      medical_aid_main_member: patient.medical_aid_main_member || '',
      referral_doctor_id: patient.referral_doctor_id || '',
      send_sms: patient.send_sms || false
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      full_name: '',
      gender: 'male',
      email: '',
      password: '',
      address: '',
      phone: '',
      date_of_birth: '',
      doctor_id: '',
      clinical_history: '',
      chronic_medications: '',
      smoke: 'never',
      alcohol: 'never',
      flags: '',
      allergies: '',
      chronic_conditions: '',
      occupation: '',
      blood_group: '',
      emergency_contact_name: '',
      emergency_contact_phone: '',
      next_of_kin_address: '',
      next_of_kin_relation: '',
      next_of_kin_email: '',
      responsible_person_name: '',
      responsible_person_address: '',
      responsible_person_phone: '',
      responsible_person_id_number: '',
      responsible_person_email: '',
      payment_method: 'cash',
      medical_aid_id: '',
      medical_aid_number: '',
      medical_aid_suffix: '',
      medical_aid_main_member: '',
      referral_doctor_id: '',
      send_sms: false
    });
    setEditingPatient(null);
    setCurrentTab('personal');
  };

  const handleDelete = async (patientId: string, name: string) => {
    if (!confirm(`Are you sure you want to archive patient "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('patients')
        .update({ status: 'inactive' })
        .eq('id', patientId);

      if (error) throw error;

      if (profile?.id && profile?.branch_id) {
          await logActivity(supabase, {
              userId: profile.id,
              branchId: profile.branch_id,
              action: 'DELETE',
              tableName: 'patients',
              recordId: patientId,
              details: `Archived patient profile: ${name}`,
              newValues: { status: 'inactive' }
          });
      }
      loadPatients();
    } catch (error) {
      console.error('Error archiving patient:', error);
      alert('Failed to archive patient');
    }
  };

  const handleUpdateStatus = async (status: 'deceased' | 'discharged') => {
    if (!selectedPatientForStatus) return;

    try {
      setLoading(true);
      const updateData: any = {
        status: status,
        updated_at: new Date().toISOString()
      };

      if (status === 'deceased') {
        updateData.deceased_date = statusFormData.date;
        updateData.deceased_reason = statusFormData.reason;
      } else if (status === 'discharged') {
        updateData.discharged_date = statusFormData.date;
        updateData.discharge_status = statusFormData.reason; // We use the reason field for the status selection
        updateData.discharge_notes = statusFormData.notes;
      }

      const { error } = await supabase
        .from('patients')
        .update(updateData)
        .eq('id', selectedPatientForStatus.id);

      if (error) throw error;

      if (profile?.id && profile?.branch_id) {
          await logActivity(supabase, {
              userId: profile.id,
              branchId: profile.branch_id,
              action: 'STATUS_CHANGE',
              tableName: 'patients',
              recordId: selectedPatientForStatus.id,
              details: `Changed patient status to ${status.toUpperCase()} (Reason: ${statusFormData.reason})`,
              newValues: updateData
          });
      }

      alert(`Patient marked as ${status} successfully`);
      setShowDeceasedModal(false);
      setShowDischargedModal(false);
      setSelectedPatientForStatus(null);
      setStatusFormData({
        date: new Date().toISOString().split('T')[0],
        reason: '',
        notes: ''
      });
      loadPatients();
    } catch (error) {
      console.error(`Error updating patient status to ${status}:`, error);
      alert(`Failed to mark patient as ${status}`);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Patient Number', 'Full Name', 'Age', 'Gender', 'Phone', 'Email', 'Blood Group', 'Registration Date'];
    const csvData = filteredPatients.map(patient => [
      patient.patient_number,
      patient.full_name,
      patient.date_of_birth ? getAge(patient.date_of_birth) : '',
      patient.gender,
      patient.phone || '',
      patient.email || '',
      patient.blood_group || '',
      new Date(patient.created_at).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patients_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const data = filteredPatients.map(p => ({
      'Patient Number': p.patient_number,
      'Full Name': p.full_name,
      'Age': p.date_of_birth ? getAge(p.date_of_birth) : 'N/A',
      'Gender': p.gender,
      'Phone': p.phone || '',
      'Email': p.email || '',
      'Total Due': p.total_due || 0,
      'Blood Group': p.blood_group || '',
      'Registration Date': new Date(p.created_at).toLocaleDateString()
    }));
    exportToExcel(data, 'spiritmed_patients');
  };

  const handleExportPDF = () => {
    const headers = ['#', 'Name', 'Phone', 'Due', 'Gender', 'Blood'];
    const data = filteredPatients.map((p, i) => [
      i + 1,
      p.full_name,
      p.phone || 'N/A',
      `$${(p.total_due || 0).toLocaleString()}`,
      p.gender,
      p.blood_group || 'N/A'
    ]);
    exportToPDF(headers, data, 'Spiritmed Patient Directory', 'spiritmed_patients');
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch =
      patient.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.patient_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.phone?.includes(searchQuery);

    const matchesGender = filters.gender === 'all' || patient.gender === filters.gender;
    const matchesBloodGroup = filters.bloodGroup === 'all' || patient.blood_group === filters.bloodGroup;
    const matchesBalance = filters.hasBalance === 'all' || 
                          (filters.hasBalance === 'due' && (patient.total_due || 0) > 0) ||
                          (filters.hasBalance === 'none' && (patient.total_due || 0) <= 0);

    return matchesSearch && matchesGender && matchesBloodGroup && matchesBalance;
  });

  const totalClinicReceivable = filteredPatients.reduce((sum, p) => sum + (p.total_due || 0), 0);

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const paginated = filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getAge = (dob: string) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Active Patients</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage active patient records</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add Patient</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-xs text-gray-500 uppercase font-bold mb-1">Total Patients</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{filteredPatients.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-xs text-amber-500 uppercase font-bold mb-1">Total Dues</div>
          <div className="text-2xl font-bold text-amber-600">${totalClinicReceivable.toLocaleString()}</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search patients by name, ID, or phone..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
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
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                <select
                  value={filters.gender}
                  onChange={(e) => { setFilters({ ...filters, gender: e.target.value }); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Genders</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Blood Group</label>
                <select
                  value={filters.bloodGroup}
                  onChange={(e) => { setFilters({ ...filters, bloodGroup: e.target.value }); setCurrentPage(1); }}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Financial State</label>
                <select
                  value={filters.hasBalance}
                  onChange={(e) => { setFilters({ ...filters, hasBalance: e.target.value }); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Patients</option>
                  <option value="due">With Outstanding Dues</option>
                  <option value="none">No Dues</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => { setFilters({ gender: 'all', bloodGroup: 'all', hasBalance: 'all' }); setCurrentPage(1); }}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Age/Gender
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-bold text-amber-600 uppercase tracking-wider font-sans">
                  Total Due
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Blood Group
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    No patients found
                  </td>
                </tr>
              ) : (
                paginated.map((patient, idx) => (
                  <tr key={patient.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-gray-400 font-mono text-[10px] mr-3">
                          {(currentPage - 1) * itemsPerPage + idx + 1}
                        </div>
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                          <span className="text-green-600 dark:text-green-400 font-medium text-sm">
                            {patient.full_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{patient.full_name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                            <Calendar className="w-3 h-3 mr-1" />
                            {new Date(patient.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white font-mono">{patient.patient_number}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {patient.date_of_birth && `${getAge(patient.date_of_birth)} years`}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 capitalize">{patient.gender}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white flex items-center">
                        <Phone className="w-3 h-3 mr-1 text-gray-400" />
                        {patient.phone}
                      </div>
                      {patient.email && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center mt-1">
                          <Mail className="w-3 h-3 mr-1 text-gray-400" />
                          {patient.email}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-black ${ (patient.total_due || 0) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        ${(patient.total_due || 0).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                        {patient.blood_group || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.location.href = `/consultations?patientId=${patient.id}`}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                          title="Start Consultation"
                        >
                          <Stethoscope className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.location.href = `/vital-signs?patientId=${patient.id}`}
                          className="text-rose-600 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300"
                          title="Record Vitals"
                        >
                          <HeartPulse className="w-4 h-4" />
                        </button>
                        <button className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300">
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(patient)}
                          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPatientForStatus(patient);
                            setShowDeceasedModal(true);
                          }}
                          className="text-gray-900 dark:text-gray-100 hover:text-red-600 dark:hover:text-red-400"
                          title="Mark Deceased"
                        >
                          <Skull className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedPatientForStatus(patient);
                            setShowDischargedModal(true);
                          }}
                          className="text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300"
                          title="Mark Discharged"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(patient.id, patient.full_name)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
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
                                setItemsPerPage(filteredPatients.length || 1000000);
                            } else {
                                setItemsPerPage(Number(val));
                            }
                            setCurrentPage(1);
                        }}
                        className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-green-500"
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
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-green-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-5xl w-full my-8 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingPatient ? 'Edit Patient' : 'Add New Patient'}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex overflow-x-auto">
                <button
                  onClick={() => setCurrentTab('personal')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'personal'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Personal Info
                </button>
                <button
                  onClick={() => setCurrentTab('medical')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'medical'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Medical Info
                </button>
                <button
                  onClick={() => setCurrentTab('nextofkin')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'nextofkin'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Next of Kin
                </button>
                <button
                  onClick={() => setCurrentTab('financial')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'financial'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Financial Info
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
              {currentTab === 'personal' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Personal Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                      <select
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select</option>
                        <option value="Mr">Mr</option>
                        <option value="Mrs">Mrs</option>
                        <option value="Ms">Ms</option>
                        <option value="Dr">Dr</option>
                        <option value="Prof">Prof</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Birth Date</label>
                      <input
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="For patient portal access"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact *</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Occupation</label>
                      <input
                        type="text"
                        value={formData.occupation}
                        onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Home Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="send_sms"
                      checked={formData.send_sms}
                      onChange={(e) => setFormData({ ...formData, send_sms: e.target.checked })}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <label htmlFor="send_sms" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Send SMS notifications
                    </label>
                  </div>
                </div>
              )}

              {currentTab === 'medical' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Medical Information</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Doctor</label>
                      <select
                        value={formData.doctor_id}
                        onChange={(e) => setFormData({ ...formData, doctor_id: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select Doctor</option>
                        {doctors.map(doctor => (
                          <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Blood Group</label>
                      <select
                        value={formData.blood_group}
                        onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select</option>
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
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clinical History</label>
                    <textarea
                      value={formData.clinical_history}
                      onChange={(e) => setFormData({ ...formData, clinical_history: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chronic Medications</label>
                    <textarea
                      value={formData.chronic_medications}
                      onChange={(e) => setFormData({ ...formData, chronic_medications: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Smoke</label>
                      <select
                        value={formData.smoke}
                        onChange={(e) => setFormData({ ...formData, smoke: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="never">Never</option>
                        <option value="former">Former</option>
                        <option value="current">Current</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alcohol</label>
                      <select
                        value={formData.alcohol}
                        onChange={(e) => setFormData({ ...formData, alcohol: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="never">Never</option>
                        <option value="occasional">Occasional</option>
                        <option value="regular">Regular</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Flags</label>
                    <input
                      type="text"
                      value={formData.flags}
                      onChange={(e) => setFormData({ ...formData, flags: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Special alerts or warnings"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Allergies</label>
                    <textarea
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Referral</label>
                    <select
                      value={formData.referral_doctor_id}
                      onChange={(e) => setFormData({ ...formData, referral_doctor_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select Referral Doctor</option>
                      {referralDoctors.map(doctor => (
                        <option key={doctor.id} value={doctor.id}>
                          {doctor.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {currentTab === 'nextofkin' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Next of Kin Details</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Name</label>
                      <input
                        type="text"
                        value={formData.emergency_contact_name}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Contact</label>
                      <input
                        type="tel"
                        value={formData.emergency_contact_phone}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Relation</label>
                      <input
                        type="text"
                        value={formData.next_of_kin_relation}
                        onChange={(e) => setFormData({ ...formData, next_of_kin_relation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="e.g., Spouse, Parent, Sibling"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Email</label>
                      <input
                        type="email"
                        value={formData.next_of_kin_email}
                        onChange={(e) => setFormData({ ...formData, next_of_kin_email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Address</label>
                    <textarea
                      value={formData.next_of_kin_address}
                      onChange={(e) => setFormData({ ...formData, next_of_kin_address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {currentTab === 'financial' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Person Responsible for Fees</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                        <input
                          type="text"
                          value={formData.responsible_person_name}
                          onChange={(e) => setFormData({ ...formData, responsible_person_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                          <input
                            type="tel"
                            value={formData.responsible_person_phone}
                            onChange={(e) => setFormData({ ...formData, responsible_person_phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID Number</label>
                          <input
                            type="text"
                            value={formData.responsible_person_id_number}
                            onChange={(e) => setFormData({ ...formData, responsible_person_id_number: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input
                          type="email"
                          value={formData.responsible_person_email}
                          onChange={(e) => setFormData({ ...formData, responsible_person_email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                        <textarea
                          value={formData.responsible_person_address}
                          onChange={(e) => setFormData({ ...formData, responsible_person_address: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Payment Information</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Form of Payment</label>
                        <select
                          value={formData.payment_method}
                          onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="cash">Cash</option>
                          <option value="medical_aid">Medical Aid</option>
                        </select>
                      </div>

                      {formData.payment_method === 'medical_aid' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Medical Aid</label>
                            <select
                              value={formData.medical_aid_id}
                              onChange={(e) => setFormData({ ...formData, medical_aid_id: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            >
                              <option value="">Select Medical Aid</option>
                              {medicalAids.map(aid => (
                                <option key={aid.id} value={aid.id}>{aid.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Number</label>
                              <input
                                type="text"
                                value={formData.medical_aid_number}
                                onChange={(e) => setFormData({ ...formData, medical_aid_number: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Suffix</label>
                              <input
                                type="text"
                                value={formData.medical_aid_suffix}
                                onChange={(e) => setFormData({ ...formData, medical_aid_suffix: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Main Member</label>
                            <input
                              type="text"
                              value={formData.medical_aid_main_member}
                              onChange={(e) => setFormData({ ...formData, medical_aid_main_member: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md"
                >
                  {editingPatient ? 'Save Changes' : 'Add Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeceasedModal && selectedPatientForStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Skull className="w-6 h-6 text-red-600" />
                Mark Patient as Deceased
              </h2>
              <button onClick={() => setShowDeceasedModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Patient: <span className="font-bold text-gray-900 dark:text-white">{selectedPatientForStatus.full_name} ({selectedPatientForStatus.patient_number})</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Death *</label>
                <input
                  type="date"
                  value={statusFormData.date}
                  onChange={(e) => setStatusFormData({ ...statusFormData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason for Death *</label>
                <textarea
                  value={statusFormData.reason}
                  onChange={(e) => setStatusFormData({ ...statusFormData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                  placeholder="Enter reason or cause of death..."
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDeceasedModal(false)}
                  className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateStatus('deceased')}
                  disabled={loading}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-md disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Confirm Deceased'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDischargedModal && selectedPatientForStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <LogOut className="w-6 h-6 text-orange-600" />
                Discharge Patient
              </h2>
              <button onClick={() => setShowDischargedModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Patient: <span className="font-bold text-gray-900 dark:text-white">{selectedPatientForStatus.full_name} ({selectedPatientForStatus.patient_number})</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discharge Date *</label>
                <input
                  type="date"
                  value={statusFormData.date}
                  onChange={(e) => setStatusFormData({ ...statusFormData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discharge Status *</label>
                <select
                  value={statusFormData.reason} // Using reason field for discharge status type
                  onChange={(e) => setStatusFormData({ ...statusFormData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select status</option>
                  <option value="recovered">Recovered</option>
                  <option value="improved">Improved</option>
                  <option value="transferred">Transferred to another facility</option>
                  <option value="self_discharged">Self-Discharged / AMA</option>
                  <option value="referred">Referred for specialized care</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Additional Notes</label>
                <textarea
                  value={statusFormData.notes}
                  onChange={(e) => setStatusFormData({ ...statusFormData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                  placeholder="Enter additional discharge notes..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDischargedModal(false)}
                  className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateStatus('discharged')}
                  disabled={loading}
                  className="flex-1 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-bold shadow-md disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Complete Discharge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
