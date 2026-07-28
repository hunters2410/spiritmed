-- Fix Missing Roles and Expand Permission Matrix
-- Date: 2026-04-20

-- 1. Helper function to generate standard permissions for all current UI modules
CREATE OR REPLACE FUNCTION generate_system_permissions(can_full_access BOOLEAN) 
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'dashboard', jsonb_build_object('view', true, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'branches', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'patients', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'appointments', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'medical_records', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'clinical_reports', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'clinical_setup', jsonb_build_object('view', true, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'inventory', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'billing', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'staff', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'attendance', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'leave_management', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'payroll', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'human_resources', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'medical_aids', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can_full_access),
        'communication', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
        'statistics', jsonb_build_object('view', true, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access),
        'audit_logs', jsonb_build_object('view', can_full_access, 'add', false, 'edit', false, 'delete', false),
        'settings', jsonb_build_object('view', can_full_access, 'add', can_full_access, 'edit', can_full_access, 'delete', can_full_access)
    );
END;
$$ LANGUAGE plpgsql;

-- 2. Seed missing systemic roles
INSERT INTO roles (name, base_role, description, permissions, is_active)
SELECT 'Nurse', 'nurse', 'Nursing staff access', generate_system_permissions(false), true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Nurse');

INSERT INTO roles (name, base_role, description, permissions, is_active)
SELECT 'Accountant', 'accountant', 'Financial staff access', generate_system_permissions(false), true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Accountant');

INSERT INTO roles (name, base_role, description, permissions, is_active)
SELECT 'Receptionist', 'receptionist', 'Front desk staff access', generate_system_permissions(false), true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Receptionist');

-- 3. Update existing systemic roles with expanded permissions
UPDATE roles SET permissions = generate_system_permissions(true) WHERE name = 'Super Admin';
UPDATE roles SET permissions = generate_system_permissions(true) WHERE name = 'Admin';
UPDATE roles SET permissions = generate_system_permissions(false) WHERE name = 'Doctor';
-- Force update Nurse/Accountant/Receptionist just in case they were partially created
UPDATE roles SET permissions = generate_system_permissions(false) WHERE name IN ('Nurse', 'Accountant', 'Receptionist');

-- 4. Retroactively link all users to their roles
-- First, link by base_role string
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.role = r.base_role AND u.role_id IS NULL;

-- Handle super_admin separately if needed (though base_role mapping should cover most)
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.role = 'super_admin' AND r.name = 'Super Admin' AND u.role_id IS NULL;

-- 5. Cleanup
DROP FUNCTION generate_system_permissions(BOOLEAN);
