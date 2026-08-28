import React, { useState, useEffect, useRef } from 'react';
import { supabase, UserProfile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  MessageSquare, X, Send, Paperclip, Mic, Trash2, Loader2, 
  ChevronLeft, Plus, User, Search, Bell, Sparkles, Smile, Image as ImageIcon
} from 'lucide-react';
import { ChatBubble } from './ChatBubble';
import { EmojiPicker } from './EmojiPicker';
import { formatDateDivider } from '../utils/chatDateUtils';

interface Conversation {
  id: string;
  last_message: string | null;
  last_message_at: string | null;
  is_group: boolean;
  name: string | null;
  participants: {
    user_id: string;
    user: UserProfile;
  }[];
  unread_count?: number;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: UserProfile;
}

// Web Audio API notification beep sound generator
function playNotificationBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // First Beep (800 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(800, ctx.currentTime);
    gain1.gain.setValueAtTime(0.35, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);

    // Second Beep (1050 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1050, ctx.currentTime + 0.16);
    gain2.gain.setValueAtTime(0.35, ctx.currentTime + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.16);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // Ignore audio restrictions if user has not interacted with DOM
  }
}

// Browser Native Notification & Tab Flashing Alert helper
let titleFlashTimer: any = null;

function triggerUnmissableChatAlert(senderName: string, previewText: string) {
  // 1. Browser Native Desktop Notification
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(`💬 Message from ${senderName}`, {
          body: previewText,
          tag: 'spiritmed-chat-alert',
          renotify: true
        });
        notif.onclick = () => {
          window.focus();
        };
      } catch (e) {
        // Silent fallback
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  // 2. Flashing Browser Tab Title Alert
  if (!document.hasFocus()) {
    if (titleFlashTimer) clearInterval(titleFlashTimer);
    let flag = false;
    titleFlashTimer = setInterval(() => {
      document.title = flag ? `💬 (1) New Message from ${senderName}` : `🔔 New Internal Chat Alert!`;
      flag = !flag;
    }, 1000);

    const clearFlash = () => {
      if (titleFlashTimer) {
        clearInterval(titleFlashTimer);
        titleFlashTimer = null;
        document.title = 'SpiritMed - Hospital Management System';
      }
      window.removeEventListener('focus', clearFlash);
    };
    window.addEventListener('focus', clearFlash);
  }
}

