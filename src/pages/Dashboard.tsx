import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users, Calendar, DollarSign, TrendingUp, Activity,
  ClipboardList, UserCheck, AlertCircle, Building2,
  Stethoscope, FileText, CreditCard, HeartPulse, ChevronLeft,
  ChevronRight, Clock, Plus, CheckCircle, XCircle, Timer
} from 'lucide-react';

interface Stats {
  totalPatients: number;
  activePatients: number;
  totalBranches: number;
  todayAppointments: number;
  pendingAppointments: number;
  completedAppointments: number;
  totalRevenue: number;
  monthlyRevenue: number;
  activeStaff: number;
  totalStaff: number;
  lowInventory: number;
  totalConsultations: number;
  pendingInvoices: number;
  paidInvoices: number;
}

interface Appointment {
  id: string;
  patient_name: string;
  doctor_name: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  reason: string;
}

export function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0,
    activePatients: 0,
    totalBranches: 0,
    todayAppointments: 0,
    pendingAppointments: 0,
    completedAppointments: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    activeStaff: 0,
    totalStaff: 0,
    lowInventory: 0,
    totalConsultations: 0,
    pendingInvoices: 0,
    paidInvoices: 0
  });
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    loadStats();
    loadAppointments();
  }, [profile, currentDate]);

  const loadStats = async () => {
    if (!profile) return;

    try {
      const branchFilter = profile.role === 'super_admin' ? {} : { branch_id: profile.branch_id };
      const today = new Date().toISOString().split('T')[0];
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [
        totalPatientsResult,
        activePatientsResult,
        branchesResult,
        todayAppointmentsResult,
        pendingAppointmentsResult,
        completedAppointmentsResult,
        paymentsResult,
        monthlyPaymentsResult,
        activeStaffResult,
        totalStaffResult,
        inventoryResult,
        consultationsResult,
        pendingInvoicesResult,
        paidInvoicesResult
      ] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).match(branchFilter),
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active').match(branchFilter),
        profile.role === 'super_admin'
          ? supabase.from('branches').select('id', { count: 'exact', head: true })
          : Promise.resolve({ count: 1 }),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('appointment_date', today).lt('appointment_date', new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]).match(branchFilter),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending_confirmation').match(branchFilter),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed').match(branchFilter),
        supabase.from('payments').select('amount').match(branchFilter),
        supabase.from('payments').select('amount').gte('payment_date', firstDayOfMonth).match(branchFilter),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true).match(branchFilter),
        supabase.from('users').select('id', { count: 'exact', head: true }).match(branchFilter),
        supabase.from('inventory_items').select('id, quantity, reorder_level').match(branchFilter),
        supabase.from('consultations').select('id', { count: 'exact', head: true }).match(branchFilter),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).in('status', ['unpaid', 'partially_paid']).match(branchFilter),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'paid').match(branchFilter)
      ]);

      const totalRevenue = paymentsResult.data?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const monthlyRevenue = monthlyPaymentsResult.data?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;
      const lowInventory = inventoryResult.data?.filter(item => Number(item.quantity) <= Number(item.reorder_level)).length || 0;

      setStats({
        totalPatients: totalPatientsResult.count || 0,
        activePatients: activePatientsResult.count || 0,
        totalBranches: branchesResult.count || 0,
        todayAppointments: todayAppointmentsResult.count || 0,
        pendingAppointments: pendingAppointmentsResult.count || 0,
        completedAppointments: completedAppointmentsResult.count || 0,
        totalRevenue,
        monthlyRevenue,
        activeStaff: activeStaffResult.count || 0,
        totalStaff: totalStaffResult.count || 0,
        lowInventory,
        totalConsultations: consultationsResult.count || 0,
        pendingInvoices: pendingInvoicesResult.count || 0,
        paidInvoices: paidInvoicesResult.count || 0
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAppointments = async () => {
    if (!profile) return;

    try {
      const branchFilter = profile.role === 'super_admin' ? {} : { branch_id: profile.branch_id };
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split('T')[0];

      const { data } = await supabase
        .from('appointments')
        .select('*')
        .match(branchFilter)
        .gte('appointment_date', startDate)
        .lte('appointment_date', endDate)
        .order('appointment_date', { ascending: true });

      setAppointments(data || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const getAppointmentsForDay = (day: number) => {
    const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toISOString().split('T')[0];
    return appointments.filter(apt => apt.appointment_date === dateStr);
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: startingDayOfWeek }, (_, i) => i);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Welcome back, {profile?.full_name}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {profile?.role === 'super_admin' ? 'System-wide overview' : 'Branch overview'} - {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {profile?.role === 'super_admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 font-medium">Total Branches</p>
                <p className="text-3xl font-bold mt-2">{stats.totalBranches}</p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                <Building2 className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 font-medium">Total Patients</p>
                <p className="text-3xl font-bold mt-2">{stats.totalPatients}</p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                <Users className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 font-medium">Total Staff</p>
                <p className="text-3xl font-bold mt-2">{stats.totalStaff}</p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                <UserCheck className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-cyan-500 via-cyan-600 to-cyan-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 font-medium">Total Revenue</p>
                <p className="text-3xl font-bold mt-2">${stats.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                <DollarSign className="w-8 h-8" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-xl shadow-sm border border-pink-200 dark:border-pink-800 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl flex items-center justify-center shadow-sm">
              <HeartPulse className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-medium text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-900/30 px-2 py-1 rounded-full">Patients</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.activePatients}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Active patients</p>
        </div>

        <div className="bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 rounded-xl shadow-sm border border-sky-200 dark:border-sky-800 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-blue-500 rounded-xl flex items-center justify-center shadow-sm">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-medium text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 px-2 py-1 rounded-full">Today</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.todayAppointments}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Appointments today</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl flex items-center justify-center shadow-sm">
              <Timer className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full">Pending</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.pendingAppointments}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Need confirmation</p>
        </div>

        <div className="bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 rounded-xl shadow-sm border border-teal-200 dark:border-teal-800 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-medium text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30 px-2 py-1 rounded-full">Completed</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.completedAppointments}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Total completed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-600" />
              Appointment Calendar
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={previousMonth}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 min-w-[140px] text-center">
                {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-bold text-gray-600 dark:text-gray-400 py-2">
                {day}
              </div>
            ))}
            {emptyDays.map(i => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {days.map(day => {
              const dayAppointments = getAppointmentsForDay(day);
              const isToday = new Date().getDate() === day &&
                             new Date().getMonth() === currentDate.getMonth() &&
                             new Date().getFullYear() === currentDate.getFullYear();

              return (
                <div
                  key={day}
                  className={`aspect-square border rounded-lg p-2 hover:border-blue-400 transition-colors cursor-pointer ${
                    isToday
                      ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-blue-600'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'
                  }`}
                >
                  <div className="text-xs font-semibold mb-1">{day}</div>
                  {dayAppointments.length > 0 && (
                    <div className={`text-[10px] font-medium ${isToday ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
                      {dayAppointments.length} apt{dayAppointments.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-600" />
                Quick Stats
              </h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-blue-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Consultations</span>
                </div>
                <span className="text-lg font-bold text-blue-600">{stats.totalConsultations}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Monthly Revenue</span>
                </div>
                <span className="text-lg font-bold text-emerald-600">${stats.monthlyRevenue.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Pending Invoices</span>
                </div>
                <span className="text-lg font-bold text-orange-600">{stats.pendingInvoices}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Paid Invoices</span>
                </div>
                <span className="text-lg font-bold text-cyan-600">{stats.paidInvoices}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Staff Activity</h2>
              <UserCheck className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-lg">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Staff</span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.activeStaff}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Staff</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white">{stats.totalStaff}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 rounded-lg">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Activity Rate</span>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {stats.totalStaff > 0 ? Math.round((stats.activeStaff / stats.totalStaff) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>

          {stats.lowInventory > 0 && (
            <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-2 border-red-300 dark:border-red-800 rounded-xl p-5 shadow-md">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-red-900 dark:text-red-400">Low Stock Alert</h3>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {stats.lowInventory} {stats.lowInventory === 1 ? 'item is' : 'items are'} running low. Please reorder soon.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
