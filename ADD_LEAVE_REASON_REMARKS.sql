-- Add rejection_reason and approver_remarks columns to leave_requests table if they don't exist
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS approver_remarks text;
