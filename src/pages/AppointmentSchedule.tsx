import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Save, Calendar, Clock, User, Check, Trash2, PlusCircle } from 'lucide-react';

/** Converts a Date to a local YYYY-MM-DD string, avoiding UTC offset issues.
 *  e.g. in UTC+2, `new Date().toISOString()` at 23:30 returns yesterday's date. */
const toLocalDateStr = (date: Date): string =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');

export function AppointmentSchedule() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [selectedDoctor, setSelectedDoctor] = useState('');

    const [holidays, setHolidays] = useState<any[]>([]);
    const [newHoliday, setNewHoliday] = useState({ name: '', date: '' });
    const [generatedSlots, setGeneratedSlots] = useState<any[]>([]);
    const [slotSummary, setSlotSummary] = useState<Record<string, number>>({});

    const [scheduleConfig, setScheduleConfig] = useState<{
        daysOfWeek: Record<number, boolean>;
        startTime: string;
        endTime: string;
        duration: number;
    }>({
        daysOfWeek: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
        startTime: '09:00',
        endTime: '17:00',
        duration: 30
    });

    useEffect(() => {
        if (selectedDoctor) {
            loadAvailability(selectedDoctor);
            loadGeneratedSlots(selectedDoctor);
        }
    }, [selectedDoctor]);

    const loadAvailability = async (doctorId: string) => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('doctor_availability')
                .select('*')
                .eq('doctor_id', doctorId);

            if (error) throw error;

            if (data && data.length > 0) {
                // Map database records to state
                const daysMap: Record<number, boolean> = { ...scheduleConfig.daysOfWeek };
                // Reset/init days
                Object.keys(daysMap).forEach(key => daysMap[parseInt(key)] = false);

                // Take the first record for general time settings
                const firstRecord = data[0];

                data.forEach(record => {
                    daysMap[record.day_of_week] = record.is_active;
                });

                setScheduleConfig({
                    daysOfWeek: daysMap as any,
                    startTime: firstRecord.start_time.slice(0, 5),
                    endTime: firstRecord.end_time.slice(0, 5),
                    duration: firstRecord.slot_duration
                });
            } else {
                // Reset to default if no availability found
                setScheduleConfig({
                    daysOfWeek: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
                    startTime: '09:00',
                    endTime: '17:00',
                    duration: 30
                });
            }
        } catch (error) {
            console.error('Error loading availability:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadGeneratedSlots = async (doctorId: string) => {
        try {
            const today = toLocalDateStr(new Date()); // local date, not UTC
            const { data, error } = await supabase
                .from('appointment_slots')
                .select('slot_date, is_booked')
                .eq('doctor_id', doctorId)
                .gte('slot_date', today)
                .order('slot_date', { ascending: true });

            if (error) throw error;

            // Group by date
            const summary: Record<string, number> = {};
            data?.forEach(slot => {
                const dateS = slot.slot_date;
                summary[dateS] = (summary[dateS] || 0) + 1;
            });

            setGeneratedSlots(data || []);
            setSlotSummary(summary);
        } catch (error) {
            console.error('Error loading slots:', error);
        }
    };

    const clearUpcomingSlots = async () => {
        if (!selectedDoctor) return;
        if (!confirm('Are you sure you want to delete all future unbooked slots for this doctor?')) return;

        try {
            setLoading(true);
            const today = new Date().toISOString().split('T')[0];
            const { error } = await supabase
                .from('appointment_slots')
                .delete()
                .eq('doctor_id', selectedDoctor)
                .is('is_booked', false)
                .gte('slot_date', today);

            if (error) throw error;
            alert('Successfully cleared future unbooked slots.');
            loadGeneratedSlots(selectedDoctor);
        } catch (error) {
            console.error('Error clearing slots:', error);
            alert('Failed to clear slots.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDoctors();
        loadHolidays();
    }, [profile]);

    const loadHolidays = async () => {
        if (!profile?.branch_id) return;
        const { data, error } = await supabase
            .from('holidays')
            .select('*')
            .eq('branch_id', profile.branch_id)
            .order('holiday_date', { ascending: true });

        if (!error) setHolidays(data || []);
    };

    const addHoliday = async () => {
        if (!newHoliday.name || !newHoliday.date) return;
        try {
            const { error } = await supabase
                .from('holidays')
                .insert([{
                    name: newHoliday.name,
                    holiday_date: newHoliday.date,
                    branch_id: profile?.branch_id
                }]);

            if (error) throw error;
            setNewHoliday({ name: '', date: '' });
            loadHolidays();
        } catch (error) {
            console.error('Error adding holiday:', error);
            alert('Failed to add holiday');
        }
    };

    const deleteHoliday = async (id: string) => {
        try {
            const { error } = await supabase
                .from('holidays')
                .delete()
                .eq('id', id);

            if (error) throw error;
            loadHolidays();
        } catch (error) {
            console.error('Error deleting holiday:', error);
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

        // Auto-select current user if they are a doctor
        if (profile.role === 'doctor') {
            setSelectedDoctor(profile.id);
        }
    };

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const handleDayToggle = (index: number) => {
        setScheduleConfig(prev => ({
            ...prev,
            daysOfWeek: { ...prev.daysOfWeek, [index]: !prev.daysOfWeek[index] }
        }));
    };

    const generateSlots = async () => {
        if (!selectedDoctor) {
            alert('Please select a doctor');
            return;
        }

        setLoading(true);
        try {
            // 1. Save ALL 7 days to doctor_availability with correct is_active flag (Bug 9)
            //    Unchecked days are explicitly deactivated rather than left stale in the DB.
            const availabilityUpserts = Array.from({ length: 7 }, (_, i) => ({
                doctor_id: selectedDoctor,
                branch_id: profile?.branch_id,
                day_of_week: i,
                start_time: scheduleConfig.startTime,
                end_time: scheduleConfig.endTime,
                break_start_time: null,
                break_end_time: null,
                slot_duration: scheduleConfig.duration,
                is_active: scheduleConfig.daysOfWeek[i]
            }));

            const { error: configError } = await supabase
                .from('doctor_availability')
                .upsert(availabilityUpserts, { onConflict: 'doctor_id,day_of_week' });
            if (configError) throw configError;

            // 2. Clear all future unbooked slots before regenerating (Bug 3)
            //    Prevents stale slots from schedule changes accumulating in the DB.
            const todayStr = toLocalDateStr(new Date());
            const { error: clearError } = await supabase
                .from('appointment_slots')
                .delete()
                .eq('doctor_id', selectedDoctor)
                .is('is_booked', false)
                .gte('slot_date', todayStr);
            if (clearError) throw clearError;

            // 3. Generate fresh slots
            const slots: any[] = [];

            // Bug 2 fix: start from midnight local time, not current moment
            const now = new Date();
            let currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            const endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + 90);

            const holidayDates = new Set(holidays.map(h => h.holiday_date));

            while (currentDate <= endDate) {
                // Bug 1 fix: use local date, not UTC via toISOString()
                const dateStr = toLocalDateStr(currentDate);
                const dayOfWeek = currentDate.getDay();

                if (scheduleConfig.daysOfWeek[dayOfWeek] && !holidayDates.has(dateStr)) {
                    let slotTime = new Date(`${dateStr}T${scheduleConfig.startTime}:00`);
                    const dayEndTime = new Date(`${dateStr}T${scheduleConfig.endTime}:00`);

                    while (slotTime < dayEndTime) {
                        const slotEndTime = new Date(slotTime.getTime() + scheduleConfig.duration * 60000);
                        if (slotEndTime > dayEndTime) break;

                        // Bug 11 fix: skip time slots that have already passed today
                        if (slotTime > now) {
                            slots.push({
                                doctor_id: selectedDoctor,
                                branch_id: profile?.branch_id,
                                slot_date: dateStr,
                                start_time: slotTime.toISOString(),
                                end_time: slotEndTime.toISOString(),
                                is_booked: false
                            });
                        }

                        slotTime = new Date(slotEndTime.getTime()); // Bug 2: immutable increment
                    }
                }

                // Bug 2 fix: immutable date increment (no in-place mutation)
                currentDate = new Date(currentDate.getTime() + 86400000);
            }

            if (slots.length > 0) {
                // Simple insert — stale slots cleared above, no duplicates possible
                const { error: slotsError } = await supabase
                    .from('appointment_slots')
                    .insert(slots);

                if (slotsError) throw slotsError;
                alert(`Successfully saved schedule and generated ${slots.length} slots!`);
                loadGeneratedSlots(selectedDoctor);
            } else {
                alert('Schedule saved. No upcoming slots were generated — check your day selection and time range.');
            }

        } catch (error) {
            console.error('Error generating slots:', error);
            alert('Failed to save schedule or generate slots. Please ensure the database tables are set up correctly.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Appointment Schedule</h1>
                    <p className="text-gray-600 mt-1">Configure doctor availability and generate appointment slots</p>
                </div>
                <button
                    onClick={generateSlots}
                    disabled={loading}
                    className="flex items-center space-x-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2 rounded-lg hover:from-green-700 hover:to-emerald-700 transition shadow-md disabled:opacity-50"
                >
                    {loading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    ) : (
                        <Save className="w-5 h-5" />
                    )}
                    <span>Generate Schedule</span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Configuration Panel */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <User className="w-5 h-5 mr-2 text-gray-500" />
                            Doctor Selection
                        </h2>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Select Doctor</label>
                            <select
                                value={selectedDoctor}
                                onChange={(e) => setSelectedDoctor(e.target.value)}
                                disabled={profile?.role === 'doctor'}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                            >
                                <option value="">Select a doctor...</option>
                                {doctors.map((doctor) => (
                                    <option key={doctor.id} value={doctor.id}>
                                        {doctor.full_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                            Days of Operation
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {dayNames.map((day, index) => (
                                <button
                                    key={day}
                                    onClick={() => handleDayToggle(index)}
                                    className={`flex items-center justify-center p-3 rounded-lg border transition ${
                                        scheduleConfig.daysOfWeek[index]
                                            ? 'bg-green-50 border-green-200 text-green-700'
                                            : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                                        }`}
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center mr-2 ${
                                        scheduleConfig.daysOfWeek[index] ? 'bg-green-500 border-green-500' : 'border-gray-400'
                                        }`}>
                                        {scheduleConfig.daysOfWeek[index] && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="font-medium">{day}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Clock className="w-5 h-5 mr-2 text-gray-500" />
                            Time Configuration
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Shift Start Time</label>
                                <input
                                    type="time"
                                    value={scheduleConfig.startTime}
                                    onChange={(e) => setScheduleConfig({ ...scheduleConfig, startTime: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Shift End Time</label>
                                <input
                                    type="time"
                                    value={scheduleConfig.endTime}
                                    onChange={(e) => setScheduleConfig({ ...scheduleConfig, endTime: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Slot Duration (minutes)</label>
                                <input
                                    type="number"
                                    value={scheduleConfig.duration}
                                    onChange={(e) => setScheduleConfig({ ...scheduleConfig, duration: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                    min="5"
                                    step="5"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                                <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                                Current Appointment Slots
                            </h2>
                            <button
                                onClick={clearUpcomingSlots}
                                disabled={loading || !selectedDoctor}
                                className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                            >
                                Clear Upcoming Slots
                            </button>
                        </div>

                        <div className="max-h-96 overflow-y-auto border border-gray-100 rounded-lg">
                            <table className="w-full text-sm text-left border-collapse border border-gray-200 dark:border-gray-700">
                                <thead className="bg-gray-50 text-gray-600 font-medium whitespace-nowrap">
                                    <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Day</th>
                                        <th className="px-4 py-3">Available Slots</th>
                                        <th className="px-4 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {Object.entries(slotSummary).map(([date, count]) => {
                                        const dateObj = new Date(date);
                                        const dayName = dayNames[dateObj.getDay()];

                                        return (
                                            <tr key={date} className="hover:bg-gray-100 transition-colors">
                                                <td className="px-4 py-3 font-medium text-gray-900">{date}</td>
                                                <td className="px-4 py-3 text-gray-600 font-roboto">{dayName}</td>
                                                <td className="px-4 py-3">
                                                    <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold font-roboto">
                                                        {count} Slots
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="flex items-center text-green-600 font-medium text-xs">
                                                        <Check className="w-3 h-3 mr-1" />
                                                        Active
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {Object.keys(slotSummary).length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-12 text-center text-gray-400 italic">
                                                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                                No slots generated yet. Pick your days and click "Generate Schedule".
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Calendar className="w-5 h-5 mr-2 text-gray-500" />
                            Holiday Management
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name</label>
                                <input
                                    type="text"
                                    value={newHoliday.name}
                                    onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                                    placeholder="e.g. Christmas Day"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                <div className="flex space-x-2">
                                    <input
                                        type="date"
                                        value={newHoliday.date}
                                        onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    />
                                    <button
                                        onClick={addHoliday}
                                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition flex items-center space-x-1"
                                    >
                                        <PlusCircle className="w-5 h-5" />
                                        <span>Add</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <h3 className="text-sm font-medium text-gray-700 mb-3">Planned Holidays</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {holidays.map((holiday) => (
                                    <div key={holiday.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-lg">
                                        <div>
                                            <div className="font-medium text-red-900">{holiday.name}</div>
                                            <div className="text-xs text-red-600">{new Date(holiday.holiday_date).toLocaleDateString()}</div>
                                        </div>
                                        <button
                                            onClick={() => deleteHoliday(holiday.id)}
                                            className="p-1.5 text-red-400 hover:text-red-600 transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {holidays.length === 0 && (
                                    <div className="col-span-full text-center py-4 text-gray-500 italic text-sm">
                                        No holidays added yet
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Summary Panel */}
                <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                                <div className="text-sm text-blue-800 font-medium italic">Automatic Generation</div>
                                <div className="text-xs text-blue-600 mt-1">
                                    Scheduling now generates slots for the next 90 days based on your weekly configuration, automatically skipping defined holidays.
                                </div>
                            </div>

                            <div className="border-t border-gray-200 pt-4">
                                <h3 className="text-sm font-medium text-gray-900 mb-2">Selected Days</h3>
                                <div className="flex flex-wrap gap-2">
                                    {dayNames.filter((_, i) => scheduleConfig.daysOfWeek[i]).map(day => (
                                        <span key={day} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                            {day.slice(0, 3)}
                                        </span>
                                    ))}
                                    {dayNames.filter((_, i) => scheduleConfig.daysOfWeek[i]).length === 0 && (
                                        <span className="text-xs text-gray-500 italic">No days selected</span>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-gray-200 pt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-gray-600">Working Hours</span>
                                    <span className="text-sm font-medium text-gray-900">{scheduleConfig.startTime} - {scheduleConfig.endTime}</span>
                                </div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-gray-600">Slot Duration</span>
                                    <span className="text-sm font-medium text-gray-900">{scheduleConfig.duration} mins</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Est. Slots/Day</span>
                                    {/* Rough calculation */}
                                    <span className="text-sm font-medium text-gray-900">
                                        {Math.floor(((
                                            (new Date(`2000-01-01T${scheduleConfig.endTime}`).getTime() - new Date(`2000-01-01T${scheduleConfig.startTime}`).getTime())
                                        ) / 60000) / scheduleConfig.duration)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
