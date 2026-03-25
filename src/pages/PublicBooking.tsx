import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    MapPin, CheckCircle, AlertCircle, Calendar, ShieldCheck, UserPlus, UserCheck, Search
} from 'lucide-react';

export function PublicBooking() {
    const [loading, setLoading] = useState(false);
    const [doctors, setDoctors] = useState<any[]>([]);
    const [availableSlots, setAvailableSlots] = useState<any[]>([]);
    const [success, setSuccess] = useState(false);
    const [isBookingEnabled, setIsBookingEnabled] = useState(true);
    const [honeypot, setHoneypot] = useState('');
    const [captcha, setCaptcha] = useState({ question: '', answer: 0 });
    const [captchaInput, setCaptchaInput] = useState('');

    // States
    const [patientStatus, setPatientStatus] = useState<'new' | 'registered'>('new');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    const [formData, setFormData] = useState({
        branch_id: '',
        doctor_id: '',
        slot_id: '',
        patient_id: '',
        patient_full_name: '',
        patient_phone: '',
        patient_email: '',
        patient_gender: 'male',
        patient_dob: '',
        appointment_type: 'consultation'
    });

    useEffect(() => {
        checkBookingStatus();
        loadDoctors();
        generateCaptcha();
    }, []);

    useEffect(() => {
        if (formData.doctor_id) {
            loadSlots(formData.doctor_id);
        } else {
            setAvailableSlots([]);
        }
    }, [formData.doctor_id, selectedDate]);

    const generateCaptcha = () => {
        const num1 = Math.floor(Math.random() * 5) + 2;
        const num2 = Math.floor(Math.random() * 5) + 2;
        setCaptcha({
            question: `${num1} + ${num2}`,
            answer: num1 + num2
        });
        setCaptchaInput('');
    };

    const checkBookingStatus = async () => {
        const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('setting_key', 'online_booking_enabled')
            .single();

        if (data && data.value === false) {
            setIsBookingEnabled(false);
        }
    };

    const loadDoctors = async () => {
        const { data } = await supabase
            .from('users')
            .select('id, full_name, branch_id, branches(name)')
            .eq('role', 'doctor')
            .eq('is_active', true);
        setDoctors(data || []);
    };

    const loadSlots = async (doctorId: string) => {
        const start = `${selectedDate}T00:00:00`;
        const end = `${selectedDate}T23:59:59`;

        const { data } = await supabase
            .from('appointment_slots')
            .select('*')
            .eq('doctor_id', doctorId)
            .eq('is_booked', false)
            .gte('start_time', start)
            .lte('start_time', end)
            .order('start_time', { ascending: true });

        setAvailableSlots(data || []);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.doctor_id || !formData.slot_id) {
            alert('Please select a doctor and a time.');
            return;
        }

        if (honeypot) {
            setSuccess(true);
            return;
        }

        if (parseInt(captchaInput) !== captcha.answer) {
            alert('Security puzzle incorrect.');
            generateCaptcha();
            return;
        }

        const submissionData = { ...formData };
        if (patientStatus === 'registered') {
            submissionData.patient_full_name = submissionData.patient_full_name || 'Registered Patient';
        }

        try {
            setLoading(true);
            const { error } = await supabase
                .from('online_bookings')
                .insert([submissionData]);

            if (error) throw error;
            setSuccess(true);
        } catch (error) {
            console.error('Submit error:', error);
            alert('Failed to book. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const containerStyle = {
        fontFamily: "'Roboto', sans-serif",
    };

    if (!isBookingEnabled) {
        return (
            <div style={containerStyle} className="min-h-screen bg-white flex items-center justify-center p-4">
                <style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');</style>
                <div className="max-w-xs w-full text-center border p-6 rounded-lg">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <h2 className="font-bold">Bookings Closed</h2>
                    <p className="text-gray-400 text-xs">Please contact the clinic directly.</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div style={containerStyle} className="min-h-screen bg-white flex items-center justify-center p-4">
                <style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');</style>
                <div className="max-w-xs w-full text-center border p-8 rounded-xl shadow-sm">
                    <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-4" />
                    <h2 className="text-lg font-bold">Booking Sent</h2>
                    <p className="text-gray-500 text-xs mb-6">We will call you shortly to confirm your visit.</p>
                    <button onClick={() => window.location.reload()} className="w-full py-2 bg-green-600 text-white rounded font-bold text-xs uppercase tracking-widest">Return</button>
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle} className="min-h-screen bg-[#FDFDFD] py-4 px-2">
            <style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&display=swap');</style>
            <div className="max-w-xl mx-auto border border-gray-100 rounded-xl bg-white shadow-lg p-4 sm:p-6">
                {/* Branded Header */}
                <div className="flex items-center gap-4 mb-6 border-b border-gray-50 pb-4">
                    <img src="/favicon.png" alt="Spiritmed" className="w-10 h-10" />
                    <div>
                        <h1 className="text-md font-black uppercase text-gray-900 tracking-tight leading-none">Appointment Booking</h1>
                        <p className="text-[10px] text-green-600 font-bold tracking-[0.2em] mt-1 uppercase">Spiritmed Healthcare</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Setup Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-gray-50">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-700 uppercase tracking-widest block">Choose Specialist</label>
                            <select
                                required
                                value={formData.doctor_id}
                                onChange={(e) => {
                                    const dr = doctors.find(d => d.id === e.target.value);
                                    setFormData({ ...formData, doctor_id: dr?.id || '', branch_id: dr?.branch_id || '', slot_id: '' });
                                }}
                                className="w-full px-3 py-1.5 border border-gray-200 rounded text-xs bg-gray-50 outline-none focus:ring-1 focus:ring-green-500 text-gray-900 font-medium"
                            >
                                <option value="">Select a Doctor</option>
                                {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-700 uppercase tracking-widest block">Patient Status</label>
                            <div className="flex gap-1 h-[32px]">
                                <button
                                    type="button"
                                    onClick={() => setPatientStatus('new')}
                                    className={`flex-1 rounded border text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${patientStatus === 'new' ? 'bg-green-600 border-green-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-green-100'}`}
                                >
                                    <UserPlus className="w-3 h-3" />
                                    New Patient
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPatientStatus('registered')}
                                    className={`flex-1 rounded border text-[10px] font-bold transition-all flex items-center justify-center gap-1 ${patientStatus === 'registered' ? 'bg-green-600 border-green-600 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-green-100'}`}
                                >
                                    <UserCheck className="w-3 h-3" />
                                    Already Registered
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Patient Details */}
                    <div className="py-2">
                        {patientStatus === 'new' ? (
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 animate-in fade-in duration-300">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-700 uppercase tracking-widest block">Full Patient Name</label>
                                    <input required type="text" placeholder="Full name..." className="w-full px-3 py-1.5 border border-gray-200 rounded text-xs outline-none focus:ring-1 focus:ring-green-500 text-gray-900" value={formData.patient_full_name} onChange={(e) => setFormData({ ...formData, patient_full_name: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-700 uppercase tracking-widest block">Phone Number</label>
                                    <input required type="tel" placeholder="+263..." className="w-full px-3 py-1.5 border border-gray-200 rounded text-xs outline-none focus:ring-1 focus:ring-green-500 text-gray-900" value={formData.patient_phone} onChange={(e) => setFormData({ ...formData, patient_phone: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-700 uppercase tracking-widest block">Email Address</label>
                                    <input type="email" placeholder="Optional email" className="w-full px-3 py-1.5 border border-gray-200 rounded text-xs outline-none focus:ring-1 focus:ring-green-500 text-gray-900" value={formData.patient_email} onChange={(e) => setFormData({ ...formData, patient_email: e.target.value })} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-700 uppercase tracking-widest block">Date of Birth / Gender</label>
                                    <div className="flex gap-1">
                                        <input required type="date" className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900 outline-none" value={formData.patient_dob} onChange={(e) => setFormData({ ...formData, patient_dob: e.target.value })} />
                                        <select className="px-2 py-1.5 border border-gray-200 rounded text-xs bg-white text-gray-900" value={formData.patient_gender} onChange={(e) => setFormData({ ...formData, patient_gender: e.target.value })}>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="animate-in fade-in duration-300">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-700 uppercase tracking-widest block">Search Patient ID</label>
                                    <div className="relative">
                                        <input required type="text" placeholder="E.g. P1000" className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded text-xs bg-green-50/20 font-bold outline-none border-green-200 text-gray-900" value={formData.patient_id} onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })} />
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-green-600" />
                                    </div>
                                </div>
                                <p className="text-[9px] text-gray-400 mt-2 italic">Use the ID assigned to you during your previous visit.</p>
                            </div>
                        )}
                    </div>

                    {/* Schedule Section */}
                    <div className="py-3 border-t border-gray-50">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-bold text-gray-700 uppercase tracking-widest block">Choose Available Time Slot</label>
                            <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                <input
                                    type="date"
                                    min={new Date().toISOString().split('T')[0]}
                                    className="bg-transparent text-[10px] font-bold outline-none cursor-pointer"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {formData.doctor_id ? (
                            availableSlots.length === 0 ? (
                                <p className="text-[10px] text-gray-400 italic text-center py-4 bg-gray-25 rounded border border-dashed border-gray-100 leading-relaxed">
                                    No slots found for {new Date(selectedDate).toLocaleDateString()}<br />
                                    Please try another date.
                                </p>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto pr-1">
                                    {availableSlots.map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, slot_id: s.id })}
                                            className={`p-1.5 text-center border rounded transition-all ${formData.slot_id === s.id ? 'bg-green-600 border-green-600 text-white font-bold shadow-md' : 'bg-white border-gray-100 text-gray-700 hover:border-green-100 text-[11px]'}`}
                                        >
                                            {new Date(s.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                        </button>
                                    ))}
                                </div>
                            )
                        ) : (
                            <div className="py-4 text-center border border-dashed border-gray-100 rounded-lg">
                                <p className="text-[10px] text-gray-300 font-medium">Please select a specialist above to view their schedule.</p>
                            </div>
                        )}
                    </div>

                    {/* Security & Action */}
                    <div className="flex gap-3 items-center pt-2">
                        <div className="bg-gray-50 px-3 py-1.5 rounded border border-gray-100 flex items-center gap-3">
                            <div className="hidden"><input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></div>
                            <span className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">{captcha.question} =</span>
                            <input required type="number" className="w-12 px-1 py-1 border border-gray-200 rounded text-xs text-center font-bold text-gray-900 outline-none focus:ring-1 focus:ring-green-500" value={captchaInput} onChange={(e) => setCaptchaInput(e.target.value)} />
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !formData.slot_id || !captchaInput}
                            className="flex-1 py-2.5 bg-green-600 text-white rounded font-black text-[10px] uppercase tracking-[0.1em] hover:bg-green-700 disabled:opacity-50 transition-all shadow-md active:scale-95"
                        >
                            {loading ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin mx-auto" /> : 'Confirm Selection'}
                        </button>
                    </div>
                </form>

                <div className="mt-8 pt-4 border-t border-gray-50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">
                        © {new Date().getFullYear()} Spiritmed Healthcare Services
                    </p>
                    <a href="/login" className="text-[10px] font-bold text-green-600 hover:text-green-700 transition-colors uppercase tracking-widest">
                        Login portal
                    </a>
                </div>
            </div>
        </div>
    );
}
