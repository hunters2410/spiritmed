import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';

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

export function AppointmentCalendar() {
    const { profile } = useAuth();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [patients, setPatients] = useState<any[]>([]);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [formData, setFormData] = useState({
        patient_id: '',
        doctor_id: '',
        appointment_date: '',
        duration_minutes: 30,
        appointment_type: 'consultation',
        notes: '',
        status: 'pending_confirmation'
    });

    useEffect(() => {
        loadAppointments();
        loadPatients();
        loadDoctors();
    }, [profile, currentMonth]);

    const loadAppointments = async () => {
        if (!profile?.branch_id && profile?.role !== 'super_admin') return;

        try {
            let query = supabase
                .from('appointments')
                .select(`
          *,
          patients (full_name, phone),
          users:doctor_id (full_name)
        `);

            // Always load for the current month in calendar view
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString();
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString();
            query = query
                .gte('appointment_date', startOfMonth)
                .lte('appointment_date', endOfMonth);

            query = query.order('appointment_date', { ascending: true });

            if (profile.role !== 'super_admin') {
                query = query.eq('branch_id', profile.branch_id);
            }

            if (profile.role === 'doctor') {
                query = query.eq('doctor_id', profile.id);
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
            const { error } = await supabase
                .from('appointments')
                .insert([{
                    ...formData,
                    branch_id: profile?.branch_id,
                    created_by: profile?.id,
                    status: 'pending_confirmation'
                }]);

            if (error) throw error;

            setShowModal(false);
            setFormData({
                patient_id: '',
                doctor_id: '',
                appointment_date: '',
                duration_minutes: 30,
                appointment_type: 'consultation',
                notes: '',
                status: 'pending_confirmation'
            });
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
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Appointment Calendar</h1>
                    <p className="text-gray-600 mt-1">View and manage appointments in calendar view</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2 rounded-lg hover:from-green-700 hover:to-emerald-700 transition shadow-md"
                >
                    <Plus className="w-5 h-5" />
                    <span>New Appointment</span>
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h2>
                    <div className="flex space-x-2">
                        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-7 border-b border-gray-200">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="py-2 text-center text-sm font-semibold text-gray-600 border-r last:border-r-0">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-fr bg-gray-50">
                    {Array.from({ length: getDaysInMonth(currentMonth).firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-32 border-b border-r border-gray-200 bg-gray-50" />
                    ))}
                    {Array.from({ length: getDaysInMonth(currentMonth).daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toISOString().split('T')[0];
                        const isToday = dateStr === new Date().toISOString().split('T')[0];
                        const dayAppointments = getAppointmentsForDay(day);

                        return (
                            <div
                                key={day}
                                className={`min-h-[8rem] p-2 border-b border-r border-gray-200 hover:bg-white transition relative group ${isToday ? 'bg-blue-50' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-sm font-medium ${isToday ? 'bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full' : 'text-gray-700'}`}>
                                        {day}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, appointment_date: `${dateStr}T09:00` }));
                                            setShowModal(true);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded text-green-600"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    {dayAppointments.map(apt => (
                                        <div
                                            key={apt.id}
                                            className={`text-xs p-1.5 rounded border truncate cursor-pointer ${apt.status === 'confirmed' ? 'bg-green-100 border-green-200 text-green-800' :
                                                apt.status === 'pending_confirmation' ? 'bg-yellow-100 border-yellow-200 text-yellow-800' :
                                                    apt.status === 'treated' || apt.status === 'completed' ? 'bg-blue-100 border-blue-200 text-blue-800' :
                                                        apt.status === 'cancelled' ? 'bg-red-100 border-red-200 text-red-800' :
                                                            'bg-gray-100 border-gray-200 text-gray-800'
                                                }`}
                                            title={`${formatTime(apt.appointment_date)} - ${apt.patients.full_name} (${apt.status === 'treated' ? 'Treated' : apt.status.replace('_', ' ')})${apt.status === 'cancelled' && (apt as any).cancellation_reason ? ` - Reason: ${(apt as any).cancellation_reason}` : ''}`}
                                        >
                                            <span className="font-semibold">{formatTime(apt.appointment_date)}</span> {apt.patients.full_name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-md w-full p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Schedule New Appointment</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Patient</label>
                                <select
                                    value={formData.patient_id}
                                    onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                    required
                                >
                                    <option value="">Select Patient</option>
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                                <input
                                    type="datetime-local"
                                    value={formData.appointment_date}
                                    onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                    required
                                />
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
                                    rows={3}
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
        </div>
    );
}
