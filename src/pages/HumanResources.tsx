import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, UserCheck, FileSpreadsheet, Briefcase, Shield, UserPlus, PhoneCall, Calculator, Stethoscope } from 'lucide-react';

export function HumanResources() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({
    totalStaff: 0,
    doctors: 0,
    nurses: 0,
    receptionists: 0,
    accountants: 0,
    presentToday: 0,
    pendingLeaves: 0,
    rolesCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHRStats();
  }, [profile]);

  const loadHRStats = async () => {
    try {
      setLoading(true);
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Users stats
      let usersQuery = supabase
        .from('users')
        .select('id, role, is_active, branch_id')
        .eq('is_active', true);

      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        usersQuery = usersQuery.eq('branch_id', profile.branch_id);
      }

      const { data: usersData, error: usersErr } = await usersQuery;
      if (usersErr) console.error('Error fetching users for HR stats:', usersErr);

      const activeUsers = usersData || [];
      const totalStaff = activeUsers.length;
      const doctors = activeUsers.filter(u => u.role === 'doctor').length;
      const nurses = activeUsers.filter(u => u.role === 'nurse').length;
      const receptionists = activeUsers.filter(u => u.role === 'receptionist').length;
      const accountants = activeUsers.filter(u => u.role === 'accountant').length;

      // 2. Attendance stats (Present Today)
      let attQuery = supabase
        .from('staff_attendance')
        .select('id', { count: 'exact', head: true })
        .eq('date', todayStr)
        .eq('status', 'present');

      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        attQuery = attQuery.eq('branch_id', profile.branch_id);
      }

      const { count: presentCount } = await attQuery;

      // 3. Pending Leaves stats
      let leaveQuery = supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        leaveQuery = leaveQuery.eq('branch_id', profile.branch_id);
      }

      const { count: pendingLeaveCount } = await leaveQuery;

      // 4. Roles stats
      const { count: totalRoles } = await supabase
        .from('roles')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      setStats({
        totalStaff,
        doctors,
        nurses,
        receptionists,
        accountants,
        presentToday: presentCount || 0,
        pendingLeaves: pendingLeaveCount || 0,
        rolesCount: totalRoles || 0
      });
    } catch (err) {
      console.error('Error loading HR stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const modules = [
    {
      title: 'Doctors',
      description: 'Manage doctors and their appointment schedules',
      icon: Stethoscope,
      path: '/doctors',
      color: 'bg-blue-500',
      countText: `${stats.doctors} Doctor${stats.doctors === 1 ? '' : 's'}`
    },
    {
      title: 'Nurses',
      description: 'Manage nursing staff accounts',
      icon: UserPlus,
      path: '/nurses',
      color: 'bg-purple-500',
      countText: `${stats.nurses} Nurse${stats.nurses === 1 ? '' : 's'}`
    },
    {
      title: 'Receptionists',
      description: 'Manage front desk staff',
      icon: PhoneCall,
      path: '/receptionists',
      color: 'bg-teal-500',
      countText: `${stats.receptionists} Receptionist${stats.receptionists === 1 ? '' : 's'}`
    },
    {
      title: 'Accountants',
      description: 'Manage accounting staff',
      icon: Calculator,
      path: '/accountants',
      color: 'bg-amber-500',
      countText: `${stats.accountants} Accountant${stats.accountants === 1 ? '' : 's'}`
    },
    {
      title: 'Attendance',
      description: 'Track daily staff attendance records',
      icon: UserCheck,
      path: '/attendance',
      color: 'bg-green-500',
      countText: `${stats.presentToday} Present Today`
    },
    {
      title: 'Leave Management',
      description: 'Manage staff leave requests and approvals',
      icon: FileSpreadsheet,
      path: '/leave-management',
      color: 'bg-orange-500',
      countText: `${stats.pendingLeaves} Pending Request${stats.pendingLeaves === 1 ? '' : 's'}`
    },
    {
      title: 'Roles',
      description: 'Configure custom roles and permissions',
      icon: Shield,
      path: '/roles',
      color: 'bg-red-500',
      countText: `${stats.rolesCount} Active Role${stats.rolesCount === 1 ? '' : 's'}`
    },
    {
      title: 'Payroll',
      description: 'Manage staff salaries and payments',
      icon: Briefcase,
      path: '/payroll',
      color: 'bg-emerald-500',
      countText: `${stats.totalStaff} Staff Accounts`
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Human Resources</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Comprehensive staff and workforce management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {modules.map((module) => (
          <a
            key={module.path}
            href={module.path}
            className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:border-green-500 dark:hover:border-green-500 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className={`${module.color} w-12 h-12 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <module.icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                  {loading ? '...' : module.countText}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{module.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{module.description}</p>
            </div>
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <span className="text-3xl font-black text-green-900 dark:text-green-100">
              {loading ? '...' : stats.totalStaff}
            </span>
          </div>
          <h4 className="text-sm font-bold text-green-900 dark:text-green-100 uppercase tracking-wider">Total Staff</h4>
          <p className="text-xs text-green-700 dark:text-green-300 mt-1 font-medium">Active staff & workforce accounts</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-3xl font-black text-blue-900 dark:text-blue-100">
              {loading ? '...' : stats.presentToday}
            </span>
          </div>
          <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 uppercase tracking-wider">Present Today</h4>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 font-medium">Staff attendance records today</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <span className="text-3xl font-black text-amber-900 dark:text-amber-100">
              {loading ? '...' : stats.pendingLeaves}
            </span>
          </div>
          <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wider">Pending Leaves</h4>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 font-medium">Leave requests awaiting approval</p>
        </div>
      </div>
    </div>
  );
}
