import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Calendar as CalendarIcon, Clock, User, Edit, Check, Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';
import { emailService } from '../utils/emailService';
import { SearchDropdown } from '../components/SearchDropdown';
import { notificationService } from '../utils/notificationService';
import { smsService } from '../utils/smsService';

interface Appointment {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  appointment_type: string;
  status: string;
  notes: string;
  cancellation_reason?: string;
  doctor_id: string; 
  patient_id: string;
  branch_id?: string;
  patients: {
    full_name: string;
    phone: string;
  };
  users: {
    full_name: string;
  };
}

export function Appointments() {
  const { profile } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [newPatient, setNewPatient] = useState({
    full_name: '',
    phone: '',
    gender: 'male',
    date_of_birth: '',
    email: ''
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [datePreset, setDatePreset] = useState('custom');
  const [editingCell, setEditingCell] = useState<{ id: string; type: 'date' | 'time' } | null>(null);
  const [tempValue, setTempValue] = useState('');

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
  }, [searchQuery, dateRange, statusFilter, typeFilter]);

  useEffect(() => {
    loadAppointments();
    loadPatients();
    loadDoctors();
  }, [profile, dateRange, statusFilter, typeFilter]);

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

      const { data, error } = await supabase
        .from('appointment_slots')
        .select('*')
        .eq('doctor_id', doctorId)
        .eq('slot_date', date)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setAvailableSlots(data || []);
    } catch (error) {
      console.error('Error loading available slots:', error);
    }
  };

  const loadAppointments = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      setLoading(true);
      let allAppointments: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        let query = supabase
          .from('appointments')
          .select(`
            *,
            doctor_id,
            patients (full_name, phone),
            users:doctor_id (full_name)
          `)
          .order('appointment_date', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile.role !== 'super_admin') {
          query = query.eq('branch_id', profile.branch_id);
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

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allAppointments = allAppointments.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setAppointments(allAppointments);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    if (!profile) return;
    try {
      let allPatients: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        let query = supabase
          .from('patients')
          .select('id, full_name, patient_number, email')
          .eq('status', 'active')
          .order('full_name')
          .range(from, from + pageSize - 1);

        if (profile.role !== 'super_admin' && profile.branch_id) {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allPatients = allPatients.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setPatients(allPatients);
    } catch (err) {
      console.error('Error loading all patients:', err);
    }
  };

  const generatePatientNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `P${timestamp}${random}`;
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const patientNumber = generatePatientNumber();
      const email = newPatient.email || `${newPatient.full_name.toLowerCase().replace(/\s+/g, '.')}@spiritmed.placeholder`;

      const { data, error } = await supabase
        .from('patients')
        .insert([{
          ...newPatient,
          email,
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
            email: ''
          });
          alert('Patient created successfully!');
        }
    } catch (error) {
      console.error('Error creating patient:', error);
      alert('Failed to create patient');
    } finally {
      setLoading(false);
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
      setLoading(true);
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
          sendExternalNotification(formData.status as any, { ...oldAppointment, status: formData.status, cancellation_reason: formData.cancellation_reason });
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

          if (patient?.email) {
            const { data: template } = await supabase
              .from('email_templates')
              .select('id')
              .eq('name', 'Appointment Confirmation')
              .maybeSingle();

            await emailService.sendEmail({
              recipientEmail: patient.email,
              recipientName: patient.full_name,
              subject: 'Appointment scheduled',
              body: `Your appointment is confirmed for ${new Date(finalDateTime).toLocaleString()}`,
              templateId: template?.id,
              placeholders: {
                patient_name: patient.full_name,
                date: new Date(finalDateTime).toLocaleDateString(),
                time: new Date(finalDateTime).toLocaleTimeString()
              },
              branchId: profile.branch_id,
              senderId: profile.id,
              referenceId: appointmentData.id,
              referenceType: 'appointment'
            });
          }

          // SEND SMS: Appointment Booked
          if (patient?.phone && profile?.branch_id) {
            await smsService.sendSms({
              recipientPhone: patient.phone,
              triggerType: 'appointment_booked',
              variables: {
                patient_name: patient.full_name,
                doctor_name: doctors.find(d => d.id === formData.doctor_id)?.full_name || 'Doctor',
                date: new Date(finalDateTime).toLocaleDateString(),
                time: new Date(finalDateTime).toLocaleTimeString()
              },
              branchId: profile.branch_id,
              patientId: patient.id
            });
          }
        }

        setSuccessMessage('Appointment scheduled successfully!');
        setShowSuccessModal(true);
      }

      setShowModal(false);
      resetForm();
      loadAppointments();
    } catch (error: any) {
      console.error('Error handling appointment submission:', error);
      alert(error.message || 'Failed to handle appointment');
    } finally {
      setLoading(false);
    }
  };

  const sendExternalNotification = (type: 'confirmed' | 'cancelled', appointment: Appointment) => {
    const message = type === 'confirmed'
      ? `Appointment confirmed for ${appointment.patients.full_name} on ${new Date(appointment.appointment_date).toLocaleString()}`
      : `Appointment cancelled for ${appointment.patients.full_name}. Reason: ${appointment.cancellation_reason || 'N/A'}`;

    console.log(`[EXTERNAL_NOTIF] Triggered for ${appointment.patients.phone}: ${message}`);
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
          sendExternalNotification(newStatus as any, { ...appointment, cancellation_reason: reason });
          
          // SEND SMS: Status Change
          if (newStatus === 'confirmed' && appointment.patients?.phone && (profile?.branch_id || appointment.branch_id)) {
            await smsService.sendSms({
              recipientPhone: appointment.patients.phone,
              triggerType: 'appointment_confirmed',
              variables: {
                patient_name: appointment.patients.full_name,
                doctor_name: appointment.users?.full_name || 'Doctor',
                date: new Date(appointment.appointment_date).toLocaleDateString(),
                time: new Date(appointment.appointment_date).toLocaleTimeString()
              },
              branchId: (profile?.branch_id || appointment.branch_id) as string,
              patientId: appointment.patient_id
            });
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
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const filteredAppointments = appointments.filter(a => {
    const s = searchQuery.toLowerCase();
    return a.patients?.full_name?.toLowerCase().includes(s) || 
           a.users?.full_name?.toLowerCase().includes(s) ||
           a.notes?.toLowerCase().includes(s);
  });

  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
  const paginatedAppointments = filteredAppointments.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

  if (loading) {
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
            Appointment Management
          </h1>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">Schedule and manage patient appointments</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center space-x-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2.5 rounded-xl hover:from-green-700 hover:to-emerald-700 transition shadow-sm font-bold text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Appointment</span>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by patient name or doctor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">Period</label>
            <select
              value={datePreset}
              onChange={(e) => handleDatePresetChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
            >
              <option value="custom">Custom Range</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="yesterday">Yesterday</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">From Date</label>
            <div className="relative">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => {
                  setDatePreset('custom');
                  setDateRange(prev => ({ ...prev, startDate: e.target.value }));
                }}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
              />
              <CalendarIcon className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">To Date</label>
            <div className="relative">
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => {
                  setDatePreset('custom');
                  setDateRange(prev => ({ ...prev, endDate: e.target.value }));
                }}
                className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
              />
              <CalendarIcon className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-extrabold uppercase text-gray-400 dark:text-gray-400 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="pending_confirmation">Pending</option>
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
            >
              <option value="all">All Types</option>
              <option value="consultation">Consultation</option>
              <option value="follow_up">Follow-up</option>
              <option value="emergency">Emergency</option>
              <option value="procedure">Procedure</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                <div key={a.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase">{a.patients?.full_name}</h3>
                      <p className="text-xs text-gray-500 font-mono">
                        {a.patients?.phone ? `Tel: ${a.patients.phone}` : ''}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 text-[10px] font-extrabold uppercase rounded-full ${
                      a.status === 'confirmed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
                      a.status === 'treated' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' :
                      a.status === 'cancelled' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' :
                      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>
                      {a.status.replace('_', ' ')}
                    </span>
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

                  {a.remarks && (
                    <div className="text-xs bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg text-gray-600 dark:text-gray-400">
                      <span className="font-bold text-[10px] uppercase block text-gray-400">Remarks</span>
                      {a.remarks}
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap justify-end gap-1.5">
                    {a.status === 'pending_confirmation' && (
                      <button
                        onClick={() => updateStatus(a.id, 'confirmed')}
                        className="px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition"
                      >
                        Confirm
                      </button>
                    )}
                    {a.status !== 'treated' && a.status !== 'cancelled' && (
                      <button
                        onClick={() => updateStatus(a.id, 'treated')}
                        className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                      >
                        Treated
                      </button>
                    )}
                    {a.status !== 'cancelled' && (
                      <button
                        onClick={() => { setCancellingAppointmentId(a.id); setShowCancelModal(true); }}
                        className="px-2.5 py-1 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-100 transition"
                      >
                        Cancel
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
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Time</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Patient Name</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Contact</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Doctor</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Remarks / Notes</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {paginatedAppointments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-100 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {a.patients.full_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {a.patients.phone || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-700">
                        <User className="w-4 h-4 text-gray-400 mr-2" />
                        {a.users.full_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={a.appointment_type}
                        onChange={(e) => updateAppointmentType(a.id, e.target.value)}
                        className="px-2 py-1 text-sm bg-transparent border border-transparent hover:border-gray-300 rounded cursor-pointer outline-none focus:ring-2 focus:ring-green-500 text-gray-700 capitalize font-medium"
                        title="Click to change appointment type inline"
                      >
                        <option value="consultation">Consultation</option>
                        <option value="follow_up">Follow-up</option>
                        <option value="emergency">Emergency</option>
                        <option value="procedure">Procedure</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={a.notes}>
                      {a.notes || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={a.status}
                        onChange={(e) => handleStatusChange(a.id, e.target.value)}
                        className={`px-2.5 py-1 text-xs rounded-full font-medium border-0 cursor-pointer outline-none focus:ring-2 focus:ring-green-500 bg-opacity-100 ${getStatusColor(a.status)}`}
                        title="Click to change status inline"
                      >
                        <option value="pending_confirmation" className="bg-white text-gray-700 font-normal">Pending</option>
                        <option value="confirmed" className="bg-white text-gray-700 font-normal">Confirmed</option>
                        <option value="treated" className="bg-white text-gray-700 font-normal">Treated</option>
                        <option value="cancelled" className="bg-white text-gray-700 font-normal">Cancelled</option>
                        <option value="completed" className="bg-white text-gray-700 font-normal">Completed</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {a.status === 'pending_confirmation' && (
                          <>
                            <button onClick={() => updateStatus(a.id, 'confirmed')} className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition"><Check className="w-4 h-4" /></button>
                            <button onClick={() => { setCancellingAppointmentId(a.id); setShowCancelModal(true); }} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"><Plus className="w-4 h-4 rotate-45" /></button>
                          </>
                        )}
                        <button onClick={() => openEditModal(a)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-100"><Edit className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-gray-500">
                Showing <span className="font-semibold text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                <span className="font-semibold text-gray-900">{Math.min(currentPage * itemsPerPage, filteredAppointments.length)}</span> of{' '}
                <span className="font-semibold text-gray-900">{filteredAppointments.length}</span> appointments
              </p>
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
            </div>
          )}
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
                      <option value="consultation">Consultation</option>
                      <option value="follow_up">Follow-up</option>
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
                          {formData.doctor_id && formData.appointment_date
                            ? 'No available slots for this doctor on this date.'
                            : 'Select doctor & date to view slots.'}
                        </p>
                      ) : (
                        availableSlots.map(slot => (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => !slot.is_booked && handleSelectSlot(slot)}
                            className={`p-1.5 text-[10px] font-semibold rounded border transition ${
                              slot.is_booked 
                                ? 'bg-red-50 text-red-300 border-red-100 cursor-not-allowed' 
                                : selectedSlotId === slot.id 
                                ? 'bg-green-600 text-white border-green-600 shadow-sm' 
                                : 'bg-white hover:border-green-500 text-gray-700 border-gray-200'
                            }`}
                            disabled={slot.is_booked}
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
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Remarks / Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm"
                      rows={3}
                      placeholder="Add any remarks or notes..."
                    />
                  </div>

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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold mb-4">Quick Add Patient</h2>
            <form onSubmit={handleCreatePatient} className="space-y-4">
              <input type="text" placeholder="Full Name" value={newPatient.full_name} onChange={e => setNewPatient({ ...newPatient, full_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required />
              <input type="tel" placeholder="Phone" value={newPatient.phone} onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg" required />
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowPatientModal(false)} className="flex-1 py-2 border rounded-lg">Cancel</button>
                <button type="submit" className="flex-1 py-2 bg-green-600 text-white rounded-lg">Add</button>
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
    </div>
  );
}
