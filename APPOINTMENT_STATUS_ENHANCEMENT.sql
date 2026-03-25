-- Add cancellation_reason to appointments
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- Update status constraint to include new values if necessary
-- Note: 'treated' is the new display name for 'completed', but we can add it as a primary status
ALTER TABLE public.appointments 
DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('pending_confirmation', 'confirmed', 'cancelled', 'treated', 'completed'));

-- Add updated_at for tracking changes
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