export function FloatingChatWidget() {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);

  // Search Conversations Filter
  const [convoSearchQuery, setConvoSearchQuery] = useState('');

  // Staff Directory Search State
  const [showStaffSearch, setShowStaffSearch] = useState(false);
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Animation Pulse State when new message arrives
  const [hasNewMessagePulse, setHasNewMessagePulse] = useState(false);

  // File Upload & Voice Note
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Notification Toast Popup
  const [toastNotification, setToastNotification] = useState<{ senderName: string; text: string; conversationId: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChatRef = useRef<Conversation | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);

  useEffect(() => {
    // Request Browser Desktop Notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (profile?.id) {
      loadConversations();
      const channel = supabase
        .channel('floating_chat_realtime')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages'
        }, async (payload) => {
          const newMsg = payload.new as Message;
          
          // Don't notify if message is sent by self
          if (newMsg.sender_id === profile.id) return;

          // Strictly verify that this message belongs to a conversation the logged-in user participates in
          const { data: myParticipant } = await supabase
            .from('chat_participants')
            .select('id')
            .eq('conversation_id', newMsg.conversation_id)
            .eq('user_id', profile.id)
            .maybeSingle();

          if (!myParticipant) return; // Ignore messages from conversations that don't belong to this user!

          // Fetch sender details
          const { data: sender } = await supabase
            .from('users')
            .select('*')
            .eq('id', newMsg.sender_id)
            .single();

          const senderName = sender?.full_name || 'Staff Member';
          
          let previewText = newMsg.content;
          if (previewText.startsWith('[IMAGE:')) previewText = '📷 Sent an image';
          else if (previewText.startsWith('[FILE:')) previewText = '📎 Sent a document';
          else if (previewText.startsWith('[AUDIO:')) previewText = '🎤 Sent a voice note';

          // 🔊 1. Play clear notification audio beep sound
          playNotificationBeep();

          // ⚡ 2. Trigger launcher button bounce animation & glow
          setHasNewMessagePulse(true);
          setTimeout(() => setHasNewMessagePulse(false), 8000);

          // 💻 3. Trigger Desktop Notification & Flashing Browser Tab Alert
          triggerUnmissableChatAlert(senderName, previewText);

          // 🔔 Note: System notification is automatically created in DB by trg_notify_on_chat_message trigger

          // If active chat is open, append message directly
          if (activeChatRef.current?.id === newMsg.conversation_id && isOpenRef.current) {
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, { ...newMsg, sender: sender as any }];
            });
          } else {
            // Show floating toast notification popup
            setToastNotification({
              senderName,
              text: previewText,
              conversationId: newMsg.conversation_id
            });

            setTimeout(() => {
              setToastNotification(null);
            }, 7000);
          }

          loadConversations();
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_participants'
        }, (payload) => {
          const updated = payload.new as any;
          if (updated) {
            setActiveChat(prev => {
              if (!prev || prev.id !== updated.conversation_id) return prev;
              return {
                ...prev,
                participants: (prev.participants || []).map((p: any) =>
                  p.user_id === updated.user_id
                    ? { ...p, last_read_at: updated.last_read_at }
                    : p
                )
              };
            });
          }
        })
        .subscribe();

      return () => {
        channel.unsubscribe();
      };
    }
  }, [profile?.id]);

  useEffect(() => {
    if (activeChat?.id && profile?.id) {
      loadMessages(activeChat.id);
      supabase
        .from('chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', activeChat.id)
        .eq('user_id', profile.id)
        .then(() => {
          setConversations(prev =>
            prev.map(c => (c.id === activeChat.id ? { ...c, unread_count: 0 } : c))
          );
        });
    }
  }, [activeChat?.id, profile?.id]);

  const isMessageRead = (msg: Message): boolean => {
    if (!activeChat || !profile) return false;
    const otherParticipants = (activeChat.participants || []).filter(
      (p: any) => p.user_id !== profile.id
    );
    if (otherParticipants.length === 0) return false;

    return otherParticipants.some((p: any) => {
      if (!p.last_read_at) return false;
      return new Date(p.last_read_at).getTime() >= new Date(msg.created_at).getTime();
    });
  };

  useEffect(() => {
    if (isOpen && activeChat) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const notifyConversationParticipants = async (conversationId: string, senderId: string, content: string) => {
    try {
      const { data: participants } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', senderId);

      if (!participants || participants.length === 0) return;

      let previewText = content;
      if (previewText.startsWith('[IMAGE:')) previewText = '📷 Sent an image';
      else if (previewText.startsWith('[FILE:')) previewText = '📎 Sent a document';
      else if (previewText.startsWith('[AUDIO:')) previewText = '🎤 Sent a voice note';

      const senderName = profile?.full_name || 'Staff Member';

      const notifRows = participants.map(p => ({
        user_id: p.user_id,
        type: 'chat_message',
        title: `💬 New Chat Message from ${senderName}`,
        message: previewText,
        is_read: false,
        link: '/chats'
      }));

      await supabase.from('notifications').insert(notifRows);
    } catch (e) {
      console.error('Error inserting chat notifications:', e);
    }
  };

  const selectChat = async (convo: Conversation) => {
    setActiveChat(convo);
    setShowStaffSearch(false);

    if (profile?.id) {
      await supabase
        .from('chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', convo.id)
        .eq('user_id', profile.id);

      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', profile.id)
        .eq('type', 'chat_message');

      loadConversations();
    }
  };

  const loadConversations = async () => {
    if (!profile?.id) return;
    try {
      const { data: myParticipants, error: pError } = await supabase
        .from('chat_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', profile.id);

      if (pError || !myParticipants || myParticipants.length === 0) {
        setConversations([]);
        setTotalUnread(0);
        return;
      }

      const conversationIds = myParticipants.map(mp => mp.conversation_id);

      const { data: convos, error: cError } = await supabase
        .from('chat_conversations')
        .select(`
          *,
          participants:chat_participants(
            user_id,
            last_read_at,
            user:users(*)
          )
        `)
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false });

      if (cError) throw cError;

      const { data: allUnreadMessages } = await supabase
        .from('chat_messages')
        .select('id, conversation_id, created_at, sender_id')
        .in('conversation_id', conversationIds)
        .neq('sender_id', profile.id);

      const participantMap = new Map(myParticipants.map(p => [p.conversation_id, p.last_read_at]));

      let grandTotalUnread = 0;

      const updatedConvos = (convos || []).map((c: any) => {
        const lastReadAt = participantMap.get(c.id);
        const unreadCount = (allUnreadMessages || []).filter(m => {
          if (m.conversation_id !== c.id) return false;
          if (!lastReadAt) return true;
          return new Date(m.created_at) > new Date(lastReadAt);
        }).length;

        grandTotalUnread += unreadCount;
        return {
          ...c,
          unread_count: unreadCount
        };
      });

      setConversations(updatedConvos);
      setTotalUnread(grandTotalUnread);
    } catch (err) {
      console.error('Error loading floating chat conversations:', err);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, sender:users(*)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data as any) || []);
    } catch (err) {
      console.error('Error loading chat messages:', err);
    }
  };

  const loadStaffList = async () => {
    setLoadingStaff(true);
    try {
      let query = supabase
        .from('users')
        .select('*')
        .neq('id', profile?.id)
        .order('full_name', { ascending: true });

      if (profile?.branch_id && profile?.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setStaffList(data || []);
    } catch (err) {
      console.error('Error loading staff:', err);
    } finally {
      setLoadingStaff(false);
    }
  };

  const startNewChat = async (targetUser: UserProfile) => {
    setShowStaffSearch(false);
    try {
      const { data: existing } = await supabase.rpc('get_private_conversation', {
        user_a: profile?.id,
        user_b: targetUser.id
      });

      if (existing && existing.id) {
        const found = conversations.find(c => c.id === existing.id);
        if (found) {
          setActiveChat(found);
        } else {
          await loadConversations();
          const { data: fullConvo } = await supabase
            .from('chat_conversations')
            .select('*, participants:chat_participants(user_id, user:users(*))')
            .eq('id', existing.id)
            .single();
          setActiveChat(fullConvo as any);
        }
        return;
      }

      const { data: newConvo, error: cError } = await supabase
        .from('chat_conversations')
        .insert([{ branch_id: profile?.branch_id, is_group: false }])
        .select()
        .single();

      if (cError) throw cError;

      await supabase.from('chat_participants').insert([
        { conversation_id: newConvo.id, user_id: profile?.id },
        { conversation_id: newConvo.id, user_id: targetUser.id }
      ]);

      await loadConversations();
      
      const { data: fullConvo } = await supabase
        .from('chat_conversations')
        .select('*, participants:chat_participants(user_id, user:users(*))')
        .eq('id', newConvo.id)
        .single();
        
      setActiveChat(fullConvo as any);
    } catch (err) {
      console.error('Error starting floating chat:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !profile) return;

    try {
      const content = newMessage.trim();
      setNewMessage('');

      const { data: insertedData, error } = await supabase
        .from('chat_messages')
        .insert([{
          conversation_id: activeChat.id,
          sender_id: profile.id,
          content
        }])
        .select('*, sender:users(*)')
        .single();

      if (error) throw error;

      if (insertedData) {
        setMessages(prev => {
          if (prev.some(m => m.id === insertedData.id)) return prev;
          return [...prev, insertedData as any];
        });
      }

      await supabase
        .from('chat_conversations')
        .update({
          last_message: content,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeChat.id);

      await notifyConversationParticipants(activeChat.id, profile.id, content);
      loadConversations();
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat || !profile) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('File size must be under 25MB');
      return;
    }

    setUploading(true);
    try {
      const isImg = file.type.startsWith('image/');
      const fileExt = file.name.split('.').pop() || 'dat';
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${isImg ? 'images' : 'documents'}/${Date.now()}_${cleanFileName}`;

      let fileUrl = '';
      const { error: uploadErr } = await supabase.storage
        .from('chat-media')
        .upload(storagePath, file, { contentType: file.type || (isImg ? 'image/jpeg' : 'application/octet-stream') });

      if (!uploadErr) {
        const { data } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
        fileUrl = data.publicUrl;
      } else {
        // Fallback to patient-files or data URL
        const { error: fallbackErr } = await supabase.storage
          .from('patient-files')
          .upload(storagePath, file, { contentType: file.type });
        if (!fallbackErr) {
          const { data } = supabase.storage.from('patient-files').getPublicUrl(storagePath);
          fileUrl = data.publicUrl;
        } else {
          fileUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
        }
      }

      const content = isImg ? `[IMAGE:${fileUrl}|${file.name}]` : `[FILE:${fileUrl}|${file.name}]`;

      const { data: insertedMsg, error: insertErr } = await supabase
        .from('chat_messages')
        .insert([{
          conversation_id: activeChat.id,
          sender_id: profile.id,
          content
        }])
        .select('*, sender:users(*)')
        .single();

      if (insertErr) throw insertErr;

      if (insertedMsg) {
        setMessages(prev => {
          if (prev.some(m => m.id === insertedMsg.id)) return prev;
          return [...prev, insertedMsg as any];
        });
      }

      await supabase.from('chat_conversations').update({
        last_message: isImg ? `📷 Image (${file.name})` : `📎 ${file.name}`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', activeChat.id);

      await notifyConversationParticipants(activeChat.id, profile.id, content);
      loadConversations();
    } catch (err) {
      console.error('Error uploading file:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  // Voice Note Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied.');
    }
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !activeChat || !profile) return;

    mediaRecorderRef.current.onstop = async () => {
      clearInterval(recordingTimerRef.current);
      setIsRecording(false);

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const tracks = mediaRecorderRef.current?.stream.getTracks();
      tracks?.forEach(t => t.stop());

      try {
        const fileName = `voice_${Date.now()}_${Math.random().toString(36).substring(7)}.webm`;
        const storagePath = `audio/${fileName}`;

        let audioUrl = '';
        const { error: uploadErr } = await supabase.storage
          .from('chat-media')
          .upload(storagePath, audioBlob, { contentType: 'audio/webm' });

        if (!uploadErr) {
          const { data } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
          audioUrl = data.publicUrl;
        } else {
          audioUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(audioBlob);
          });
        }

        const durationStr = `${recordingTime}s`;
        const content = `[AUDIO:${audioUrl}|Voice Note (${durationStr})]`;

        const { data: insertedMsg, error: insertErr } = await supabase
          .from('chat_messages')
          .insert([{
            conversation_id: activeChat.id,
            sender_id: profile.id,
            content
          }])
          .select('*, sender:users(*)')
          .single();

        if (insertErr) throw insertErr;

        if (insertedMsg) {
          setMessages(prev => {
            if (prev.some(m => m.id === insertedMsg.id)) return prev;
            return [...prev, insertedMsg as any];
          });
        }

        await supabase.from('chat_conversations').update({
          last_message: '🎤 Voice Note',
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', activeChat.id);

        await notifyConversationParticipants(activeChat.id, profile.id, content);
        loadConversations();
      } catch (err) {
        console.error('Error uploading voice note:', err);
      }
    };

    mediaRecorderRef.current.stop();
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  };

  const getOtherParticipant = (convo: Conversation) => {
    return convo.participants.find(p => p.user_id !== profile?.id)?.user;
  };

  // Filter conversations by search term
  const filteredConversations = conversations.filter(convo => {
    const other = getOtherParticipant(convo);
    if (!other) return false;
    const term = convoSearchQuery.toLowerCase();
    const nameMatch = other.full_name.toLowerCase().includes(term);
    const roleMatch = (other.role || '').toLowerCase().includes(term);
    const lastMsgMatch = (convo.last_message || '').toLowerCase().includes(term);
    return nameMatch || roleMatch || lastMsgMatch;
  });

  if (!profile) return null;

  return (
    <>
      {/* 🔔 Toast Notification Popup */}
      {toastNotification && (
        <div 
          onClick={() => {
            setIsOpen(true);
            const found = conversations.find(c => c.id === toastNotification.conversationId);
            if (found) setActiveChat(found);
            setToastNotification(null);
            setHasNewMessagePulse(false);
          }}
          className="fixed bottom-24 lg:bottom-28 right-4 lg:right-6 z-[99] max-w-sm bg-white dark:bg-gray-800 border-2 border-indigo-500 rounded-2xl p-3.5 shadow-2xl cursor-pointer animate-in slide-in-from-bottom-5 duration-300 flex items-start gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black flex-shrink-0 shadow-md">
            <Bell className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black text-gray-900 dark:text-white flex items-center justify-between">
              <span>{toastNotification.senderName}</span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-0.5">
                <Sparkles className="w-3 h-3 animate-spin" /> New Message
              </span>
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-300 truncate mt-0.5 font-medium">
              {toastNotification.text}
            </p>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setToastNotification(null);
            }} 
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 💬 Animated Floating Chat Button (Mobile & Desktop Responsive) */}
      <div className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-[95] print:hidden">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) loadConversations();
            setHasNewMessagePulse(false);
          }}
          className={`relative group p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center ${
            hasNewMessagePulse ? 'animate-bounce ring-4 ring-indigo-400 ring-offset-2 dark:ring-offset-gray-900' : ''
          }`}
          title="Internal Staff Chat"
        >
          <MessageSquare className={`w-7 h-7 ${hasNewMessagePulse ? 'animate-pulse' : ''}`} />
          
          {(totalUnread > 0 || hasNewMessagePulse) && (
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[11px] font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900 animate-pulse shadow-md">
              {totalUnread > 0 ? (totalUnread > 99 ? '99+' : totalUnread) : '!'}
            </span>
          )}
        </button>
      </div>

      {/* 💬 Floating Chat Window Drawer (Mobile Responsive: Full Screen Modal / Drawer on Mobile) */}
      {isOpen && (
        <div className="fixed bottom-20 lg:bottom-24 right-2 sm:right-6 left-2 sm:left-auto z-[96] w-auto sm:w-[420px] h-[80vh] sm:h-[570px] max-h-[85vh] bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 print:hidden">
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          />

          {/* Widget Header */}
          <div className="p-3.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between shadow-md flex-shrink-0">
            <div className="flex items-center gap-2.5">
              {activeChat && (
                <button 
                  onClick={() => setActiveChat(null)}
                  className="p-1 hover:bg-white/20 rounded-full transition"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs uppercase shadow-xs">
                {activeChat ? (getOtherParticipant(activeChat)?.full_name.charAt(0) || 'C') : <MessageSquare className="w-4 h-4" />}
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight truncate max-w-[180px] sm:max-w-[220px]">
                  {activeChat ? (getOtherParticipant(activeChat)?.full_name || 'Staff Member') : 'Staff Chat'}
                </h3>
                <p className="text-[10px] text-indigo-100 font-medium">
                  {activeChat ? (getOtherParticipant(activeChat)?.role || 'Staff') : 'Internal Hospital Messenger'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {!activeChat && (
                <button
                  onClick={() => {
                    setShowStaffSearch(true);
                    loadStaffList();
                  }}
                  className="p-1.5 hover:bg-white/20 rounded-xl transition text-xs font-bold flex items-center gap-1 bg-white/10"
                  title="New Staff Chat"
                >
                  <Plus className="w-4 h-4" /> New
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/20 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Widget Body */}
          <div className="flex-1 overflow-hidden flex flex-col bg-gray-50/50 dark:bg-gray-900/30">
            {showStaffSearch ? (
              /* Staff Search Screen with Vertical Scroll */
              <div className="flex-1 flex flex-col p-3 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Select Hospital Staff</span>
                  <button 
                    onClick={() => setShowStaffSearch(false)}
                    className="text-xs text-indigo-600 font-semibold hover:underline"
                  >
                    Back
                  </button>
                </div>

                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search staff by name or role..."
                    value={staffSearchQuery}
                    onChange={(e) => setStaffSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Vertical Scrollable Staff List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {loadingStaff ? (
                    <div className="p-8 text-center text-gray-400 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-600 mb-1" />
                      Loading hospital staff...
                    </div>
                  ) : staffList.filter(u => u.full_name.toLowerCase().includes(staffSearchQuery.toLowerCase()) || (u.role && u.role.toLowerCase().includes(staffSearchQuery.toLowerCase()))).length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-xs font-medium">
                      No staff members found matching search.
                    </div>
                  ) : (
                    staffList
                      .filter(u => u.full_name.toLowerCase().includes(staffSearchQuery.toLowerCase()) || (u.role && u.role.toLowerCase().includes(staffSearchQuery.toLowerCase())))
                      .map(u => (
                        <button
                          key={u.id}
                          onClick={() => startNewChat(u)}
                          className="w-full p-2.5 flex items-center gap-3 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-2xl transition border border-gray-100 dark:border-gray-700/60 text-left shadow-2xs"
                        >
                          <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs overflow-hidden flex-shrink-0">
                            {u.avatar_url ? <img src={u.avatar_url} alt={u.full_name} className="w-full h-full object-cover" /> : u.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">{u.full_name}</h4>
                            <span className="text-[9px] uppercase font-extrabold text-indigo-600">{u.role || 'Staff'}</span>
                          </div>
                        </button>
                      ))
                  )}
                </div>
              </div>
            ) : !activeChat ? (
              /* Conversations View with Search & Vertical Scroll */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Search Bar for Conversations */}
                <div className="p-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                    <input
                      type="text"
                      placeholder="Search chats by name, role or text..."
                      value={convoSearchQuery}
                      onChange={(e) => setConvoSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 text-xs bg-gray-100 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                {/* Vertical Scrollable Conversations List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1 touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center">
                      <MessageSquare className="w-10 h-10 text-indigo-400 mx-auto mb-2 opacity-80" />
                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        {convoSearchQuery ? 'No matching chats found' : 'No Conversations Yet'}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {convoSearchQuery ? 'Try a different search term.' : 'Start chatting with hospital staff instantly.'}
                      </p>
                      {!convoSearchQuery && (
                        <button
                          onClick={() => {
                            setShowStaffSearch(true);
                            loadStaffList();
                          }}
                          className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-indigo-700 transition"
                        >
                          Start Staff Chat
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredConversations.map(convo => {
                      const other = getOtherParticipant(convo);
                      if (!other) return null;
                      return (
                        <button
                          key={convo.id}
                          onClick={() => selectChat(convo)}
                          className="w-full p-3 flex gap-3 bg-white dark:bg-gray-800 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/30 rounded-2xl transition text-left border border-gray-100 dark:border-gray-700/60 shadow-2xs relative"
                        >
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 font-black flex items-center justify-center flex-shrink-0 text-sm overflow-hidden">
                            {other.avatar_url ? (
                              <img src={other.avatar_url} alt={other.full_name} className="w-full h-full object-cover" />
                            ) : (
                              other.full_name.charAt(0)
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline">
                              <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">{other.full_name}</h4>
                              <span className="text-[9px] text-gray-400 font-medium">
                                {convo.last_message_at ? new Date(convo.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5 font-normal">
                              {convo.last_message || 'Tap to open chat...'}
                            </p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="inline-block text-[8px] font-black uppercase text-indigo-600">
                                {other.role || 'Staff'}
                              </span>
                              {convo.unread_count && convo.unread_count > 0 ? (
                                <span className="px-2 py-0.5 bg-red-600 text-white rounded-full text-[10px] font-black shadow-xs animate-pulse">
                                  {convo.unread_count} new
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* Active Chat Feed & Input with Touch & Vertical Scroll */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Scrollable Messages Feed */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2 relative touch-pan-y scroll-smooth" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {messages.map((msg, index) => {
                    const currentDateHeader = formatDateDivider(msg.created_at);
                    const prevMessageDateHeader = index > 0 ? formatDateDivider(messages[index - 1].created_at) : null;
                    const showDateDivider = currentDateHeader && currentDateHeader !== prevMessageDateHeader;

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateDivider && (
                          <div className="flex items-center justify-center my-2">
                            <span className="px-2.5 py-0.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-700/80 rounded-full">
                              {currentDateHeader}
                            </span>
                          </div>
                        )}
                        <ChatBubble
                          content={msg.content}
                          sender_name={msg.sender?.full_name || 'Staff'}
                          sender_avatar={msg.sender?.avatar_url}
                          sender_role={msg.sender?.role}
                          is_own={msg.sender_id === profile?.id}
                          created_at={msg.created_at}
                          is_read={isMessageRead(msg)}
                        />
                      </React.Fragment>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Bar */}
                <div className="p-2.5 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                  {isRecording ? (
                    <div className="flex items-center justify-between bg-red-50 dark:bg-red-950/40 p-2 rounded-xl border border-red-200">
                      <span className="text-xs font-bold text-red-700">
                        Recording ({recordingTime}s)
                      </span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={cancelRecording} className="p-1 text-gray-500 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={stopAndSendRecording} className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold">
                          Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSendMessage} className="flex items-center gap-1 relative">
                      {/* Hidden file inputs */}
                      <input
                        type="file"
                        ref={imageInputRef}
                        onChange={handleFileUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <input
                        type="file"
                        ref={docInputRef}
                        onChange={handleFileUpload}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                        className="hidden"
                      />

                      {/* Emoji button & picker */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                          className={`p-1.5 rounded-full transition ${
                            showEmojiPicker ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40' : 'text-gray-500 hover:text-indigo-600'
                          }`}
                          title="Insert Emoji"
                        >
                          <Smile className="w-4 h-4" />
                        </button>

                        <EmojiPicker
                          isOpen={showEmojiPicker}
                          onClose={() => setShowEmojiPicker(false)}
                          onSelectEmoji={(emoji) => setNewMessage((prev) => prev + emoji)}
                          position="top"
                        />
                      </div>

                      {/* Image button */}
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        disabled={uploading}
                        className="p-1.5 text-gray-500 hover:text-indigo-600 rounded-full"
                        title="Send Photo"
                      >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <ImageIcon className="w-4 h-4" />}
                      </button>

                      {/* Document button */}
                      <button
                        type="button"
                        onClick={() => docInputRef.current?.click()}
                        disabled={uploading}
                        className="p-1.5 text-gray-500 hover:text-indigo-600 rounded-full"
                        title="Send Document File"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>

                      {/* Mic button */}
                      <button
                        type="button"
                        onClick={startRecording}
                        className="p-1.5 text-gray-500 hover:text-red-600 rounded-full"
                        title="Record Voice Note"
                      >
                        <Mic className="w-4 h-4" />
                      </button>

                      {/* Text input */}
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onFocus={() => setShowEmojiPicker(false)}
                        placeholder="Type message..."
                        className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-full text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                      />

                      {/* Send button */}
                      <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0 flex items-center justify-center shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
