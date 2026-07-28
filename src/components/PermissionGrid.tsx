import { Eye, Plus, Edit2, Trash2, CheckCircle2, Circle } from 'lucide-react';

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

const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'branches', label: 'Branches' },
  { id: 'patients', label: 'Patient Management' },
  { id: 'appointments', label: 'Appointment' },
  { id: 'medical_records', label: 'Medical Records' },
  { id: 'clinical_reports', label: 'Clinical Reports' },
  { id: 'clinical_setup', label: 'Clinical Setup' },
  { id: 'inventory', label: 'Inventory & Resources' },
  { id: 'billing', label: 'Financial Management' },
  { id: 'medical_aids', label: 'Medical Aids' },
  { id: 'staff', label: 'Staff Management' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'leave_management', label: 'Leave Management' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'human_resources', label: 'Human Resources' },
  { id: 'communication', label: 'Communication' },
  { id: 'statistics', label: 'Reports & Analytics' },
  { id: 'audit_logs', label: 'Audit Logs' },
  { id: 'settings', label: 'System Settings' }
];

const ACTIONS = [
  { id: 'view', label: 'View', icon: Eye, color: 'text-blue-600' },
  { id: 'add', label: 'Add', icon: Plus, color: 'text-green-600' },
  { id: 'edit', label: 'Edit', icon: Edit2, color: 'text-amber-600' },
  { id: 'delete', label: 'Delete', icon: Trash2, color: 'text-red-600' }
] as const;

export function PermissionGrid({ permissions, onChange, readOnly = false }: PermissionGridProps) {
  const handleToggle = (moduleId: string, actionId: keyof ModulePermission) => {
    if (readOnly) return;
    
    const current = permissions[moduleId] || { view: false, add: false, edit: false, delete: false };
    const updatedModule = { ...current, [actionId]: !current[actionId] };
    
    // If enabling add, edit, or delete, automatically enable view
    if (actionId !== 'view' && updatedModule[actionId]) {
      updatedModule.view = true;
    }
    
    // If disabling view, automatically disable all other actions
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/50">
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Module
            </th>
            {ACTIONS.map((action) => (
              <th key={action.id} className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <div className="flex flex-col items-center gap-1">
                  <action.icon className={`w-4 h-4 ${action.color}`} />
                  <span>{action.label}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {MODULES.map((module) => (
            <tr key={module.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {module.label}
                </div>
              </td>
              {ACTIONS.map((action) => {
                const isEnabled = (permissions[module.id] as any)?.[action.id] || false;
                return (
                  <td key={action.id} className="px-4 py-3 text-center">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => handleToggle(module.id, action.id as keyof ModulePermission)}
                      className={`transition-all p-1 rounded-md ${
                        readOnly ? 'cursor-default' : 'hover:scale-110 active:scale-95'
                      }`}
                    >
                      {isEnabled ? (
                        <CheckCircle2 className={`w-6 h-6 ${action.color}`} />
                      ) : (
                        <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
