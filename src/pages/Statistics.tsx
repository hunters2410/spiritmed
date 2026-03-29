import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    TrendingUp, Users, DollarSign, Calendar,
    Activity, ArrowUpRight, ArrowDownRight,
    BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon,
    Building2
} from 'lucide-react';
import {
    AreaChart, Area,
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts';

interface PeriodicStat {
    name: string;
    value: number;
}

export function Statistics() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [branchId, setBranchId] = useState<string>(profile?.branch_id || '');
    const [branches, setBranches] = useState<any[]>([]);
    
    // Data states
    const [patientGrowth, setPatientGrowth] = useState<PeriodicStat[]>([]);
    const [revenueData, setRevenueData] = useState<PeriodicStat[]>([]);
    const [appointmentDist, setAppointmentDist] = useState<any[]>([]);
    const [departmentActivity, setDepartmentActivity] = useState<any[]>([]);
    const [stats, setStats] = useState({
        patients: { current: 0, growth: 0 },
        revenue: { current: 0, growth: 0 },
        appointments: { current: 0, growth: 0 },
        consultations: { current: 0, growth: 0 }
    });

    const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    useEffect(() => {
        if (profile?.role === 'super_admin') {
            loadBranches();
        }
    }, [profile]);

    useEffect(() => {
        loadAllStats();
    }, [branchId]);

    async function loadBranches() {
        const { data } = await supabase.from('branches').select('*').order('name');
        setBranches(data || []);
    }

    async function loadAllStats() {
        setLoading(true);
        try {
            const filter = branchId ? { branch_id: branchId } : {};
            const now = new Date();
            const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

            // 1. Fetch Month-over-Month Growth
            const [
                currPatients, prevPatients,
                currRevenue, prevRevenue,
                currAppts, prevAppts,
                currConsultations, prevConsultations
            ] = await Promise.all([
                supabase.from('patients').select('id', { count: 'exact', head: true }).match(filter).gte('created_at', startOfCurrentMonth),
                supabase.from('patients').select('id', { count: 'exact', head: true }).match(filter).gte('created_at', startOfPrevMonth).lt('created_at', startOfCurrentMonth),
                supabase.from('payments').select('amount').match(filter).gte('payment_date', startOfCurrentMonth),
                supabase.from('payments').select('amount').match(filter).gte('payment_date', startOfPrevMonth).lt('payment_date', startOfCurrentMonth),
                supabase.from('appointments').select('id', { count: 'exact', head: true }).match(filter).gte('appointment_date', startOfCurrentMonth),
                supabase.from('appointments').select('id', { count: 'exact', head: true }).match(filter).gte('appointment_date', startOfPrevMonth).lt('appointment_date', startOfCurrentMonth),
                supabase.from('consultations').select('id', { count: 'exact', head: true }).match(filter).gte('created_at', startOfCurrentMonth),
                supabase.from('consultations').select('id', { count: 'exact', head: true }).match(filter).gte('created_at', startOfPrevMonth).lt('created_at', startOfCurrentMonth)
            ]);

            const revCurr = currRevenue.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
            const revPrev = prevRevenue.data?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

            setStats({
                patients: { current: currPatients.count || 0, growth: calculateGrowth(currPatients.count || 0, prevPatients.count || 0) },
                revenue: { current: revCurr, growth: calculateGrowth(revCurr, revPrev) },
                appointments: { current: currAppts.count || 0, growth: calculateGrowth(currAppts.count || 0, prevAppts.count || 0) },
                consultations: { current: currConsultations.count || 0, growth: calculateGrowth(currConsultations.count || 0, prevConsultations.count || 0) }
            });

            // 2. Patient Growth Trend (Last 6 Months)
            const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
            const { data: trendData } = await supabase
                .from('patients')
                .select('created_at')
                .match(filter)
                .gte('created_at', sixMonthsAgo);

            const monthlyPatients = processTrendData(trendData || [], 'created_at');
            setPatientGrowth(monthlyPatients);

            // 3. Revenue Trend
            const { data: revTrend } = await supabase
                .from('payments')
                .select('amount, payment_date')
                .match(filter)
                .gte('payment_date', sixMonthsAgo);
            
            setRevenueData(processRevenueData(revTrend || []));

            // 4. Appointment Distribution
            const { data: apptDist } = await supabase
                .from('appointments')
                .select('status')
                .match(filter);
            
            setAppointmentDist(processDistribution(apptDist || [], 'status'));

            // 5. Departmental Distribution
            const [labs, pharmacy] = await Promise.all([
                supabase.from('lab_results').select('id', { count: 'exact', head: true }).match(filter),
                supabase.from('prescriptions').select('id', { count: 'exact', head: true }).match(filter)
            ]);

            setDepartmentActivity([
                { name: 'Consultations', value: currConsultations.count || 0, color: '#4f46e5' },
                { name: 'Laboratory', value: labs.count || 0, color: '#10b981' },
                { name: 'Pharmacy', value: pharmacy.count || 0, color: '#f59e0b' }
            ]);

        } catch (err) {
            console.error('Error fetching statistics:', err);
        } finally {
            setLoading(false);
        }
    }

    function calculateGrowth(curr: number, prev: number) {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    }

    function processTrendData(data: any[], dateKey: string) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const result: { [key: string]: number } = {};
        
        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
            result[key] = 0;
        }

        data.forEach(item => {
            const d = new Date(item[dateKey]);
            const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
            if (result[key] !== undefined) result[key]++;
        });

        return Object.keys(result).map(key => ({ name: key, value: result[key] }));
    }

    function processRevenueData(data: any[]) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const result: { [key: string]: number } = {};
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
            result[key] = 0;
        }

        data.forEach(item => {
            const d = new Date(item.payment_date);
            const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
            if (result[key] !== undefined) result[key] += Number(item.amount);
        });

        return Object.keys(result).map(key => ({ name: key, value: Math.round(result[key]) }));
    }

    function processDistribution(data: any[], key: string) {
        const dist: { [key: string]: number } = {};
        data.forEach(item => {
            const val = item[key] || 'Unknown';
            dist[val] = (dist[val] || 0) + 1;
        });
        return Object.keys(dist).map(name => ({ name: name.replace('_', ' ').toUpperCase(), value: dist[name] }));
    }

    if (loading && patientGrowth.length === 0) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <TrendingUp className="w-8 h-8 text-indigo-600" />
                        Analytics Dashboard
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Real-time clinical and operational performance tracking</p>
                </div>

                <div className="flex items-center gap-3">
                    {profile?.role === 'super_admin' && (
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <select
                                value={branchId}
                                onChange={(e) => setBranchId(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                            >
                                <option value="">All Branches</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    )}
                    <button onClick={loadAllStats} className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                        <Activity className="w-5 h-5 text-indigo-600" />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'New Patients', value: stats.patients.current, growth: stats.patients.growth, icon: Users, color: 'indigo' },
                    { label: 'Monthly Revenue', value: `$${stats.revenue.current.toLocaleString()}`, growth: stats.revenue.growth, icon: DollarSign, color: 'emerald' },
                    { label: 'Consultations', value: stats.consultations.current, growth: stats.consultations.growth, icon: Stethoscope, color: 'blue' },
                    { label: 'Total Appointments', value: stats.appointments.current, growth: stats.appointments.growth, icon: Calendar, color: 'amber' }
                ].map((kpi, i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`w-12 h-12 bg-${kpi.color}-50 dark:bg-${kpi.color}-900/20 rounded-xl flex items-center justify-center`}>
                                <kpi.icon className={`w-6 h-6 text-${kpi.color}-600`} />
                            </div>
                            <span className={`flex items-center text-xs font-bold ${kpi.growth >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-rose-600 bg-rose-50 dark:bg-rose-900/20'} px-2 py-1 rounded-full border ${kpi.growth >= 0 ? 'border-emerald-100' : 'border-rose-100'}`}>
                                {kpi.growth >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                                {Math.abs(kpi.growth)}%
                            </span>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-widest">{kpi.label}</p>
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{kpi.value}</h3>
                        <p className="text-[10px] text-gray-400 mt-2 italic font-medium">Compared to last month</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Patient Enrollment Trend */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <LineChartIcon className="w-4 h-4 text-indigo-600" />
                            Patient Registration Trend
                        </h3>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={patientGrowth}>
                                <defs>
                                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ stroke: '#4f46e5', strokeWidth: 2 }}
                                />
                                <Area type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Monthly Revenue Performance */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-emerald-600" />
                            Revenue Distribution
                        </h3>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Appointment Status */}
                <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-6 flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-amber-600" />
                        Appointment Status
                    </h3>
                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={appointmentDist}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {appointmentDist.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-[10px] font-bold uppercase text-gray-500">{value}</span>} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Departmental Activity */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                            <Activity className="w-4 h-4 text-rose-600" />
                            Clinical Resource Load
                        </h3>
                    </div>
                    <div className="space-y-6">
                        {departmentActivity.map((dept, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-gray-500">
                                    <span>{dept.name}</span>
                                    <span>{dept.value} Events</span>
                                </div>
                                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.min((dept.value / 100) * 100, 100)}%`, backgroundColor: dept.color }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

const Stethoscope = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
);
