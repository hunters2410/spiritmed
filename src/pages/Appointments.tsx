import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Calendar as CalendarIcon, Clock, User, Edit, Check, Search, ChevronLeft, ChevronRight, FileText, FileSpreadsheet, FolderOpen, Paperclip, Send, Smartphone, RotateCcw, Trash2 } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';
import { emailService } from '../utils/emailService';
import { SearchDropdown } from '../components/SearchDropdown';
import { RemarksQuickInput } from '../components/RemarksQuickInput';
import { notificationService } from '../utils/notificationService';
import { smsService } from '../utils/smsService';
import { exportAppointmentsPDF, exportAppointmentsExcel, BranchBranding, AppointmentExportItem } from '../utils/exportUtils';
import { AppointmentPatientFilesModal } from '../components/AppointmentPatientFilesModal';
import { getAppointmentTypeBadge, getAppointmentTypeLabel, fetchOrGenerateDoctorSlots } from '../utils/appointmentUtils';
import { fetchAllPatients } from '../utils/patientUtils';
import { recordRemarkUsage } from '../utils/remarksUtils';

interface Appointment {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  appointment_type: string;
  status: string;
  notes?: string;
  cancellation_reason?: string;
  doctor_id: string; 
  patient_id: string;
  branch_id?: string;
  patients: {
    full_name: string;
    phone: string;
    email?: string;
    patient_number?: string;
    file_number?: string;
  };
  users: {
    full_name: string;
  };
}

