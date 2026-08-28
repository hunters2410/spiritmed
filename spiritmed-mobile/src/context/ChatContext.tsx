import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { playNotificationBeep } from '../utils/notificationBeep';

interface ChatContextType {
  unreadCount: number;
  unreadMap: Record<string, number>;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  markAsRead: (conversationId: string) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType>({
  unreadCount: 0,
  unreadMap: {},
  activeConversationId: null,
  setActiveConversationId: () => {},
  markAsRead: async () => {},
  refreshUnreadCount: async () => {},
});

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConvoRef = useRef<string | null>(null);

  useEffect(() => {
    activeConvoRef.current = activeConversationId;
  }, [activeConversationId]);

  const refreshUnreadCount = async () => {
    if (!user?.id) {
      setUnreadCount(0);
      setUnreadMap({});
      return;
    }

    try {
      // 1. Fetch all conversations this user participates in
      const { data: participants, error: pError } = await supabase
        .from('chat_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', user.id);

      if (pError || !participants || participants.length === 0) {
        setUnreadCount(0);
        setUnreadMap({});
        return;
      }

      const map: Record<string, number> = {};
      let total = 0;

      // 2. For each conversation, count unread messages
      await Promise.all(
        participants.map(async (p) => {
          let query = supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', p.conversation_id)
            .neq('sender_id', user.id);

          if (p.last_read_at) {
            query = query.gt('created_at', p.last_read_at);
          }

          const { count, error } = await query;
          if (!error && count !== null) {
            map[p.conversation_id] = count;
            total += count;
          }
        })
      );

      setUnreadMap(map);
      setUnreadCount(total);
    } catch (err) {
      console.error('Error refreshing unread count:', err);
    }
  };

  const markAsRead = async (conversationId: string) => {
    if (!user?.id || !conversationId) return;

    try {
      const now = new Date().toISOString();
      await supabase
        .from('chat_participants')
        .update({ last_read_at: now })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);

      setUnreadMap((prev) => {
        const currentConvoUnread = prev[conversationId] || 0;
        const newMap = { ...prev, [conversationId]: 0 };
        setUnreadCount((prevTotal) => Math.max(0, prevTotal - currentConvoUnread));
        return newMap;
      });
    } catch (err) {
      console.error('Error marking conversation as read:', err);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      setUnreadMap({});
      return;
    }

    refreshUnreadCount();

    // Listen to real-time chat_messages
    const channelName = `global_chat_unread_${user.id}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg || newMsg.sender_id === user.id) return;

          // Check if this message belongs to a conversation of this user
          const { data: participation } = await supabase
            .from('chat_participants')
            .select('id')
            .eq('conversation_id', newMsg.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!participation) return;

          // If user is currently looking at this conversation, auto-mark as read
          if (activeConvoRef.current === newMsg.conversation_id) {
            await supabase
              .from('chat_participants')
              .update({ last_read_at: new Date().toISOString() })
              .eq('conversation_id', newMsg.conversation_id)
              .eq('user_id', user.id);
            return;
          }

          // 🔊 Play notification beep sound
          playNotificationBeep();

          // Otherwise increment unread count
          setUnreadMap((prev) => {
            const nextCount = (prev[newMsg.conversation_id] || 0) + 1;
            return { ...prev, [newMsg.conversation_id]: nextCount };
          });
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return (
    <ChatContext.Provider
      value={{
        unreadCount,
        unreadMap,
        activeConversationId,
        setActiveConversationId,
        markAsRead,
        refreshUnreadCount,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatUnread() {
  return useContext(ChatContext);
}
