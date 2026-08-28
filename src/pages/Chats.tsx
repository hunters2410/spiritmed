import React, { useState, useEffect, useRef } from 'react';
import { supabase, UserProfile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Send, 
  Search, 
  User, 
  MoreVertical, 
  MessageSquare, 
  Plus, 
  X,
  Paperclip,
  Image as ImageIcon,
  Mic,
  Square,
  Trash2,
  Loader2,
  Stethoscope,
  ShieldCheck,
  UserCheck,
  Calculator,
  HeartPulse,
  ArrowDown,
  Smile
} from 'lucide-react';
import { ChatBubble } from '../components/ChatBubble';
import { EmojiPicker } from '../components/EmojiPicker';
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

export function Chats() {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  // User Search / Staff Directory State
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [allStaff, setAllStaff] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [loadingStaff, setLoadingStaff] = useState(false);

  // File Upload State
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Emoji Picker State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Voice Note Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChatRef = useRef<Conversation | null>(null);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    if (profile?.id) {
      loadConversations();
      const subscription = subscribeToMessages();
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [profile?.id]);

  useEffect(() => {
    if (activeChat && profile?.id) {
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

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (showUserSearch) {
      loadAllStaff();
    }
  }, [showUserSearch]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = async () => {
    try {
      const { data: myParticipants, error: pError } = await supabase
        .from('chat_participants')
        .select('conversation_id')
        .eq('user_id', profile?.id);

      if (pError) throw pError;

      const conversationIds = myParticipants.map(mp => mp.conversation_id);

      if (conversationIds.length === 0) {
        setConversations([]);
        return;
      }

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
      setConversations(convos as any);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(`
          *,
          sender:users(*)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data as any);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const loadAllStaff = async () => {
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
      setAllStaff(data || []);
    } catch (error) {
      console.error('Error loading staff list:', error);
    } finally {
      setLoadingStaff(false);
    }
  };

  const playNotificationBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

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
      // Audio playback restrictions fallback
    }
  };

  const subscribeToMessages = () => {
    return supabase
      .channel('chat_messages_channel')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages' 
      }, async (payload) => {
        const newMessage = payload.new as Message;
        
        if (newMessage.sender_id === profile?.id) return;

        // Ensure user only receives events for chats they are a participant in
        const { data: myPart } = await supabase
          .from('chat_participants')
          .select('id')
          .eq('conversation_id', newMessage.conversation_id)
          .eq('user_id', profile?.id)
          .maybeSingle();

        if (!myPart) return;

        playNotificationBeep();

        if (activeChatRef.current?.id === newMessage.conversation_id) {
          const { data: fetchedSender } = await supabase
            .from('users')
            .select('*')
            .eq('id', newMessage.sender_id)
            .single();

          setMessages(prev => {
            if (prev.some(m => m.id === newMessage.id)) return prev;
            return [...prev, { ...newMessage, sender: (fetchedSender || profile) as any }];
          });
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
  };

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

      loadConversations();

    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat || !profile) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('File size must be under 25MB');
      return;
    }

    setUploadingAttachment(true);
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
        // Fallback to patient-files or Data URL
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

      const content = isImg
        ? `[IMAGE:${fileUrl}|${file.name}]`
        : `[FILE:${fileUrl}|${file.name}]`;

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

      loadConversations();

    } catch (err: any) {
      console.error('Error uploading attachment:', err);
      alert('Failed to send file attachment.');
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  // Voice Note Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Microphone access denied or not supported on this device.');
    }
  };

  const stopAndSendRecording = async () => {
    if (!mediaRecorderRef.current || !activeChat || !profile) return;

    mediaRecorderRef.current.onstop = async () => {
      clearInterval(recordingTimerRef.current);
      setIsRecording(false);

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const tracks = mediaRecorderRef.current?.stream.getTracks();
      tracks?.forEach(track => track.stop());

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

        loadConversations();

      } catch (err) {
        console.error('Error uploading voice note:', err);
        alert('Failed to send voice note.');
      }
    };

    mediaRecorderRef.current.stop();
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      const tracks = mediaRecorderRef.current.stream.getTracks();
      tracks?.forEach(track => track.stop());
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const startNewChat = async (targetUser: UserProfile) => {
    setShowUserSearch(false);
    
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

    } catch (error) {
        console.error('Error creating chat:', error);
        alert('Failed to start chat');
    }
  };

  const getOtherParticipant = (convo: Conversation) => {
    return convo.participants.find(p => p.user_id !== profile?.id)?.user;
  };

  const getRoleBadgeColor = (role?: string) => {
    const r = (role || '').toLowerCase();
    if (r.includes('doctor')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    if (r.includes('nurse')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    if (r.includes('accountant')) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    if (r.includes('receptionist')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';
    if (r.includes('admin')) return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300';
  };

  const filteredStaff = allStaff.filter(u => {
    const matchesSearch = 
      u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.role && u.role.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (roleFilter === 'all') return matchesSearch;
    return matchesSearch && u.role && u.role.toLowerCase().includes(roleFilter.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100vh-100px)] bg-white dark:bg-gray-800 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-xl">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
      />

      {/* Sidebar */}
      <div className="w-full sm:w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50/50 dark:bg-gray-900/20">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-indigo-600" />
              Internal Staff Chat
            </h1>
            <button 
              onClick={() => setShowUserSearch(true)}
              className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-md flex items-center gap-1 text-xs font-bold"
              title="New Staff Chat"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search conversations..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-8 h-8 text-indigo-500" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 font-bold">No active conversations</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Connect with Doctors, Nurses, Receptionists or Accountants.</p>
              <button 
                onClick={() => setShowUserSearch(true)}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
              >
                Start Staff Conversation
              </button>
            </div>
          ) : (
            conversations.map(convo => {
              const other = getOtherParticipant(convo);
              if (!other) return null;
              const isActive = activeChat?.id === convo.id;

              return (
                <button 
                  key={convo.id}
                  onClick={() => setActiveChat(convo)}
                  className={`w-full p-4 flex gap-3 hover:bg-white dark:hover:bg-gray-800 transition text-left border-b border-gray-100 dark:border-gray-800 ${
                    isActive ? 'bg-white dark:bg-gray-800 border-l-4 border-l-indigo-600 shadow-xs' : ''
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 border border-indigo-200 overflow-hidden shadow-xs">
                    {other.avatar_url ? (
                      <img src={other.avatar_url} alt={other.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-black text-indigo-600 uppercase">{other.full_name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{other.full_name}</h3>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {convo.last_message_at ? new Date(convo.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-normal">
                        {convo.last_message || 'Tap to start conversation...'}
                      </p>
                      {convo.unread_count ? (
                        <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] rounded-full font-bold">
                          {convo.unread_count}
                        </span>
                      ) : null}
                    </div>
                    {other.role && (
                      <div className="mt-1">
                        <span className={`inline-block text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider ${getRoleBadgeColor(other.role)}`}>
                          {other.role}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50/30 dark:bg-gray-900/40 relative">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center shadow-xs relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200 overflow-hidden shadow-xs">
                  {getOtherParticipant(activeChat)?.avatar_url ? (
                    <img src={getOtherParticipant(activeChat)?.avatar_url} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-md font-black text-indigo-600 uppercase">{getOtherParticipant(activeChat)?.full_name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-black text-gray-900 dark:text-white leading-tight flex items-center gap-2">
                    {getOtherParticipant(activeChat)?.full_name || 'Staff Member'}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider ${getRoleBadgeColor(getOtherParticipant(activeChat)?.role)}`}>
                      {getOtherParticipant(activeChat)?.role || 'Staff'}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Available
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 relative scroll-smooth">
               <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: "radial-gradient(#4f46e5 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }}></div>
               
               <div className="relative z-10 space-y-1">
                 {messages.map((msg, index) => {
                   const currentDateHeader = formatDateDivider(msg.created_at);
                   const prevMessageDateHeader = index > 0 ? formatDateDivider(messages[index - 1].created_at) : null;
                   const showDateDivider = currentDateHeader && currentDateHeader !== prevMessageDateHeader;

                   return (
                     <React.Fragment key={msg.id}>
                       {showDateDivider && (
                         <div className="flex items-center justify-center my-4">
                           <span className="px-3.5 py-1 text-xs font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/50 rounded-full border border-indigo-200/80 dark:border-indigo-700/60 shadow-xs">
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
            </div>

            {/* Message Input & Action Bar */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
              {isRecording ? (
                /* Recording Controls Bar */
                <div className="flex items-center justify-between bg-red-50 dark:bg-red-950/40 p-3 rounded-2xl border border-red-200 dark:border-red-800 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
                    <span className="text-xs font-bold text-red-700 dark:text-red-300">
                      Recording Voice Note... ({formatRecordingTime(recordingTime)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-white dark:hover:bg-gray-800 rounded-full transition"
                      title="Cancel Recording"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={stopAndSendRecording}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-bold transition flex items-center gap-1.5 shadow-md"
                    >
                      <Send className="w-3.5 h-3.5" /> Send Voice Note
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard Message & Attachment Bar with Emojis, Images, Docs & Voice */
                <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-center gap-1.5 relative">
                  {/* Hidden File Inputs */}
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

                  {/* Emoji Button & Picker Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`p-2.5 rounded-full transition flex-shrink-0 ${
                        showEmojiPicker
                          ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40'
                          : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title="Insert Emoji"
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    <EmojiPicker
                      isOpen={showEmojiPicker}
                      onClose={() => setShowEmojiPicker(false)}
                      onSelectEmoji={(emoji) => {
                        setNewMessage((prev) => prev + emoji);
                      }}
                      position="top"
                    />
                  </div>

                  {/* Share Image Button */}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingAttachment}
                    className="p-2.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition flex-shrink-0"
                    title="Share Photo or Image"
                  >
                    {uploadingAttachment ? (
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                    ) : (
                      <ImageIcon className="w-5 h-5" />
                    )}
                  </button>

                  {/* Share Document Button */}
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    disabled={uploadingAttachment}
                    className="p-2.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition flex-shrink-0"
                    title="Share Document / PDF / File"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  {/* Voice Note Button */}
                  <button
                    type="button"
                    onClick={startRecording}
                    className="p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition flex-shrink-0"
                    title="Record Voice Note"
                  >
                    <Mic className="w-5 h-5" />
                  </button>

                  {/* Text Input Field */}
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onFocus={() => setShowEmojiPicker(false)}
                      placeholder="Type a message or share photos & documents..."
                      className="w-full pl-5 pr-12 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner text-gray-900 dark:text-white"
                    />
                    <button 
                      type="submit"
                      disabled={!newMessage.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition disabled:opacity-50 shadow-md shadow-indigo-600/20 flex items-center justify-center"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col p-10 text-center">
             <div className="relative mb-6">
                <div className="absolute -inset-4 bg-indigo-100 dark:bg-indigo-900/20 rounded-full blur-2xl animate-pulse"></div>
                <MessageSquare className="w-20 h-20 text-indigo-500 relative z-10" />
             </div>
             <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Hospital Staff Messenger</h2>
             <p className="text-gray-500 max-w-sm mb-8 text-sm leading-relaxed">
               Secure internal communication for Doctors, Nurses, Receptionists, and Accountants. Share notes, documents, images, and voice recordings.
             </p>
             <button 
               onClick={() => setShowUserSearch(true)}
               className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20 flex items-center gap-2 text-sm"
             >
               <Plus className="w-5 h-5" />
               Start Staff Conversation
             </button>
          </div>
        )}
      </div>

      {/* Staff Selector Modal */}
      {showUserSearch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <div>
                <h2 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  Select Staff Member
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Start a direct internal chat with any staff member
                </p>
              </div>
              <button 
                onClick={() => setShowUserSearch(false)} 
                className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Department / Role Filter Pills */}
            <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Search by staff name or role..."
                  value={searchQuery}
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-700 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                {[
                  { id: 'all', label: 'All Staff' },
                  { id: 'doctor', label: 'Doctors' },
                  { id: 'nurse', label: 'Nurses' },
                  { id: 'receptionist', label: 'Receptionists' },
                  { id: 'accountant', label: 'Accountants' },
                  { id: 'admin', label: 'Admins' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setRoleFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                      roleFilter === tab.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Staff List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-1.5">
              {loadingStaff ? (
                <div className="p-12 text-center text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-2" />
                  <p className="text-xs">Loading hospital staff...</p>
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className="p-12 text-center text-gray-500 text-sm">
                  No staff members found matching your search.
                </div>
              ) : (
                filteredStaff.map(user => (
                  <button 
                    key={user.id}
                    onClick={() => startNewChat(user)}
                    className="w-full p-3 flex items-center gap-3.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-2xl transition text-left border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800"
                  >
                    <div className="w-11 h-11 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200 overflow-hidden flex-shrink-0 shadow-xs">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-black text-indigo-600 uppercase">{user.full_name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{user.full_name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${getRoleBadgeColor(user.role)}`}>
                          {user.role}
                        </span>
                        {user.email && (
                          <span className="text-[11px] text-gray-400 truncate">{user.email}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
