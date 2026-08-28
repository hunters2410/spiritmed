-- Migration: Enable Realtime for Notifications and Chat Tables & Performance Indexes
-- Date: 2026-04-20

DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- 1. Ensure notifications table is in realtime publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
    END IF;

    -- 2. Ensure chat_messages is in realtime publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
    END IF;

    -- 3. Ensure chat_conversations is in realtime publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'chat_conversations'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
    END IF;

    -- 4. Ensure chat_participants is in realtime publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'chat_participants'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_participants;
    END IF;
  END IF;
END $$;

-- Add indexes for fast unread count lookups
CREATE INDEX IF NOT EXISTS idx_chat_participants_user_convo ON chat_participants(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_convo_created ON chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);

-- 5. Ensure authenticated users can insert notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'notifications' AND policyname = 'Users can insert notifications'
  ) THEN
    CREATE POLICY "Users can insert notifications" 
    ON notifications FOR INSERT 
    TO authenticated 
    WITH CHECK (true);
  END IF;
END $$;

-- 6. Trigger function to automatically generate notifications for chat message recipients
CREATE OR REPLACE FUNCTION public.handle_new_chat_message_notification()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  msg_preview TEXT;
  part RECORD;
BEGIN
  -- Fetch sender's full name
  SELECT full_name INTO sender_name FROM public.users WHERE id = NEW.sender_id;
  IF sender_name IS NULL OR sender_name = '' THEN
    sender_name := 'Staff Member';
  END IF;

  -- Create clean preview text based on message content type
  IF NEW.content LIKE '[IMAGE:%' THEN
    msg_preview := '📷 Sent an image';
  ELSIF NEW.content LIKE '[FILE:%' THEN
    msg_preview := '📎 Sent a document';
  ELSIF NEW.content LIKE '[AUDIO:%' THEN
    msg_preview := '🎤 Sent a voice note';
  ELSE
    msg_preview := substring(NEW.content from 1 for 120);
  END IF;

  -- Create a notification for each recipient participant in this conversation
  FOR part IN 
    SELECT user_id FROM public.chat_participants 
    WHERE conversation_id = NEW.conversation_id 
      AND user_id <> NEW.sender_id
  LOOP
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      link,
      is_read,
      created_at
    ) VALUES (
      part.user_id,
      'chat_message',
      'Message from ' || sender_name,
      msg_preview,
      '/chats',
      false,
      NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-create trigger on chat_messages
DROP TRIGGER IF EXISTS trg_notify_on_chat_message ON public.chat_messages;

CREATE TRIGGER trg_notify_on_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_chat_message_notification();

