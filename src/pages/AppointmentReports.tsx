import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import {
    Calendar, Users, CheckCircle, XCircle, Clock,
    Download, TrendingUp, PieChart as PieChartIcon
} from 'lucide-react';

interface AppointmentReport {
    id: string;
    status: string;
    appointment_date: string;
    appointment_type: string;
    doctor_id: string;
    branch_id: string;
    users: any;
}

export function AppointmentReports() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AppointmentReport[]>([]);
    const [doctors, setDoctors] = useState<{ id: string; full_name: string }[]>([]);
    const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
    const [filters, setFilters] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        doctorId: 'all',
        branchId: profile?.branch_id || 'all'
    });

    useEffect(() => {
        loadInitialData();
    }, [profile]);

    useEffect(() => {
        fetchReportData();
    }, [filters]);

    const loadInitialData = async () => {
        try {
            const { data: doctorsData } = await supabase
                .from('users')
                .select('id, full_name')
                .eq('role', 'doctor');

            const { data: branchesData } = await supabase
                .from('branches')
                .select('id, name');

            setDoctors(doctorsData || []);
            setBranches(branchesData || []);
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    };

    const fetchReportData = async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('appointments')
                .select('id, status, appointment_date, appointment_type, doctor_id, branch_id, users:doctor_id(full_name)');

            if (filters.startDate) query = query.gte('appointment_date', filters.startDate);
            if (filters.endDate) query = query.lte('appointment_date', filters.endDate + 'T23:59:59');
            if (filters.doctorId !== 'all') query = query.eq('doctor_id', filters.doctorId);
            if (filters.branchId !== 'all') query = query.eq('branch_id', filters.branchId);

            const { data: appointments, error } = await query;
            if (error) throw error;
            setData(appointments || []);
        } catch (error) {
            console.error('Error fetching report data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Metrics calculation
    const metrics = {
        total: data.length,
        treated: data.filter(a => a.status === 'treated').length,
        cancelled: data.filter(a => a.status === 'cancelled').length,
        confirmed: data.filter(a => a.status === 'confirmed').length,
        pending: data.filter(a => a.status === 'pending_confirmation').length
    };

    // Chart data: Status distribution
    const statusData = [
        { name: 'Treated', value: metrics.treated, color: '#10B981' },
        { name: 'Cancelled', value: metrics.cancelled, color: '#EF4444' },
        { name: 'Confirmed', value: metrics.confirmed, color: '#3B82F6' },
        { name: 'Pending', value: metrics.pending, color: '#F59E0B' }
    ].filter(i => i.value > 0);

    // Chart data: Daily trends
    const dailyData = data.reduce((acc: any[], curr) => {
        const date = new Date(curr.appointment_date).toLocaleDateString();
        const existing = acc.find(i => i.date === date);
        if (existing) {
            existing.count += 1;
        } else {
            acc.push({ date, count: 1 });
        }
        return acc;
    }, []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Chart data: Appointments by Doctor
    const doctorData = data.reduce((acc: any[], curr) => {
        let doctorName = 'Unknown';
        if (curr.users) {
            doctorName = Array.isArray(curr.users)
                ? (curr.users[0]?.full_name || 'Unknown')
                : (curr.users.full_name || 'Unknown');
        }
        const existing = acc.find(i => i.name === doctorName);
        if (existing) {
            existing.count += 1;
        } else {
            acc.push({ name: doctorName, count: 1 });
        }
        return acc;
    }, []).sort((a, b) => b.count - a.count).slice(0, 10);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Appointment Reports</h1>
                    <p className="text-gray-600">Analytics and summary reports for your branch</p>
                </div>
                <button
                    onClick={() => window.print()}
                    className="flex items-center space-x-2 bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    <span>Export PDF</span>
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">From</label>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">To</label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        />
                    </div>
                    {profile?.role === 'super_admin' && (
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-500 uppercase">Branch</label>
                            <select
                                value={filters.branchId}
                                onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}
                                className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                            >
                                <option value="all">All Branches</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-500 uppercase">Doctor</label>
                        <select
                            value={filters.doctorId}
                            onChange={(e) => setFilters({ ...filters, doctorId: e.target.value })}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                        >
                            <option value="all">All Doctors</option>
                            {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                    { label: 'Total', value: metrics.total, icon: Calendar, color: 'blue' },
                    { label: 'Treated', value: metrics.treated, icon: CheckCircle, color: 'green' },
                    { label: 'Cancelled', value: metrics.cancelled, icon: XCircle, color: 'red' },
                    { label: 'Confirmed', value: metrics.confirmed, icon: TrendingUp, color: 'indigo' },
                    { label: 'Pending', value: metrics.pending, icon: Clock, color: 'amber' },
                ].map((item) => (
                    <div key={item.label} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-500 text-sm font-medium">{item.label}</span>
                            <div className={`p-2 bg-${item.color}-50 rounded-lg`}>
                                <item.icon className={`w-5 h-5 text-${item.color}-600`} />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                            {loading ? <div className="h-8 w-12 bg-gray-100 animate-pulse rounded" /> : item.value}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Trends Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-[400px]">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        Appointment Trends
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Status Distribution */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-[400px]">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-blue-600" />
                        Status Distribution
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={statusData}
                                innerRadius={80}
                                outerRadius={120}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {statusData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Doctor Performance */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 h-[400px] lg:col-span-2">
                    <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-600" />
                        Top Doctors by Appointments
                    </h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={doctorData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={150} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#6366F1" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
