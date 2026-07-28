import { useState, useEffect, useRef } from 'react';
import { supabase, UserProfile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Send, 
  Search, 
  User, 
  MoreVertical, 
  MessageSquare, 
  Plus, 
  X
} from 'lucide-react';
import { ChatBubble } from '../components/ChatBubble';

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
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    if (activeChat) {
      loadMessages(activeChat.id);
    }
  }, [activeChat?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = async () => {
    try {
      // 1. Get all conversation IDs where current user is a participant
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

      // 2. Fetch full conversation details + all participants
      const { data: convos, error: cError } = await supabase
        .from('chat_conversations')
        .select(`
          *,
          participants:chat_participants(
            user_id,
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

  const subscribeToMessages = () => {
    return supabase
      .channel('chat_messages')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'chat_messages' 
      }, async (payload) => {
        const newMessage = payload.new as Message;
        
        // If it belongs to current active chat, add to list
        if (activeChat?.id === newMessage.conversation_id) {
          // Fetch sender info for UI
          const { data: sender } = await supabase
            .from('users')
            .select('*')
            .eq('id', newMessage.sender_id)
            .single();
          
          setMessages(prev => [...prev, { ...newMessage, sender: sender as any }]);
        }
        
        // Refresh conversation list to update previews
        loadConversations();
      })
      .subscribe();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat || !profile) return;

    try {
      const content = newMessage.trim();
      setNewMessage('');

      const { error } = await supabase
        .from('chat_messages')
        .insert([{
          conversation_id: activeChat.id,
          sender_id: profile.id,
          content
        }])
        .select()
        .single();

      if (error) throw error;

      // Update conversation last message timestamp
      await supabase
        .from('chat_conversations')
        .update({ 
          last_message: content,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeChat.id);

    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    }
  };

  const startNewChat = async (targetUser: UserProfile) => {
    setShowUserSearch(false);
    
    // Check if conversation already exists between these two
    try {
      const { data: existing } = await supabase.rpc('get_private_conversation', {
        user_a: profile?.id,
        user_b: targetUser.id
      });

      if (existing && existing.id) {
        // Find existing in conversations list or add it
        const found = conversations.find(c => c.id === existing.id);
        if (found) {
          setActiveChat(found);
        } else {
          // If not in list, reload list
          await loadConversations();
          // We'll set active chat after state update in loadConversations or just fetch it manually
          const { data: fullConvo } = await supabase
            .from('chat_conversations')
            .select('*, participants:chat_participants(user_id, user:users(*))')
            .eq('id', existing.id)
            .single();
          setActiveChat(fullConvo as any);
        }
        return;
      }

      // Create new conversation
      const { data: newConvo, error: cError } = await supabase
        .from('chat_conversations')
        .insert([{ branch_id: profile?.branch_id, is_group: false }])
        .select()
        .single();

      if (cError) throw cError;

      // Add participants
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

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) return;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('full_name', `%${query}%`)
      .neq('id', profile?.id)
      .limit(10);

    if (!error) setUsers(data || []);
  };

  const getOtherParticipant = (convo: Conversation) => {
    return convo.participants.find(p => p.user_id !== profile?.id)?.user;
  };

  return (
    <div className="flex h-[calc(100vh-100px)] bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-xl">
      {/* Sidebar */}
      <div className="w-full sm:w-80 border-r border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50/50 dark:bg-gray-900/20">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-indigo-600" />
              Messages
            </h1>
            <button 
              onClick={() => setShowUserSearch(true)}
              className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 transition shadow-sm"
              title="New Chat"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search chats..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No active conversations</p>
              <button 
                onClick={() => setShowUserSearch(true)}
                className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                Start your first chat
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
                  className={`w-full p-4 flex gap-3 hover:bg-white dark:hover:bg-gray-800 transition ${isActive ? 'bg-white dark:bg-gray-800 border-r-4 border-r-indigo-600' : ''}`}
                >
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 border border-indigo-200 overflow-hidden shadow-sm">
                    {other.avatar_url ? (
                      <img src={other.avatar_url} alt={other.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-indigo-600 uppercase">{other.full_name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{other.full_name}</h3>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {convo.last_message_at ? new Date(convo.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-500 truncate pr-2">
                        {convo.last_message || 'Start chatting...'}
                      </p>
                      {convo.unread_count ? (
                        <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] rounded-full font-bold">
                          {convo.unread_count}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-tighter mt-1">{other.role}</div>
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
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-between items-center shadow-sm relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200 overflow-hidden shadow-sm">
                  {getOtherParticipant(activeChat)?.avatar_url ? (
                    <img src={getOtherParticipant(activeChat)?.avatar_url} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-md font-bold text-indigo-600 uppercase">{getOtherParticipant(activeChat)?.full_name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-black text-gray-900 dark:text-white leading-tight">
                    {getOtherParticipant(activeChat)?.full_name || 'Chat'}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Online</span>
                  </div>
                </div>
              </div>
              <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>

            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 relative">
               {/* Pattern overlay */}
               <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none" style={{ backgroundImage: "radial-gradient(#4f46e5 0.5px, transparent 0.5px)", backgroundSize: "24px 24px" }}></div>
               
               <div className="relative z-10">
                 {messages.map((msg) => (
                   <ChatBubble 
                     key={msg.id}
                     content={msg.content}
                     sender_name={msg.sender?.full_name || 'System'}
                     sender_avatar={msg.sender?.avatar_url}
                     is_own={msg.sender_id === profile?.id}
                     created_at={msg.created_at}
                   />
                 ))}
                 <div ref={messagesEndRef} />
               </div>
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
              <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto relative flex items-center gap-2">
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message here..."
                    className="w-full pl-5 pr-12 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-inner"
                  />
                  <button 
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition disabled:opacity-50 shadow-md shadow-indigo-600/20"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col p-10 text-center">
             <div className="relative mb-6">
                <div className="absolute -inset-4 bg-indigo-100 dark:bg-indigo-900/20 rounded-full blur-2xl animate-pulse"></div>
                <MessageSquare className="w-20 h-20 text-indigo-500 relative z-10" />
             </div>
             <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Hospital Internal Messenger</h2>
             <p className="text-gray-500 max-w-xs mb-8">Securely chat with doctors, nurses, and administrative staff across departments.</p>
             <button 
               onClick={() => setShowUserSearch(true)}
               className="px-6 py-3 bg-indigo-600 text-white rounded-full font-bold hover:bg-indigo-700 transition shadow-xl shadow-indigo-600/20 flex items-center gap-2"
             >
               <Plus className="w-5 h-5" />
               Start New Conversation
             </button>
          </div>
        )}
      </div>

      {/* User Search Modal */}
      {showUserSearch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <h2 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-600" />
                Select Staff Member
              </h2>
              <button onClick={() => setShowUserSearch(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                  type="text" 
                  autoFocus
                  placeholder="Search staff by name or role..."
                  className="w-full pl-9 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-none rounded-lg focus:ring-2 focus:ring-indigo-500"
                  onChange={(e) => searchUsers(e.target.value)}
                />
              </div>

              <div className="max-h-80 overflow-y-auto space-y-1 scrollbar-thin">
                {users.map(user => (
                  <button 
                    key={user.id}
                    onClick={() => startNewChat(user)}
                    className="w-full p-3 flex items-center gap-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center border border-indigo-200 overflow-hidden flex-shrink-0">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-indigo-600 uppercase">{user.full_name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{user.full_name}</div>
                      <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">{user.role}</div>
                    </div>
                  </button>
                ))}
                
                {searchQuery.length > 0 && users.length === 0 && (
                  <div className="p-8 text-center text-gray-500 text-sm italic">
                    No results found for "{searchQuery}"
                  </div>
                )}

                {searchQuery.length < 2 && (
                  <div className="p-6 text-center text-gray-400 text-xs">
                    Start typing to search for hospital staff...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