export function Appointments() {
  const { profile, hasPermission } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [branchInfo, setBranchInfo] = useState<BranchBranding | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [selectedPatientForFiles, setSelectedPatientForFiles] = useState<{ id: string; name: string; number?: string } | null>(null);
  const [formData, setFormData] = useState({
    patient_id: '',
    doctor_id: '',
    appointment_date: new Date().toISOString().split('T')[0], 
    appointment_time: '',
    duration_minutes: 30,
    appointment_type: 'consultation',
    notes: '',
    status: 'pending_confirmation',
    cancellation_reason: ''
  });

  const openCreateModal = () => {
    setFormData({
      patient_id: '',
      doctor_id: '',
      appointment_date: new Date().toISOString().split('T')[0],
      appointment_time: '',
      duration_minutes: 30,
      appointment_type: 'consultation',
      notes: '',
      status: 'pending_confirmation',
      cancellation_reason: ''
    });
    setSelectedSlotId('');
    setIsEditing(false);
    setEditingId(null);
    setShowModal(true);
  };

  const getLocalDateTimeComponents = (dateString: string) => {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return { dateStr: '', timeStr: '' };
    }
    const dateStr = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('-');
    
    const timeStr = [
      String(d.getHours()).padStart(2, '0'),
      String(d.getMinutes()).padStart(2, '0')
    ].join(':');

    return { dateStr, timeStr };
  };

  const handleSelectSlot = (slot: any) => {
    setSelectedSlotId(slot.id);
    const { dateStr, timeStr } = getLocalDateTimeComponents(slot.start_time);
    const duration = Math.round((new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / 60000) || formData.duration_minutes;
    setFormData(prev => ({
      ...prev,
      appointment_date: dateStr,
      appointment_time: timeStr,
      duration_minutes: duration
    }));
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [slotMessage, setSlotMessage] = useState('');
  const [newPatient, setNewPatient] = useState({
    full_name: '',
    phone: '',
    gender: 'male',
    date_of_birth: '',
    email: '',
    file_number: '',
    address: ''
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [datePreset, setDatePreset] = useState('custom');
  const [editingCell, setEditingCell] = useState<{ id: string; type: 'date' | 'time' } | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState<string[]>([]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const currentIds = paginatedAppointments.map(a => a.id);
      setSelectedAppointmentIds(prev => Array.from(new Set([...prev, ...currentIds])));
    } else {
      const currentIds = new Set(paginatedAppointments.map(a => a.id));
      setSelectedAppointmentIds(prev => prev.filter(id => !currentIds.has(id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedAppointmentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDeleteAppointment = async (id: string, patientName?: string) => {
    if (!window.confirm(`Are you sure you want to delete this appointment for "${patientName || 'this patient'}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      // Release any booked slots linked to this appointment
      await supabase
        .from('appointment_slots')
        .update({ is_booked: false, appointment_id: null })
        .eq('appointment_id', id);

      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (profile?.id && profile?.branch_id) {
        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id,
          action: 'DELETE',
          tableName: 'appointments',
          recordId: id,
          details: `Deleted appointment for patient: ${patientName || id}`
        });
      }

      setAppointments(prev => prev.filter(a => a.id !== id));
      setSelectedAppointmentIds(prev => prev.filter(selectedId => selectedId !== id));
      setTotalCount(prev => Math.max(0, prev - 1));
      setSuccessMessage('Appointment deleted successfully!');
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Error deleting appointment:', err);
      alert('Failed to delete appointment: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDeleteAppointments = async () => {
    if (selectedAppointmentIds.length === 0) return;

    if (!window.confirm(`PERMANENT BULK DELETE CONFIRMATION:\n\nAre you sure you want to PERMANENTLY delete ${selectedAppointmentIds.length} selected appointments?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      // Release any booked slots linked to these appointments
      await supabase
        .from('appointment_slots')
        .update({ is_booked: false, appointment_id: null })
        .in('appointment_id', selectedAppointmentIds);

      const { error } = await supabase
        .from('appointments')
        .delete()
        .in('id', selectedAppointmentIds);

      if (error) throw error;

      if (profile?.id && profile?.branch_id) {
        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id,
          action: 'DELETE',
          tableName: 'appointments',
          recordId: selectedAppointmentIds.join(', '),
          details: `Bulk deleted ${selectedAppointmentIds.length} appointments`
        });
      }

      const deletedCount = selectedAppointmentIds.length;
      setAppointments(prev => prev.filter(a => !selectedAppointmentIds.includes(a.id)));
      setSelectedAppointmentIds([]);
      setTotalCount(prev => Math.max(0, prev - deletedCount));
      setSuccessMessage(`${deletedCount} appointments deleted successfully!`);
      setShowSuccessModal(true);
    } catch (err: any) {
      console.error('Error bulk deleting appointments:', err);
      alert('Failed to delete appointments: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const localToday = new Date();
    
    const getLocalDateStr = (d: Date) => {
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
      ].join('-');
    };

    if (preset === 'today') {
      const dateStr = getLocalDateStr(localToday);
      setDateRange({ startDate: dateStr, endDate: dateStr });
    } else if (preset === 'tomorrow') {
      const tom = new Date(localToday);
      tom.setDate(tom.getDate() + 1);
      const dateStr = getLocalDateStr(tom);
      setDateRange({ startDate: dateStr, endDate: dateStr });
    } else if (preset === 'yesterday') {
      const yes = new Date(localToday);
      yes.setDate(yes.getDate() - 1);
      const dateStr = getLocalDateStr(yes);
      setDateRange({ startDate: dateStr, endDate: dateStr });
    } else {
      setDateRange({ startDate: '', endDate: '' });
    }
  };

  const handleStatusChange = (appointmentId: string, newStatus: string) => {
    if (newStatus === 'cancelled') {
      setCancellingAppointmentId(appointmentId);
      setShowCancelModal(true);
    } else {
      updateStatus(appointmentId, newStatus);
    }
  };

  const saveInlineDate = async (id: string) => {
    setEditingCell(null);
    const appointment = appointments.find(a => a.id === id);
    if (!appointment) return;
    
    const { timeStr } = getLocalDateTimeComponents(appointment.appointment_date);
    const newDateTime = `${tempValue}T${timeStr || '09:00'}:00`;

    // Prevent duplicate booking for the same patient on the same date
    const dateStr = tempValue;
    const startOfDay = `${dateStr}T00:00:00`;
    const endOfDay = `${dateStr}T23:59:59`;

    const { data: existingAppts } = await supabase
      .from('appointments')
      .select('id')
      .eq('patient_id', appointment.patient_id)
      .gte('appointment_date', startOfDay)
      .lte('appointment_date', endOfDay)
      .neq('id', id)
      .neq('status', 'cancelled');

    if (existingAppts && existingAppts.length > 0) {
      alert(`Duplicate Booking Blocked: Patient "${appointment.patients?.full_name || 'Selected patient'}" already has another active appointment booked on ${dateStr}.`);
      return;
    }

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ appointment_date: newDateTime })
        .eq('id', id);

      if (error) throw error;
      
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, appointment_date: newDateTime } : a));
    } catch (err) {
      console.error('Error saving inline date:', err);
      alert('Failed to update date');
    }
  };

  const saveInlineTime = async (id: string) => {
    setEditingCell(null);
    const appointment = appointments.find(a => a.id === id);
    if (!appointment) return;
    
    const { dateStr } = getLocalDateTimeComponents(appointment.appointment_date);
    const newDateTime = `${dateStr || new Date().toISOString().split('T')[0]}T${tempValue}:00`;

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ appointment_date: newDateTime })
        .eq('id', id);

      if (error) throw error;
      
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, appointment_date: newDateTime } : a));
    } catch (err) {
      console.error('Error saving inline time:', err);
      alert('Failed to update time');
    }
  };

  const updateAppointmentType = async (id: string, type: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ appointment_type: type })
        .eq('id', id);

      if (error) throw error;
      
      setAppointments(prev => prev.map(a => a.id === id ? { ...a, appointment_type: type } : a));
    } catch (err) {
      console.error('Error saving inline appointment type:', err);
      alert('Failed to update appointment type');
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateRange, statusFilter, typeFilter, itemsPerPage]);

  useEffect(() => {
    if (profile?.branch_id) {
      loadBranchInfo(profile.branch_id);
    }
  }, [profile?.branch_id]);

  const loadBranchInfo = async (branchId: string) => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('name, logo_url, phone, email, address')
        .eq('id', branchId)
        .maybeSingle();
      if (!error && data) {
        setBranchInfo(data);
      }
    } catch (e) {
      console.error('Error fetching branch branding info:', e);
    }
  };

  useEffect(() => {
    if (profile?.id) {
      loadAppointments();
      loadPatients();
      loadDoctors();
    }
  }, [profile?.id, profile?.branch_id, dateRange.startDate, dateRange.endDate, statusFilter, typeFilter, currentPage, itemsPerPage, searchQuery]);

  useEffect(() => {
    if (formData.doctor_id && formData.appointment_date) {
      loadAvailableSlots(formData.doctor_id, formData.appointment_date);
    }
  }, [formData.doctor_id, formData.appointment_date]);

  useEffect(() => {
    if (formData.doctor_id) {
      fetchDoctorDuration(formData.doctor_id);
    }
  }, [formData.doctor_id]);

  const fetchDoctorDuration = async (doctorId: string) => {
    if (!doctorId) return;
    try {
      const { data, error } = await supabase
        .from('doctor_availability')
        .select('slot_duration')
        .eq('doctor_id', doctorId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data && data.slot_duration) {
        setFormData(prev => ({ ...prev, duration_minutes: data.slot_duration }));
      } else {
        setFormData(prev => ({ ...prev, duration_minutes: 30 }));
      }
    } catch (error) {
      console.error('Error fetching doctor slot duration:', error);
    }
  };

  const loadAvailableSlots = async (doctorId: string, date: string) => {
    try {
      setSelectedSlotId(''); 
      const { slots, message } = await fetchOrGenerateDoctorSlots(
        supabase,
        doctorId,
        date,
        profile?.branch_id
      );
      setAvailableSlots(slots || []);
      setSlotMessage(message || '');
    } catch (error) {
      console.error('Error loading available slots:', error);
    }
  };

  const loadAppointments = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      // Only trigger full layout loading on initial load when no data exists yet
      if (appointments.length === 0) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      let query = supabase
        .from('appointments')
        .select(`
          id, appointment_date, duration_minutes, appointment_type, status, notes, cancellation_reason,
          doctor_id, patient_id, branch_id,
          patients!left (full_name, phone, email, patient_number, file_number),
          users:doctor_id!left (full_name)
        `, { count: 'exact' })
        .order('appointment_date', { ascending: false });

      // Apply range only when not fetching all records
      if (itemsPerPage > 0) {
        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;
        query = query.range(from, to);
      }

      if (profile.role !== 'super_admin') {
        // Include appointments for this branch AND orphaned records with no branch_id
        // (legacy records created before branch_id was enforced)
        query = query.or(`branch_id.eq.${profile.branch_id},branch_id.is.null`);
      }
      if (profile.role === 'doctor') {
        query = query.eq('doctor_id', profile.id);
      }
      if (dateRange.startDate) {
        query = query.gte('appointment_date', dateRange.startDate);
      }
      if (dateRange.endDate) {
        const endDateObj = new Date(dateRange.endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        query = query.lt('appointment_date', endDateObj.toISOString().split('T')[0]);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('appointment_type', typeFilter);
      }
      if (searchQuery.trim()) {
        const searchTerm = searchQuery.trim();
        // Look up patients whose name, file_number, or patient_number matches
        const { data: matchingPatients } = await supabase
          .from('patients')
          .select('id')
          .or(
            `full_name.ilike.%${searchTerm}%,file_number.ilike.%${searchTerm}%,patient_number.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
          );
        const matchingPatientIds = (matchingPatients || []).map((p: any) => p.id);

        if (matchingPatientIds.length > 0) {
          query = query.or(
            `notes.ilike.%${searchTerm}%,patient_id.in.(${matchingPatientIds.join(',')})`
          );
        } else {
          query = query.or(`notes.ilike.%${searchTerm}%`);
        }
      }
      const { data, error, count } = await query;
      if (error) throw error;
      setAppointments(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const loadPatients = async () => {
    if (!profile) return;
    try {
      const data = await fetchAllPatients({
        select: 'id, full_name, patient_number, file_number, national_id, phone, email',
        activeOnly: false
      });
      setPatients(data || []);
    } catch (err) {
      console.error('Error loading patients:', err);
    }
  };

  const generatePatientNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${timestamp}${random}`;
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const patientNumber = generatePatientNumber();

      // --- Duplicate checks ---
      if (newPatient.file_number.trim()) {
        const { data: existingFile } = await supabase
          .from('patients')
          .select('id, full_name')
          .eq('file_number', newPatient.file_number.trim())
          .maybeSingle();
        if (existingFile) {
          alert(`File number "${newPatient.file_number.trim()}" is already assigned to patient: ${existingFile.full_name}`);
          setSubmitting(false);
          return;
        }
      }

      if (newPatient.email.trim()) {
        const { data: existingEmail } = await supabase
          .from('patients')
          .select('id, full_name')
          .eq('email', newPatient.email.trim())
          .maybeSingle();
        if (existingEmail) {
          alert(`Email "${newPatient.email.trim()}" is already registered to patient: ${existingEmail.full_name}`);
          setSubmitting(false);
          return;
        }
      }
      // --- End duplicate checks ---

      const email = newPatient.email.trim() || `${newPatient.full_name.toLowerCase().replace(/\s+/g, '.')}@spiritmed.placeholder`;

      const sanitizedPatient = Object.fromEntries(
        Object.entries(newPatient).map(([key, value]) => [
          key,
          typeof value === 'string' && value.trim() === '' ? null : (typeof value === 'string' ? value.trim() : value)
        ])
      );

      const { data, error } = await supabase
        .from('patients')
        .insert([{
          ...sanitizedPatient,
          email,
          file_number: newPatient.file_number.trim() || null,
          address: newPatient.address.trim() || null,
          date_of_birth: newPatient.date_of_birth.trim() || null,
          patient_number: patientNumber,
          branch_id: profile?.branch_id,
          status: 'active'
        }])
        .select();

      if (error) throw error;

        if (data && data[0]) {
          if (profile?.id && profile?.branch_id) {
            await logActivity(supabase, {
              userId: profile.id,
              branchId: profile.branch_id,
              action: 'CREATE',
              tableName: 'patients',
              recordId: data[0].id,
              details: `Quick-added patient from appointments: ${newPatient.full_name}`,
              newValues: { ...newPatient, patient_number: patientNumber }
            });
          }
          const createdPatient = data[0];
          // Only add the fields the dropdown needs — avoids raw DB row dumps in the list
          setPatients([...patients, {
            id: createdPatient.id,
            full_name: createdPatient.full_name,
            patient_number: createdPatient.patient_number,
            email: createdPatient.email
          }]);
          setFormData({
            ...formData,
            patient_id: createdPatient.id
          });
          setShowPatientModal(false);
          setNewPatient({
            full_name: '',
            phone: '',
            gender: 'male',
            date_of_birth: '',
            email: '',
            file_number: '',
            address: ''
          });
          setSuccessMessage(`Patient "${createdPatient.full_name}" registered successfully!`);
          setShowSuccessModal(true);
        }
    } catch (error: any) {
      console.error('Error creating patient:', error);
      setSuccessMessage('Failed to create patient: ' + (error?.message || 'Unknown error'));
      setShowSuccessModal(true);
    } finally {
      setSubmitting(false);
    }
  };

  const loadDoctors = async () => {
    if (!profile?.branch_id) return;
    const { data } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('branch_id', profile.branch_id)
      .eq('role', 'doctor')
      .eq('is_active', true)
      .order('full_name');
    setDoctors(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const resetForm = () => {
        setFormData({
          patient_id: '',
          doctor_id: '',
          appointment_date: new Date().toISOString().split('T')[0],
          appointment_time: '',
          duration_minutes: 30,
          appointment_type: 'consultation',
          notes: '',
          status: 'pending_confirmation',
          cancellation_reason: ''
        });
        setSelectedSlotId('');
        setIsEditing(false);
        setEditingId(null);
      };

      let finalDateTime = '';
      let finalDuration = formData.duration_minutes;

      if (selectedSlotId) {
        const selectedSlot = availableSlots.find(s => s.id === selectedSlotId);
        if (selectedSlot) {
          finalDateTime = selectedSlot.start_time;
          finalDuration = selectedSlot.slot_duration || formData.duration_minutes;
        }
      }

      if (!finalDateTime) {
        if (formData.appointment_date && formData.appointment_time) {
          finalDateTime = `${formData.appointment_date}T${formData.appointment_time}:00`;
        } else {
          alert('Please select an available time slot or enter date and time.');
          setLoading(false);
          return;
        }
      }

      // Prevent 1 patient from having 2 active appointments on the same date
      const dateStr = finalDateTime.split('T')[0] || finalDateTime.split(' ')[0];
      const startOfDay = `${dateStr}T00:00:00`;
      const endOfDay = `${dateStr}T23:59:59`;

      let dupCheckQuery = supabase
        .from('appointments')
        .select('id')
        .eq('patient_id', formData.patient_id)
        .gte('appointment_date', startOfDay)
        .lte('appointment_date', endOfDay)
        .neq('status', 'cancelled');

      if (isEditing && editingId) {
        dupCheckQuery = dupCheckQuery.neq('id', editingId);
      }

      const { data: existingAppts } = await dupCheckQuery;

      if (existingAppts && existingAppts.length > 0) {
        const patientObj = patients.find(p => p.id === formData.patient_id);
        alert(`Duplicate Booking Blocked: Patient "${patientObj?.full_name || 'Selected patient'}" already has an active appointment booked on ${dateStr}. A patient cannot have duplicate appointments on the same date.`);
        setSubmitting(false);
        setLoading(false);
        return;
      }

      if (isEditing && editingId) {
        const oldAppointment = appointments.find(a => a.id === editingId);
        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            patient_id: formData.patient_id,
            doctor_id: formData.doctor_id,
            appointment_type: formData.appointment_type,
            notes: formData.notes,
            status: formData.status,
            duration_minutes: finalDuration,
            appointment_date: finalDateTime,
            ...(formData.status === 'cancelled' ? { cancellation_reason: formData.cancellation_reason || (oldAppointment as any)?.cancellation_reason || 'Manually Cancelled' } : {})
          })
          .eq('id', editingId);

        if (updateError) throw updateError;

        if (profile?.id && profile?.branch_id) {
          const patientName = patients.find(p => p.id === formData.patient_id)?.full_name || 'Patient';
          await logActivity(supabase, {
            userId: profile.id,
            branchId: profile.branch_id,
            action: 'UPDATE',
            tableName: 'appointments',
            recordId: editingId,
            details: `Updated appointment details for patient: ${patientName}`,
            newValues: formData
          });

          if (formData.doctor_id) {
            await notificationService.send({
              userId: formData.doctor_id,
              title: 'Appointment Updated',
              message: `Appointment for ${patientName} has been updated.`,
              type: 'info',
              link: '/appointments',
              branchId: profile.branch_id
            });
          }
        }

        if (oldAppointment && oldAppointment.status !== formData.status && (formData.status === 'confirmed' || formData.status === 'cancelled')) {
          const branchId = (profile?.branch_id || (oldAppointment as any).branch_id) as string;
          if (branchId) {
            const doctorName = doctors.find(d => d.id === formData.doctor_id)?.full_name || (oldAppointment as any).users?.full_name || 'Doctor';
            const formattedDate = new Date(finalDateTime).toLocaleDateString();
            const formattedTime = new Date(finalDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const triggerType = formData.status === 'confirmed' ? 'appointment_confirmed' : 'appointment_cancelled';
            const pat = patients.find(p => p.id === formData.patient_id) || oldAppointment.patients;

            if (pat?.phone) {
              await smsService.sendSms({
                recipientPhone: pat.phone,
                triggerType: triggerType as any,
                variables: {
                  patient_name: pat.full_name,
                  doctor_name: doctorName,
                  date: formattedDate,
                  time: formattedTime,
                  reason: formData.cancellation_reason || ''
                },
                branchId,
                patientId: formData.patient_id
              });
            }

            if ((pat as any)?.email) {
              await emailService.sendEmail({
                recipientEmail: (pat as any).email,
                recipientName: pat.full_name,
                triggerType,
                placeholders: {
                  patient_name: pat.full_name,
                  doctor_name: doctorName,
                  date: formattedDate,
                  time: formattedTime,
                  reason: formData.cancellation_reason || ''
                },
                branchId
              });
            }
          }
        }

        setSuccessMessage('Appointment updated successfully!');
        setShowSuccessModal(true);
      } else {
        const { data: appointmentData, error: appointmentError } = await supabase
          .from('appointments')
          .insert([{
            patient_id: formData.patient_id,
            doctor_id: formData.doctor_id,
            appointment_type: formData.appointment_type,
            notes: formData.notes,
            status: formData.status,
            duration_minutes: finalDuration,
            appointment_date: finalDateTime,
            branch_id: profile?.branch_id,
            created_by: profile?.id
          }])
          .select()
          .single();

        if (appointmentError) throw appointmentError;

        if (selectedSlotId) {
          await supabase
            .from('appointment_slots')
            .update({ is_booked: true, appointment_id: appointmentData.id })
            .eq('id', selectedSlotId);
        }

        if (profile?.id && profile?.branch_id && appointmentData) {
          const patient = patients.find(p => p.id === formData.patient_id);
          const patientName = patient?.full_name || 'Patient';
          
          await logActivity(supabase, {
            userId: profile.id,
            branchId: profile.branch_id,
            action: 'CREATE',
            tableName: 'appointments',
            recordId: appointmentData.id,
            details: `Scheduled new ${formData.appointment_type} appointment for patient: ${patientName}`,
            newValues: formData
          });

          if (formData.doctor_id) {
            await notificationService.send({
              userId: formData.doctor_id,
              title: 'New Appointment',
              message: `You have a new appointment with ${patientName} on ${new Date(finalDateTime).toLocaleString()}.`,
              type: 'success',
              link: '/appointments',
              branchId: profile.branch_id
            });
          }

          // AUTOMATIC DISPATCH: SMS & EMAIL (Appointment Booked)
          if (patient && profile?.branch_id) {
            const doctorName = doctors.find(d => d.id === formData.doctor_id)?.full_name || 'Doctor';
            const formattedDate = new Date(finalDateTime).toLocaleDateString();
            const formattedTime = new Date(finalDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (patient.phone) {
              await smsService.sendSms({
                recipientPhone: patient.phone,
                triggerType: 'appointment_booked',
                variables: {
                  patient_name: patient.full_name,
                  doctor_name: doctorName,
                  date: formattedDate,
                  time: formattedTime
                },
                branchId: profile.branch_id,
                patientId: patient.id
              });
            }

            if (patient.email) {
              await emailService.sendEmail({
                recipientEmail: patient.email,
                recipientName: patient.full_name,
                triggerType: 'appointment_booked',
                placeholders: {
                  patient_name: patient.full_name,
                  doctor_name: doctorName,
                  date: formattedDate,
                  time: formattedTime
                },
                branchId: profile.branch_id
              });
            }
          }
        }

        setSuccessMessage('Appointment scheduled successfully!');
        setShowSuccessModal(true);
      }

      if (formData.notes) {
        recordRemarkUsage(formData.notes);
      }

      setShowModal(false);
      resetForm();
      loadAppointments();
    } catch (error: any) {
      console.error('Error handling appointment submission:', error);
      alert(error.message || 'Failed to handle appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const sendAppointmentSms = async (appointment: Appointment) => {
    const patientPhone = appointment.patients?.phone;
    const patientEmail = (appointment.patients as any)?.email;

    if (!patientPhone && !patientEmail) {
      alert('Patient does not have a registered phone number or email address.');
      return;
    }
    const branchId = profile?.branch_id || appointment.branch_id;
    if (!branchId) {
      alert('Branch ID is required to send notifications.');
      return;
    }

    try {
      const formattedDate = new Date(appointment.appointment_date).toLocaleDateString();
      const formattedTime = formatTime(appointment.appointment_date);
      const triggerType = appointment.status === 'confirmed' ? 'appointment_confirmed' : 'appointment_booked';
      const doctorName = appointment.users?.full_name || 'Doctor';
      const dispatched: string[] = [];

      if (patientPhone) {
        const smsRes = await smsService.sendSms({
          recipientPhone: patientPhone,
          triggerType,
          variables: {
            patient_name: appointment.patients.full_name,
            doctor_name: doctorName,
            date: formattedDate,
            time: formattedTime
          },
          branchId,
          patientId: appointment.patient_id
        });
        if (smsRes.success) dispatched.push('SMS');
      }

      if (patientEmail) {
        const emailRes = await emailService.sendEmail({
          recipientEmail: patientEmail,
          recipientName: appointment.patients.full_name,
          triggerType,
          placeholders: {
            patient_name: appointment.patients.full_name,
            doctor_name: doctorName,
            date: formattedDate,
            time: formattedTime
          },
          branchId
        });
        if (emailRes.success) dispatched.push('Email');
      }

      alert(`Notification (${dispatched.join(' & ') || 'Logged'}) processed for ${appointment.patients.full_name}!`);
    } catch (err: any) {
      console.error('Error sending notifications:', err);
      alert('Failed to send notification: ' + (err.message || 'Unknown error'));
    }
  };



  const updateStatus = async (id: string, newStatus: string, reason?: string) => {
    if (newStatus === 'cancelled' && !reason) {
      setCancellingAppointmentId(id);
      setShowCancelModal(true);
      return;
    }

    try {
      const updateData: any = { status: newStatus };
      if (reason) updateData.cancellation_reason = reason;

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      if (profile?.id && profile?.branch_id) {
        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id,
          action: 'STATUS_CHANGE',
          tableName: 'appointments',
          recordId: id,
          details: `Changed appointment status to ${newStatus.toUpperCase()}${reason ? ` (Reason: ${reason})` : ''}`,
          newValues: updateData
        });
      }

      const appointment = appointments.find(a => a.id === id);
      if (appointment) {
        if (newStatus === 'confirmed' || newStatus === 'cancelled') {
          // AUTOMATIC DISPATCH: SMS & EMAIL (Appointment Confirmed / Cancelled)
          const branchId = (profile?.branch_id || appointment.branch_id) as string;
          if (branchId) {
            const doctorName = appointment.users?.full_name || 'Doctor';
            const formattedDate = new Date(appointment.appointment_date).toLocaleDateString();
            const formattedTime = new Date(appointment.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const triggerType = newStatus === 'confirmed' ? 'appointment_confirmed' : 'appointment_cancelled';

            if (appointment.patients?.phone) {
              await smsService.sendSms({
                recipientPhone: appointment.patients.phone,
                triggerType: triggerType as any,
                variables: {
                  patient_name: appointment.patients.full_name,
                  doctor_name: doctorName,
                  date: formattedDate,
                  time: formattedTime,
                  reason: reason || ''
                },
                branchId,
                patientId: appointment.patient_id
              });
            }

            if ((appointment.patients as any)?.email) {
              await emailService.sendEmail({
                recipientEmail: (appointment.patients as any).email,
                recipientName: appointment.patients.full_name,
                triggerType,
                placeholders: {
                  patient_name: appointment.patients.full_name,
                  doctor_name: doctorName,
                  date: formattedDate,
                  time: formattedTime,
                  reason: reason || ''
                },
                branchId
              });
            }
          }
        }
        
        // Notify doctor of status change
        if (appointment.doctor_id) {
          await notificationService.send({
            userId: appointment.doctor_id,
            title: 'Appointment Status Updated',
            message: `Appointment for ${appointment.patients.full_name} is now ${newStatus.replace('_', ' ')}.`,
            type: newStatus === 'cancelled' ? 'warning' : 'info',
            link: '/appointments',
            branchId: profile?.branch_id || appointment.branch_id
          });
        }
      }

      loadAppointments();
      setShowCancelModal(false);
      setCancellationReason('');
      setCancellingAppointmentId(null);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  };

  const handleCancelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cancellingAppointmentId && cancellationReason) {
      updateStatus(cancellingAppointmentId, 'cancelled', cancellationReason);
    }
  };

  const openEditModal = (appointment: Appointment) => {
    const { dateStr, timeStr } = getLocalDateTimeComponents(appointment.appointment_date);

    setFormData({
      patient_id: appointment.patient_id,
      doctor_id: (appointment as any).doctor_id || '',
      appointment_date: dateStr,
      appointment_time: timeStr,
      duration_minutes: appointment.duration_minutes,
      appointment_type: appointment.appointment_type,
      notes: appointment.notes || '',
      status: appointment.status,
      cancellation_reason: appointment.cancellation_reason || ''
    });
    setEditingId(appointment.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-700';
      case 'pending_confirmation': return 'bg-yellow-100 text-yellow-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'treated': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    // Detect midnight UTC — means no real time was stored (old migrated data used date-only)
    const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
    if (isDateOnly) return '—';
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getFilterSummary = () => {
    const parts: string[] = [];

    if (datePreset === 'today') parts.push('Date: Today');
    else if (datePreset === 'tomorrow') parts.push('Date: Tomorrow');
    else if (datePreset === 'yesterday') parts.push('Date: Yesterday');
    else if (dateRange.startDate && dateRange.endDate) {
      parts.push(`Date: ${dateRange.startDate} to ${dateRange.endDate}`);
    } else if (dateRange.startDate) {
      parts.push(`From ${dateRange.startDate}`);
    } else if (dateRange.endDate) {
      parts.push(`Until ${dateRange.endDate}`);
    } else {
      parts.push('Date: All');
    }

    if (statusFilter !== 'all') {
      parts.push(`Status: ${statusFilter.replace('_', ' ').toUpperCase()}`);
    }

    if (typeFilter !== 'all') {
      parts.push(`Type: ${typeFilter.replace('_', ' ').toUpperCase()}`);
    }

    if (searchQuery.trim()) {
      parts.push(`Search: "${searchQuery.trim()}"`);
    }

    return parts.join(' • ');
  };

  const handleExportPDF = async () => {
    try {
      setIsExporting(true);
      const exportData: AppointmentExportItem[] = filteredAppointments.map(a => ({
        date: new Date(a.appointment_date).toLocaleDateString(),
        time: formatTime(a.appointment_date),
        fileNo: a.patients?.file_number ? a.patients.file_number.split('-')[0] : 'NO FILE',
        patientName: a.patients?.full_name || 'Unknown',
        contact: a.patients?.phone || 'N/A',
        doctor: a.users?.full_name ? `Dr. ${a.users.full_name}` : 'Unassigned',
        type: a.appointment_type.replace('_', ' ').toUpperCase(),
        remarks: a.notes || '',
        status: a.status.replace('_', ' ').toUpperCase()
      }));

      await exportAppointmentsPDF(
        exportData,
        'Appointments_List',
        branchInfo || undefined,
        getFilterSummary()
      );
    } catch (err) {
      console.error('Error generating PDF:', err);
      alert('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = () => {
    try {
      setIsExporting(true);
      const exportData: AppointmentExportItem[] = filteredAppointments.map(a => ({
        date: new Date(a.appointment_date).toLocaleDateString(),
        time: formatTime(a.appointment_date),
        fileNo: a.patients?.file_number ? a.patients.file_number.split('-')[0] : 'NO FILE',
        patientName: a.patients?.full_name || 'Unknown',
        contact: a.patients?.phone || 'N/A',
        doctor: a.users?.full_name ? `Dr. ${a.users.full_name}` : 'Unassigned',
        type: a.appointment_type.replace('_', ' ').toUpperCase(),
        remarks: a.notes || '',
        status: a.status.replace('_', ' ').toUpperCase()
      }));

      exportAppointmentsExcel(
        exportData,
        'Appointments_List',
        branchInfo || undefined,
        getFilterSummary()
      );
    } catch (err) {
      console.error('Error generating Excel:', err);
      alert('Failed to export Excel');
    } finally {
      setIsExporting(false);
    }
  };

  // Server already handles status, type, and search filters — just use the fetched data directly
  const filteredAppointments = appointments;

  // Server-side total always drives pagination
  const effectiveTotal = totalCount;
  // itemsPerPage === 0 means "All" — no pagination needed
  const totalPages = itemsPerPage > 0 ? Math.ceil(effectiveTotal / itemsPerPage) : 1;
  // No client-side slice needed — server already returns the correct page
  const paginatedAppointments = filteredAppointments;

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);
      
      if (currentPage <= 2) {
        end = 3;
      }
      if (currentPage >= totalPages - 1) {
        start = totalPages - 2;
      }
      
      if (start > 2) {
        pages.push('...');
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages - 1) {
        pages.push('...');
      }
      
      pages.push(totalPages);
    }
    return pages;
  };

  if (loading && appointments.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="w-7 h-7 text-green-600" />
            <span>Appointment Management</span>
            {isRefreshing && (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 px-2.5 py-0.5 rounded-full border border-green-200 dark:border-green-800 animate-pulse">
                <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600" />
                Updating...
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">Schedule and manage patient appointments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={handleExportPDF}
            disabled={isExporting || filteredAppointments.length === 0}
            className="flex items-center justify-center space-x-1.5 bg-red-600 hover:bg-red-700 text-white px-3.5 py-2.5 rounded-xl transition shadow-xs font-bold text-xs shrink-0 disabled:opacity-50"
            title="Export Branded PDF"
          >
            <FileText className="w-4 h-4" />
            <span>Export PDF</span>
          </button>
          <button
            onClick={handleExportExcel}
            disabled={isExporting || filteredAppointments.length === 0}
            className="flex items-center justify-center space-x-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2.5 rounded-xl transition shadow-xs font-bold text-xs shrink-0 disabled:opacity-50"
            title="Export Branded Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
          {hasPermission('appointments', 'add') && (
            <button
              onClick={openCreateModal}
              className="flex items-center justify-center space-x-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2.5 rounded-xl hover:from-green-700 hover:to-emerald-700 transition shadow-sm font-bold text-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New Appointment</span>
            </button>
          )}
        </div>
      </div>

      {/* Streamlined Filter & Search Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        {/* Search Bar & Reset */}
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search appointments by patient name, file number, doctor, remarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-12 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-gray-50/50 dark:bg-gray-900/40 text-gray-900 dark:text-white text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            )}
          </div>

          {(searchQuery || statusFilter !== 'all' || typeFilter !== 'all' || dateRange.startDate || dateRange.endDate || datePreset !== 'custom') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setTypeFilter('all');
                setDateRange({ startDate: '', endDate: '' });
                setDatePreset('custom');
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:underline px-2 py-1 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
            </button>
          )}
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">Period</label>
            <select
              value={datePreset}
              onChange={(e) => handleDatePresetChange(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
            >
              <option value="custom">All / Custom</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="yesterday">Yesterday</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">From Date</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => {
                setDatePreset('custom');
                setDateRange(prev => ({ ...prev, startDate: e.target.value }));
              }}
              className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
            />
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">To Date</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => {
                setDatePreset('custom');
                setDateRange(prev => ({ ...prev, endDate: e.target.value }));
              }}
              className="w-full px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
            />
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="pending_confirmation">Pending Confirmation</option>
              <option value="confirmed">Confirmed</option>
              <option value="treated">Treated</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
            >
              <option value="all">All Types</option>
              <option value="consultation">New Consultation</option>
              <option value="initial_new_old">Initial - New Old Patient</option>
              <option value="follow_up">Review</option>
              <option value="emergency">Emergency</option>
              <option value="procedure">Procedure</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {selectedAppointmentIds.length > 0 && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-800 p-3 px-6 flex items-center justify-between animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-rose-800 dark:text-rose-300">
                {selectedAppointmentIds.length} appointment(s) selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedAppointmentIds([])}
                className="px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 transition"
              >
                Clear Selection
              </button>
              {hasPermission('appointments', 'delete') && (
                <button
                  type="button"
                  onClick={handleBulkDeleteAppointments}
                  disabled={loading}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedAppointmentIds.length})
                </button>
              )}
            </div>
          </div>
        )}

        {appointments.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments scheduled</h3>
            <p className="text-gray-600">There are no appointments for this period.</p>
          </div>
        ) : (
          <>
            {/* 📱 Mobile Appointment Cards (< md) */}
            <div className="md:hidden space-y-3 p-4">
              {paginatedAppointments.map((a) => (
                <div key={a.id} className={`bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3 ${selectedAppointmentIds.includes(a.id) ? 'ring-2 ring-green-500 bg-green-50/20' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedAppointmentIds.includes(a.id)}
                        onChange={() => handleToggleSelect(a.id)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer mt-1"
                      />
                      <div>
                        <h3 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase flex items-center gap-1.5 flex-wrap">
                          <span>{a.patients?.full_name}</span>
                          {a.patients?.file_number ? (
                            <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800">
                              File: {a.patients.file_number.split('-')[0]}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-sans font-normal text-gray-400 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                              NO FILE
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-500 font-mono">
                          {a.patients?.phone ? `Tel: ${a.patients.phone}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className={`px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full border ${getAppointmentTypeBadge(a.appointment_type)}`}>
                        {getAppointmentTypeLabel(a.appointment_type)}
                      </span>
                      <span className={`px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-full ${
                        a.status === 'confirmed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                        a.status === 'treated' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                        a.status === 'cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' :
                        'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>
                        {a.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold">Date & Time</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {new Date(a.appointment_date).toLocaleDateString()} @ {new Date(a.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-bold">Doctor</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {a.users?.full_name || 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  {a.notes && (
                    <div className="text-xs bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg text-gray-600 dark:text-gray-400">
                      <span className="font-bold text-[10px] uppercase block text-gray-400">Notes</span>
                      {a.notes}
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap justify-end gap-1.5">
                    <button
                      onClick={() => sendAppointmentSms(a)}
                      className="px-2.5 py-1 bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-bold hover:bg-purple-100 transition flex items-center gap-1"
                      title="Send SMS reminder to patient"
                    >
                      <Send className="w-3 h-3" /> SMS
                    </button>
                    {a.status === 'pending_confirmation' && hasPermission('appointments', 'edit') && (
                      <button
                        onClick={() => updateStatus(a.id, 'confirmed')}
                        className="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition"
                      >
                        Confirm
                      </button>
                    )}
                    {a.status !== 'treated' && a.status !== 'cancelled' && hasPermission('appointments', 'edit') && (
                      <button
                        onClick={() => updateStatus(a.id, 'treated')}
                        className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                      >
                        Treated
                      </button>
                    )}
                    {a.status !== 'cancelled' && (hasPermission('appointments', 'delete') || hasPermission('appointments', 'edit')) && (
                      <button
                        onClick={() => { setCancellingAppointmentId(a.id); setShowCancelModal(true); }}
                        className="px-2.5 py-1 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-100 transition"
                      >
                        Cancel
                      </button>
                    )}
                    {hasPermission('appointments', 'delete') && (
                      <button
                        onClick={() => handleDeleteAppointment(a.id, a.patients?.full_name)}
                        className="px-2.5 py-1 bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-bold hover:bg-rose-100 transition flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 💻 Desktop Table View (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-4 text-center w-10">
                    <input
                      type="checkbox"
                      checked={paginatedAppointments.length > 0 && paginatedAppointments.every(a => selectedAppointmentIds.includes(a.id))}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer"
                      title="Select all on this page"
                    />
                  </th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase">Time</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase">File No.</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase">Patient Name</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase">Contact</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase">Remarks / Notes</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {paginatedAppointments.map((a) => (
                  <tr key={a.id} className={`hover:bg-gray-100 transition-colors ${selectedAppointmentIds.includes(a.id) ? 'bg-green-50/40' : ''}`}>
                    <td className="px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedAppointmentIds.includes(a.id)}
                        onChange={() => handleToggleSelect(a.id)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                      {editingCell?.id === a.id && editingCell?.type === 'date' ? (
                        <input
                          type="date"
                          value={tempValue}
                          onChange={e => setTempValue(e.target.value)}
                          onBlur={() => saveInlineDate(a.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveInlineDate(a.id);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="px-2 py-1 border border-green-500 rounded text-sm w-36 outline-none focus:ring-2 focus:ring-green-500 bg-white"
                          autoFocus
                        />
                      ) : (
                        <div
                          onClick={() => {
                            const { dateStr } = getLocalDateTimeComponents(a.appointment_date);
                            setEditingCell({ id: a.id, type: 'date' });
                            setTempValue(dateStr);
                          }}
                          className="flex items-center cursor-pointer hover:bg-gray-50 hover:text-green-700 p-1 -m-1 rounded transition group"
                          title="Click to edit date inline"
                        >
                          <CalendarIcon className="w-4 h-4 text-green-600 mr-2 opacity-60 group-hover:opacity-100 transition-opacity" />
                          <span>{new Date(a.appointment_date).toLocaleDateString()}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                      {editingCell?.id === a.id && editingCell?.type === 'time' ? (
                        <input
                          type="time"
                          value={tempValue}
                          onChange={e => setTempValue(e.target.value)}
                          onBlur={() => saveInlineTime(a.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveInlineTime(a.id);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="px-2 py-1 border border-green-500 rounded text-sm w-28 outline-none focus:ring-2 focus:ring-green-500 bg-white"
                          autoFocus
                        />
                      ) : (
                        <div
                          onClick={() => {
                            const { timeStr } = getLocalDateTimeComponents(a.appointment_date);
                            setEditingCell({ id: a.id, type: 'time' });
                            setTempValue(timeStr);
                          }}
                          className="flex items-center cursor-pointer hover:bg-gray-50 hover:text-green-700 p-1 -m-1 rounded transition group"
                          title="Click to edit time inline"
                        >
                          <Clock className="w-4 h-4 text-green-600 mr-2 opacity-60 group-hover:opacity-100 transition-opacity" />
                          <span>{formatTime(a.appointment_date)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {a.patients?.file_number ? (
                        <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-800">
                          {a.patients.file_number.split('-')[0]}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-sans italic font-normal">NO FILE</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {a.patients.full_name}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {a.patients.phone || 'N/A'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <select
                        value={a.appointment_type}
                        onChange={(e) => updateAppointmentType(a.id, e.target.value)}
                        className={`px-2.5 py-1 text-xs rounded-full font-bold border cursor-pointer outline-none focus:ring-2 focus:ring-green-500 transition-all ${getAppointmentTypeBadge(a.appointment_type)}`}
                        title="Click to change appointment type inline"
                      >
                        <option value="consultation" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">New Consultation</option>
                        <option value="initial_new_old" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">Initial - New Old Patient</option>
                        <option value="follow_up" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">Review</option>
                        <option value="emergency" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">Emergency</option>
                        <option value="procedure" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">Procedure</option>
                      </select>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500 max-w-xs truncate" title={a.notes}>
                      {a.notes || 'N/A'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <select
                        value={a.status}
                        onChange={(e) => handleStatusChange(a.id, e.target.value)}
                        className={`px-2.5 py-1 text-xs rounded-full font-medium border-0 cursor-pointer outline-none focus:ring-2 focus:ring-green-500 bg-opacity-100 ${getStatusColor(a.status)}`}
                        title="Click to change status inline"
                      >
                        <option value="pending_confirmation" className="bg-white text-gray-700 font-normal">Pending Confirmation</option>
                        <option value="confirmed" className="bg-white text-gray-700 font-normal">Confirmed</option>
                        <option value="treated" className="bg-white text-gray-700 font-normal">Treated</option>
                        <option value="cancelled" className="bg-white text-gray-700 font-normal">Cancelled</option>
                        <option value="completed" className="bg-white text-gray-700 font-normal">Completed</option>
                      </select>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => sendAppointmentSms(a)}
                          className="p-1.5 text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/40 rounded-lg border border-purple-100 dark:border-purple-800 transition"
                          title={`Send SMS notification/reminder to ${a.patients?.full_name || 'Patient'}`}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        {a.status === 'pending_confirmation' && (
                          <>
                            {hasPermission('appointments', 'edit') && (
                              <button onClick={() => updateStatus(a.id, 'confirmed')} className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition" title="Confirm Appointment"><Check className="w-4 h-4" /></button>
                            )}
                            {(hasPermission('appointments', 'delete') || hasPermission('appointments', 'edit')) && (
                              <button onClick={() => { setCancellingAppointmentId(a.id); setShowCancelModal(true); }} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition" title="Cancel Appointment"><Plus className="w-4 h-4 rotate-45" /></button>
                            )}
                          </>
                        )}
                        <button 
                          onClick={() => {
                            setSelectedPatientForFiles({
                              id: a.patient_id,
                              name: a.patients?.full_name || 'Patient',
                              number: a.patients?.patient_number
                            });
                            setShowFilesModal(true);
                          }} 
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-100 transition"
                          title="Patient Files (View, Download, Upload)"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                        {hasPermission('appointments', 'edit') && (
                          <button onClick={() => openEditModal(a)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-100" title="Edit Appointment"><Edit className="w-4 h-4" /></button>
                        )}
                        {hasPermission('appointments', 'delete') && (
                          <button 
                            onClick={() => handleDeleteAppointment(a.id, a.patients?.full_name)} 
                            className="p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 rounded-lg border border-rose-100 dark:border-rose-800 transition"
                            title="Delete appointment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Left: record info + per-page selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs text-gray-500">
                {itemsPerPage === 0
                  ? <><span className="font-semibold text-gray-900">{effectiveTotal}</span> appointments (all)</>  
                  : <>Showing <span className="font-semibold text-gray-900">{effectiveTotal === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span>–<span className="font-semibold text-gray-900">{Math.min(currentPage * itemsPerPage, effectiveTotal)}</span> of <span className="font-semibold text-gray-900">{effectiveTotal}</span></>  
                }
              </p>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Per page:</label>
                <select
                  value={itemsPerPage}
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="px-2 py-1 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 font-semibold outline-none cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>All</option>
                </select>
              </div>
            </div>
            {/* Right: page navigation (hidden when showing all) */}
            {itemsPerPage > 0 && totalPages > 1 && (
              <div className="flex items-center space-x-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-1.5 border border-gray-300 rounded-lg disabled:opacity-30 hover:bg-white transition bg-white text-gray-700 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {getPageNumbers().map((page, i) => (
                  <button
                    key={i}
                    disabled={page === '...'}
                    onClick={() => typeof page === 'number' && setCurrentPage(page)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                      currentPage === page
                        ? 'bg-green-600 text-white shadow-sm'
                        : page === '...'
                        ? 'text-gray-400 cursor-default'
                        : 'border border-gray-300 hover:bg-white text-gray-600 bg-white'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-1.5 border border-gray-300 rounded-lg disabled:opacity-30 hover:bg-white transition bg-white text-gray-700 disabled:pointer-events-none"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          </>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{isEditing ? 'Edit Appointment' : 'New Appointment'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column 1 */}
                <div className="space-y-4">
                  <SearchDropdown
                    label="Patient"
                    placeholder="Search patient..."
                    items={patients}
                    selectedId={formData.patient_id}
                    displayFn={p => p?.full_name ? `${p.full_name} (${p.patient_number || 'N/A'})` : (p?.patient_number || p?.id || 'Unknown Patient')}
                    onSelect={id => setFormData({ ...formData, patient_id: id })}
                    onAddNew={() => setShowPatientModal(true)}
                  />
                  <SearchDropdown
                    label="Doctor"
                    placeholder="Search doctor..."
                    items={doctors}
                    selectedId={formData.doctor_id}
                    onSelect={id => setFormData({ ...formData, doctor_id: id })}
                  />
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Appointment Type</label>
                    <select 
                      value={formData.appointment_type} 
                      onChange={e => setFormData({ ...formData, appointment_type: e.target.value })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white"
                    >
                      <option value="consultation">New Consultation</option>
                      <option value="initial_new_old">Initial - New Old Patient</option>
                      <option value="follow_up">Review</option>
                      <option value="emergency">Emergency</option>
                      <option value="procedure">Procedure</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Duration (minutes)</label>
                    <input 
                      type="number" 
                      value={formData.duration_minutes} 
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm bg-gray-50 cursor-not-allowed text-gray-500" 
                      readOnly 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                    <select 
                      value={formData.status} 
                      onChange={e => setFormData({ ...formData, status: e.target.value })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white"
                    >
                      <option value="pending_confirmation">Pending Confirmation</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="treated">Treated</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                {/* Column 2 */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date</label>
                    <input 
                      type="date" 
                      value={formData.appointment_date} 
                      onChange={e => setFormData({ ...formData, appointment_date: e.target.value })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Time</label>
                    <input 
                      type="time" 
                      value={formData.appointment_time} 
                      onChange={e => setFormData({ ...formData, appointment_time: e.target.value })} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm" 
                      required 
                    />
                  </div>

                  {/* Slot picker (helper) */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Available Slots (Quick Select)</label>
                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border border-gray-200 p-2 rounded-lg bg-gray-50">
                      {availableSlots.length === 0 ? (
                        <p className="col-span-3 text-center text-xs text-gray-400 py-2 italic">
                          {slotMessage || (formData.doctor_id && formData.appointment_date
                            ? 'No available slots for this doctor on this date.'
                            : 'Select doctor & date to view slots.')}
                        </p>
                      ) : (
                        availableSlots.map(slot => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => !slot.is_booked && handleSelectSlot(slot)}
                            className={`p-1.5 text-[10px] font-semibold rounded border transition ${
                              slot.is_booked 
                                ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed' 
                                : selectedSlotId === slot.id 
                                ? 'bg-green-600 text-white border-green-600 shadow-sm font-bold ring-2 ring-green-400' 
                                : 'bg-white hover:border-green-500 text-gray-700 border-gray-200 hover:shadow-xs'
                            }`}
                            disabled={slot.is_booked}
                            title={slot.is_booked ? 'Already booked' : 'Click to select this slot'}
                          >
                            {formatTime(slot.start_time)}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row spanned fields */}
                <div className="md:col-span-2 space-y-4">
                  <RemarksQuickInput
                    value={formData.notes}
                    onChange={val => setFormData({ ...formData, notes: val })}
                    placeholder="Add any remarks or notes..."
                  />

                  {formData.status === 'cancelled' && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 text-red-600">Cancellation Reason</label>
                      <textarea
                        value={formData.cancellation_reason}
                        onChange={e => setFormData({ ...formData, cancellation_reason: e.target.value })}
                        className="w-full px-3 py-2 border border-red-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500 text-sm bg-red-50"
                        rows={2}
                        placeholder="Enter cancellation reason..."
                        required
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 mt-6 border-t pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 rounded-lg text-sm transition">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPatientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-500">
              <h2 className="text-lg font-black text-white tracking-tight">Quick Add Patient</h2>
              <p className="text-green-100 text-xs mt-0.5">Fill in the details to register a new patient</p>
            </div>

            <form onSubmit={handleCreatePatient} className="p-6 space-y-4">
              {/* Name — required */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={newPatient.full_name}
                  onChange={e => setNewPatient({ ...newPatient, full_name: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  required
                />
              </div>

              {/* Phone + Gender row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Phone <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    placeholder="e.g. +263771234567"
                    value={newPatient.phone}
                    onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Gender <span className="text-red-500">*</span></label>
                  <select
                    value={newPatient.gender}
                    onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white text-gray-900 font-medium"
                    required
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Date of Birth + File Number row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={newPatient.date_of_birth}
                    onChange={e => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">File Number</label>
                  <input
                    type="text"
                    placeholder="e.g. F-00123"
                    value={newPatient.file_number}
                    onChange={e => setNewPatient({ ...newPatient, file_number: e.target.value })}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Email</label>
                <input
                  type="email"
                  placeholder="patient@email.com"
                  value={newPatient.email}
                  onChange={e => setNewPatient({ ...newPatient, email: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Address</label>
                <input
                  type="text"
                  placeholder="e.g. 123 Main St, Harare"
                  value={newPatient.address}
                  onChange={e => setNewPatient({ ...newPatient, address: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPatientModal(false)}
                  className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 rounded-xl text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Add Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold mb-4">Cancel Appointment</h2>
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <textarea placeholder="Reason..." value={cancellationReason} onChange={e => setCancellationReason(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCancelModal(false)} className="flex-1 py-2 border rounded-lg">Back</button>
                <button type="submit" className="flex-1 py-2 bg-red-600 text-white rounded-lg">Confirm</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 text-center">
            <Check className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <p className="mb-6">{successMessage}</p>
            <button onClick={() => setShowSuccessModal(false)} className="w-full py-3 bg-green-600 text-white rounded-lg">OK</button>
          </div>
        </div>
      )}

      {showFilesModal && selectedPatientForFiles && (
        <AppointmentPatientFilesModal
          isOpen={showFilesModal}
          onClose={() => {
            setShowFilesModal(false);
            setSelectedPatientForFiles(null);
          }}
          patientId={selectedPatientForFiles.id}
          patientName={selectedPatientForFiles.name}
          patientNumber={selectedPatientForFiles.number}
        />
      )}
    </div>
  );
}
