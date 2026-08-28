import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, ChevronLeft, ChevronRight, User, Clock, Check, X, Trash2 } from 'lucide-react';
import { SearchDropdown } from './SearchDropdown';
import { RemarksQuickInput } from './RemarksQuickInput';
import { fetchAllPatients } from '../utils/patientUtils';
import { logActivity } from '../utils/auditLogger';
import { notificationService } from '../utils/notificationService';
import { smsService } from '../utils/smsService';
import { emailService } from '../utils/emailService';
import { getAppointmentTypeBadge, getAppointmentTypeLabel, fetchOrGenerateDoctorSlots } from '../utils/appointmentUtils';
import { recordRemarkUsage } from '../utils/remarksUtils';

interface Appointment {
    id: string;
    appointment_date: string;
    duration_minutes: number;
    appointment_type: string;
    status: string;
    notes: string;
    cancellation_reason?: string;
    patient_id: string;
    branch_id?: string;
    patients: {
        full_name: string;
        phone: string;
        email?: string;
        patient_number?: string;
        file_number?: string;
        date_of_birth?: string;
    };
    users: {
        full_name: string;
    };
}

interface Props {
    showTitle?: boolean;
    compact?: boolean;
}

export function ReusableCalendar({ showTitle = true, compact = false }: Props) {
    const { profile } = useAuth();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [newPatient, setNewPatient] = useState({
        full_name: '',
        phone: '',
        gender: 'male',
        date_of_birth: '',
        email: '',
        file_number: '',
        address: ''
    });
    const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        appointment_date: '',
        appointment_time: '',
        status: '',
        appointment_type: '',
        notes: '',
        cancellation_reason: ''
    });
    const [patients, setPatients] = useState<any[]>([]);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [formData, setFormData] = useState({
        patient_id: '',
        doctor_id: '',
        appointment_date: '',
        appointment_time: '',
        duration_minutes: 30,
        appointment_type: 'consultation',
        notes: '',
        status: 'pending_confirmation',
        cancellation_reason: ''
    });
    const [availableSlots, setAvailableSlots] = useState<any[]>([]);
    const [selectedSlotId, setSelectedSlotId] = useState('');
    const [slotMessage, setSlotMessage] = useState('');
    const [dayModalDate, setDayModalDate] = useState<Date | null>(null);
    const [daySearchQuery, setDaySearchQuery] = useState('');
    const [deletingAptId, setDeletingAptId] = useState<string | null>(null);

    const calcAge = (dob?: string): string => {
        if (!dob) return '';
        const birth = new Date(dob);
        if (isNaN(birth.getTime())) return '';
        const ageDiff = Date.now() - birth.getTime();
        const years = Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
        return `${years}y`;
    };

    useEffect(() => {
        loadAppointments();
        loadPatients();
        loadDoctors();
    }, [profile, currentMonth]);

    const loadAppointments = async () => {
        if (!profile?.branch_id && profile?.role !== 'super_admin') return;

        try {
            // Use start/end-of-month boundaries for the current calendar view
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0] + 'T23:59:59';

            let query = supabase
                .from('appointments')
                .select(`
                  id, appointment_date, duration_minutes, appointment_type, status, notes, cancellation_reason,
                  patient_id, branch_id,
                  patients!left (full_name, phone, email, patient_number, file_number, date_of_birth),
                  users:doctor_id!left (full_name)
                `)
                .gte('appointment_date', startOfMonth)
                .lte('appointment_date', endOfMonth)
                .order('appointment_date', { ascending: true })
                .limit(2000);

            if (profile.role !== 'super_admin') {
                // Include branch appointments AND orphaned records with no branch_id
                query = query.or(`branch_id.eq.${profile.branch_id},branch_id.is.null`);
            }

            if (profile.role === 'doctor') {
                query = query.eq('doctor_id', profile.id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setAppointments((data as any) || []);
        } catch (error) {
            console.error('Error loading appointments:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPatients = async () => {
        if (!profile) return;
        try {
            const data = await fetchAllPatients({
                select: 'id, full_name, patient_number, file_number, national_id, phone, email, branch_id',
                activeOnly: false
            });
            setPatients(data || []);
        } catch (error) {
            console.error('Error loading patients:', error);
        }
    };

    const loadDoctors = async () => {
        if (!profile) return;
        try {
            let query = supabase
                .from('users')
                .select('id, full_name')
                .eq('role', 'doctor')
                .eq('is_active', true)
                .order('full_name');

            if (profile.role !== 'super_admin' && profile.branch_id) {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setDoctors(data || []);
        } catch (error) {
            console.error('Error loading doctors:', error);
        }
    };

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
                        details: `Quick-added patient from appointments calendar: ${newPatient.full_name}`,
                        newValues: { ...newPatient, patient_number: patientNumber }
                    });
                }
                const createdPatient = data[0];
                setPatients(prev => [...prev, {
                    id: createdPatient.id,
                    full_name: createdPatient.full_name,
                    patient_number: createdPatient.patient_number,
                    email: createdPatient.email,
                    phone: createdPatient.phone,
                    branch_id: createdPatient.branch_id
                }]);
                setFormData(prev => ({
                    ...prev,
                    patient_id: createdPatient.id
                }));
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
            alert('Failed to create patient: ' + (error?.message || error?.details || 'Unknown error'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.patient_id) {
            alert('Please select a patient.');
            return;
        }

        setSubmitting(true);
        try {
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
                    setSubmitting(false);
                    return;
                }
            }

            // Prevent duplicate booking for the same patient on the same date
            const dateStr = finalDateTime.split('T')[0] || finalDateTime.split(' ')[0];
            const startOfDay = `${dateStr}T00:00:00`;
            const endOfDay = `${dateStr}T23:59:59`;

            const { data: existingAppts } = await supabase
                .from('appointments')
                .select('id')
                .eq('patient_id', formData.patient_id)
                .gte('appointment_date', startOfDay)
                .lte('appointment_date', endOfDay)
                .neq('status', 'cancelled');

            if (existingAppts && existingAppts.length > 0) {
                const patientObj = patients.find(p => p.id === formData.patient_id);
                alert(`Duplicate Booking Blocked: Patient "${patientObj?.full_name || 'Selected patient'}" already has an active appointment on ${dateStr}.`);
                setSubmitting(false);
                return;
            }

            const selectedPatient = patients.find(p => p.id === formData.patient_id);
            const targetBranchId = profile?.branch_id || selectedPatient?.branch_id || null;

            const { data: appointmentData, error } = await supabase
                .from('appointments')
                .insert([{
                    patient_id: formData.patient_id,
                    doctor_id: formData.doctor_id || null,
                    appointment_date: finalDateTime,
                    duration_minutes: Number(finalDuration) || 30,
                    appointment_type: formData.appointment_type,
                    notes: formData.notes?.trim() || null,
                    status: formData.status || 'pending_confirmation',
                    cancellation_reason: formData.status === 'cancelled' ? (formData.cancellation_reason || 'Manually Cancelled') : null,
                    branch_id: targetBranchId,
                    created_by: profile?.id || null
                }])
                .select()
                .single();

            if (error) throw error;

            if (selectedSlotId && appointmentData) {
                await supabase
                    .from('appointment_slots')
                    .update({ is_booked: true, appointment_id: appointmentData.id })
                    .eq('id', selectedSlotId);
            }

            if (profile?.id && targetBranchId && appointmentData) {
                const patientName = selectedPatient?.full_name || 'Patient';
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: targetBranchId,
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
                        branchId: targetBranchId
                    });
                }

                // AUTOMATIC DISPATCH: SMS & EMAIL (Appointment Booked)
                if (selectedPatient && targetBranchId) {
                    const doctorName = doctors.find(d => d.id === formData.doctor_id)?.full_name || 'Doctor';
                    const formattedDate = new Date(finalDateTime).toLocaleDateString();
                    const formattedTime = new Date(finalDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    if (selectedPatient.phone) {
                        await smsService.sendSms({
                            recipientPhone: selectedPatient.phone,
                            triggerType: 'appointment_booked',
                            variables: {
                                patient_name: selectedPatient.full_name,
                                doctor_name: doctorName,
                                date: formattedDate,
                                time: formattedTime
                            },
                            branchId: targetBranchId,
                            patientId: selectedPatient.id
                        });
                    }

                    if (selectedPatient.email) {
                        await emailService.sendEmail({
                            recipientEmail: selectedPatient.email,
                            recipientName: selectedPatient.full_name,
                            triggerType: 'appointment_booked',
                            placeholders: {
                                patient_name: selectedPatient.full_name,
                                doctor_name: doctorName,
                                date: formattedDate,
                                time: formattedTime
                            },
                            branchId: targetBranchId
                        });
                    }
                }
            }

            if (formData.notes) {
                recordRemarkUsage(formData.notes);
            }

            setSuccessMessage('Appointment scheduled successfully!');
            setShowSuccessModal(true);
            setShowModal(false);
            setFormData({
                patient_id: '',
                doctor_id: '',
                appointment_date: '',
                appointment_time: '',
                duration_minutes: 30,
                appointment_type: 'consultation',
                notes: '',
                status: 'pending_confirmation',
                cancellation_reason: ''
            });
            setSelectedSlotId('');
            loadAppointments();
        } catch (error: any) {
            console.error('Error creating appointment:', error);
            alert(error?.message || error?.details || 'Failed to create appointment');
        } finally {
            setSubmitting(false);
        }
    };

    const formatTime = (dateString: string) => {
        const d = new Date(dateString);
        // Detect midnight UTC — means no real time was stored (old migrated data)
        const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
        if (isDateOnly) return '—';
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const openEditDetails = (apt: Appointment) => {
        const d = new Date(apt.appointment_date);
        const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
        const dateStr = [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, '0'),
            String(d.getDate()).padStart(2, '0')
        ].join('-');
        const timeStr = isDateOnly ? '08:00' : [
            String(d.getHours()).padStart(2, '0'),
            String(d.getMinutes()).padStart(2, '0')
        ].join(':');
        setEditForm({
            appointment_date: dateStr,
            appointment_time: timeStr,
            status: apt.status,
            appointment_type: apt.appointment_type,
            notes: apt.notes || '',
            cancellation_reason: apt.cancellation_reason || ''
        });
        setIsEditingDetails(false);
        setSelectedApt(apt);
        setShowDetailsModal(true);
    };

    const handleUpdateAppointment = async () => {
        if (!selectedApt) return;
        setEditSaving(true);
        try {
            // Prevent duplicate booking for the patient on the same date
            const dateStr = editForm.appointment_date;
            const startOfDay = `${dateStr}T00:00:00`;
            const endOfDay = `${dateStr}T23:59:59`;

            const { data: existingAppts } = await supabase
                .from('appointments')
                .select('id')
                .eq('patient_id', selectedApt.patient_id)
                .gte('appointment_date', startOfDay)
                .lte('appointment_date', endOfDay)
                .neq('id', selectedApt.id)
                .neq('status', 'cancelled');

            if (existingAppts && existingAppts.length > 0) {
                alert(`Duplicate Booking Blocked: Patient "${selectedApt.patients?.full_name || 'Selected patient'}" already has another active appointment booked on ${dateStr}.`);
                setEditSaving(false);
                return;
            }

            const finalDateTime = `${editForm.appointment_date}T${editForm.appointment_time}:00`;
            const { error } = await supabase
                .from('appointments')
                .update({
                    appointment_date: finalDateTime,
                    status: editForm.status,
                    appointment_type: editForm.appointment_type,
                    notes: editForm.notes?.trim() || null,
                    cancellation_reason: editForm.status === 'cancelled' ? (editForm.cancellation_reason?.trim() || 'Cancelled') : null
                })
                .eq('id', selectedApt.id);

            if (error) throw error;

            if (selectedApt.status !== editForm.status && (editForm.status === 'confirmed' || editForm.status === 'cancelled')) {
                const branchId = (profile?.branch_id || (selectedApt as any).branch_id) as string;
                if (branchId) {
                    const doctorName = selectedApt.users?.full_name || 'Doctor';
                    const formattedDate = new Date(finalDateTime).toLocaleDateString();
                    const formattedTime = new Date(finalDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const triggerType = editForm.status === 'confirmed' ? 'appointment_confirmed' : 'appointment_cancelled';
                    const pat = selectedApt.patients;

                    if (pat?.phone) {
                        await smsService.sendSms({
                            recipientPhone: pat.phone,
                            triggerType: triggerType as any,
                            variables: {
                                patient_name: pat.full_name,
                                doctor_name: doctorName,
                                date: formattedDate,
                                time: formattedTime,
                                reason: editForm.cancellation_reason || ''
                            },
                            branchId,
                            patientId: selectedApt.patient_id
                        });
                    }

                    if (pat?.email) {
                        await emailService.sendEmail({
                            recipientEmail: pat.email,
                            recipientName: pat.full_name,
                            triggerType,
                            placeholders: {
                                patient_name: pat.full_name,
                                doctor_name: doctorName,
                                date: formattedDate,
                                time: formattedTime,
                                reason: editForm.cancellation_reason || ''
                            },
                            branchId
                        });
                    }
                }
            }

            if (editForm.notes) {
                recordRemarkUsage(editForm.notes);
            }

            setShowDetailsModal(false);
            setIsEditingDetails(false);
            setSuccessMessage('Appointment updated successfully!');
            setShowSuccessModal(true);
            loadAppointments();
        } catch (err: any) {
            console.error('Error updating appointment:', err);
            alert(err?.message || 'Failed to update appointment.');
        } finally {
            setEditSaving(false);
        }
    };

    const handleDeleteCalendarAppointment = async () => {
        if (!selectedApt) return;
        if (!window.confirm(`Are you sure you want to delete this appointment for "${selectedApt.patients?.full_name || 'this patient'}"? This action cannot be undone.`)) {
            return;
        }

        try {
            setEditSaving(true);
            // Release booked slot
            await supabase
                .from('appointment_slots')
                .update({ is_booked: false, appointment_id: null })
                .eq('appointment_id', selectedApt.id);

            const { error } = await supabase
                .from('appointments')
                .delete()
                .eq('id', selectedApt.id);

            if (error) throw error;

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'DELETE',
                    tableName: 'appointments',
                    recordId: selectedApt.id,
                    details: `Deleted appointment from Calendar for: ${selectedApt.patients?.full_name || selectedApt.id}`
                });
            }

            setShowDetailsModal(false);
            setIsEditingDetails(false);
            setSuccessMessage('Appointment deleted successfully!');
            setShowSuccessModal(true);
            loadAppointments();
        } catch (err: any) {
            console.error('Error deleting appointment:', err);
            alert('Failed to delete appointment: ' + (err?.message || 'Unknown error'));
        } finally {
            setEditSaving(false);
        }
    };
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        return { daysInMonth, firstDay };
    };

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const prevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const getAppointmentsForDay = (day: number) => {
        return appointments.filter(apt => {
            const aptDate = new Date(apt.appointment_date);
            return aptDate.getDate() === day &&
                aptDate.getMonth() === currentMonth.getMonth() &&
                aptDate.getFullYear() === currentMonth.getFullYear();
        });
    };

    if (loading) {
        return (
            <div className={`flex items-center justify-center ${compact ? 'h-full' : 'h-64'}`}>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
            </div>
        );
    }

    return (
        <div className={compact ? "" : "space-y-6"}>
            {showTitle && (
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 font-roboto">Appointment Calendar</h1>
                        <p className="text-gray-600 mt-1 font-roboto">View and manage appointments in calendar view</p>
                    </div>
                    <button
                        onClick={() => {
                            setFormData({
                                patient_id: '',
                                doctor_id: '',
                                appointment_date: new Date().toISOString().split('T')[0],
                                appointment_time: '09:00',
                                duration_minutes: 30,
                                appointment_type: 'consultation',
                                notes: '',
                                status: 'pending_confirmation'
                            });
                            setSelectedSlotId('');
                            setShowModal(true);
                        }}
                        className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2 rounded-lg hover:from-green-700 hover:to-emerald-700 transition shadow-md font-roboto"
                    >
                        <Plus className="w-5 h-5" />
                        <span>New Appointment</span>
                    </button>
                </div>
            )}

            <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden ${compact ? 'border-none shadow-none' : ''}`}>
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white font-roboto">
                        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h2>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setCurrentMonth(new Date())}
                            className="px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition border border-gray-200 dark:border-gray-700"
                        >
                            Today
                        </button>
                        <div className="flex space-x-1">
                            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-700">
                                <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-700">
                                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="py-2 text-center text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest bg-gray-50/50 dark:bg-gray-900/30">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-fr bg-gray-50/50 dark:bg-gray-950/20">
                    {Array.from({ length: getDaysInMonth(currentMonth).firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className={`${compact ? 'h-20 sm:h-22' : 'h-32 sm:h-36'} border-b border-r border-gray-100 dark:border-gray-800 opacity-50`} />
                    ))}
                    {Array.from({ length: getDaysInMonth(currentMonth).daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const localDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                        const dateStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
                        const todayLocal = new Date();
                        const todayStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;
                        const isToday = dateStr === todayStr;
                        const dayAppointments = getAppointmentsForDay(day);
                        const maxVisible = compact ? 1 : 3;
                        const visibleApts = dayAppointments.slice(0, maxVisible);
                        const hiddenCount = dayAppointments.length - maxVisible;

                        return (
                            <div
                                key={day}
                                onClick={() => {
                                    if (dayAppointments.length > 0) {
                                        setDayModalDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
                                    }
                                }}
                                className={`${compact ? 'h-20 sm:h-22' : 'h-32 sm:h-36'} p-1 border-b border-r border-gray-100 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-800/50 transition-all relative group flex flex-col justify-between cursor-pointer ${isToday ? 'bg-indigo-50/40 dark:bg-indigo-900/10' : ''}`}
                            >
                                <div>
                                    <div className="flex justify-between items-center mb-0.5">
                                        <span className={`text-[10px] font-extrabold ${isToday ? 'bg-indigo-600 text-white w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-md shadow-2xs' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {day}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFormData({
                                                    patient_id: '',
                                                    doctor_id: '',
                                                    appointment_date: dateStr,
                                                    appointment_time: '09:00',
                                                    duration_minutes: 30,
                                                    appointment_type: 'consultation',
                                                    notes: '',
                                                    status: 'pending_confirmation'
                                                });
                                                setSelectedSlotId('');
                                                setShowModal(true);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded text-indigo-600 dark:text-indigo-400 transition-opacity"
                                            title="Add Appointment"
                                        >
                                            <Plus className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <div className="space-y-0.5">
                                        {visibleApts.map(apt => (
                                            <div
                                                key={apt.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openEditDetails(apt);
                                                }}
                                                className={`text-[9px] px-1 py-0.5 rounded border truncate cursor-pointer hover:opacity-80 transition-all font-semibold shadow-2xs ${
                                                    apt.status === 'confirmed' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300' :
                                                    apt.status === 'pending_confirmation' ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300' :
                                                    apt.status === 'treated' || apt.status === 'completed' ? 'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-300' :
                                                    apt.status === 'cancelled' ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300' :
                                                    'bg-gray-50 border-gray-200 text-gray-800 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                                                }`}
                                                title={`${formatTime(apt.appointment_date)} - ${apt.patients?.full_name}`}
                                            >
                                                <span className="font-mono font-bold opacity-75 mr-0.5 text-[8px]">{formatTime(apt.appointment_date).split(' ')[0]}</span>
                                                {apt.patients?.full_name}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {hiddenCount > 0 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDayModalDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
                                        }}
                                        className="w-full text-[9px] font-bold py-0.5 text-center bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded hover:bg-indigo-100 transition shadow-2xs mt-0.5"
                                    >
                                        + {hiddenCount} more
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">New Appointment</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
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
                                        onSelect={(id) => setFormData({ ...formData, patient_id: id })}
                                        onAddNew={() => setShowPatientModal(true)}
                                    />
                                    
                                    <SearchDropdown
                                        label="Doctor"
                                        placeholder="Search doctor..."
                                        items={doctors}
                                        selectedId={formData.doctor_id}
                                        onSelect={(id) => setFormData({ ...formData, doctor_id: id })}
                                    />

                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Appointment Type</label>
                                        <select
                                            value={formData.appointment_type}
                                            onChange={(e) => setFormData({ ...formData, appointment_type: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white"
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
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none text-sm bg-gray-50 cursor-not-allowed text-gray-500 dark:bg-gray-900 dark:border-gray-800"
                                            readOnly
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                                        <select
                                            value={formData.status}
                                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-white"
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
                                            onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Time</label>
                                        <input
                                            type="time"
                                            value={formData.appointment_time}
                                            onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                            required
                                        />
                                    </div>

                                    {/* Slot picker (helper) */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Available Slots (Quick Select)</label>
                                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border border-gray-200 p-2 rounded-lg bg-gray-50 dark:bg-gray-900 dark:border-gray-700">
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
                                                                ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed dark:bg-red-950/20 dark:border-red-900'
                                                                : selectedSlotId === slot.id
                                                                ? 'bg-green-600 text-white border-green-600 shadow-sm font-bold ring-2 ring-green-400'
                                                                : 'bg-white hover:border-green-500 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 hover:shadow-xs'
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

                                {/* Spanned Bottom Area */}
                                <div className="md:col-span-2 space-y-4">
                                    <RemarksQuickInput
                                        value={formData.notes}
                                        onChange={(val) => setFormData({ ...formData, notes: val })}
                                        placeholder="Add any remarks or notes..."
                                    />

                                    {formData.status === 'cancelled' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 text-red-600">Cancellation Reason</label>
                                            <textarea
                                                value={formData.cancellation_reason}
                                                onChange={(e) => setFormData({ ...formData, cancellation_reason: e.target.value })}
                                                className="w-full px-3 py-2 border border-red-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500 text-sm bg-red-50 dark:bg-red-950/20 dark:border-red-800 dark:text-white"
                                                rows={2}
                                                placeholder="Enter cancellation reason..."
                                                required
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex space-x-3 mt-6 border-t dark:border-gray-700 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm transition dark:border-gray-600 dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2"
                                >
                                    {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                                    {submitting ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick Add Patient Modal */}
            {showPatientModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-xs flex items-center justify-center z-[80] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150 border border-gray-100 dark:border-gray-700">
                        {/* Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-500">
                            <h2 className="text-lg font-black text-white tracking-tight">Quick Add Patient</h2>
                            <p className="text-green-100 text-xs mt-0.5">Fill in the details to register a new patient</p>
                        </div>

                        <form onSubmit={handleCreatePatient} className="p-6 space-y-4">
                            {/* Name — required */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter full name"
                                    value={newPatient.full_name}
                                    onChange={e => setNewPatient({ ...newPatient, full_name: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    required
                                />
                            </div>

                            {/* Phone + Gender row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
                                        Phone <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        placeholder="e.g. +263771234567"
                                        value={newPatient.phone}
                                        onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
                                        Gender <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={newPatient.gender}
                                        onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none font-medium"
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
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
                                        Date of Birth
                                    </label>
                                    <input
                                        type="date"
                                        value={newPatient.date_of_birth}
                                        onChange={e => setNewPatient({ ...newPatient, date_of_birth: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
                                        File Number
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. F-00123"
                                        value={newPatient.file_number}
                                        onChange={e => setNewPatient({ ...newPatient, file_number: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    placeholder="patient@email.com"
                                    value={newPatient.email}
                                    onChange={e => setNewPatient({ ...newPatient, email: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </div>

                            {/* Address */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
                                    Address
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 123 Main St, Harare"
                                    value={newPatient.address}
                                    onChange={e => setNewPatient({ ...newPatient, address: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPatientModal(false)}
                                    className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl text-sm font-semibold transition dark:text-gray-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {submitting && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                                    {submitting ? 'Saving...' : 'Add Patient'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-150 border border-gray-100 dark:border-gray-700">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto">
                            <Check className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Success!</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{successMessage}</p>
                        </div>
                        <button
                            onClick={() => setShowSuccessModal(false)}
                            className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* Appointment Details / Edit Modal — single unified modal, always editable */}
            {showDetailsModal && selectedApt && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">

                        {/* Header */}
                        <div className="flex justify-between items-center px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Edit Appointment</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Update details and save changes</p>
                            </div>
                            <button
                                onClick={() => setShowDetailsModal(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            {/* Patient info strip */}
                            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                                <div className="w-9 h-9 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center text-green-600 shrink-0">
                                    <User className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{selectedApt.patients.full_name}</p>
                                    <p className="text-xs text-gray-500">{selectedApt.patients.phone}{selectedApt.users?.full_name ? ` • Dr. ${selectedApt.users.full_name}` : ''}</p>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        {selectedApt.patients?.file_number && (
                                            <span className="text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                                File: {selectedApt.patients.file_number.split('-')[0]}
                                            </span>
                                        )}
                                        {selectedApt.patients?.date_of_birth && (
                                            <span className="text-[10px] font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                                                Age: {calcAge(selectedApt.patients.date_of_birth)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Date & Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={editForm.appointment_date}
                                        onChange={e => setEditForm(f => ({ ...f, appointment_date: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Time</label>
                                    <input
                                        type="time"
                                        value={editForm.appointment_time}
                                        onChange={e => setEditForm(f => ({ ...f, appointment_time: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                            </div>

                            {/* Type & Status */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Type</label>
                                    <select
                                        value={editForm.appointment_type}
                                        onChange={e => setEditForm(f => ({ ...f, appointment_type: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none dark:bg-gray-700 dark:text-white"
                                    >
                                        <option value="consultation">New Consultation</option>
                                        <option value="follow_up">Review</option>
                                        <option value="emergency">Emergency</option>
                                        <option value="procedure">Procedure</option>
                                        <option value="initial_new_old">Initial - New Old Patient</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                                    <select
                                        value={editForm.status}
                                        onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none dark:bg-gray-700 dark:text-white"
                                    >
                                        <option value="pending_confirmation">Pending Confirmation</option>
                                        <option value="confirmed">Confirmed</option>
                                        <option value="treated">Treated</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>

                            {/* Notes */}
                            <RemarksQuickInput
                                label="Notes"
                                value={editForm.notes}
                                onChange={val => setEditForm(f => ({ ...f, notes: val }))}
                                placeholder="Add notes..."
                            />

                            {editForm.status === 'cancelled' && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 text-red-600">Cancellation Reason</label>
                                    <textarea
                                        value={editForm.cancellation_reason}
                                        onChange={e => setEditForm(f => ({ ...f, cancellation_reason: e.target.value }))}
                                        rows={2}
                                        className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none bg-red-50 dark:bg-red-950/20 dark:border-red-800 dark:text-white resize-none"
                                        placeholder="Enter cancellation reason..."
                                        required
                                    />
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 px-6 pb-5">
                            <button
                                type="button"
                                onClick={handleDeleteCalendarAppointment}
                                disabled={editSaving}
                                className="px-3.5 py-2.5 bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-bold hover:bg-rose-100 transition flex items-center justify-center gap-1.5"
                                title="Delete this appointment"
                            >
                                <Trash2 className="w-4 h-4" /> Delete
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowDetailsModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleUpdateAppointment}
                                disabled={editSaving}
                                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold transition flex items-center justify-center gap-2"
                            >
                                {editSaving
                                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    : <Check className="w-4 h-4" />
                                }
                                {editSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Success Modal */}
            {/* Day Appointments Overview Modal */}
            {dayModalDate && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[60] p-4" onClick={() => { setDayModalDate(null); setDaySearchQuery(''); }}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-150 border border-gray-100 dark:border-gray-700 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="flex justify-between items-center px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
                            <div>
                                <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                                    {dayModalDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                                </h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                    {getAppointmentsForDay(dayModalDate.getDate()).length} appointment(s)
                                </p>
                            </div>
                            <button onClick={() => { setDayModalDate(null); setDaySearchQuery(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Search bar */}
                        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
                            <div className="relative">
                                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                <input
                                    type="text"
                                    placeholder="Search patient, doctor, status..."
                                    value={daySearchQuery}
                                    onChange={e => setDaySearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white"
                                    autoFocus
                                />
                                {daySearchQuery && (
                                    <button onClick={() => setDaySearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold">✕</button>
                                )}
                            </div>
                        </div>

                        {/* List */}
                        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
                            {(() => {
                                const allDayApts = getAppointmentsForDay(dayModalDate.getDate());
                                const q = daySearchQuery.toLowerCase().trim();
                                const filtered = q
                                    ? allDayApts.filter(a =>
                                        (a.patients?.full_name || '').toLowerCase().includes(q) ||
                                        (a.patients?.file_number || '').toLowerCase().includes(q) ||
                                        (a.users?.full_name || '').toLowerCase().includes(q) ||
                                        (a.status || '').toLowerCase().includes(q) ||
                                        (a.notes || '').toLowerCase().includes(q)
                                    )
                                    : allDayApts;

                                if (filtered.length === 0) {
                                    return (
                                        <div className="text-center py-8 text-sm text-gray-400">
                                            {q ? 'No appointments match your search.' : 'No appointments for this day.'}
                                        </div>
                                    );
                                }

                                return filtered.map(apt => (
                                    <div
                                        key={apt.id}
                                        className="p-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 rounded-xl transition group"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div
                                                className="flex-1 min-w-0 cursor-pointer"
                                                onClick={() => { openEditDetails(apt); setDayModalDate(null); setDaySearchQuery(''); }}
                                            >
                                                <span className="text-xs font-extrabold text-gray-900 dark:text-white uppercase block group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                                                    {apt.patients?.full_name || 'Patient'}
                                                </span>
                                                {/* File number + Age row */}
                                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                    {apt.patients?.file_number && (
                                                        <span className="text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                                            File: {apt.patients.file_number.split('-')[0]}
                                                        </span>
                                                    )}
                                                    {apt.patients?.date_of_birth && (
                                                        <span className="text-[10px] font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                                                            Age: {calcAge(apt.patients.date_of_birth)}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1 mt-1">
                                                    <Clock className="w-3 h-3 text-gray-400" /> {formatTime(apt.appointment_date)}{apt.users?.full_name ? ` • Dr. ${apt.users.full_name}` : ''}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                    apt.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                                                    apt.status === 'pending_confirmation' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' :
                                                    apt.status === 'treated' || apt.status === 'completed' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' :
                                                    apt.status === 'cancelled' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' :
                                                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                                }`}>
                                                    {apt.status.replace('_', ' ')}
                                                </span>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!window.confirm(`Delete appointment for "${apt.patients?.full_name || 'this patient'}"? This cannot be undone.`)) return;
                                                        setDeletingAptId(apt.id);
                                                        try {
                                                            await supabase.from('appointment_slots').update({ is_booked: false, appointment_id: null }).eq('appointment_id', apt.id);
                                                            const { error } = await supabase.from('appointments').delete().eq('id', apt.id);
                                                            if (error) throw error;
                                                            if (profile?.id && profile?.branch_id) {
                                                                await logActivity(supabase, { userId: profile.id, branchId: profile.branch_id, action: 'DELETE', tableName: 'appointments', recordId: apt.id, details: `Deleted appointment from Calendar day view for: ${apt.patients?.full_name || apt.id}` });
                                                            }
                                                            setAppointments(prev => prev.filter(a => a.id !== apt.id));
                                                        } catch (err: any) {
                                                            alert('Failed to delete: ' + (err?.message || 'Unknown error'));
                                                        } finally {
                                                            setDeletingAptId(null);
                                                        }
                                                    }}
                                                    disabled={deletingAptId === apt.id}
                                                    className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition disabled:opacity-50"
                                                    title="Delete appointment"
                                                >
                                                    {deletingAptId === apt.id
                                                        ? <span className="w-3.5 h-3.5 border-2 border-rose-400/40 border-t-rose-500 rounded-full animate-spin block" />
                                                        : <Trash2 className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center shrink-0">
                            <button
                                onClick={() => { setDayModalDate(null); setDaySearchQuery(''); }}
                                className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => {
                                    const dateStr = new Date(dayModalDate.getFullYear(), dayModalDate.getMonth(), dayModalDate.getDate()).toISOString().split('T')[0];
                                    setFormData({ patient_id: '', doctor_id: '', appointment_date: dateStr, appointment_time: '09:00', duration_minutes: 30, appointment_type: 'consultation', notes: '', status: 'pending_confirmation' });
                                    setDayModalDate(null);
                                    setDaySearchQuery('');
                                    setShowModal(true);
                                }}
                                className="flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 transition shadow-xs"
                            >
                                <Plus className="w-4 h-4" /> Add Appointment
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
