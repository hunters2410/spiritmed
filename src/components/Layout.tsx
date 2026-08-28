import { ReactNode, useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Building2, Users, Calendar, FileText, DollarSign, Package,
  Settings, LogOut, Menu, X, Bell, MessageSquare,
  Stethoscope, TrendingUp,
  Briefcase, UserCheck, FileSpreadsheet, BarChart3, User,
  Moon, Sun, Activity, Microscope,
  FileCheck, FilePlus, UserCog, Shield, Mail, Send, History,
  Folder, FolderOpen, CalendarCheck, Pill, HeartPulse, ScrollText,
  FileSignature, ClipboardCheck, Skull, UserMinus, CreditCard,
  Receipt, Wallet, Calculator, LayoutDashboard, Clock,
  Globe, ShieldCheck, Zap, Search, UserPlus, FlaskConical, Layers, Ruler, Box, UserX
} from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';
import { ApprovalRequestPanel } from './ApprovalRequestPanel';
import { FloatingChatWidget } from './FloatingChatWidget';

interface LayoutProps {
  children: ReactNode;
}
export function Layout({ children }: LayoutProps) {
  const { signOut, hasPermission, profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileModuleDrawerOpen, setMobileModuleDrawerOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [quickActionSearch, setQuickActionSearch] = useState('');
  const quickActionRef = useRef<HTMLDivElement>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

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
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', module: 'dashboard' },
        { label: 'Branches', icon: Building2, path: '/branches', module: 'branches' },
      ]
    },
    {
      title: 'Patient Management',
      items: [
        { label: 'All Patients', icon: Users, path: '/patients', module: 'patients' },
        { label: 'Patient History', icon: History, path: '/patient-history', module: 'patient_history' },
        { label: 'Deceased Patients', icon: Skull, path: '/patients/deceased', module: 'deceased_patients' },
        { label: 'Discharged Patients', icon: UserMinus, path: '/patients/discharged', module: 'discharged_patients' },
        { label: 'Old Patients', icon: UserX, path: '/patients/old', module: 'old_patients' },
        { label: 'Patient Files', icon: FolderOpen, path: '/patient-files', module: 'patient_files' },
        { label: 'File Number Pool', icon: FileText, path: '/patient-file-pool', module: 'file_number_pool' },
        { label: 'Reports Statistics', icon: BarChart3, path: '/reports-statistics', module: 'reports_statistics' },
      ]
    },
    {
      title: 'Appointment',
      items: [
        { label: 'Appointments', icon: Calendar, path: '/appointments', module: 'appointments' },
        { label: 'Appointment Calendar', icon: CalendarCheck, path: '/appointments/calendar', module: 'appointment_calendar' },
        { label: 'Appointment Schedule', icon: Clock, path: '/appointments/schedule', module: 'appointment_schedule' },
        { label: 'Online Booking', icon: Globe, path: '/appointments/online-booking', module: 'online_booking' },
        { label: 'Appointment Reports', icon: BarChart3, path: '/appointments/reports', module: 'appointment_reports' },
      ]
    },
    {
      title: 'Medical Records',
      items: [
        { label: 'Consultations', icon: Stethoscope, path: '/consultations', module: 'consultations' },
        { label: 'Prescriptions', icon: Pill, path: '/prescriptions', module: 'prescriptions' },
        { label: 'Vital Signs', icon: Activity, path: '/vital-signs', module: 'vital_signs' },
        { label: 'Lab Results', icon: Microscope, path: '/lab-results', module: 'lab_results' },
        { label: 'Follow-ups', icon: HeartPulse, path: '/follow-ups', module: 'follow_ups' },
      ]
    },
    {
      title: 'Clinical Reports',
      items: [
        { label: 'Medical Reports', icon: FileText, path: '/medical-reports', module: 'medical_reports' },
        { label: 'Discharge Summaries', icon: FileCheck, path: '/discharge-summaries', module: 'discharge_summaries' },
        { label: 'Referral Forms', icon: FileSignature, path: '/referral-forms', module: 'referral_forms' },
        { label: 'Operation Reports', icon: ClipboardCheck, path: '/operation-reports', module: 'operation_reports' },
        { label: 'Medical Certificates', icon: ScrollText, path: '/medical-certificates', module: 'medical_certificates' },
        { label: 'Admission Letters', icon: FilePlus, path: '/admission-letters', module: 'admission_letters' },
      ]
    },
    {
      title: 'Prescription Items',
      items: [
        { label: 'Medicines', icon: Pill, path: '/medicines', module: 'medicines' },
        { label: 'Frequency', icon: Clock, path: '/medicine-frequencies', module: 'medicine_frequencies' },
      ]
    },
    {
      title: 'Clinical Setup',
      items: [
        { label: 'Complaints', icon: MessageSquare, path: '/complaints', module: 'complaints' },
        { label: 'Investigations', icon: Microscope, path: '/investigations', module: 'investigations' },
        { label: 'Diagnoses', icon: Activity, path: '/diagnoses', module: 'diagnoses' },
        { label: 'Histology', icon: FlaskConical, path: '/histology', module: 'histology' },
        { label: 'Anaesthetists', icon: UserCheck, path: '/anaesthetists', module: 'anaesthetists' },
        { label: 'Surgical Procedures', icon: Activity, path: '/surgical-procedures', module: 'surgical_procedures' },
        { label: 'Assistants', icon: UserPlus, path: '/assistants', module: 'assistants' },
        { label: 'Hospitals', icon: Building2, path: '/hospitals', module: 'hospitals' },
      ]
    },
    {
      title: 'Financial Management',
      items: [
        { label: 'Invoice / Bills', icon: Receipt, path: '/bills', module: 'billing' },
        { label: 'Patient Due', icon: Receipt, path: '/patients/due', module: 'patient_due' },
        { label: 'Payment Procedures', icon: DollarSign, path: '/payment-procedures', module: 'payment_procedures' },
        { label: 'Estimate Bill', icon: CreditCard, path: '/estimates', module: 'estimates' },
        { label: 'Payments', icon: Wallet, path: '/payments', module: 'payments' },
        { label: 'Medical Aids', icon: ShieldCheck, path: '/medical-aids', module: 'medical_aids' },
        { label: 'Expenses', icon: DollarSign, path: '/expenses', module: 'expenses' },
        { label: 'Expense Categories', icon: Layers, path: '/expense-categories', module: 'expense_categories' },
        { label: 'Accounting', icon: Calculator, path: '/accounting', module: 'accounting' },
      ]
    },
    {
      title: 'Inventory & Resources',
      items: [
        { label: 'Assets Register', icon: Box, path: '/assets-register', module: 'assets_register' },
        { label: 'Asset Categories', icon: Layers, path: '/assets-categories', module: 'asset_categories' },
        { label: 'Inventory', icon: Package, path: '/inventory', module: 'inventory' },
        { label: 'Suppliers', icon: Building2, path: '/suppliers', module: 'suppliers' },
        { label: 'Inventory Categories', icon: Layers, path: '/inventory/categories', module: 'inventory_categories' },
        { label: 'Inventory Units', icon: Ruler, path: '/inventory/units', module: 'inventory_units' },
        { label: 'Hospital Files', icon: Folder, path: '/hospital-files', module: 'hospital_files' },
      ]
    },
    {
      title: 'Staff Management',
      items: [
        { label: 'User Management', icon: UserCog, path: '/users', module: 'staff' },
        { label: 'Roles', icon: Shield, path: '/roles', module: 'roles' },
        { label: 'Attendance', icon: UserCheck, path: '/attendance', module: 'attendance' },
        { label: 'Leave Management', icon: FileSpreadsheet, path: '/leave-management', module: 'leave_management' },
        { label: 'Payroll', icon: Briefcase, path: '/payroll', module: 'payroll' },
        { label: 'Human Resources', icon: UserCog, path: '/human-resources', module: 'human_resources' },
      ]
    },
    {
      title: 'Third Party',
      items: [
        { label: 'Referral Doctors', icon: Users, path: '/referral-doctors', module: 'referral_doctors' },
      ]
    },
    {
      title: 'Communication',
      items: [
        { label: 'Internal Chats', icon: MessageSquare, path: '/chats', module: 'chats' },
        { label: 'Notifications', icon: Bell, path: '/notifications', module: 'notifications' },
        { label: 'Email Management', icon: Mail, path: '/emails', module: 'emails' },
        { label: 'SMS Management', icon: Send, path: '/sms', module: 'sms' },
      ]
    },
    {
      title: 'Reports & Analytics',
      items: [
        { label: 'Statistics', icon: TrendingUp, path: '/statistics', module: 'statistics' },
      ]
    },
    {
      title: 'System',
      items: [
        { label: 'Audit Logs', icon: History, path: '/audit-logs', module: 'audit_logs' },
        { label: 'Profile', icon: User, path: '/profile', module: 'profile' },
        { label: 'Settings', icon: Settings, path: '/settings', module: 'settings' },
      ]
    }
  ];

  const filteredGroups = navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      // Explicitly hide branches module from non-superadmins
      if (item.module === 'branches' && profile?.role !== 'super_admin') return false;
      return hasPermission(item.module, 'view');
    })
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
    setSidebarOpen(false);
    setMobileModuleDrawerOpen(false);
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

  const currentPath = window.location.pathname;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className={`fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`print:hidden fixed top-0 left-0 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 transform transition-all lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-72'} w-72`}>
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
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3 space-y-4 touch-scrolling">
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
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 transition-all ${window.location.pathname === item.path ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400 font-semibold shadow-sm' : ''
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

      <div className={`transition-all ${sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-72'}`}>
        <header className="print:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30 shadow-xs">
          <div className="flex flex-col gap-2 px-3 md:px-6 py-2 md:py-3">
            <div className="flex items-center justify-between gap-2 md:gap-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <Menu className="w-6 h-6" />
                </button>
                <div className="lg:hidden font-extrabold text-base tracking-tight text-green-600 dark:text-green-400">
                  Spiritmed
                </div>
              </div>

              <div className="hidden lg:flex items-center gap-2">
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="flex items-center justify-center p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition border border-gray-200 dark:border-gray-700 shadow-sm"
                  title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <Menu className="w-5 h-5" />
                </button>
              </div>

              {/* Desktop & Tablet Action Links */}
              <div className="hidden lg:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 ml-4">
                <a href="/patients" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shrink-0 shadow-2xs">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>New Patient</span>
                </a>
                <a href="/patient-history" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition shrink-0 border border-gray-200/80 dark:border-gray-700">
                  <History className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Patient History</span>
                </a>
                <a href="/appointments" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition shrink-0 border border-gray-200/80 dark:border-gray-700">
                  <CalendarCheck className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Appointment</span>
                </a>
                <a href="/consultations" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition shrink-0 border border-gray-200/80 dark:border-gray-700">
                  <Stethoscope className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Consultation</span>
                </a>
                <a href="/prescriptions" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition shrink-0 border border-gray-200/80 dark:border-gray-700">
                  <Pill className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Prescription</span>
                </a>
                <a href="/operation-reports" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition shrink-0 border border-gray-200/80 dark:border-gray-700">
                  <ClipboardCheck className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Operations Report</span>
                </a>
                <a href="/estimates" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition shrink-0 border border-gray-200/80 dark:border-gray-700">
                  <CreditCard className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Estimate Bill</span>
                </a>
                <a href="/payments" className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition shrink-0 border border-gray-200/80 dark:border-gray-700">
                  <Wallet className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Record Payment</span>
                </a>
              </div>

              <div className="flex items-center space-x-1.5 md:space-x-3 ml-auto">
                {/* Quick Actions (Desktop only) */}
                <div className="hidden md:block relative" ref={quickActionRef}>
                  <button
                    onClick={() => setQuickActionOpen(!quickActionOpen)}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-blue-600 text-white text-xs md:text-sm font-bold rounded-lg hover:bg-blue-700 transition shadow-xs"
                    title="Quick Search"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Quick Modules</span>
                  </button>

                  {quickActionOpen && (
                    <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50">
                      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                          <input
                            type="text"
                            value={quickActionSearch}
                            onChange={(e) => setQuickActionSearch(e.target.value)}
                            placeholder="Search modules..."
                            className="w-full pl-9 pr-3 py-2 text-xs md:text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            autoFocus
                          />
                        </div>
                      </div>

                      <div className="max-h-80 overflow-y-auto">
                        {filteredModules.length === 0 ? (
                          <div className="p-4 text-center text-xs md:text-sm text-gray-500 dark:text-gray-400">
                            No modules found
                          </div>
                        ) : (
                          <div className="py-2">
                            {filteredModules.map((module) => (
                              <button
                                key={module.path}
                                onClick={() => handleModuleClick(module.path)}
                                className="w-full flex items-center space-x-3 px-4 py-2 text-xs md:text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                              >
                                <module.icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 text-left">
                                  <div className="font-medium">{module.label}</div>
                                  <div className="text-[10px] md:text-xs text-gray-500 dark:text-gray-400">{module.category}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <NotificationDropdown />

                <button
                  onClick={toggleTheme}
                  className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
                  title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
                </button>

                {/* User Profile & Sign Out Dropdown */}
                <div className="relative" ref={userDropdownRef}>
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="p-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition flex items-center justify-center"
                    title="User Account & Sign Out"
                  >
                    <User className="w-5 h-5 text-gray-700 dark:text-gray-200" />
                  </button>

                  {userDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 p-2 space-y-1">
                      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                        <p className="font-bold text-xs text-gray-900 dark:text-white truncate">
                          {profile?.full_name || 'Medical Staff'}
                        </p>
                        <p className="text-[10px] font-mono text-gray-500 capitalize mt-0.5">
                          Role: {profile?.role || 'User'}
                        </p>
                      </div>

                      <a
                        href="/profile"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center space-x-2 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                      >
                        <User className="w-4 h-4 text-blue-600" />
                        <span>My Profile Settings</span>
                      </a>

                      <button
                        onClick={() => { setUserDropdownOpen(false); handleSignOut(); }}
                        className="w-full flex items-center space-x-2 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition text-left"
                      >
                        <LogOut className="w-4 h-4 text-rose-600" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="p-3 md:p-6 pb-24 lg:pb-6 dark:text-white">
          {children}
        </main>
      </div>

      {/* Admin-only: Floating edit approval requests panel */}
      <ApprovalRequestPanel />

      {/* Floating Messenger Widget across all pages */}
      <FloatingChatWidget />

      {/* 📱 Mobile Bottom Navigation Bar (Module-by-Module Navigator) */}
      <div className="print:hidden lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <a
          href="/dashboard"
          className={`flex flex-col items-center py-1 px-2 rounded-lg text-xs transition ${currentPath === '/dashboard' ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Dashboard</span>
        </a>

        <a
          href="/patients"
          className={`flex flex-col items-center py-1 px-2 rounded-lg text-xs transition ${currentPath.startsWith('/patients') ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Patients</span>
        </a>

        <a
          href="/appointments"
          className={`flex flex-col items-center py-1 px-2 rounded-lg text-xs transition ${currentPath.startsWith('/appointments') ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}
        >
          <Calendar className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Appts</span>
        </a>

        <a
          href="/consultations"
          className={`flex flex-col items-center py-1 px-2 rounded-lg text-xs transition ${currentPath === '/consultations' ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}
        >
          <Stethoscope className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">Clinical</span>
        </a>

        <button
          onClick={() => setMobileModuleDrawerOpen(true)}
          className="flex flex-col items-center py-1 px-2 rounded-lg text-xs text-blue-600 dark:text-blue-400 font-semibold"
        >
          <Layers className="w-5 h-5 mb-0.5 text-blue-600 dark:text-blue-400" />
          <span className="text-[10px]">Modules</span>
        </button>
      </div>

      {/* 📦 Mobile Module-by-Module Directory Drawer Grid */}
      {mobileModuleDrawerOpen && (
        <div className="print:hidden lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Module Navigator</h3>
              </div>
              <button
                onClick={() => setMobileModuleDrawerOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-6 touch-scrolling">
              {filteredGroups.map((group) => (
                <div key={group.title} className="space-y-2">
                  <h4 className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">
                    {group.title}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <button
                        key={item.path}
                        onClick={() => handleModuleClick(item.path)}
                        className={`flex items-center space-x-2.5 p-2.5 rounded-xl border text-left transition ${currentPath === item.path ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 font-semibold' : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'}`}
                      >
                        <item.icon className="w-4 h-4 text-green-600 shrink-0" />
                        <span className="text-xs font-medium truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
