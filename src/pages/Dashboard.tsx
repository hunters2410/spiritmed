import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users, Calendar, DollarSign, Activity,
  UserCheck, AlertCircle, Building2,
  Stethoscope, FileText, CreditCard, HeartPulse, CheckCircle, Timer,
  Skull, LogOut
} from 'lucide-react';
import { ReusableCalendar } from '../components/ReusableCalendar';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface Stats {
  totalPatients: number;
  activePatients: number;
  deceasedPatients: number;
  dischargedPatients: number;
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
  pendingBills: number;
  paidBills: number;
  totalMedicalAidDues: number;
  totalShortfallDues: number;
  financialHistory: any[];
  incomeBreakdown: any[];
  expenseBreakdown: any[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function Dashboard() {
  const { profile, hasPermission } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0,
    activePatients: 0,
    deceasedPatients: 0,
    dischargedPatients: 0,
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
    pendingBills: 0,
    paidBills: 0,
    totalMedicalAidDues: 0,
    totalShortfallDues: 0,
    financialHistory: [],
    incomeBreakdown: [],
    expenseBreakdown: []
  });
  const [loading, setLoading] = useState(true);

  // Cache dashboard stats for 2 minutes to avoid re-firing queries on every navigation
  const statsCache = useRef<{ data: Stats | null; ts: number; branchId: string | null }>({ data: null, ts: 0, branchId: null });
  const CACHE_TTL = 2 * 60 * 1000;

  const canViewBranches = profile?.role === 'super_admin' || hasPermission('branches', 'view');
  const canViewPatients = hasPermission('patients', 'view');
  const canViewStaff = hasPermission('staff', 'view') || hasPermission('users', 'view');
  const canViewBilling = hasPermission('billing', 'view') || hasPermission('payments', 'view') || hasPermission('accounting', 'view');
  const canViewAppointments = hasPermission('appointments', 'view');
  const canViewExpenses = hasPermission('expenses', 'view');
  const canViewConsultations = hasPermission('consultations', 'view') || hasPermission('medical_records', 'view');
  const canViewInventory = hasPermission('inventory', 'view');

  useEffect(() => {
    if (!profile) return;
    // Serve from cache if fresh
    if (
      statsCache.current.data &&
      statsCache.current.branchId === (profile.branch_id || 'all') &&
      Date.now() - statsCache.current.ts < CACHE_TTL
    ) {
      setStats(statsCache.current.data);
      setLoading(false);
      return;
    }
    loadStats();
  }, [profile]);

  const loadStats = async () => {
    if (!profile) return;

    try {
      const branchFilter = profile.role === 'super_admin' ? {} : { branch_id: profile.branch_id };
      const today = new Date().toISOString().split('T')[0];
      const sixMonthsAgo = subMonths(startOfMonth(new Date()), 5);

      const [
        totalPatientsResult,
        activePatientsResult,
        branchesResult,
        todayAppointmentsResult,
        pendingAppointmentsResult,
        completedAppointmentsResult,
        paymentsResult,
        activeStaffResult,
        totalStaffResult,
        inventoryResult,
        consultationsResult,
        pendingInvoicesResult,
        paidInvoicesResult,
        billBalancesResult,
        allRecentPayments,
        allRecentExpenses,
        deceasedPatientsResult,
        dischargedPatientsResult
      ] = await Promise.all([
        canViewPatients ? supabase.from('patients').select('id', { count: 'exact', head: true }).match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewPatients ? supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active').match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewBranches
          ? supabase.from('branches').select('id', { count: 'exact', head: true })
          : Promise.resolve({ count: 0 }),
        canViewAppointments ? supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('appointment_date', today).lt('appointment_date', new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]).match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewAppointments ? supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending_confirmation').match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewAppointments ? supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed').match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewBilling ? supabase.from('payments').select('amount').match(branchFilter) : Promise.resolve({ data: [] }),
        canViewStaff ? supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true).match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewStaff ? supabase.from('users').select('id', { count: 'exact', head: true }).match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewInventory ? supabase.from('inventory_items').select('id, quantity, reorder_level').match(branchFilter) : Promise.resolve({ data: [] }),
        canViewConsultations ? supabase.from('consultations').select('id', { count: 'exact', head: true }).match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewBilling ? supabase.from('bills').select('id', { count: 'exact', head: true }).in('status', ['unpaid', 'partially_paid']).match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewBilling ? supabase.from('bills').select('id', { count: 'exact', head: true }).eq('status', 'paid').match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewBilling ? supabase.from('bills').select('medical_aid_balance, shortfall_balance').in('status', ['unpaid', 'partially_paid']).match(branchFilter) : Promise.resolve({ data: [] }),
        canViewBilling ? supabase.from('payments').select('amount, payment_date, payment_method').gte('payment_date', sixMonthsAgo.toISOString()).match(branchFilter) : Promise.resolve({ data: [] }),
        canViewExpenses ? supabase.from('expenses').select('amount, expense_date, category:expense_categories(name)').gte('expense_date', sixMonthsAgo.toISOString()).match(branchFilter) : Promise.resolve({ data: [] }),
        canViewPatients ? supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'deceased').match(branchFilter) : Promise.resolve({ count: 0 }),
        canViewPatients ? supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'discharged').match(branchFilter) : Promise.resolve({ count: 0 })
      ]);

      const totalRevenue = paymentsResult.data?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

      // Calculate monthly revenue (current month)
      const currentMonthStart = startOfMonth(new Date()).toISOString();
      const currentMonthEnd = endOfMonth(new Date()).toISOString();
      const monthlyRevenue = allRecentPayments.data
        ?.filter(p => p.payment_date >= currentMonthStart && p.payment_date <= currentMonthEnd)
        ?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0;

      // Process 6-Month Financial Trend
      const months = Array.from({ length: 6 }).map((_, i) => {
        const d = subMonths(new Date(), 5 - i);
        return {
          key: format(d, 'yyyy-MM'),
          label: format(d, 'MMM'),
          income: 0,
          expenses: 0
        };
      });

      allRecentPayments.data?.forEach(p => {
        const mKey = p.payment_date?.substring(0, 7);
        const target = months.find(m => m.key === mKey);
        if (target) target.income += Number(p.amount) || 0;
      });

      allRecentExpenses.data?.forEach(e => {
        const mKey = e.expense_date?.substring(0, 7);
        const target = months.find(m => m.key === mKey);
        if (target) target.expenses += Number(e.amount) || 0;
      });

      const financialHistory = months.map(m => ({
        month: m.label,
        income: m.income,
        expenses: m.expenses
      }));

      // Process Income Breakdown (by payment method)
      const incomeByMethod: Record<string, number> = {};
      allRecentPayments.data?.forEach(p => {
        const method = p.payment_method || 'Other';
        const formatted = method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, ' ');
        incomeByMethod[formatted] = (incomeByMethod[formatted] || 0) + (Number(p.amount) || 0);
      });

      const incomeBreakdown = Object.entries(incomeByMethod).map(([name, value]) => ({
        name,
        value
      }));

      // Process Expense Breakdown (by category)
      const expenseByCategory: Record<string, number> = {};
      allRecentExpenses.data?.forEach((e: any) => {
        const catName = e.category?.name || 'General Operations';
        expenseByCategory[catName] = (expenseByCategory[catName] || 0) + (Number(e.amount) || 0);
      });

      const expenseBreakdown = Object.entries(expenseByCategory).map(([name, value]) => ({
        name,
        value
      }));

      const lowStockCount = inventoryResult.data?.filter((i: any) => i.quantity <= i.reorder_level).length || 0;

      // Calculate dues
      const totalMedicalAidDues = billBalancesResult.data?.reduce((sum: number, b: any) => sum + (Number(b.medical_aid_balance) || 0), 0) || 0;
      const totalShortfallDues = billBalancesResult.data?.reduce((sum: number, b: any) => sum + (Number(b.shortfall_balance) || 0), 0) || 0;

      const newStats: Stats = {
        totalPatients: totalPatientsResult.count || 0,
        activePatients: activePatientsResult.count || 0,
        deceasedPatients: deceasedPatientsResult.count || 0,
        dischargedPatients: dischargedPatientsResult.count || 0,
        totalBranches: branchesResult.count || 0,
        todayAppointments: todayAppointmentsResult.count || 0,
        pendingAppointments: pendingAppointmentsResult.count || 0,
        completedAppointments: completedAppointmentsResult.count || 0,
        totalRevenue,
        monthlyRevenue,
        activeStaff: activeStaffResult.count || 0,
        totalStaff: totalStaffResult.count || 0,
        lowInventory: lowStockCount,
        totalConsultations: consultationsResult.count || 0,
        pendingBills: pendingInvoicesResult.count || 0,
        paidBills: paidInvoicesResult.count || 0,
        totalMedicalAidDues,
        totalShortfallDues,
        financialHistory,
        incomeBreakdown,
        expenseBreakdown
      };

      setStats(newStats);
      statsCache.current = { data: newStats, ts: Date.now(), branchId: profile.branch_id || 'all' };
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const hasAnyPrimaryCard = canViewBranches || canViewPatients || canViewStaff || canViewBilling;
  const hasAnyStatusTile = canViewPatients || canViewAppointments;
  const hasAnyFinancialChart = canViewBilling || canViewExpenses;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent font-roboto">
            Welcome back, {profile?.full_name}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">
            {profile?.role === 'super_admin' ? 'System-wide overview' : `${(profile?.role || 'Staff').toUpperCase()} Portal`} - {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Top Banner KPI Cards (Filtered strictly by permission) */}
      {hasAnyPrimaryCard && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {canViewBranches && (
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
          )}

          {canViewPatients && (
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
          )}

          {canViewStaff && (
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
          )}

          {canViewBilling && (
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
          )}
        </div>
      )}

      {/* Patient & Appointment Status Tiles */}
      {hasAnyStatusTile && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {canViewPatients && (
            <>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-xl shadow-sm border border-green-100 dark:border-green-800 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-sm">
                    <HeartPulse className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-full uppercase tracking-tighter">Active</span>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white font-roboto">{stats.activePatients}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">Active patients</p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-xl shadow-sm border border-blue-100 dark:border-blue-800 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-sm">
                    <LogOut className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full uppercase tracking-tighter">Discharged</span>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white font-roboto">{stats.dischargedPatients}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">Discharged patients</p>
              </div>

              <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10 rounded-xl shadow-sm border border-red-100 dark:border-red-800 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-rose-500 rounded-xl flex items-center justify-center shadow-sm">
                    <Skull className="w-6 h-6 text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full uppercase tracking-tighter">Deceased</span>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white font-roboto">{stats.deceasedPatients}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 font-roboto">Deceased patients</p>
              </div>
            </>
          )}

          {canViewAppointments && (
            <>
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
            </>
          )}
        </div>
      )}

      {/* Financial Analytics Section (Only for permitted roles) */}
      {hasAnyFinancialChart && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 font-roboto">
                  <Activity className="w-6 h-6 text-green-600" />
                  Revenue & Expenses Trend
                </h2>
                <p className="text-xs text-gray-500 mt-1">Monthly financial overview for the last 6 months</p>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.financialHistory}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="month" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#9CA3AF' }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#9CA3AF' }}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#FFF', 
                      borderRadius: '12px', 
                      border: 'none', 
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' 
                    }}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, '']}
                  />
                  <Legend iconType="circle" />
                  <Area type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {canViewBilling && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-6">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider font-roboto">Income by Source</h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.incomeBreakdown}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {stats.incomeBreakdown.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => `$${value.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {stats.incomeBreakdown.slice(0, 3).map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-gray-600 dark:text-gray-400 truncate max-w-[100px]">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white">${item.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canViewExpenses && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-6">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider font-roboto">Expense Allocation</h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.expenseBreakdown}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {stats.expenseBreakdown.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => `$${value.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {stats.expenseBreakdown.slice(0, 3).map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[(index + 2) % COLORS.length] }} />
                        <span className="text-gray-600 dark:text-gray-400 truncate max-w-[100px]">{item.name}</span>
                      </div>
                      <span className="font-bold text-gray-900 dark:text-white">${item.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agenda & Operational Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {canViewAppointments ? (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 font-roboto">
                <Calendar className="w-6 h-6 text-green-600" />
                Appointment Agenda
              </h2>
            </div>

            <ReusableCalendar showTitle={false} compact={true} />
          </div>
        ) : (
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-8 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 bg-green-50 dark:bg-green-900/30 rounded-2xl flex items-center justify-center text-green-600 mb-4">
              <HeartPulse className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Hospital Workspace</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mt-1">
              Welcome to your SpiritMed workspace. Use the sidebar to navigate to your authorized hospital modules.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {(canViewConsultations || canViewBilling) && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-xl shadow-sm border border-green-100 dark:border-green-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 font-roboto">
                  <Activity className="w-5 h-5 text-green-600" />
                  Quick Stats
                </h2>
              </div>
              <div className="space-y-3">
                {canViewConsultations && (
                  <a
                    href="/consultations"
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-600 hover:shadow-md transition-all duration-200 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-green-600 group-hover:scale-110 transition-transform" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto group-hover:text-green-700 dark:group-hover:text-green-400 font-medium">Consultations</span>
                    </div>
                    <span className="text-lg font-bold text-green-600 font-roboto">{stats.totalConsultations}</span>
                  </a>
                )}
                {canViewBilling && (
                  <>
                    <a
                      href="/payments"
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-600 hover:shadow-md transition-all duration-200 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto group-hover:text-emerald-700 dark:group-hover:text-emerald-400 font-medium">Monthly Revenue</span>
                      </div>
                      <span className="text-lg font-bold text-emerald-600 font-roboto">${stats.monthlyRevenue.toLocaleString()}</span>
                    </a>
                    <a
                      href="/bills?status=pending"
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-md transition-all duration-200 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto group-hover:text-amber-700 dark:group-hover:text-amber-400 font-medium">Pending Bills</span>
                      </div>
                      <span className="text-lg font-bold text-amber-600 font-roboto">{stats.pendingBills}</span>
                    </a>
                    <a
                      href="/bills?dueType=medical_aid"
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all duration-200 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto group-hover:text-blue-700 dark:group-hover:text-blue-400 font-medium">Medical Aid Dues</span>
                      </div>
                      <span className="text-lg font-bold text-blue-600 font-roboto">${stats.totalMedicalAidDues.toLocaleString()}</span>
                    </a>
                    <a
                      href="/bills?dueType=shortfall"
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700 hover:border-rose-300 dark:hover:border-rose-600 hover:shadow-md transition-all duration-200 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-rose-600 group-hover:scale-110 transition-transform" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto group-hover:text-rose-700 dark:group-hover:text-rose-400 font-medium">Shortfall Dues</span>
                      </div>
                      <span className="text-lg font-bold text-rose-600 font-roboto">${stats.totalShortfallDues.toLocaleString()}</span>
                    </a>
                    <a
                      href="/bills?status=paid"
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-50 dark:border-gray-700 hover:border-cyan-300 dark:hover:border-cyan-600 hover:shadow-md transition-all duration-200 cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-cyan-600 group-hover:scale-110 transition-transform" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-roboto group-hover:text-cyan-700 dark:group-hover:text-cyan-400 font-medium">Paid Bills</span>
                      </div>
                      <span className="text-lg font-bold text-cyan-600 font-roboto">{stats.paidBills}</span>
                    </a>
                  </>
                )}
              </div>
            </div>
          )}

          {canViewStaff && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white font-roboto">Staff Activity</h2>
                <UserCheck className="w-5 h-5 text-gray-400" />
              </div>
              <div className="space-y-3">
                <a href="/users" className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-lg hover:shadow-sm transition-all cursor-pointer group">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-roboto group-hover:text-green-700 dark:group-hover:text-green-400">Active Staff</span>
                  <span className="text-xl font-bold text-green-600 dark:text-green-400 font-roboto">{stats.activeStaff}</span>
                </a>
                <a href="/users" className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg hover:shadow-sm transition-all cursor-pointer group">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-roboto group-hover:text-gray-900 dark:group-hover:text-white">Total Staff</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-white font-roboto">{stats.totalStaff}</span>
                </a>
                <a href="/attendance" className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/10 dark:to-green-900/10 rounded-lg hover:shadow-sm transition-all cursor-pointer group">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 font-roboto group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Activity Rate</span>
                  <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-roboto">
                    {stats.totalStaff > 0 ? Math.round((stats.activeStaff / stats.totalStaff) * 100) : 0}%
                  </span>
                </a>
              </div>
            </div>
          )}

          {canViewInventory && stats.lowInventory > 0 && (
            <a href="/inventory" className="block bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10 border-2 border-red-300 dark:border-red-800 rounded-xl p-5 shadow-md hover:shadow-lg transition-all cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-500 group-hover:bg-red-600 transition-colors rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-red-900 dark:text-red-300 font-roboto">Low Inventory Alert</h3>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-1 font-roboto">
                    {stats.lowInventory} {stats.lowInventory === 1 ? 'item requires' : 'items require'} immediate restocking.
                  </p>
                </div>
              </div>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
