import { Users, UserCheck, FileSpreadsheet, Briefcase, Shield, UserPlus, PhoneCall, Calculator, Stethoscope } from 'lucide-react';

export function HumanResources() {
  const modules = [
    {
      title: 'Doctors',
      description: 'Manage doctors and their appointment schedules',
      icon: Stethoscope,
      path: '/doctors',
      color: 'bg-blue-500'
    },
    {
      title: 'Nurses',
      description: 'Manage nursing staff accounts',
      icon: UserPlus,
      path: '/nurses',
      color: 'bg-purple-500'
    },
    {
      title: 'Receptionists',
      description: 'Manage front desk staff',
      icon: PhoneCall,
      path: '/receptionists',
      color: 'bg-teal-500'
    },
    {
      title: 'Accountants',
      description: 'Manage accounting staff',
      icon: Calculator,
      path: '/accountants',
      color: 'bg-amber-500'
    },
    {
      title: 'Attendance',
      description: 'Track daily staff attendance records',
      icon: UserCheck,
      path: '/attendance',
      color: 'bg-green-500'
    },
    {
      title: 'Leave Management',
      description: 'Manage staff leave requests and approvals',
      icon: FileSpreadsheet,
      path: '/leave-management',
      color: 'bg-orange-500'
    },
    {
      title: 'Roles',
      description: 'Configure custom roles and permissions',
      icon: Shield,
      path: '/roles',
      color: 'bg-red-500'
    },
    {
      title: 'Payroll',
      description: 'Manage staff salaries and payments',
      icon: Briefcase,
      path: '/payroll',
      color: 'bg-emerald-500'
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
            className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg hover:border-green-500 dark:hover:border-green-500 transition-all"
          >
            <div className={`${module.color} w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
              <module.icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{module.title}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">{module.description}</p>
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-green-900 dark:text-green-100">-</span>
          </div>
          <h4 className="text-sm font-medium text-green-900 dark:text-green-100">Total Staff</h4>
          <p className="text-xs text-green-700 dark:text-green-300 mt-1">Active employees</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">-</span>
          </div>
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">Present Today</h4>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Staff attendance</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-amber-900 dark:text-amber-100">-</span>
          </div>
          <h4 className="text-sm font-medium text-amber-900 dark:text-amber-100">Pending Leaves</h4>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">Awaiting approval</p>
        </div>
      </div>
    </div>
  );
}
