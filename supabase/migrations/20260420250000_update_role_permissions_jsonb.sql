-- Migration: Upgrade JSONB Role Permissions with All 32 System Modules
-- Date: 2026-04-20

-- Function to generate expanded JSONB permissions object for all 32 modules
CREATE OR REPLACE FUNCTION update_all_role_permissions(is_admin BOOLEAN) 
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'dashboard', jsonb_build_object('view', true, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'branches', jsonb_build_object('view', is_admin, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'patients', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'appointments', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'medical_records', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'clinical_reports', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'clinical_setup', jsonb_build_object('view', true, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'assets_register', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'asset_categories', jsonb_build_object('view', true, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'inventory', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'suppliers', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'inventory_categories', jsonb_build_object('view', true, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'inventory_units', jsonb_build_object('view', true, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'hospital_files', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'billing', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'payment_procedures', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'estimates', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'payments', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'medical_aids', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'expenses', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'expense_categories', jsonb_build_object('view', true, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'accounting', jsonb_build_object('view', is_admin, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'staff', jsonb_build_object('view', is_admin, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'roles', jsonb_build_object('view', is_admin, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'attendance', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'leave_management', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'payroll', jsonb_build_object('view', is_admin, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'human_resources', jsonb_build_object('view', is_admin, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'referral_doctors', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', is_admin),
        'communication', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
        'statistics', jsonb_build_object('view', true, 'add', is_admin, 'edit', is_admin, 'delete', is_admin),
        'audit_logs', jsonb_build_object('view', is_admin, 'add', false, 'edit', false, 'delete', false),
        'settings', jsonb_build_object('view', is_admin, 'add', is_admin, 'edit', is_admin, 'delete', is_admin)
    );
END;
$$ LANGUAGE plpgsql;

-- Update Admin / Super Admin roles with full access to all 32 modules
UPDATE roles 
SET permissions = update_all_role_permissions(true) 
WHERE name IN ('Super Admin', 'Admin') OR base_role = 'admin';

-- Update clinical & staff roles (Doctor, Nurse, Accountant, Receptionist) with standard access
UPDATE roles 
SET permissions = update_all_role_permissions(false) 
WHERE name NOT IN ('Super Admin', 'Admin') AND base_role != 'admin';

-- Cleanup temporary function
DROP FUNCTION update_all_role_permissions(BOOLEAN);
