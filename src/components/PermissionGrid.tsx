import React, { useState, useMemo } from 'react';
import { Eye, Plus, Edit2, Trash2, CheckCircle2, Circle, CheckSquare, XSquare, Search } from 'lucide-react';

export interface ModulePermission {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

export interface Permissions {
  [module: string]: ModulePermission;
}

interface PermissionGridProps {
  permissions: Permissions;
  onChange: (newPermissions: Permissions) => void;
  readOnly?: boolean;
}

export const MODULES = [
  // 1. Main
  { id: 'dashboard', label: 'Dashboard', category: 'Main' },
  { id: 'branches', label: 'Branches', category: 'Main' },

  // 2. Patient Management
  { id: 'patients', label: 'All Patients', category: 'Patient Management' },
  { id: 'patient_history', label: 'Patient History', category: 'Patient Management' },
  { id: 'deceased_patients', label: 'Deceased Patients', category: 'Patient Management' },
  { id: 'discharged_patients', label: 'Discharged Patients', category: 'Patient Management' },
  { id: 'old_patients', label: 'Old Patients', category: 'Patient Management' },
  { id: 'patient_files', label: 'Patient Files', category: 'Patient Management' },
  { id: 'file_number_pool', label: 'File Number Pool', category: 'Patient Management' },
  { id: 'reports_statistics', label: 'Reports Statistics', category: 'Patient Management' },

  // 3. Appointment
  { id: 'appointments', label: 'Appointments', category: 'Appointment' },
  { id: 'appointment_calendar', label: 'Appointment Calendar', category: 'Appointment' },
  { id: 'appointment_schedule', label: 'Appointment Schedule', category: 'Appointment' },
  { id: 'online_booking', label: 'Online Booking', category: 'Appointment' },
  { id: 'appointment_reports', label: 'Appointment Reports', category: 'Appointment' },

  // 4. Medical Records
  { id: 'consultations', label: 'Consultations', category: 'Medical Records' },
  { id: 'prescriptions', label: 'Prescriptions', category: 'Medical Records' },
  { id: 'vital_signs', label: 'Vital Signs', category: 'Medical Records' },
  { id: 'lab_results', label: 'Lab Results', category: 'Medical Records' },
  { id: 'follow_ups', label: 'Follow-ups', category: 'Medical Records' },

  // 5. Clinical Reports
  { id: 'medical_reports', label: 'Medical Reports', category: 'Clinical Reports' },
  { id: 'discharge_summaries', label: 'Discharge Summaries', category: 'Clinical Reports' },
  { id: 'referral_forms', label: 'Referral Forms', category: 'Clinical Reports' },
  { id: 'operation_reports', label: 'Operation Reports', category: 'Clinical Reports' },
  { id: 'medical_certificates', label: 'Medical Certificates', category: 'Clinical Reports' },
  { id: 'admission_letters', label: 'Admission Letters', category: 'Clinical Reports' },

  // 6. Prescription Items
  { id: 'medicines', label: 'Medicines', category: 'Prescription Items' },
  { id: 'medicine_frequencies', label: 'Frequency', category: 'Prescription Items' },

  // 7. Clinical Setup
  { id: 'complaints', label: 'Complaints', category: 'Clinical Setup' },
  { id: 'investigations', label: 'Investigations', category: 'Clinical Setup' },
  { id: 'diagnoses', label: 'Diagnoses', category: 'Clinical Setup' },
  { id: 'histology', label: 'Histology', category: 'Clinical Setup' },
  { id: 'anaesthetists', label: 'Anaesthetists', category: 'Clinical Setup' },
  { id: 'surgical_procedures', label: 'Surgical Procedures', category: 'Clinical Setup' },
  { id: 'assistants', label: 'Assistants', category: 'Clinical Setup' },
  { id: 'hospitals', label: 'Hospitals', category: 'Clinical Setup' },

  // 8. Financial Management
  { id: 'billing', label: 'Invoice / Bills', category: 'Financial Management' },
  { id: 'patient_due', label: 'Patient Due', category: 'Financial Management' },
  { id: 'payment_procedures', label: 'Payment Procedures', category: 'Financial Management' },
  { id: 'estimates', label: 'Estimate Bill', category: 'Financial Management' },
  { id: 'payments', label: 'Payments', category: 'Financial Management' },
  { id: 'medical_aids', label: 'Medical Aids', category: 'Financial Management' },
  { id: 'expenses', label: 'Expenses', category: 'Financial Management' },
  { id: 'expense_categories', label: 'Expense Categories', category: 'Financial Management' },
  { id: 'accounting', label: 'Accounting', category: 'Financial Management' },

  // 9. Inventory & Resources
  { id: 'assets_register', label: 'Assets Register', category: 'Inventory & Resources' },
  { id: 'asset_categories', label: 'Asset Categories', category: 'Inventory & Resources' },
  { id: 'inventory', label: 'Inventory', category: 'Inventory & Resources' },
  { id: 'suppliers', label: 'Suppliers', category: 'Inventory & Resources' },
  { id: 'inventory_categories', label: 'Inventory Categories', category: 'Inventory & Resources' },
  { id: 'inventory_units', label: 'Inventory Units', category: 'Inventory & Resources' },
  { id: 'hospital_files', label: 'Hospital Files', category: 'Inventory & Resources' },

  // 10. Staff Management
  { id: 'staff', label: 'User Management', category: 'Staff Management' },
  { id: 'roles', label: 'Roles', category: 'Staff Management' },
  { id: 'attendance', label: 'Attendance', category: 'Staff Management' },
  { id: 'leave_management', label: 'Leave Management', category: 'Staff Management' },
  { id: 'payroll', label: 'Payroll', category: 'Staff Management' },
  { id: 'human_resources', label: 'Human Resources', category: 'Staff Management' },

  // 11. Third Party
  { id: 'referral_doctors', label: 'Referral Doctors', category: 'Third Party' },

  // 12. Communication
  { id: 'chats', label: 'Internal Chats', category: 'Communication' },
  { id: 'notifications', label: 'Notifications', category: 'Communication' },
  { id: 'emails', label: 'Email Management', category: 'Communication' },
  { id: 'sms', label: 'SMS Management', category: 'Communication' },

  // 13. Reports & Analytics
  { id: 'statistics', label: 'Statistics', category: 'Reports & Analytics' },

  // 14. System
  { id: 'audit_logs', label: 'Audit Logs', category: 'System' },
  { id: 'profile', label: 'Profile', category: 'System' },
  { id: 'settings', label: 'Settings', category: 'System' }
];

const ACTIONS = [
  { id: 'view', label: 'View', icon: Eye, color: 'text-blue-600' },
  { id: 'add', label: 'Add', icon: Plus, color: 'text-green-600' },
  { id: 'edit', label: 'Edit', icon: Edit2, color: 'text-amber-600' },
  { id: 'delete', label: 'Delete', icon: Trash2, color: 'text-red-600' }
] as const;

export function PermissionGrid({ permissions, onChange, readOnly = false }: PermissionGridProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const set = new Set<string>();
    MODULES.forEach(m => set.add(m.category));
    return ['all', ...Array.from(set)];
  }, []);

  const filteredModules = useMemo(() => {
    return MODULES.filter(m => {
      const matchCat = selectedCategory === 'all' || m.category === selectedCategory;
      const q = search.toLowerCase().trim();
      const matchSearch = !q || m.label.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [search, selectedCategory]);

  const handleToggle = (moduleId: string, actionId: keyof ModulePermission) => {
    if (readOnly) return;
    
    const current = permissions[moduleId] || { view: false, add: false, edit: false, delete: false };
    const updatedModule = { ...current, [actionId]: !current[actionId] };
    
    if (actionId !== 'view' && updatedModule[actionId]) {
      updatedModule.view = true;
    }
    
    if (actionId === 'view' && !updatedModule.view) {
      updatedModule.add = false;
      updatedModule.edit = false;
      updatedModule.delete = false;
    }

    onChange({
      ...permissions,
      [moduleId]: updatedModule
    });
  };

  const handleGrantFullAccess = () => {
    if (readOnly) return;
    const fullAccess: Permissions = { ...permissions };
    filteredModules.forEach(mod => {
      fullAccess[mod.id] = { view: true, add: true, edit: true, delete: true };
    });
    onChange(fullAccess);
  };

  const handleGrantViewOnly = () => {
    if (readOnly) return;
    const viewOnlyAccess: Permissions = { ...permissions };
    filteredModules.forEach(mod => {
      viewOnlyAccess[mod.id] = { view: true, add: false, edit: false, delete: false };
    });
    onChange(viewOnlyAccess);
  };

  const handleClearAll = () => {
    if (readOnly) return;
    const cleared: Permissions = { ...permissions };
    filteredModules.forEach(mod => {
      cleared[mod.id] = { view: false, add: false, edit: false, delete: false };
    });
    onChange(cleared);
  };

  const handleToggleCategory = (catName: string, grant: boolean) => {
    if (readOnly) return;
    const nextPerms = { ...permissions };
    MODULES.filter(m => m.category === catName).forEach(mod => {
      nextPerms[mod.id] = {
        view: grant,
        add: grant,
        edit: grant,
        delete: grant
      };
    });
    onChange(nextPerms);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Filter modules..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {categories.length > 2 && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs py-1.5 px-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
            >
              {categories.map(c => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Categories' : c}
                </option>
              ))}
            </select>
          )}
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGrantFullAccess}
              className="px-3 py-1.5 bg-green-50 hover:bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-green-200 dark:border-green-800"
              title="Grant full access to filtered modules"
            >
              <CheckSquare className="w-3.5 h-3.5" /> Grant Full Access
            </button>
            <button
              type="button"
              onClick={handleGrantViewOnly}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-blue-200 dark:border-blue-800"
              title="Grant view-only access to filtered modules"
            >
              <Eye className="w-3.5 h-3.5" /> View Only All
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-bold transition flex items-center gap-1 border border-gray-300 dark:border-gray-600"
              title="Revoke all permissions for filtered modules"
            >
              <XSquare className="w-3.5 h-3.5" /> Revoke All
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs max-h-[55vh] overflow-y-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-xs">
            <tr>
              <th className="px-4 py-3 font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Module Name ({filteredModules.length} Total)
              </th>
              {ACTIONS.map((action) => (
                <th key={action.id} className="px-4 py-3 text-center font-black text-gray-600 dark:text-gray-300 uppercase tracking-wider w-20">
                  <div className="flex flex-col items-center gap-1">
                    <action.icon className={`w-4 h-4 ${action.color}`} />
                    <span>{action.label}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-medium">
            {filteredModules.map((module, idx) => {
              const showCategoryHeader = idx === 0 || module.category !== filteredModules[idx - 1].category;
              return (
                <React.Fragment key={module.id}>
                  {showCategoryHeader && (
                    <tr className="bg-gray-100/80 dark:bg-gray-800/80 border-y border-gray-200 dark:border-gray-700">
                      <td colSpan={5} className="px-4 py-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[11px] uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            📁 {module.category}
                          </span>
                          {!readOnly && (
                            <div className="flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handleToggleCategory(module.category, true)}
                                className="text-green-600 hover:underline font-bold"
                              >
                                Enable All
                              </button>
                              <span className="text-gray-300 dark:text-gray-600">|</span>
                              <button
                                type="button"
                                onClick={() => handleToggleCategory(module.category, false)}
                                className="text-red-500 hover:underline font-bold"
                              >
                                Disable All
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="font-bold text-gray-900 dark:text-white text-xs">{module.label}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{module.id}</div>
                    </td>
                    {ACTIONS.map((action) => {
                      const isEnabled = (permissions[module.id] as any)?.[action.id] || false;
                      return (
                        <td key={action.id} className="px-4 py-2 text-center">
                          <button
                            type="button"
                            disabled={readOnly}
                            onClick={() => handleToggle(module.id, action.id as keyof ModulePermission)}
                            className={`transition-all p-1 rounded-lg ${
                              readOnly ? 'cursor-default' : 'hover:scale-110 active:scale-95'
                            }`}
                          >
                            {isEnabled ? (
                              <CheckCircle2 className={`w-5 h-5 ${action.color}`} />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
