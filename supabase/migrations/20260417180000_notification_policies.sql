-- Migration: Notification RLS Policies
-- Date: 2026-04-17

-- Ensure RLS is enabled
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 1. Users can view their own notifications
CREATE POLICY "Users can view own notifications" 
ON notifications FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- 2. Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" 
ON notifications FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 3. Users can delete their own notifications
CREATE POLICY "Users can delete own notifications" 
ON notifications FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- 4. Enable Realtime for notifications table
-- This depends on how the DB is set up, but usually this is done in the Supabase UI.
-- For the sake of completeness, adding it to the publication if it exists.
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;
