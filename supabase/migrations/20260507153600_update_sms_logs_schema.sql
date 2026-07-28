-- Update sms_logs table to match the latest smsService code
DO $$ 
BEGIN
    -- 1. Rename columns if they exist in old format
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_logs' AND column_name = 'recipient_phone') THEN
        ALTER TABLE public.sms_logs RENAME COLUMN recipient_phone TO phone_number;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_logs' AND column_name = 'message') THEN
        ALTER TABLE public.sms_logs RENAME COLUMN message TO message_body;
    END IF;

    -- 2. Add missing columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_logs' AND column_name = 'patient_id') THEN
        ALTER TABLE public.sms_logs ADD COLUMN patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_logs' AND column_name = 'template_id') THEN
        ALTER TABLE public.sms_logs ADD COLUMN template_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_logs' AND column_name = 'provider') THEN
        ALTER TABLE public.sms_logs ADD COLUMN provider TEXT DEFAULT 'msg91';
    END IF;

    -- 3. Update status constraint
    ALTER TABLE public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_status_check;
    ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_status_check CHECK (status IN ('sending', 'sent', 'failed', 'pending'));
END $$;
