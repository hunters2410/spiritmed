import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Check, X, User, Phone, Mail, Calendar,
    MapPin, Clock, Search, Copy
} from 'lucide-react';

interface OnlineBooking {
    id: string;
    patient_full_name: string;
    patient_phone: string;
    patient_email: string;
    patient_gender: string;
    patient_dob: string;
    appointment_type: string;
    status: string;
    created_at: string;
    branch_id: string;
    doctor_id: string;
    slot_id: string;
    branches: { name: string };
    users: { full_name: string };
    appointment_slots: { start_time: string };
}

export function OnlineBookings() {
    const { profile } = useAuth();
    const [bookings, setBookings] = useState<OnlineBooking[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isBookingEnabled, setIsBookingEnabled] = useState(true);
    const [dateFilters, setDateFilters] = useState({
        startDate: '',
        endDate: ''
    });

    useEffect(() => {
        loadBookings();
        checkSettings();
    }, [profile, dateFilters]);

    const checkSettings = async () => {
        const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('setting_key', 'online_booking_enabled')
            .single();
        if (data) setIsBookingEnabled(data.value);
    };

    const toggleBookingEnabled = async () => {
        try {
            const newValue = !isBookingEnabled;
            const { error } = await supabase
                .from('system_settings')
                .update({ value: newValue })
                .eq('setting_key', 'online_booking_enabled');
            if (error) throw error;
            setIsBookingEnabled(newValue);
        } catch (error) {
            console.error('Error toggling booking:', error);
            alert('Failed to update setting');
        }
    };

    const loadBookings = async () => {
        if (!profile) return;
        try {
            setLoading(true);
            let query = supabase
                .from('online_bookings')
                .select(`
                  *,
                  branches:branch_id (name),
                  users:doctor_id (full_name),
                  appointment_slots:slot_id (start_time)
                `)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (dateFilters.startDate) query = query.gte('created_at', dateFilters.startDate);
            if (dateFilters.endDate) query = query.lte('created_at', dateFilters.endDate + 'T23:59:59');

            if (profile.role !== 'super_admin') {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setBookings(data || []);
        } catch (error) {
            console.error('Error loading bookings:', error);
        } finally {
            setLoading(false);
        }
    };

    const generatePatientNumber = () => {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `P${timestamp}${random}`;
    };

    const handleApprove = async (booking: OnlineBooking) => {
        try {
            setProcessingId(booking.id);

            // 1. Check if patient exists by phone
            let patientId: string;
            const { data: existingPatient } = await supabase
                .from('patients')
                .select('id')
                .eq('phone', booking.patient_phone)
                .maybeSingle();

            if (existingPatient) {
                patientId = existingPatient.id;
            } else {
                // Create new patient
                const { data: newPatient, error: pError } = await supabase
                    .from('patients')
                    .insert([{
                        full_name: booking.patient_full_name,
                        phone: booking.patient_phone,
                        email: booking.patient_email,
                        gender: booking.patient_gender,
                        date_of_birth: booking.patient_dob,
                        branch_id: booking.branch_id,
                        patient_number: generatePatientNumber(),
                        status: 'active'
                    }])
                    .select()
                    .single();

                if (pError) throw pError;
                patientId = newPatient.id;
            }

            // 2. Create appointment
            const { data: appointment, error: aError } = await supabase
                .from('appointments')
                .insert([{
                    branch_id: booking.branch_id,
                    patient_id: patientId,
                    doctor_id: booking.doctor_id,
                    appointment_date: booking.appointment_slots.start_time,
                    appointment_type: booking.appointment_type,
                    status: 'confirmed'
                }])
                .select()
                .single();

            if (aError) throw aError;

            // 3. Mark slot as booked
            await supabase
                .from('appointment_slots')
                .update({ is_booked: true, appointment_id: appointment.id })
                .eq('id', booking.slot_id);

            // 4. Update booking status
            await supabase
                .from('online_bookings')
                .update({ status: 'approved' })
                .eq('id', booking.id);

            setBookings(bookings.filter(b => b.id !== booking.id));
            alert('Booking approved and appointment created!');
        } catch (error) {
            console.error('Error approving booking:', error);
            alert('Failed to approve booking.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (id: string) => {
        if (!confirm('Are you sure you want to reject this booking?')) return;
        try {
            setProcessingId(id);
            const { error } = await supabase
                .from('online_bookings')
                .update({ status: 'rejected' })
                .eq('id', id);

            if (error) throw error;
            setBookings(bookings.filter(b => b.id !== id));
        } catch (error) {
            console.error('Error rejecting booking:', error);
            alert('Failed to reject booking.');
        } finally {
            setProcessingId(null);
        }
    };

    const copyBookingLink = () => {
        const url = `${window.location.origin}/book`;
        navigator.clipboard.writeText(url);
        alert('Booking link copied to clipboard!');
    };

    const filteredBookings = bookings.filter(b =>
        b.patient_full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.patient_phone.includes(searchTerm)
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Online Bookings</h1>
                    <p className="text-gray-600">Review and approve patient appointment requests</p>
                </div>
                <div className="flex items-center space-x-4">
                    <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${isBookingEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        <div className={`w-2 h-2 rounded-full animate-pulse ${isBookingEnabled ? 'bg-green-600' : 'bg-red-600'}`} />
                        <span>{isBookingEnabled ? 'Booking Active' : 'Booking Disabled'}</span>
                    </div>
                    {profile?.role === 'super_admin' && (
                        <button
                            onClick={toggleBookingEnabled}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm border ${isBookingEnabled ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'}`}
                        >
                            {isBookingEnabled ? 'Disable Booking Link' : 'Enable Booking Link'}
                        </button>
                    )}
                    <button
                        onClick={copyBookingLink}
                        className="flex items-center justify-center space-x-2 bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition shadow-sm text-sm font-medium"
                    >
                        <Copy className="w-4 h-4" />
                        <span>Copy Public Booking Link</span>
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex flex-wrap items-center gap-4">
                    <div className="relative max-w-md flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by name or phone..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                            <span className="text-xs font-bold text-gray-400 uppercase">From</span>
                            <input
                                type="date"
                                className="text-sm outline-none bg-transparent"
                                value={dateFilters.startDate}
                                onChange={(e) => setDateFilters({ ...dateFilters, startDate: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                            <span className="text-xs font-bold text-gray-400 uppercase">To</span>
                            <input
                                type="date"
                                className="text-sm outline-none bg-transparent"
                                value={dateFilters.endDate}
                                onChange={(e) => setDateFilters({ ...dateFilters, endDate: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                                <th className="px-6 py-4">Patient Details</th>
                                <th className="px-6 py-4">Appointment Info</th>
                                <th className="px-6 py-4">Booked At</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredBookings.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        No pending online bookings found.
                                    </td>
                                </tr>
                            ) : filteredBookings.map((booking) => (
                                <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="space-y-1">
                                            <div className="font-bold text-gray-900">{booking.patient_full_name}</div>
                                            <div className="flex items-center text-sm text-gray-500 gap-2">
                                                <Phone className="w-3 h-3 text-green-600" />
                                                {booking.patient_phone}
                                            </div>
                                            {booking.patient_email && (
                                                <div className="flex items-center text-sm text-gray-500 gap-2">
                                                    <Mail className="w-3 h-3 text-blue-600" />
                                                    {booking.patient_email}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center text-sm font-medium text-gray-900 gap-2">
                                                <Calendar className="w-3 h-3 text-indigo-600" />
                                                {new Date(booking.appointment_slots?.start_time).toLocaleDateString()}
                                                <Clock className="w-3 h-3 text-indigo-600 ml-1" />
                                                {new Date(booking.appointment_slots?.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className="flex items-center text-sm text-gray-500 gap-2">
                                                <MapPin className="w-3 h-3 text-red-500" />
                                                {booking.branches?.name}
                                            </div>
                                            <div className="flex items-center text-sm text-gray-500 gap-2">
                                                <User className="w-3 h-3 text-green-600" />
                                                Dr. {booking.users?.full_name}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900">
                                            {new Date(booking.created_at).toLocaleDateString()}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {new Date(booking.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold uppercase">
                                            {booking.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            <button
                                                onClick={() => handleApprove(booking)}
                                                disabled={processingId === booking.id}
                                                className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition"
                                                title="Approve"
                                            >
                                                <Check className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => handleReject(booking.id)}
                                                disabled={processingId === booking.id}
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                                                title="Reject"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
}
