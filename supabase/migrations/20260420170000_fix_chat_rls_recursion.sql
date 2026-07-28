-- Aggressive Fix for Infinite Recursion in chat_participants/chat_conversations RLS
-- Date: 2026-04-20

-- 1. PURGE ALL LEGACY POLICIES
-- This ensures no hidden or manually created policies are causing the recursion.
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE tablename IN ('chat_participants', 'chat_conversations', 'chat_messages')
    ) 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 2. CREATE SECURITY DEFINER HELPER
-- This function bypasses RLS to check membership safely.
CREATE OR REPLACE FUNCTION public.is_chat_participant(conv_id UUID, user_auth_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.chat_participants 
    WHERE conversation_id = conv_id 
    AND user_id = user_auth_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. APPLY CLEAN POLICIES - chat_conversations
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_conversations_select"
ON chat_conversations FOR SELECT
USING (
  public.is_chat_participant(id, auth.uid()) OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "chat_conversations_admin"
ON chat_conversations FOR ALL
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
);

-- 4. APPLY CLEAN POLICIES - chat_participants
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_participants_select"
ON chat_participants FOR SELECT
USING (
  user_id = auth.uid() OR -- Always see your own
  public.is_chat_participant(conversation_id, auth.uid()) -- See others in same convo
);

CREATE POLICY "chat_participants_insert"
ON chat_participants FOR INSERT
WITH CHECK (
  user_id = auth.uid() OR -- Add self
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'admin')) -- Admins add others
);

-- 5. APPLY CLEAN POLICIES - chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_select"
ON chat_messages FOR SELECT
USING (
  public.is_chat_participant(conversation_id, auth.uid())
);

CREATE POLICY "chat_messages_insert"
ON chat_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  public.is_chat_participant(conversation_id, auth.uid())
);
