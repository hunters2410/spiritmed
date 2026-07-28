-- Dynamic Permission System Initialization
-- Date: 2026-04-20

-- 1. Ensure roles table has the permissions JSONB column
-- (Already exists in the schema, but let's be sure and set a default)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'roles' AND column_name = 'permissions'
    ) THEN
        ALTER TABLE roles ADD COLUMN permissions JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Add role_id to users to link them to specific role records
-- This allows for custom roles beyond the hardcoded 'role' text field.
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'role_id'
    ) THEN
        ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Seed Default Roles with Permissions
-- A helper function to generate standard permission blocks
CREATE OR REPLACE FUNCTION generate_all_permissions(can BOOLEAN) 
RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'dashboard', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
        'branches', jsonb_build_object('view', can, 'add', can, 'edit', can, 'delete', can),
        'patients', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can),
        'appointments', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can),
        'consultations', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can),
        'prescriptions', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can),
        'clinical_reports', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can),
        'inventory', jsonb_build_object('view', true, 'add', can, 'edit', can, 'delete', can),
        'billing', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', can),
        'staff', jsonb_build_object('view', can, 'add', can, 'edit', can, 'delete', can),
        'communication', jsonb_build_object('view', true, 'add', true, 'edit', true, 'delete', true),
        'settings', jsonb_build_object('view', can, 'add', can, 'edit', can, 'delete', can)
    );
END;
$$ LANGUAGE plpgsql;

-- Insert systemic roles if they don't exist
-- We'll use a specific branch_id if available, or NULL for systemic roles.
INSERT INTO roles (name, base_role, description, permissions, is_active)
SELECT 'Super Admin', 'admin', 'System-wide full access', generate_all_permissions(true), true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Super Admin');

INSERT INTO roles (name, base_role, description, permissions, is_active)
SELECT 'Admin', 'admin', 'Branch administration access', generate_all_permissions(true), true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Admin');

INSERT INTO roles (name, base_role, description, permissions, is_active)
SELECT 'Doctor', 'doctor', 'Medical staff access', generate_all_permissions(false), true
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Doctor');

-- 4. Migrate users to the new role_id system
-- This links existing users based on their text role string.
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.role = r.base_role AND u.role_id IS NULL;

-- Also handle super_admin explicitly
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.role = 'super_admin' AND r.name = 'Super Admin' AND u.role_id IS NULL;

-- Cleanup helper function
DROP FUNCTION generate_all_permissions(BOOLEAN);
