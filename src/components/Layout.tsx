import { ReactNode, useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GlobalSearch } from './GlobalSearch';
import {
  Building2, Users, Calendar, FileText, DollarSign, Package,
  Settings, LogOut, Menu, X, Bell, MessageSquare, Home,
  UserPlus, Stethoscope, Syringe, ClipboardList, TrendingUp,
  Briefcase, UserCheck, FileSpreadsheet, BarChart3, User,
  Moon, Sun, ChevronLeft, ChevronRight, Activity, Microscope,
  FileCheck, FilePlus, UserCog, Shield, Mail, Send, History,
  Folder, FolderOpen, CalendarCheck, Pill, HeartPulse, ScrollText,
  FileSignature, ClipboardCheck, Skull, UserMinus, CreditCard,
  Receipt, Wallet, Calculator, LayoutDashboard, Clock, PhoneCall,
  Globe, ShieldCheck, Database, Zap, Search
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  icon: any;
  path: string;
  roles?: string[];
}

export function Layout({ children }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [quickActionSearch, setQuickActionSearch] = useState('');
  const quickActionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' || 'light';
    setTheme(savedTheme);
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickActionRef.current && !quickActionRef.current.contains(event.target as Node)) {
        setQuickActionOpen(false);
        setQuickActionSearch('');
      }
    };

    if (quickActionOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [quickActionOpen]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const navigationGroups = [
    {
      title: 'Main',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['super_admin', 'admin', 'doctor', 'nurse', 'receptionist', 'accountant'] },
        { label: 'Branches', icon: Building2, path: '/branches', roles: ['super_admin'] },
      ]
    },
    {
      title: 'Patient Management',
      items: [
        { label: 'All Patients', icon: Users, path: '/patients', roles: ['admin', 'doctor', 'nurse', 'receptionist'] },
        { label: 'Deceased Patients', icon: Skull, path: '/patients/deceased', roles: ['admin', 'doctor'] },
        { label: 'Discharged Patients', icon: UserMinus, path: '/patients/discharged', roles: ['admin', 'doctor', 'nurse'] },
        { label: 'Patient Files', icon: FolderOpen, path: '/patient-files', roles: ['admin', 'doctor', 'nurse'] },
      ]
    },
    {
      title: 'Appointment',
      items: [
        { label: 'Appointments', icon: Calendar, path: '/appointments', roles: ['admin', 'doctor', 'nurse', 'receptionist'] },
        { label: 'Appointment Calendar', icon: CalendarCheck, path: '/appointments/calendar', roles: ['admin', 'doctor', 'nurse', 'receptionist'] },
        { label: 'Appointment Schedule', icon: Clock, path: '/appointments/schedule', roles: ['admin', 'doctor', 'receptionist'] },
        { label: 'Online Booking', icon: Globe, path: '/appointments/online-booking', roles: ['admin', 'receptionist'] },
        { label: 'Appointment Reports', icon: BarChart3, path: '/appointments/reports', roles: ['super_admin', 'admin'] },
      ]
    },
    {
      title: 'Medical Records',
      items: [
        { label: 'Consultations', icon: Stethoscope, path: '/consultations', roles: ['admin', 'doctor'] },
        { label: 'Prescriptions', icon: Pill, path: '/prescriptions', roles: ['admin', 'doctor'] },
        { label: 'Vital Signs', icon: Activity, path: '/vital-signs', roles: ['admin', 'doctor', 'nurse'] },
        { label: 'Lab Results', icon: Microscope, path: '/lab-results', roles: ['admin', 'doctor', 'nurse'] },
        { label: 'Medical Reports', icon: FileText, path: '/medical-reports', roles: ['admin', 'doctor'] },
        { label: 'Discharge Summaries', icon: FileCheck, path: '/discharge-summaries', roles: ['admin', 'doctor'] },
        { label: 'Referral Forms', icon: FileSignature, path: '/referral-forms', roles: ['admin', 'doctor'] },
        { label: 'Operation Reports', icon: ClipboardCheck, path: '/operation-reports', roles: ['admin', 'doctor'] },
        { label: 'Medical Certificates', icon: ScrollText, path: '/medical-certificates', roles: ['admin', 'doctor'] },
        { label: 'Admission Letters', icon: FilePlus, path: '/admission-letters', roles: ['admin', 'doctor', 'nurse'] },
        { label: 'Follow-ups', icon: HeartPulse, path: '/follow-ups', roles: ['admin', 'doctor', 'nurse'] },
      ]
    },
    {
      title: 'Financial Management',
      items: [
        { label: 'Invoices', icon: Receipt, path: '/invoices', roles: ['admin', 'accountant', 'receptionist'] },
        { label: 'Bills', icon: CreditCard, path: '/bills', roles: ['admin', 'accountant', 'receptionist'] },
        { label: 'Payments', icon: Wallet, path: '/payments', roles: ['admin', 'accountant', 'receptionist'] },
        { label: 'Expenses', icon: DollarSign, path: '/expenses', roles: ['admin', 'accountant'] },
        { label: 'Accounting', icon: Calculator, path: '/accounting', roles: ['super_admin', 'admin', 'accountant'] },
      ]
    },
    {
      title: 'Inventory & Resources',
      items: [
        { label: 'Inventory', icon: Package, path: '/inventory', roles: ['admin', 'nurse'] },
        { label: 'Hospital Files', icon: Folder, path: '/hospital-files', roles: ['admin'] },
      ]
    },
    {
      title: 'Staff Management',
      items: [
        { label: 'User Management', icon: UserCog, path: '/users', roles: ['super_admin'] },
        { label: 'Roles', icon: Shield, path: '/roles', roles: ['super_admin', 'admin'] },
        { label: 'Attendance', icon: UserCheck, path: '/attendance', roles: ['admin'] },
        { label: 'Leave Management', icon: FileSpreadsheet, path: '/leave-management', roles: ['admin'] },
        { label: 'Payroll', icon: Briefcase, path: '/payroll', roles: ['admin', 'accountant'] },
        { label: 'Human Resources', icon: UserCog, path: '/human-resources', roles: ['super_admin', 'admin'] },
      ]
    },
    {
      title: 'Third Party',
      items: [
        { label: 'Medical Aids', icon: ShieldCheck, path: '/medical-aids', roles: ['admin', 'accountant', 'receptionist'] },
        { label: 'Referral Doctors', icon: Users, path: '/referral-doctors', roles: ['admin', 'doctor'] },
      ]
    },
    {
      title: 'Communication',
      items: [
        { label: 'Internal Chats', icon: MessageSquare, path: '/chats', roles: ['super_admin', 'admin', 'doctor', 'nurse', 'receptionist', 'accountant'] },
        { label: 'Notifications', icon: Bell, path: '/notifications', roles: ['super_admin', 'admin', 'doctor', 'nurse', 'receptionist', 'accountant'] },
        { label: 'Email Management', icon: Mail, path: '/emails', roles: ['admin'] },
        { label: 'SMS Management', icon: Send, path: '/sms', roles: ['admin'] },
      ]
    },
    {
      title: 'Reports & Analytics',
      items: [
        { label: 'Statistics', icon: TrendingUp, path: '/statistics', roles: ['super_admin', 'admin'] },
      ]
    },
    {
      title: 'System',
      items: [
        { label: 'Audit Logs', icon: History, path: '/audit-logs', roles: ['super_admin', 'admin'] },
        { label: 'Profile', icon: User, path: '/profile', roles: ['super_admin', 'admin', 'doctor', 'nurse', 'receptionist', 'accountant'] },
        { label: 'Settings', icon: Settings, path: '/settings', roles: ['super_admin', 'admin'] },
      ]
    }
  ];

  const filteredGroups = navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !item.roles || item.roles.includes(profile?.role || ''))
  })).filter(group => group.items.length > 0);

  const allModules = filteredGroups.flatMap(group =>
    group.items.map(item => ({
      ...item,
      category: group.title
    }))
  );

  const filteredModules = allModules.filter(module =>
    module.label.toLowerCase().includes(quickActionSearch.toLowerCase()) ||
    module.category.toLowerCase().includes(quickActionSearch.toLowerCase())
  );

  const handleModuleClick = (path: string) => {
    window.location.href = path;
    setQuickActionOpen(false);
    setQuickActionSearch('');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      window.history.pushState({}, '', '/login');
      window.location.reload();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className={`fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`fixed top-0 left-0 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 transform transition-all lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-56'} w-56`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className={`flex flex-col items-center ${sidebarCollapsed ? 'space-y-2' : 'space-y-4'}`}>
              <div className="relative w-full flex justify-center">
                <img
                  src="/favicon.png"
                  alt="Logo"
                  className={`object-contain transition-all ${sidebarCollapsed ? 'w-12 h-12' : 'w-24 h-24'}`}
                />
                {!sidebarCollapsed && (
                  <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute right-0 top-0">
                    <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`hidden lg:flex items-center justify-center p-1.5 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition mt-2`}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-4">
            {filteredGroups.map((group, groupIndex) => (
              <div key={group.title}>
                {!sidebarCollapsed && (
                  <div className="px-2 py-2 text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide">
                    {group.title}
                  </div>
                )}
                {sidebarCollapsed && groupIndex > 0 && (
                  <div className="my-2 mx-auto w-8 border-t border-gray-200 dark:border-gray-700" />
                )}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <a
                      key={item.path}
                      href={item.path}
                      className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 transition-all ${
                        window.location.pathname === item.path ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400 font-semibold shadow-sm' : ''
                      }`}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <item.icon className="w-4.5 h-4.5 flex-shrink-0" />
                      {!sidebarCollapsed && <span className="text-sm">{item.label}</span>}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className={`transition-all ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-56'}`}>
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
          <div className="flex items-center justify-between gap-4 px-6 py-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>

            <div className="flex-1 max-w-2xl">
              <GlobalSearch />
            </div>

            <div className="flex items-center space-x-3">
              <div className="relative" ref={quickActionRef}>
                <button
                  onClick={() => setQuickActionOpen(!quickActionOpen)}
                  className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-sm font-medium rounded-lg hover:from-green-700 hover:to-emerald-700 transition shadow-sm"
                  title="Quick Actions"
                >
                  <Zap className="w-4 h-4" />
                  <span>Quick Action</span>
                </button>

                {quickActionOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="text"
                          value={quickActionSearch}
                          onChange={(e) => setQuickActionSearch(e.target.value)}
                          placeholder="Search modules..."
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="max-h-96 overflow-y-auto">
                      {filteredModules.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
                          No modules found
                        </div>
                      ) : (
                        <div className="py-2">
                          {filteredModules.map((module) => (
                            <button
                              key={module.path}
                              onClick={() => handleModuleClick(module.path)}
                              className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                            >
                              <module.icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <div className="flex-1 text-left">
                                <div className="font-medium">{module.label}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{module.category}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button className="relative p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition">
                <Bell className="w-4 h-4" />
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
              </button>

              <button
                onClick={toggleTheme}
                className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              <a
                href="/profile"
                className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
                title="Profile"
              >
                <User className="w-4 h-4" />
              </a>

              <button
                onClick={handleSignOut}
                className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 dark:text-white">
          {children}
        </main>
      </div>
    </div>
  );
}
