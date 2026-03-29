import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users, Calendar, DollarSign, Activity,
  UserCheck, AlertCircle, Building2,
  Stethoscope, FileText, CreditCard, HeartPulse, CheckCircle, Timer
} from 'lucide-react';
import { ReusableCalendar } from '../components/ReusableCalendar';

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

  useEffect(() => {
    loadStats();
  }, [profile]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent font-roboto">
            Welcome back, {profile?.full_name}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">
            {profile?.role === 'super_admin' ? 'System-wide overview' : 'Branch overview'} - {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {profile?.role === 'super_admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-green-500 via-green-600 to-emerald-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 font-medium font-roboto uppercase tracking-wider">Total Branches</p>
                <p className="text-3xl font-bold mt-2 font-roboto">{stats.totalBranches}</p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                <Building2 className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 font-medium font-roboto uppercase tracking-wider">Total Patients</p>
                <p className="text-3xl font-bold mt-2 font-roboto">{stats.totalPatients}</p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                <Users className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-teal-500 via-teal-600 to-teal-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 font-medium font-roboto uppercase tracking-wider">Total Staff</p>
                <p className="text-3xl font-bold mt-2 font-roboto">{stats.totalStaff}</p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                <UserCheck className="w-8 h-8" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-cyan-500 via-cyan-600 to-cyan-700 rounded-xl shadow-lg p-6 text-white transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 font-medium font-roboto uppercase tracking-wider">Total Revenue</p>
                <p className="text-3xl font-bold mt-2 font-roboto">${stats.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                <DollarSign className="w-8 h-8" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-xl shadow-sm border border-green-100 dark:border-green-800 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
              <HeartPulse className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full uppercase tracking-tighter">Patients</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white font-roboto">{stats.activePatients}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">Active patients</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 rounded-xl shadow-sm border border-emerald-100 dark:border-emerald-800 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-sm">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-full uppercase tracking-tighter">Today</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white font-roboto">{stats.todayAppointments}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">Appointments today</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/10 dark:to-yellow-900/10 rounded-xl shadow-sm border border-amber-100 dark:border-amber-800 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl flex items-center justify-center shadow-sm">
              <Timer className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full uppercase tracking-tighter">Pending</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white font-roboto">{stats.pendingAppointments}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">Need confirmation</p>
        </div>

        <div className="bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-900/10 dark:to-emerald-900/10 rounded-xl shadow-sm border border-teal-100 dark:border-teal-800 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/30 px-2 py-1 rounded-full uppercase tracking-tighter">Completed</span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-white font-roboto">{stats.completedAppointments}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">Total completed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 font-roboto">
              <Calendar className="w-6 h-6 text-green-600" />
              Appointment Agenda
            </h2>
          </div>

          <ReusableCalendar showTitle={false} compact={true} />
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-xl shadow-sm border border-green-100 dark:border-green-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 font-roboto">
                <Activity className="w-5 h-5 text-green-600" />
                Quick Stats
              </h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto">Consultations</span>
                </div>
                <span className="text-lg font-bold text-green-600 font-roboto">{stats.totalConsultations}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto">Monthly Revenue</span>
                </div>
                <span className="text-lg font-bold text-emerald-600 font-roboto">${stats.monthlyRevenue.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto">Pending Invoices</span>
                </div>
                <span className="text-lg font-bold text-amber-600 font-roboto">{stats.pendingInvoices}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-600" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto">Paid Invoices</span>
                </div>
                <span className="text-lg font-bold text-cyan-600 font-roboto">{stats.paidInvoices}</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white font-roboto">Staff Activity</h2>
              <UserCheck className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-lg">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-roboto">Active Staff</span>
                <span className="text-xl font-bold text-green-600 dark:text-green-400 font-roboto">{stats.activeStaff}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-roboto">Total Staff</span>
                <span className="text-xl font-bold text-gray-900 dark:text-white font-roboto">{stats.totalStaff}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/10 dark:to-green-900/10 rounded-lg">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-roboto">Activity Rate</span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-roboto">
                  {stats.totalStaff > 0 ? Math.round((stats.activeStaff / stats.totalStaff) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>

          {stats.lowInventory > 0 && (
            <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10 border-2 border-red-300 dark:border-red-800 rounded-xl p-5 shadow-md animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg">
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-red-900 dark:text-red-400 font-roboto">Low Stock Alert</h3>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1 font-roboto leading-relaxed">
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
