import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Calendar as CalendarIcon, Clock, User, Edit, Check, Filter, Search } from 'lucide-react';

interface Appointment {
  id: string;
  appointment_date: string;
  duration_minutes: number;
  appointment_type: string;
  status: string;
  notes: string;
  cancellation_reason?: string;
  doctor_id: string; // Add doctor_id for editing
  patient_id: string;
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
    appointment_date: new Date().toISOString().split('T')[0], // Use just date part for slot selection
    duration_minutes: 30,
    appointment_type: 'consultation',
    notes: '',
    status: 'pending_confirmation',
    cancellation_reason: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [slotLoading, setSlotLoading] = useState(false);
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

  const loadAvailableSlots = async (doctorId: string, date: string) => {
    try {
      setSlotLoading(true);
      setSelectedSlotId(''); // Reset selection

      const { data, error } = await supabase
        .from('appointment_slots')
        .select('*')
        .eq('doctor_id', doctorId)
        .eq('is_booked', false)
        .gte('start_time', `${date}T00:00:00`)
        .lte('start_time', `${date}T23:59:59`)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setAvailableSlots(data || []);
    } catch (error) {
      console.error('Error loading available slots:', error);
    } finally {
      setSlotLoading(false);
    }
  };

  const loadAppointments = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      setLoading(true);
      let query = supabase
        .from('appointments')
        .select(`
          *,
          doctor_id,
          patients (full_name, phone),
          users:doctor_id (full_name)
        `)
        .order('appointment_date', { ascending: true });

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
      setAppointments(data || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    if (!profile?.branch_id) return;
    const { data } = await supabase
      .from('patients')
      .select('id, full_name, patient_number')
      .eq('branch_id', profile.branch_id)
      .eq('status', 'active')
      .order('full_name');
    setPatients(data || []);
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

      // Auto-generate email if not provided
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
        const createdPatient = data[0];
        setPatients([...patients, createdPatient]);
        setFormData({
          patient_id: createdPatient.id,
          doctor_id: '',
          appointment_date: new Date().toISOString().split('T')[0],
          duration_minutes: 30,
          appointment_type: 'consultation',
          notes: '',
          status: 'pending_confirmation',
          cancellation_reason: ''
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

      if (isEditing && editingId) {
        // UPDATE Logic
        const oldAppointment = appointments.find(a => a.id === editingId);

        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            patient_id: formData.patient_id,
            doctor_id: formData.doctor_id,
            appointment_type: formData.appointment_type,
            notes: formData.notes,
            status: formData.status,
            ...(formData.status === 'cancelled' ? { cancellation_reason: formData.cancellation_reason || (oldAppointment as any)?.cancellation_reason || 'Manually Cancelled' } : {}),
            // Only update date if a new slot was selected
            ...(selectedSlotId ? { appointment_date: availableSlots.find(s => s.id === selectedSlotId)?.start_time } : {})
          })
          .eq('id', editingId);

        if (updateError) throw updateError;

        // Trigger notification if status changed to confirmed/cancelled
        if (oldAppointment && oldAppointment.status !== formData.status && (formData.status === 'confirmed' || formData.status === 'cancelled')) {
          sendNotification(formData.status as any, { ...oldAppointment, status: formData.status, cancellation_reason: formData.cancellation_reason });
        }

        alert('Appointment updated successfully!');
      } else {
        // CREATE Logic
        if (!selectedSlotId) {
          alert('Please select an available time slot');
          setLoading(false);
          return;
        }

        const selectedSlot = availableSlots.find(s => s.id === selectedSlotId);
        if (!selectedSlot) throw new Error('Selected slot not found');

        const { data: appointmentData, error: appointmentError } = await supabase
          .from('appointments')
          .insert([{
            ...formData,
            appointment_date: selectedSlot.start_time,
            duration_minutes: selectedSlot.slot_duration || formData.duration_minutes,
            branch_id: profile?.branch_id,
            created_by: profile?.id
          }])
          .select()
          .single();

        if (appointmentError) throw appointmentError;

        const { error: slotError } = await supabase
          .from('appointment_slots')
          .update({
            is_booked: true,
            appointment_id: appointmentData.id
          })
          .eq('id', selectedSlotId);

        if (slotError) console.error('Error updating slot:', slotError);
        alert('Appointment scheduled successfully!');
      }

      setShowModal(false);
      resetForm();
      loadAppointments();
    } catch (error: any) {
      console.error('Error creating appointment:', error);
      alert(error.message || 'Failed to create appointment');
    } finally {
      setLoading(false);
    }
  };

  const sendNotification = (type: 'confirmed' | 'cancelled', appointment: Appointment) => {
    const message = type === 'confirmed'
      ? `Appointment confirmed for ${appointment.patients.full_name} on ${new Date(appointment.appointment_date).toLocaleString()}`
      : `Appointment cancelled for ${appointment.patients.full_name}. Reason: ${appointment.cancellation_reason || 'N/A'}`;

    console.log(`[NOTIFICATION/SMS/EMAIL] Triggered for ${appointment.patients.phone}: ${message}`);
    // In a real app, this would call an API like Twilio or SendGrid
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

      // Find the appointment to send notification
      const appointment = appointments.find(a => a.id === id);
      if (appointment && (newStatus === 'confirmed' || newStatus === 'cancelled')) {
        sendNotification(newStatus as any, { ...appointment, cancellation_reason: reason });
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
    setFormData({
      patient_id: appointment.patient_id,
      doctor_id: (appointment as any).doctor_id || '',
      appointment_date: appointment.appointment_date.split('T')[0],
      duration_minutes: appointment.duration_minutes,
      appointment_type: appointment.appointment_type,
      notes: appointment.notes,
      status: appointment.status,
      cancellation_reason: appointment.cancellation_reason || ''
    });
    setEditingId(appointment.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-100 text-green-700';
      case 'pending_confirmation':
        return 'bg-yellow-100 text-yellow-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'treated':
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointment Management</h1>
          <p className="text-gray-600 mt-1">Schedule and manage patient appointments</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2 rounded-lg hover:from-green-700 hover:to-emerald-700 transition shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>New Appointment</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by patient name or doctor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">From:</span>
            <div className="relative">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
              />
              <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">To:</span>
            <div className="relative">
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
              />
              <CalendarIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="flex items-center space-x-2 ml-auto">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="pending_confirmation">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="treated">Treated</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm bg-white"
            >
              <option value="all">All Types</option>
              <option value="consultation">Consultation</option>
              <option value="follow_up">Follow-up</option>
              <option value="emergency">Emergency</option>
              <option value="procedure">Procedure</option>
            </select>
          </div>

          <div className="flex-1 text-right text-sm text-gray-600">
            Found {appointments.length} appointments
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date & Time</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Patient</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Doctor</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {appointments
                  .filter(appointment => {
                    const searchLower = searchQuery.toLowerCase();
                    const patientName = appointment.patients?.full_name?.toLowerCase() || '';
                    const doctorName = appointment.users?.full_name?.toLowerCase() || '';
                    return patientName.includes(searchLower) || doctorName.includes(searchLower);
                  })
                  .map((appointment) => (
                    <tr key={appointment.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 text-green-600 mr-2" />
                          <span className="font-bold text-gray-900">{formatTime(appointment.appointment_date)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(appointment.appointment_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{appointment.patients.full_name}</span>
                          <span className="text-xs text-gray-500">{appointment.patients.phone}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm text-gray-700">
                          <User className="w-4 h-4 text-gray-400 mr-2" />
                          {appointment.users.full_name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-700 capitalize">{appointment.appointment_type.replace('_', ' ')}</span>
                          <span className="text-xs text-gray-500">{appointment.duration_minutes} mins</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${getStatusColor(appointment.status)}`}>
                          {appointment.status === 'treated' ? 'Treated' : appointment.status.replace('_', ' ')}
                        </span>
                        {appointment.status === 'cancelled' && appointment.cancellation_reason && (
                          <div className="text-[10px] text-red-600 mt-1 max-w-[150px] truncate" title={appointment.cancellation_reason}>
                            Reason: {appointment.cancellation_reason}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {appointment.status === 'pending_confirmation' && (
                            <div className="flex space-x-1">
                              <button
                                onClick={() => updateStatus(appointment.id, 'confirmed')}
                                className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition"
                                title="Confirm"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setCancellingAppointmentId(appointment.id);
                                  setShowCancelModal(true);
                                }}
                                className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"
                                title="Cancel"
                              >
                                <Plus className="w-4 h-4 rotate-45" />
                              </button>
                            </div>
                          )}
                          {appointment.status === 'confirmed' && (
                            <button
                              onClick={() => updateStatus(appointment.id, 'treated')}
                              className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
                              title="Mark Treated"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(appointment)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
                            title="Edit Appointment"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{isEditing ? 'Edit Appointment' : 'Schedule New Appointment'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Patient</label>
                <select
                  value={formData.patient_id}
                  onChange={(e) => {
                    if (e.target.value === 'new') {
                      setShowPatientModal(true);
                    } else {
                      setFormData({ ...formData, patient_id: e.target.value });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  required
                >
                  <option value="">Select Patient</option>
                  <option value="new" className="font-bold text-green-600">+ Add New Patient</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.full_name} ({patient.patient_number})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Doctor</label>
                <select
                  value={formData.doctor_id}
                  onChange={(e) => setFormData({ ...formData, doctor_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  required
                >
                  <option value="">Select Doctor</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                <input
                  type="date"
                  value={formData.appointment_date}
                  onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Available Slots</label>
                {slotLoading ? (
                  <div className="flex items-center space-x-2 text-sm text-gray-500 py-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600" />
                    <span>Loading slots...</span>
                  </div>
                ) : !formData.doctor_id ? (
                  <p className="text-sm text-gray-500 py-2 italic">Select a doctor to see availability</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-sm text-red-500 py-2 italic">No available slots for this date</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 mt-1 max-h-40 overflow-y-auto p-1">
                    {availableSlots.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setSelectedSlotId(slot.id)}
                        className={`px-2 py-2 text-xs font-medium rounded-lg border transition ${selectedSlotId === slot.id
                          ? 'bg-green-600 border-green-600 text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-green-500 hover:text-green-600'
                          }`}
                      >
                        {formatTime(slot.start_time)}
                      </button>
                    ))}
                  </div>
                )}
                {!selectedSlotId && availableSlots.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1">Please select a time slot</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (mins)</label>
                  <input
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                    min="15"
                    step="15"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={formData.appointment_type}
                    onChange={(e) => setFormData({ ...formData, appointment_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  >
                    <option value="consultation">Consultation</option>
                    <option value="follow_up">Follow-up</option>
                    <option value="emergency">Emergency</option>
                    <option value="procedure">Procedure</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                >
                  <option value="pending_confirmation">Pending Confirmation</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="treated">Treated</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {formData.status === 'cancelled' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cancellation Reason *</label>
                  <textarea
                    value={formData.cancellation_reason}
                    onChange={(e) => setFormData({ ...formData, cancellation_reason: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                    rows={2}
                    placeholder="Provide a reason for cancellation..."
                    required
                  />
                </div>
              )}

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition shadow-md"
                >
                  Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showPatientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Plus className="w-6 h-6 text-green-600" />
              Quick Add Patient
            </h2>
            <form onSubmit={handleCreatePatient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={newPatient.full_name}
                  onChange={(e) => setNewPatient({ ...newPatient, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={newPatient.date_of_birth}
                    onChange={(e) => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select
                    value={newPatient.gender}
                    onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  value={newPatient.phone}
                  onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  required
                  placeholder="+27..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  value={newPatient.email}
                  onChange={(e) => setNewPatient({ ...newPatient, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  placeholder="Leave blank to auto-generate"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPatientModal(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-md disabled:opacity-50"
                >
                  {loading ? 'Adding...' : 'Add Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Plus className="w-6 h-6 text-red-600 rotate-45" />
              Cancel Appointment
            </h2>
            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Cancellation *</label>
                <textarea
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  rows={3}
                  placeholder="Please provide a reason..."
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancellingAppointmentId(null);
                    setCancellationReason('');
                  }}
                  className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-md"
                >
                  Confirm Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
