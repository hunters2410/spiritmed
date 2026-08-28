-- Migration: Strict User Chat Ownership RLS
-- Date: 2026-04-20
-- Description: Ensures logged-in users can strictly ONLY view and access chats where they are explicit participants.

-- 1. Helper function to safely check participation
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

-- 2. Drop existing overly broad admin override policies
DROP POLICY IF EXISTS "chat_conversations_select" ON chat_conversations;
DROP POLICY IF EXISTS "chat_conversations_admin" ON chat_conversations;
DROP POLICY IF EXISTS "chat_participants_select" ON chat_participants;
DROP POLICY IF EXISTS "chat_participants_insert" ON chat_participants;
DROP POLICY IF EXISTS "chat_messages_select" ON chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON chat_messages;

-- 3. Strict chat_conversations Policy: Only participants can view
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_conversations_participant_select"
ON chat_conversations FOR SELECT
TO authenticated
USING (
  public.is_chat_participant(id, auth.uid())
);

CREATE POLICY "chat_conversations_participant_insert"
ON chat_conversations FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4. Strict chat_participants Policy: Users can only see participation records for conversations they belong to
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_participants_strict_select"
ON chat_participants FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR public.is_chat_participant(conversation_id, auth.uid())
);

CREATE POLICY "chat_participants_strict_insert"
ON chat_participants FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() OR public.is_chat_participant(conversation_id, auth.uid())
);

-- 5. Strict chat_messages Policy: Only participants can view and send messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_strict_select"
ON chat_messages FOR SELECT
TO authenticated
USING (
  public.is_chat_participant(conversation_id, auth.uid())
);

CREATE POLICY "chat_messages_strict_insert"
ON chat_messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid() AND public.is_chat_participant(conversation_id, auth.uid())
);
