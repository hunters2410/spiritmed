import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, ChevronLeft, ChevronRight, User, Clock, Check, X, Stethoscope } from 'lucide-react';
import { SearchDropdown } from './SearchDropdown';

interface Appointment {
    id: string;
    appointment_date: string;
    duration_minutes: number;
    appointment_type: string;
    status: string;
    notes: string;
    patient_id: string;
    patients: {
        full_name: string;
        phone: string;
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
    const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
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
        status: 'pending_confirmation'
    });
    const [availableSlots, setAvailableSlots] = useState<any[]>([]);
    const [selectedSlotId, setSelectedSlotId] = useState('');
    const [dayModalDate, setDayModalDate] = useState<Date | null>(null);

    useEffect(() => {
        loadAppointments();
        loadPatients();
        loadDoctors();
    }, [profile, currentMonth]);

    const loadAppointments = async () => {
        if (!profile?.branch_id && profile?.role !== 'super_admin') return;

        try {
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString();
            
            let allAppointments: Appointment[] = [];
            let from = 0;
            const pageSize = 1000;

            while (true) {
                let query = supabase
                    .from('appointments')
                    .select(`
                      *,
                      patients (full_name, phone),
                      users:doctor_id (full_name)
                    `)
                    .gte('appointment_date', startOfMonth)
                    .lte('appointment_date', endOfMonth)
                    .order('appointment_date', { ascending: true })
                    .range(from, from + pageSize - 1);

                if (profile.role !== 'super_admin') {
                    query = query.eq('branch_id', profile.branch_id);
                }

                if (profile.role === 'doctor') {
                    query = query.eq('doctor_id', profile.id);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allAppointments = allAppointments.concat(data as any);
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
        if (!profile?.branch_id) return;
        try {
            let allPatients: any[] = [];
            let from = 0;
            const pageSize = 1000;

            while (true) {
                const { data, error } = await supabase
                    .from('patients')
                    .select('id, full_name, patient_number')
                    .eq('branch_id', profile.branch_id)
                    .eq('status', 'active')
                    .order('full_name')
                    .range(from, from + pageSize - 1);

                if (error) throw error;
                if (!data || data.length === 0) break;
                allPatients = allPatients.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }

            setPatients(allPatients);
        } catch (error) {
            console.error('Error loading patients:', error);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let finalDateTime = '';
            if (selectedSlotId) {
                const selectedSlot = availableSlots.find(s => s.id === selectedSlotId);
                if (selectedSlot) {
                    finalDateTime = selectedSlot.start_time;
                }
            }

            if (!finalDateTime) {
                if (formData.appointment_date && formData.appointment_time) {
                    finalDateTime = `${formData.appointment_date}T${formData.appointment_time}:00`;
                } else {
                    alert('Please select an available time slot or enter date and time.');
                    return;
                }
            }

            const { data: appointmentData, error } = await supabase
                .from('appointments')
                .insert([{
                    patient_id: formData.patient_id,
                    doctor_id: formData.doctor_id,
                    appointment_date: finalDateTime,
                    duration_minutes: formData.duration_minutes,
                    appointment_type: formData.appointment_type,
                    notes: formData.notes,
                    status: formData.status,
                    branch_id: profile?.branch_id,
                    created_by: profile?.id
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
                status: 'pending_confirmation'
            });
            setSelectedSlotId('');
            loadAppointments();
        } catch (error) {
            console.error('Error creating appointment:', error);
            alert('Failed to create appointment');
        }
    };

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
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
                        const dateStr = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toISOString().split('T')[0];
                        const isToday = dateStr === new Date().toISOString().split('T')[0];
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
                                                    setSelectedApt(apt);
                                                    setShowDetailsModal(true);
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
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white font-roboto text-center flex-1">Schedule Appointment</h2>
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
                                        placeholder="Select Patient"
                                        items={patients}
                                        selectedId={formData.patient_id}
                                        onSelect={(id) => setFormData({ ...formData, patient_id: id })}
                                    />
                                    
                                    <SearchDropdown
                                        label="Doctor"
                                        placeholder="Select Doctor"
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
                                                                ? 'bg-red-50 text-red-300 border-red-100 cursor-not-allowed dark:bg-red-950/20'
                                                                : selectedSlotId === slot.id
                                                                ? 'bg-green-600 text-white border-green-600 shadow-sm'
                                                                : 'bg-white hover:border-green-500 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
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

                                {/* Spanned Bottom Area */}
                                <div className="md:col-span-2 space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Remarks / Notes</label>
                                        <textarea
                                            value={formData.notes}
                                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                            rows={3}
                                            placeholder="Add any remarks or notes..."
                                        />
                                    </div>
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
                                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition"
                                >
                                    Schedule Visit
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Appointment Details Modal */}
            {showDetailsModal && selectedApt && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white font-roboto">Appointment Details</h3>
                                <p className="text-sm text-gray-500 font-roboto">View visit information</p>
                            </div>
                            <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-gray-600 transition p-1">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center text-green-600">
                                    <User className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Patient</div>
                                    <div className="text-lg font-bold text-gray-900 dark:text-white font-roboto">{selectedApt.patients.full_name}</div>
                                    <div className="text-sm text-gray-500 font-roboto">{selectedApt.patients.phone}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center mb-1">
                                        <Clock className="w-3.5 h-3.5 mr-1" /> Time
                                    </div>
                                    <div className="text-sm font-bold text-gray-900 dark:text-white font-roboto">
                                        {new Date(selectedApt.appointment_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                    </div>
                                    <div className="text-sm text-gray-500 font-roboto">
                                        {formatTime(selectedApt.appointment_date)} ({selectedApt.duration_minutes}m)
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center mb-1">
                                        <Stethoscope className="w-3.5 h-3.5 mr-1" /> Doctor
                                    </div>
                                    <div className="text-sm font-bold text-gray-900 dark:text-white font-roboto">
                                        {selectedApt.users?.full_name || 'System Assigned'}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Type</div>
                                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-[10px] font-bold uppercase font-roboto">
                                        {selectedApt.appointment_type.replace('_', ' ')}
                                    </span>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Status</div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-roboto ${
                                        selectedApt.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                        selectedApt.status === 'pending_confirmation' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-blue-100 text-blue-700'
                                    }`}>
                                        {selectedApt.status.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>

                            {selectedApt.notes && (
                                <div>
                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Notes</div>
                                    <div className="p-3 bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 italic font-roboto leading-relaxed">
                                        "{selectedApt.notes}"
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setShowDetailsModal(false)}
                            className="w-full mt-8 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg font-bold hover:bg-gray-50 dark:hover:bg-gray-700/50 transition font-roboto"
                        >
                            Close Details
                        </button>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {/* Day Appointments Overview Modal */}
            {dayModalDate && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[60] p-4" onClick={() => setDayModalDate(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 border border-gray-100 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-3">
                            <div>
                                <h3 className="font-extrabold text-base text-gray-900 dark:text-white font-roboto">
                                    Appointments
                                </h3>
                                <p className="text-xs text-gray-500 font-medium">
                                    {dayModalDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })} • {getAppointmentsForDay(dayModalDate.getDate()).length} total
                                </p>
                            </div>
                            <button onClick={() => setDayModalDate(null)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                            {getAppointmentsForDay(dayModalDate.getDate()).map(apt => (
                                <div
                                    key={apt.id}
                                    onClick={() => {
                                        setSelectedApt(apt);
                                        setShowDetailsModal(true);
                                        setDayModalDate(null);
                                    }}
                                    className="p-3 bg-gray-50 dark:bg-gray-900/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 border border-gray-100 dark:border-gray-700 rounded-xl cursor-pointer transition flex items-center justify-between group"
                                >
                                    <div>
                                        <span className="text-xs font-extrabold text-gray-900 dark:text-white uppercase block group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            {apt.patients?.full_name || 'Patient'}
                                        </span>
                                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono flex items-center gap-1 mt-0.5">
                                            <Clock className="w-3 h-3 text-gray-400" /> {formatTime(apt.appointment_date)} • Dr. {apt.users?.full_name || 'Staff'}
                                        </span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                        apt.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' :
                                        apt.status === 'pending_confirmation' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' :
                                        apt.status === 'treated' || apt.status === 'completed' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300' :
                                        apt.status === 'cancelled' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' :
                                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                                    }`}>
                                        {apt.status.replace('_', ' ')}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <button
                                onClick={() => setDayModalDate(null)}
                                className="px-3 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => {
                                    const dateStr = dayModalDate.toISOString().split('T')[0];
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
                                    setDayModalDate(null);
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
