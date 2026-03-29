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

            setSuccessMessage('Appointment scheduled successfully!');
            setShowSuccessModal(true);
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
                        onClick={() => setShowModal(true)}
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
                    <div className="flex space-x-2">
                        <button onClick={prevMonth} className="p-2 hover:bg-green-50 dark:hover:bg-green-900/10 rounded-lg transition-colors">
                            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button onClick={nextMonth} className="p-2 hover:bg-green-50 dark:hover:bg-green-900/10 rounded-lg transition-colors">
                            <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </button>
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
                        <div key={`empty-${i}`} className={`${compact ? 'h-24' : 'h-32'} border-b border-r border-gray-100 dark:border-gray-800 opacity-50`} />
                    ))}
                    {Array.from({ length: getDaysInMonth(currentMonth).daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day).toISOString().split('T')[0];
                        const isToday = dateStr === new Date().toISOString().split('T')[0];
                        const dayAppointments = getAppointmentsForDay(day);

                        return (
                            <div
                                key={day}
                                className={`${compact ? 'min-h-[6rem]' : 'min-h-[8rem]'} p-1.5 border-b border-r border-gray-100 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-800/50 transition-all relative group shadow-sm hover:shadow-md ${isToday ? 'bg-green-50/50 dark:bg-green-900/5' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`text-[11px] font-bold ${isToday ? 'bg-green-600 text-white w-5 h-5 flex items-center justify-center rounded-md shadow-sm' : 'text-gray-400'}`}>
                                        {day}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, appointment_date: `${dateStr}T09:00` }));
                                            setShowModal(true);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded text-green-600 dark:text-green-400 transition-opacity"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="space-y-0.5 max-h-[80%] overflow-hidden">
                                    {dayAppointments.map(apt => (
                                        <div
                                            key={apt.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedApt(apt);
                                                setShowDetailsModal(true);
                                            }}
                                            className={`text-[9px] p-1 rounded-sm border truncate cursor-pointer hover:scale-[1.02] transition-all font-roboto shadow-sm ${
                                                apt.status === 'confirmed' ? 'bg-green-50 border-green-100 text-green-700' :
                                                apt.status === 'pending_confirmation' ? 'bg-yellow-50 border-yellow-100 text-yellow-700' :
                                                apt.status === 'treated' || apt.status === 'completed' ? 'bg-blue-50 border-blue-100 text-blue-700' :
                                                apt.status === 'cancelled' ? 'bg-red-50 border-red-100 text-red-700' :
                                                'bg-gray-50 border-gray-100 text-gray-700'
                                            }`}
                                            title={`${formatTime(apt.appointment_date)} - ${apt.patients.full_name}`}
                                        >
                                            <span className="font-bold opacity-60 mr-1">{formatTime(apt.appointment_date).split(' ')[0]}</span>
                                            {apt.patients.full_name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Same modals as in AppointmentCalendar.tsx */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white font-roboto text-center flex-1">Schedule Appointment</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="space-y-4">
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

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date & Time</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.appointment_date}
                                        onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-green-500 font-roboto text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Type</label>
                                    <select
                                        value={formData.appointment_type}
                                        onChange={(e) => setFormData({ ...formData, appointment_type: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-green-500 font-roboto text-sm h-[42px]"
                                    >
                                        <option value="consultation">Consultation</option>
                                        <option value="follow_up">Follow-up</option>
                                        <option value="emergency">Emergency</option>
                                        <option value="procedure">Procedure</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Notes (Optional)</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-green-500 font-roboto text-sm"
                                    rows={2}
                                    placeholder="Add any special instructions..."
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-bold hover:from-green-700 hover:to-emerald-700 transition shadow-md font-roboto mt-4"
                            >
                                Schedule Visit
                            </button>
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
            {showSuccessModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200 shadow-2xl border border-green-100 dark:border-green-900/30">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 font-roboto">Success!</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6 font-roboto text-sm">{successMessage}</p>
                        <button
                            onClick={() => setShowSuccessModal(false)}
                            className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-bold hover:from-green-700 hover:to-emerald-700 transition shadow-md font-roboto"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
