import { useState, useEffect, useRef } from 'react';
import { Search, X, FileText, Users, Calendar, Building2, Stethoscope, UserPlus, PhoneCall, Calculator } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  icon: any;
  path: string;
}

interface NavItem {
  label: string;
  path: string;
}
const navigationItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Branches', path: '/branches' },
  { label: 'All Patients', path: '/patients' },
  { label: 'Consultations', path: '/consultations' },
  { label: 'Prescriptions', path: '/prescriptions' },
  { label: 'Lab Results', path: '/lab-results' },
  { label: 'Medical Reports', path: '/medical-reports' },
  { label: 'Discharge Summaries', path: '/discharge-summaries' },
  { label: 'Referral Forms', path: '/referral-forms' },
  { label: 'Operation Reports', path: '/operation-reports' },
  { label: 'Medical Certificates', path: '/medical-certificates' },
  { label: 'Admission Letters', path: '/admission-letters' },
  { label: 'Medicines', path: '/medicines' },
  { label: 'Complaints', path: '/complaints' },
  { label: 'Investigations', path: '/investigations' },
  { label: 'Diagnoses', path: '/diagnoses' },
  { label: 'Histology', path: '/histology' },
  { label: 'Anaesthetists', path: '/anaesthetists' },
  { label: 'Assistants', path: '/assistants' },
  { label: 'Hospitals', path: '/hospitals' },
  { label: 'Profile', path: '/profile' },
  { label: 'Settings', path: '/settings' }
];

export function GlobalSearch() {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const searchData = async () => {
      setLoading(true);
      const searchResults: SearchResult[] = [];

      const navResults = navigationItems
        .filter(item => item.label.toLowerCase().includes(query.toLowerCase()))
        .map(item => ({
          id: item.path,
          type: 'navigation',
          title: item.label,
          icon: FileText,
          path: item.path
        }));

      searchResults.push(...navResults);

      try {
        let patientsQuery = supabase
          .from('patients')
          .select('id, full_name, date_of_birth, phone')
          .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(5);

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          patientsQuery = patientsQuery.eq('branch_id', profile.branch_id);
        }

        const { data: patients } = await patientsQuery;

        if (patients) {
          patients.forEach(patient => {
            searchResults.push({
              id: patient.id,
              type: 'patient',
              title: patient.full_name,
              subtitle: `${patient.phone || 'N/A'} • DOB: ${new Date(patient.date_of_birth).toLocaleDateString()}`,
              icon: Users,
              path: '/patients'
            });
          });
        }

        let usersQuery = supabase
          .from('users')
          .select('id, full_name, email, role')
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(5);

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          usersQuery = usersQuery.eq('branch_id', profile.branch_id);
        }

        const { data: users } = await usersQuery;

        if (users) {
          users.forEach(user => {
            const icons: Record<string, any> = {
              doctor: Stethoscope,
              nurse: UserPlus,
              receptionist: PhoneCall,
              accountant: Calculator,
              admin: Users
            };

            searchResults.push({
              id: user.id,
              type: 'staff',
              title: user.full_name,
              subtitle: `${user.role} • ${user.email}`,
              icon: icons[user.role] || Users,
              path: user.role === 'doctor' ? '/doctors' : user.role === 'nurse' ? '/nurses' : user.role === 'receptionist' ? '/receptionists' : '/users'
            });
          });
        }

        let appointmentsQuery = supabase
          .from('appointments')
          .select(`
            id,
            appointment_date,
            appointment_time,
            patients:patient_id (full_name),
            users:doctor_id (full_name)
          `)
          .limit(5)
          .order('appointment_date', { ascending: false });

        if (profile?.role !== 'super_admin' && profile?.branch_id) {
          appointmentsQuery = appointmentsQuery.eq('branch_id', profile.branch_id);
        }

        const { data: appointments } = await appointmentsQuery;

        if (appointments) {
          appointments
            .filter(apt => {
              const pName = Array.isArray(apt.patients) ? apt.patients[0]?.full_name : (apt.patients as any)?.full_name;
              const dName = Array.isArray(apt.users) ? apt.users[0]?.full_name : (apt.users as any)?.full_name;
              return pName?.toLowerCase().includes(query.toLowerCase()) || dName?.toLowerCase().includes(query.toLowerCase());
            })
            .forEach(appointment => {
              const pName = Array.isArray(appointment.patients) ? appointment.patients[0]?.full_name : (appointment.patients as any)?.full_name;
              const dName = Array.isArray(appointment.users) ? appointment.users[0]?.full_name : (appointment.users as any)?.full_name;
              searchResults.push({
                id: appointment.id,
                type: 'appointment',
                title: `Appointment - ${pName || 'Unknown'}`,
                subtitle: `Dr. ${dName || 'Unknown'} • ${new Date(appointment.appointment_date).toLocaleDateString()} ${appointment.appointment_time}`,
                icon: Calendar,
                path: '/appointments'
              });
            });
        }

        if (profile?.role === 'super_admin') {
          const { data: branches } = await supabase
            .from('branches')
            .select('id, name, location')
            .ilike('name', `%${query}%`)
            .limit(5);

          if (branches) {
            branches.forEach(branch => {
              searchResults.push({
                id: branch.id,
                type: 'branch',
                title: branch.name,
                subtitle: branch.location || 'N/A',
                icon: Building2,
                path: '/branches'
              });
            });
          }
        }
      } catch (error) {
        console.error('Search error:', error);
      }

      setResults(searchResults);
      setLoading(false);
    };

    const debounce = setTimeout(searchData, 300);
    return () => clearTimeout(debounce);
  }, [query, profile]);

  const handleResultClick = (path: string) => {
    window.location.href = path;
    setIsOpen(false);
    setQuery('');
  };

  const getTypeBadge = (type: string) => {
    const badges: Record<string, string> = {
      navigation: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
      patient: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
      staff: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400',
      appointment: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400',
      branch: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
    };
    return badges[type] || 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-400';
  };

  return (
    <>
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
      >
        <Search className="w-4 h-4" />
        <span className="hidden md:inline">Search...</span>
        <kbd className="hidden md:inline px-1.5 py-0.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">
          Ctrl+K
        </kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-20 px-4">
          <div ref={searchRef} className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden">
            <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patients, staff, appointments, navigation..."
                className="flex-1 px-4 py-4 text-sm bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-400"
                autoFocus
              />
              <button
                onClick={() => {
                  setIsOpen(false);
                  setQuery('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  {query.trim().length < 2 ? 'Type to search...' : 'No results found'}
                </div>
              ) : (
                <div className="py-2">
                  {results.map((result) => {
                    const Icon = result.icon;
                    return (
                      <button
                        key={`${result.type}-${result.id}`}
                        onClick={() => handleResultClick(result.path)}
                        className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left"
                      >
                        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {result.title}
                            </span>
                            <span className={`px-2 py-0.5 text-xs rounded-full capitalize ${getTypeBadge(result.type)}`}>
                              {result.type}
                            </span>
                          </div>
                          {result.subtitle && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                              {result.subtitle}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center space-x-4">
                  <span>Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded">ESC</kbd> to close</span>
                </div>
                <span>{results.length} results</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
