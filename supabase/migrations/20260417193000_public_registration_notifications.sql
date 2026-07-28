-- Migration: Public Registration Notifications Trigger
-- Description: Triggers a notification for branch staff when a new patient registers via the public link.

-- 1. Create the notification handler function
CREATE OR REPLACE FUNCTION public.handle_public_registration_notification()
RETURNS TRIGGER AS $$
DECLARE
    staff_record RECORD;
BEGIN
    -- Find all users (admins and receptionists) in the same branch
    FOR staff_record IN 
        SELECT id 
        FROM public.users 
        WHERE branch_id = NEW.branch_id 
        AND role IN ('admin', 'receptionist', 'super_admin')
        AND is_active = true
    LOOP
        -- Insert a notification for each staff member
        INSERT INTO public.notifications (
            branch_id,
            user_id,
            title,
            message,
            type,
            is_read,
            link
        ) VALUES (
            NEW.branch_id,
            staff_record.id,
            'New Public Registration',
            NEW.full_name || ' has registered via the public link and is awaiting approval.',
            'registration',
            false,
            '/patients' -- Link to the patients page where pending registrations can be approved
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger on patient_temporary_db
-- Note: We use IF NOT EXISTS logic via a DO block to prevent errors if the trigger/table setup is already partially there
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'on_public_registration_insert'
    ) THEN
        CREATE TRIGGER on_public_registration_insert
        AFTER INSERT ON public.patient_temporary_db
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_public_registration_notification();
    END IF;
END $$;
