import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Modal,
  FlatList,
  RefreshControl,
  Keyboard,
  Image,
  Linking,
  Dimensions,
  Vibration,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAudioPlayer, setAudioModeAsync, useAudioRecorder, requestRecordingPermissionsAsync } from 'expo-audio';
import { RecordingPresets } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useChatUnread } from '../context/ChatContext';
import { playNotificationBeep } from '../utils/notificationBeep';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, ChatConversation, ChatMessage, StaffUser } from '../types';

type ChatScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Chat'>;
type ChatScreenRouteProp = RouteProp<RootStackParamList, 'Chat'>;

interface Props {
  navigation?: any;
  route?: any;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Date Formatting Helpers ──
function isSameDay(d1Str?: string | null, d2Str?: string | null): boolean {
  if (!d1Str || !d2Str) return false;
  try {
    const d1 = new Date(d1Str);
    const d2 = new Date(d2Str);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  } catch {
    return false;
  }
}

function formatDateHeader(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (isSameDay(dateStr, today.toISOString())) {
      return 'Today';
    }
    if (isSameDay(dateStr, yesterday.toISOString())) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatMessageTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatLastMessagePreview(content?: string | null): string {
  if (!content) return 'No messages yet.';
  if (content.startsWith('[AUDIO:')) return '🎤 Voice Note';
  if (content.startsWith('[IMAGE:')) return '📷 Photo';
  if (content.startsWith('[FILE:')) return '📄 Document';
  return content;
}

export function ChatScreen({ navigation, route }: Props) {
  const initialConversationId = route?.params?.conversationId;
  const targetUserId = route?.params?.targetUserId;
  const { themeColors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : insets.top;

  // Track exact keyboard height so input bar is always lifted directly above the keyboard
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const onShow = (e: any) => {
      const h = e?.endCoordinates?.height || 0;
      setKeyboardHeight(h);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
    };

    const onHide = () => {
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      onHide
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Current User Info
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [userBranchId, setUserBranchId] = useState<string>('');

  // Unread Messages Context
  const { unreadMap, setActiveConversationId, markAsRead, refreshUnreadCount } = useChatUnread();

  // Conversations List State
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchConvo, setSearchConvo] = useState('');

  // Active Chat State
  const [activeChat, setActiveChat] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessageText, setNewMessageText] = useState('');
  const [sending, setSending] = useState(false);

  // Audio Playback State
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const playerRef = useRef<any>(null);

  // In-App Notification Toast State
  const [toastNotification, setToastNotification] = useState<{
    title: string;
    body: string;
    conversationId: string;
  } | null>(null);
  const toastAnim = useRef(new Animated.Value(-100)).current;

  // Fullscreen Image Preview State
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string>('');

  // Staff Directory / New Chat Modal State
  const [staffModalVisible, setStaffModalVisible] = useState(false);
  const [allStaff, setAllStaff] = useState<StaffUser[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Media & Emoji State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const flatListRef = useRef<FlatList>(null);
  const activeChatRef = useRef<ChatConversation | null>(null);

  useEffect(() => {
    activeChatRef.current = activeChat;
    setActiveConversationId(activeChat?.id || null);
    if (activeChat?.id) {
      markAsRead(activeChat.id);
    }
  }, [activeChat]);

  useEffect(() => {
    initChat();
  }, []);

  const initChat = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, full_name, email, role, specialization, branch_id')
          .eq('id', userData.user.id)
          .single();

        if (profile) {
          setCurrentUser(profile);
          if (profile.branch_id) setUserBranchId(profile.branch_id);
          await loadConversations(profile.id);
        }
      }
    } catch (e) {
      console.error('Error initializing chat:', e);
    } finally {
      setLoading(false);
    }
  };

  // ── Show In-App Notification Banner ──
  const triggerNotification = (senderName: string, messageContent: string, convoId: string) => {
    try {
      Vibration.vibrate(150);
    } catch (e) {}

    setToastNotification({
      title: senderName,
      body: formatLastMessagePreview(messageContent),
      conversationId: convoId,
    });

    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: topInset + 6,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.delay(3200),
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToastNotification(null);
    });
  };

  // ── Realtime Subscription ──
  useEffect(() => {
    if (!currentUser?.id) return;

    const channelName = `mobile_chat_${currentUser.id}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          const newMsg = payload.new as ChatMessage;

          // Skip messages sent by self
          const isMe = newMsg.sender_id === currentUser.id;
          if (isMe && activeChatRef.current?.id !== newMsg.conversation_id) return;

          // Verify this user is actually a participant of this conversation
          const { data: myPart } = await supabase
            .from('chat_participants')
            .select('id')
            .eq('conversation_id', newMsg.conversation_id)
            .eq('user_id', currentUser.id)
            .maybeSingle();

          if (!myPart) return; // Not a participant — ignore completely

          const { data: senderData } = await supabase
            .from('users')
            .select('id, full_name, role, specialization')
            .eq('id', newMsg.sender_id)
            .single();

          if (activeChatRef.current?.id === newMsg.conversation_id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, { ...newMsg, sender: senderData || undefined }];
            });

            if (!isMe) {
              playNotificationBeep();
            }

            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
          } else if (!isMe) {
            refreshUnreadCount();

            triggerNotification(
              senderData?.full_name || 'Staff Member',
              newMsg.content,
              newMsg.conversation_id
            );
          }

          if (currentUser?.id) {
            loadConversations(currentUser.id, false);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_participants' },
        (payload) => {
          const updated = payload.new as any;
          if (updated && activeChatRef.current?.id === updated.conversation_id) {
            setActiveChat((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                participants: prev.participants.map((p) =>
                  p.user_id === updated.user_id
                    ? { ...p, last_read_at: updated.last_read_at }
                    : p
                ),
              };
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat.id);
    } else {
      setMessages([]);
    }
  }, [activeChat?.id]);

  useEffect(() => {
    if (targetUserId && currentUser?.id && !activeChat) {
      startChatWithUser(targetUserId);
    }
  }, [targetUserId, currentUser?.id]);

  // ── Load Conversations ──
  const loadConversations = async (userId: string, showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const { data: partData, error: partError } = await supabase
        .from('chat_participants')
        .select('conversation_id')
        .eq('user_id', userId);

      if (partError) throw partError;
      if (!partData || partData.length === 0) {
        setConversations([]);
        return;
      }

      const convoIds = partData.map((p) => p.conversation_id);

      const { data: convos, error: convosError } = await supabase
        .from('chat_conversations')
        .select(
          `
          *,
          chat_participants (
            id,
            user_id,
            last_read_at,
            user:users (
              id,
              full_name,
              email,
              role,
              specialization
            )
          )
        `
        )
        .in('id', convoIds)
        .order('last_message_at', { ascending: false });

      if (convosError) throw convosError;

      const formatted: ChatConversation[] = (convos || []).map((c: any) => ({
        id: c.id,
        created_at: c.created_at,
        is_group: c.is_group || false,
        name: c.name || '',
        last_message: c.last_message || '',
        last_message_at: c.last_message_at || c.created_at,
        participants: (c.chat_participants || []).map((cp: any) => ({
          user_id: cp.user_id,
          last_read_at: cp.last_read_at,
          user: cp.user,
        })),
      }));

      setConversations(formatted);

      if (initialConversationId) {
        const found = formatted.find((c) => c.id === initialConversationId);
        if (found) setActiveChat(found);
      }
    } catch (e: any) {
      console.error('Error loading conversations:', e);
    } finally {
      if (showLoader) setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Load Messages ──
  const loadMessages = async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(
          `
          *,
          sender:users (
            id,
            full_name,
            role,
            specialization
          )
        `
        )
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 150);
    } catch (e: any) {
      console.error('Error loading messages:', e);
      Alert.alert('Error', 'Unable to load chat messages.');
    } finally {
      setLoadingMessages(false);
    }
  };

  // ── Send Message ──
  const handleSendMessage = async () => {
    if (!newMessageText.trim() || !activeChat || !currentUser?.id || sending) return;

    const content = newMessageText.trim();
    setNewMessageText('');
    setSending(true);

    try {
      const { data: newMsg, error: insertError } = await supabase
        .from('chat_messages')
        .insert([
          {
            conversation_id: activeChat.id,
            sender_id: currentUser.id,
            content: content,
          },
        ])
        .select(
          `
          *,
          sender:users (
            id,
            full_name,
            role,
            specialization
          )
        `
        )
        .single();

      if (insertError) throw insertError;

      if (newMsg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      await supabase
        .from('chat_conversations')
        .update({
          last_message: content,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', activeChat.id);

      loadConversations(currentUser.id, false);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (e: any) {
      console.error('Error sending message:', e);
      Alert.alert('Send Failed', 'Could not deliver your message.');
    } finally {
      setSending(false);
    }
  };

  // ── Send Rich Content Message (image/doc/audio) ──
  const sendRichMessage = async (content: string, preview: string) => {
    if (!activeChat || !currentUser?.id) return;
    try {
      const { data: newMsg, error } = await supabase
        .from('chat_messages')
        .insert([{ conversation_id: activeChat.id, sender_id: currentUser.id, content }])
        .select(`*, sender:users(id, full_name, role, specialization)`)
        .single();
      if (error) throw error;
      if (newMsg) {
        setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      }
      await supabase
        .from('chat_conversations')
        .update({ last_message: preview, last_message_at: new Date().toISOString() })
        .eq('id', activeChat.id);
      loadConversations(currentUser.id, false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert('Send Failed', 'Could not send media message.');
    }
  };

  // ── Helper to convert base64 to ArrayBuffer safely in React Native ──
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let bufferLength = base64.length * 0.75;
    const len = base64.length;
    let i = 0;
    let p = 0;

    if (base64[base64.length - 1] === '=') {
      bufferLength--;
      if (base64[base64.length - 2] === '=') bufferLength--;
    }

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const bytes = new Uint8Array(arrayBuffer);

    for (i = 0; i < len; i += 4) {
      const enc1 = chars.indexOf(base64[i]);
      const enc2 = chars.indexOf(base64[i + 1]);
      const enc3 = chars.indexOf(base64[i + 2]);
      const enc4 = chars.indexOf(base64[i + 3]);

      bytes[p++] = (enc1 << 2) | (enc2 >> 4);
      if (enc3 !== 64 && enc3 !== -1) {
        bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2);
      }
      if (enc4 !== 64 && enc4 !== -1) {
        bytes[p++] = ((enc3 & 3) << 6) | enc4;
      }
    }
    return arrayBuffer;
  };

  // ── Upload helper using Supabase Admin & FileSystem ──
  const uploadChatFile = async (uri: string, path: string, contentType: string): Promise<string> => {
    let fileData: ArrayBuffer;
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      fileData = base64ToArrayBuffer(base64);
    } catch {
      fileData = await fetch(uri).then((r) => r.arrayBuffer());
    }

    const { data: uploaded, error: uploadError } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(path, fileData, { contentType, upsert: false });

    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabaseAdmin.storage.from('chat-media').getPublicUrl(uploaded.path);
    return publicUrl;
  };

  // ── Pick & Send Image from Gallery ──
  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.75,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setSendingMedia(true);
      const asset = result.assets[0];
      const fileName = asset.fileName || `photo_${Date.now()}.jpg`;
      const publicUrl = await uploadChatFile(
        asset.uri,
        `images/${Date.now()}_${fileName}`,
        asset.mimeType || 'image/jpeg'
      );
      await sendRichMessage(`[IMAGE:${publicUrl}|${fileName}]`, '📷 Photo');
    } catch (e: any) {
      Alert.alert('Error', 'Could not send image: ' + (e?.message || ''));
    } finally {
      setSendingMedia(false);
    }
  };

  // ── Open Camera & Send Photo ──
  const handleOpenCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow camera access in Settings.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.75,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setSendingMedia(true);
      const asset = result.assets[0];
      const fileName = `camera_${Date.now()}.jpg`;
      const publicUrl = await uploadChatFile(
        asset.uri,
        `images/${fileName}`,
        'image/jpeg'
      );
      await sendRichMessage(`[IMAGE:${publicUrl}|${fileName}]`, '📷 Photo');
    } catch (e: any) {
      Alert.alert('Error', 'Could not send photo: ' + (e?.message || ''));
    } finally {
      setSendingMedia(false);
    }
  };

  // ── Pick & Send Document ──
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setSendingMedia(true);
      const asset = result.assets[0];
      const fileName = asset.name || `document_${Date.now()}`;
      const publicUrl = await uploadChatFile(
        asset.uri,
        `documents/${Date.now()}_${fileName}`,
        asset.mimeType || 'application/octet-stream'
      );
      await sendRichMessage(`[FILE:${publicUrl}|${fileName}]`, `📄 ${fileName}`);
    } catch (e: any) {
      Alert.alert('Error', 'Could not send document: ' + (e?.message || ''));
    } finally {
      setSendingMedia(false);
    }
  };

  // ── Attachment action sheet ──
  const handleAttachPress = () => {
    Alert.alert(
      'Send Attachment',
      'Choose what to share',
      [
        { text: '🖼️  Photo from Gallery', onPress: handlePickImage },
        { text: '📷  Take a Photo', onPress: handleOpenCamera },
        { text: '📄  Document / File', onPress: handlePickDocument },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // ── Audio Recording Helper ──
  const formatDuration = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ── Start Recording (Tap Mic) ──
  const handleStartRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Please allow microphone access to send voice notes.');
        return;
      }
      Keyboard.dismiss();
      setShowEmojiPicker(false);
      await setAudioModeAsync({ playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      audioRecorder.record();
      setIsRecording(true);
      setRecordingDuration(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      try {
        Vibration.vibrate(40);
      } catch (e) {}
    } catch (e: any) {
      Alert.alert('Recording Error', 'Could not start recording: ' + (e?.message || ''));
    }
  };

  // ── Cancel / Delete Recording (Tap Trash) ──
  const handleCancelRecording = async () => {
    if (!isRecording) return;
    try {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      setRecordingDuration(0);
      await audioRecorder.stop().catch(() => {});
      try {
        Vibration.vibrate(60);
      } catch (e) {}
    } catch (e) {
      console.log('Error canceling recording:', e);
    }
  };

  // ── Stop & Send Recording (Tap Green Send Button) ──
  const handleStopAndSendRecording = async () => {
    if (!isRecording) return;
    try {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      const duration = recordingDuration;
      setIsRecording(false);
      setRecordingDuration(0);

      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (!uri || !activeChat || !currentUser?.id) return;
      if (duration < 1) {
        // Less than 1 second, discard
        return;
      }
      setSendingMedia(true);

      const fileName = `voice_${Date.now()}.m4a`;
      const publicUrl = await uploadChatFile(
        uri,
        `audio/${fileName}`,
        'audio/m4a'
      );

      await sendRichMessage(`[AUDIO:${publicUrl}|Voice Note (${duration}s)]`, '🎤 Voice Note');
    } catch (e: any) {
      Alert.alert('Recording Error', 'Could not send voice note: ' + (e?.message || ''));
    } finally {
      setSendingMedia(false);
    }
  };

  // ── Direct In-Chat Audio Playback ──
  const handlePlayVoiceNote = async (msgId: string, rawUrl: string) => {
    try {
      if (playingMsgId === msgId && playerRef.current) {
        playerRef.current.pause();
        setPlayingMsgId(null);
        return;
      }

      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.release?.();
        } catch (e) {}
        playerRef.current = null;
      }

      setLoadingAudioId(msgId);

      let playableUri = rawUrl;

      if (rawUrl.startsWith('data:')) {
        const base64Data = rawUrl.includes(',') ? rawUrl.split(',')[1] : rawUrl;
        const localPath = `${FileSystem.cacheDirectory}vn_${Date.now()}.webm`;
        await FileSystem.writeAsStringAsync(localPath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        playableUri = localPath;
      }

      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});

      const player = createAudioPlayer(playableUri);
      playerRef.current = player;
      setPlayingMsgId(msgId);
      setLoadingAudioId(null);

      player.play();

      player.addListener?.('playbackStatusUpdate', (status: any) => {
        if (status?.isLoaded && status?.didJustFinish) {
          setPlayingMsgId(null);
        }
      });
    } catch (err: any) {
      console.error('Direct audio playback error:', err);
      setLoadingAudioId(null);
      setPlayingMsgId(null);

      try {
        if (rawUrl.startsWith('http')) {
          Linking.openURL(rawUrl);
        } else if (rawUrl.startsWith('data:')) {
          const base64Data = rawUrl.includes(',') ? rawUrl.split(',')[1] : rawUrl;
          const localPath = `${FileSystem.cacheDirectory}voice_note_${Date.now()}.webm`;
          await FileSystem.writeAsStringAsync(localPath, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(localPath, { dialogTitle: 'Play Voice Note' });
          }
        }
      } catch (fallbackError) {
        Alert.alert('Audio Error', 'Unable to play voice note.');
      }
    }
  };

  // ── Long Press Message: Delete or Options ──
  const handleLongPressMessage = (message: ChatMessage) => {
    try {
      Vibration.vibrate(40);
    } catch (e) {}

    const isAudio = message.content?.startsWith('[AUDIO:');
    const isImage = message.content?.startsWith('[IMAGE:');
    const isFile = message.content?.startsWith('[FILE:');

    let preview = message.content || '';
    if (isAudio) preview = '🎤 Voice Note';
    else if (isImage) preview = '📷 Photo';
    else if (isFile) preview = '📄 Document';

    Alert.alert(
      'Message Options',
      preview.length > 60 ? `${preview.slice(0, 60)}...` : preview,
      [
        {
          text: '🗑️ Delete Message',
          style: 'destructive',
          onPress: () => confirmDeleteMessage(message),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const confirmDeleteMessage = (message: ChatMessage) => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Optimistic deletion
              setMessages((prev) => prev.filter((m) => m.id !== message.id));

              const { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('id', message.id);

              if (error) throw error;

              if (activeChat) {
                const remaining = messages.filter((m) => m.id !== message.id);
                const last = remaining[remaining.length - 1];
                await supabase
                  .from('chat_conversations')
                  .update({
                    last_message: last ? last.content : 'Message deleted',
                    last_message_at: last ? last.created_at : new Date().toISOString(),
                  })
                  .eq('id', activeChat.id);

                if (currentUser?.id) {
                  loadConversations(currentUser.id, false);
                }
              }
            } catch (e: any) {
              console.error('Error deleting message:', e);
              Alert.alert('Error', 'Unable to delete message.');
              if (activeChat) loadMessages(activeChat.id);
            }
          },
        },
      ]
    );
  };

  // ── Long Press Conversation: Delete Entire Chat ──
  const handleLongPressConversation = (convo: ChatConversation) => {
    try {
      Vibration.vibrate(40);
    } catch (e) {}

    const title = getConvoTitle(convo);

    Alert.alert(
      title,
      'Conversation Options',
      [
        {
          text: '🗑️ Delete Conversation',
          style: 'destructive',
          onPress: () => confirmDeleteConversation(convo),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const confirmDeleteConversation = (convo: ChatConversation) => {
    Alert.alert(
      'Delete Conversation',
      `Delete conversation with ${getConvoTitle(convo)}? This will remove chat history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setConversations((prev) => prev.filter((c) => c.id !== convo.id));
              if (activeChat?.id === convo.id) setActiveChat(null);

              await supabase.from('chat_participants').delete().eq('conversation_id', convo.id);
              await supabase.from('chat_messages').delete().eq('conversation_id', convo.id);
              await supabase.from('chat_conversations').delete().eq('id', convo.id);

              if (currentUser?.id) {
                loadConversations(currentUser.id, false);
              }
            } catch (e: any) {
              console.error('Error deleting conversation:', e);
              Alert.alert('Error', 'Unable to delete conversation.');
            }
          },
        },
      ]
    );
  };

  // ── Start Chat With User ──
  const startChatWithUser = async (targetUser: StaffUser | string) => {
    const otherUserId = typeof targetUser === 'string' ? targetUser : targetUser.id;
    if (!currentUser?.id || otherUserId === currentUser.id) return;

    setStaffModalVisible(false);
    setLoading(true);

    try {
      const { data: myConvos } = await supabase
        .from('chat_participants')
        .select('conversation_id')
        .eq('user_id', currentUser.id);

      if (myConvos && myConvos.length > 0) {
        const myConvoIds = myConvos.map((c) => c.conversation_id);

        const { data: existingPart } = await supabase
          .from('chat_participants')
          .select('conversation_id')
          .eq('user_id', otherUserId)
          .in('conversation_id', myConvoIds);

        if (existingPart && existingPart.length > 0) {
          const matchId = existingPart[0].conversation_id;
          const found = conversations.find((c) => c.id === matchId);
          if (found) {
            setActiveChat(found);
            setLoading(false);
            return;
          }
        }
      }

      const { data: newConvo, error: createError } = await supabase
        .from('chat_conversations')
        .insert([
          {
            is_group: false,
            last_message: 'Started new conversation',
            last_message_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (createError) throw createError;

      await supabase.from('chat_participants').insert([
        { conversation_id: newConvo.id, user_id: currentUser.id },
        { conversation_id: newConvo.id, user_id: otherUserId },
      ]);

      await loadConversations(currentUser.id);

      const freshTarget: StaffUser | undefined =
        typeof targetUser === 'string'
          ? allStaff.find((s) => s.id === targetUser)
          : targetUser;

      setActiveChat({
        id: newConvo.id,
        created_at: newConvo.created_at,
        is_group: false,
        name: freshTarget?.full_name || 'Direct Chat',
        last_message: '',
        last_message_at: newConvo.created_at,
        participants: [
          { user_id: currentUser.id, user: currentUser },
          { user_id: otherUserId, user: freshTarget },
        ],
      });
    } catch (e: any) {
      console.error('Error starting chat:', e);
      Alert.alert('Error', 'Unable to start chat with colleague.');
    } finally {
      setLoading(false);
    }
  };

  // ── Load Staff Directory ──
  const loadStaffDirectory = async () => {
    setLoadingStaff(true);
    try {
      let query = supabase
        .from('users')
        .select('id, full_name, email, role, specialization, phone, branch_id')
        .neq('id', currentUser?.id || '');

      if (userBranchId) {
        query = query.or(`branch_id.eq.${userBranchId},branch_id.is.null`);
      }

      const { data, error } = await query.order('full_name', { ascending: true });
      if (error) throw error;
      setAllStaff(data || []);
    } catch (e: any) {
      console.error('Error loading staff directory:', e);
    } finally {
      setLoadingStaff(false);
    }
  };

  const onRefresh = () => {
    if (currentUser?.id) {
      setRefreshing(true);
      loadConversations(currentUser.id, false);
    }
  };

  const getOtherParticipant = (convo: ChatConversation): StaffUser | null => {
    if (!currentUser) return null;
    const other = convo.participants.find((p) => p.user_id !== currentUser.id);
    return other?.user || null;
  };

  const getConvoTitle = (convo: ChatConversation): string => {
    if (convo.is_group) return convo.name || 'Group Chat';
    const other = getOtherParticipant(convo);
    return other?.full_name || 'Staff Colleague';
  };

  const getConvoSub = (convo: ChatConversation): string => {
    if (convo.is_group) return 'Staff Group';
    const other = getOtherParticipant(convo);
    if (!other) return 'Staff';
    return (other.role || 'Staff').toUpperCase() + (other.specialization ? ` • ${other.specialization}` : '');
  };

  const isMessageReadByOther = (msg: ChatMessage): boolean => {
    if (!activeChat || !currentUser) return false;
    const otherParticipants = activeChat.participants.filter((p) => p.user_id !== currentUser.id);
    if (otherParticipants.length === 0) return false;

    return otherParticipants.some((p) => {
      if (!p.last_read_at) return false;
      return new Date(p.last_read_at).getTime() >= new Date(msg.created_at).getTime();
    });
  };

  // ── Render Rich Message Content ──
  const renderMessageContent = (item: ChatMessage, isMe: boolean) => {
    const content = item.content || '';
    // WhatsApp colour palette
    const sentText    = '#111B21';
    const receivedText = '#111B21';

    try {
      const isAudio = content.startsWith('[AUDIO:');
      const isImage = content.startsWith('[IMAGE:');
      const isFile  = content.startsWith('[FILE:');

      if (isAudio) {
        const raw = content.slice(7, -1);
        const parts = raw.split('|');
        const audioUrl = parts[0];
        const audioMeta = parts[1] || 'Voice Note';
        const isPlaying = playingMsgId === item.id;
        const isLoadingAudio = loadingAudioId === item.id;

        return (
          <View style={[styles.voiceNoteBubble, { minWidth: 200 }]}>
            <View style={styles.voiceNoteHeaderRow}>
              <TouchableOpacity
                style={[styles.voicePlayBtn, { backgroundColor: isMe ? '#128C7E' : '#25D366' }]}
                onPress={() => handlePlayVoiceNote(item.id, audioUrl)}
                activeOpacity={0.75}
                disabled={isLoadingAudio}
              >
                {isLoadingAudio ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={{ fontSize: 14, color: '#FFF' }}>
                    {isPlaying ? '⏸' : '▶'}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={{ flex: 1, marginLeft: 10 }}>
                {/* WhatsApp waveform bars */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 4 }}>
                  {[4,6,10,8,12,7,9,5,11,6,8,10,5,7,9].map((h, i) => (
                    <View key={i} style={{
                      width: 2.5,
                      height: h,
                      borderRadius: 1.5,
                      backgroundColor: isPlaying
                        ? (i < 8 ? '#25D366' : 'rgba(37,211,102,0.35)')
                        : 'rgba(0,0,0,0.25)',
                    }} />
                  ))}
                </View>
                <Text style={{ fontSize: 10.5, color: '#111B21', fontWeight: '500' }}>
                  {audioMeta}{isPlaying ? ' · playing' : ''}
                </Text>
              </View>
            </View>
          </View>
        );
      }

      if (isImage) {
        const raw = content.slice(7, -1);
        const parts = raw.split('|');
        const imageUrl = parts[0];
        const imageTitle = parts[1] || 'Photo';

        return (
          <View style={styles.mediaContainer}>
            <TouchableOpacity
              onPress={() => { setPreviewImageUrl(imageUrl); setPreviewImageTitle(imageTitle); }}
              activeOpacity={0.9}
              style={[styles.imageCard, { borderRadius: 8, overflow: 'hidden' }]}
            >
              <Image source={{ uri: imageUrl }} style={styles.chatImage} resizeMode="cover" />
            </TouchableOpacity>
          </View>
        );
      }

      if (isFile) {
        const raw = content.slice(6, -1);
        const parts = raw.split('|');
        const fileUrl = parts[0];
        const fileName = parts[1] || 'Document';

        return (
          <TouchableOpacity
            style={[styles.fileCard, { backgroundColor: isMe ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.05)' }]}
            onPress={() => { if (fileUrl) Linking.openURL(fileUrl).catch(() => Alert.alert('Document', 'Unable to open file.')); }}
            activeOpacity={0.75}
          >
            <Text style={{ fontSize: 22 }}>📄</Text>
            <Text style={[styles.fileName, { color: isMe ? sentText : receivedText }]} numberOfLines={1}>
              {fileName}
            </Text>
          </TouchableOpacity>
        );
      }

      // Plain text
      return (
        <Text style={[styles.msgText, { color: isMe ? sentText : receivedText }]}>
          {content}
        </Text>
      );
    } catch {
      return <Text style={[styles.msgText, { color: isMe ? '#111B21' : '#111B21' }]}>{content}</Text>;
    }
  };

  // ── Filtered Data ──
  const filteredConversations = conversations.filter((c) => {
    const q = searchConvo.toLowerCase().trim();
    if (!q) return true;
    const title = getConvoTitle(c).toLowerCase();
    const lastMsg = (c.last_message || '').toLowerCase();
    return title.includes(q) || lastMsg.includes(q);
  });

  const filteredStaff = allStaff.filter((s) => {
    const q = staffSearch.toLowerCase().trim();
    const matchesQuery =
      !q ||
      s.full_name?.toLowerCase().includes(q) ||
      s.role?.toLowerCase().includes(q) ||
      s.specialization?.toLowerCase().includes(q);

    const matchesRole =
      selectedRoleFilter === 'all' || s.role?.toLowerCase() === selectedRoleFilter;

    return matchesQuery && matchesRole;
  });

  // ── Chat Stream & Input — WhatsApp style ──
  const renderChatStreamAndInput = () => (
    <View style={{ flex: 1, backgroundColor: '#E5DDD5' }}>
      {/* Messages Stream: Full Height Viewport with Free Two-Way Scrolling */}
      {loadingMessages ? (
        <View style={[styles.loadingContainer, { backgroundColor: '#E5DDD5' }]}>
          <ActivityIndicator size="small" color="#25D366" />
          <Text style={{ color: '#667781', marginTop: 8, fontSize: 13 }}>Loading messages...</Text>
        </View>
      ) : messages.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.emptyMessagesContainer, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={{ fontSize: 42, marginBottom: 8 }}>💬</Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111B21' }}>No Messages Yet</Text>
          <Text style={{ fontSize: 12, textAlign: 'center', marginTop: 4, color: '#667781' }}>
            Send a message below to start the conversation.
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 8,
            paddingTop: 8,
            paddingBottom: 12,
            flexGrow: 1,
          }}
          scrollEnabled={true}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={40}
          maxToRenderPerBatch={40}
          renderItem={({ item, index }) => {
            const isMe = item.sender_id === currentUser?.id;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDateHeader = !prevMsg || !isSameDay(item.created_at, prevMsg.created_at);

            return (
              <View>
                {/* WhatsApp-style date pill */}
                {showDateHeader && (
                  <View style={{ alignItems: 'center', marginVertical: 8 }}>
                    <View style={{
                      backgroundColor: '#D9F0D3',
                      paddingHorizontal: 12,
                      paddingVertical: 4,
                      borderRadius: 8,
                      shadowColor: '#000',
                      shadowOpacity: 0.08,
                      shadowRadius: 3,
                      elevation: 1,
                    }}>
                      <Text style={{ fontSize: 11.5, color: '#4A4A4A', fontWeight: '600' }}>
                        {formatDateHeader(item.created_at)}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={[
                  { flexDirection: 'row', marginVertical: 2 },
                  isMe ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' },
                ]}>
                  <TouchableOpacity
                    onLongPress={() => handleLongPressMessage(item)}
                    delayLongPress={350}
                    activeOpacity={0.85}
                    style={[
                      {
                        maxWidth: '78%',
                        paddingHorizontal: 10,
                        paddingTop: 6,
                        paddingBottom: 4,
                        borderRadius: 8,
                        shadowColor: '#000',
                        shadowOpacity: 0.08,
                        shadowRadius: 2,
                        elevation: 1,
                      },
                      isMe
                        ? { backgroundColor: '#DCF8C6', borderTopRightRadius: 2 }
                        : { backgroundColor: '#FFFFFF', borderTopLeftRadius: 2 },
                    ]}
                  >
                    {/* Sender name in group chats */}
                    {!isMe && item.sender?.full_name && (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#25D366', marginBottom: 2 }}>
                        {item.sender.full_name}
                      </Text>
                    )}

                    {renderMessageContent(item, isMe)}

                    {/* Timestamp row — right-aligned like WhatsApp */}
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 2, gap: 3 }}>
                      <Text style={{ fontSize: 10, color: '#667781' }}>
                        {formatMessageTime(item.created_at)}
                      </Text>
                      {isMe && (
                        isMessageReadByOther(item) ? (
                          <Text style={{ fontSize: 10, color: '#53BDEB', fontWeight: 'bold' }}>✓✓</Text>
                        ) : (
                          <Text style={{ fontSize: 10, color: '#8696A0' }}>✓</Text>
                        )
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* WhatsApp-style Input Bar & Recording Console */}
      {isRecording ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            paddingTop: 6,
            paddingBottom: keyboardHeight > 0 ? 6 : Math.max(insets.bottom, 12) + 4,
            backgroundColor: '#F0F0F0',
            gap: 8,
          }}
        >
          {/* Cancel / Discard Recording Button (Trash) */}
          <TouchableOpacity
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#FEE2E2',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={handleCancelRecording}
            activeOpacity={0.75}
          >
            <Text style={{ fontSize: 20 }}>🗑️</Text>
          </TouchableOpacity>

          {/* Live Recording Status & Waveform Pill */}
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              borderRadius: 22,
              paddingHorizontal: 12,
              height: 44,
              elevation: 1,
              shadowColor: '#000',
              shadowOpacity: 0.06,
              shadowRadius: 2,
              gap: 8,
            }}
          >
            {/* Blinking Red Dot */}
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: '#EF4444',
              }}
            />

            {/* Timer */}
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111B21', minWidth: 38 }}>
              {formatDuration(recordingDuration)}
            </Text>

            {/* Animated Waveform Visualizer */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.5 }}>
              {[12, 22, 16, 26, 14, 20, 28, 18, 24, 15, 22, 18].map((h, i) => (
                <View
                  key={i}
                  style={{
                    width: 3,
                    height: Math.max(6, ((recordingDuration + i) % 4 + 1) * (h / 4)),
                    borderRadius: 2,
                    backgroundColor: '#25D366',
                  }}
                />
              ))}
            </View>
          </View>

          {/* Send Voice Note Button (Green Circle with Arrow) */}
          <TouchableOpacity
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: '#25D366',
              justifyContent: 'center',
              alignItems: 'center',
              elevation: 2,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 3,
            }}
            onPress={handleStopAndSendRecording}
            disabled={sendingMedia}
            activeOpacity={0.8}
          >
            {sendingMedia ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={{ fontSize: 18, color: '#FFFFFF' }}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            paddingHorizontal: 6,
            paddingTop: 6,
            paddingBottom: keyboardHeight > 0 ? 6 : Math.max(insets.bottom, 12) + 4,
            backgroundColor: '#F0F0F0',
            gap: 6,
          }}
        >
          {/* Message input pill */}
          <View style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'flex-end',
            backgroundColor: '#FFFFFF',
            borderRadius: 22,
            paddingHorizontal: 10,
            paddingVertical: 6,
            minHeight: 44,
            elevation: 1,
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 2,
          }}>
            {/* Emoji button */}
            <TouchableOpacity
              style={{ paddingRight: 6, paddingBottom: 4, justifyContent: 'center' }}
              onPress={() => { Keyboard.dismiss(); setShowEmojiPicker(true); }}
            >
              <Text style={{ fontSize: 22 }}>🙂</Text>
            </TouchableOpacity>

            <TextInput
              style={{
                flex: 1,
                fontSize: 15,
                color: '#111B21',
                maxHeight: 120,
                paddingVertical: 4,
              }}
              placeholder="Message"
              placeholderTextColor="#8696A0"
              value={newMessageText}
              onChangeText={setNewMessageText}
              onFocus={() => setShowEmojiPicker(false)}
              multiline
              maxLength={1000}
            />

            {/* Attachment button */}
            <TouchableOpacity
              style={{ paddingLeft: 6, paddingBottom: 4, justifyContent: 'center' }}
              onPress={handleAttachPress}
              disabled={sendingMedia}
            >
              {sendingMedia ? (
                <ActivityIndicator size="small" color="#8696A0" />
              ) : (
                <Text style={{ fontSize: 22 }}>📎</Text>
              )}
            </TouchableOpacity>

            {/* Camera button */}
            <TouchableOpacity
              style={{ paddingLeft: 6, paddingBottom: 4, justifyContent: 'center' }}
              onPress={handleOpenCamera}
              disabled={sendingMedia}
            >
              <Text style={{ fontSize: 20 }}>📷</Text>
            </TouchableOpacity>
          </View>

          {/* Send / Mic button — tap to start recording or tap to send text */}
          <TouchableOpacity
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: '#25D366',
              justifyContent: 'center',
              alignItems: 'center',
              elevation: 2,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 3,
            }}
            onPress={newMessageText.trim() ? handleSendMessage : handleStartRecording}
            disabled={sending || sendingMedia}
            activeOpacity={0.8}
          >
            {sending || sendingMedia ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : newMessageText.trim() ? (
              <Text style={{ fontSize: 18, color: '#FFFFFF' }}>➤</Text>
            ) : (
              <Text style={{ fontSize: 20, color: '#FFFFFF' }}>🎤</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Emoji Picker Modal */}
      <Modal
        visible={showEmojiPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmojiPicker(false)}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setShowEmojiPicker(false)}
        />
        <View style={{
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 20),
          elevation: 12,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          maxHeight: 320,
        }}>
          <View style={{ paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111B21', flex: 1 }}>Emojis</Text>
            <TouchableOpacity onPress={() => setShowEmojiPicker(false)}>
              <Text style={{ fontSize: 18, color: '#8696A0' }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 8 }}>
              {[
                '😀','😂','😄','😆','😉','😍','🤣','😢','😭','😡',
                '👍','👎','❤️','🔥','🎉','🤔','😮','😨','🙏','💪',
                '👏','🙌','🤝','👋','✌️','🤛','🤜','👌','☝️','👇',
                '🏥','💉','💊','🩺','🧴','💁','👨‍⚕️','👩‍⚕️','⏰','✅',
                '❌','⚠️','🔔','🔕','📞','📧','📝','📅','🔒','💡',
              ].map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => setNewMessageText(prev => prev + emoji)}
                >
                  <Text style={{ fontSize: 26 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.cardBg} />

      {/* ─────────────────────────────────────────────────────────────
          IN-APP NOTIFICATION BANNER / TOAST (Sound + Vibration)
         ───────────────────────────────────────────────────────────── */}
      {toastNotification && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY: toastAnim }],
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: themeColors.accent,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.toastInner}
            onPress={() => {
              const found = conversations.find((c) => c.id === toastNotification.conversationId);
              if (found) {
                setActiveChat(found);
                setToastNotification(null);
              }
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.toastAvatar, { backgroundColor: themeColors.accent }]}>
              <Text style={{ fontSize: 16 }}>💬</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.toastTitle, { color: themeColors.text }]} numberOfLines={1}>
                {toastNotification.title}
              </Text>
              <Text style={[styles.toastBody, { color: themeColors.subText }]} numberOfLines={1}>
                {toastNotification.body}
              </Text>
            </View>
            <Text style={[styles.toastOpenText, { color: themeColors.accent }]}>Open</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. ACTIVE CHAT VIEW — header is position:absolute so Android
             adjustResize / keyboard can NEVER shift it off screen.
         ───────────────────────────────────────────────────────────── */}
      {activeChat ? (() => {
        const headerHeight = topInset + 60;
        return (
          <View style={{ flex: 1 }}>
            {/* ── WhatsApp-style Absolutely-Pinned Header ── */}
            <View
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                zIndex: 999,
                elevation: 8,
                backgroundColor: '#075E54',
                paddingTop: topInset + 4,
                paddingBottom: 10,
                paddingHorizontal: 6,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              {/* Back arrow */}
              <TouchableOpacity
                onPress={() => { Keyboard.dismiss(); setActiveChat(null); }}
                activeOpacity={0.7}
                style={{ padding: 6 }}
              >
                <Text style={{ fontSize: 22, color: '#FFFFFF' }}>‹</Text>
              </TouchableOpacity>

              {/* Avatar circle */}
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: '#128C7E',
                justifyContent: 'center', alignItems: 'center',
                marginLeft: 2,
              }}>
                <Text style={{ fontSize: 18 }}>👤</Text>
              </View>

              {/* Name + role */}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 15.5, fontWeight: '700', color: '#FFFFFF' }} numberOfLines={1}>
                  {getConvoTitle(activeChat)}
                </Text>
                <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.8)' }} numberOfLines={1}>
                  {getConvoSub(activeChat)}
                </Text>
              </View>

              {/* Action icons — no call icon */}
              <TouchableOpacity style={{ padding: 8 }}>
                <Text style={{ fontSize: 17, color: '#FFFFFF' }}>⋮</Text>
              </TouchableOpacity>
            </View>

            {/* ── Chat body fills the window below the pinned header.
                Dynamically offsets by keyboardHeight so the input bar is ALWAYS
                lifted above the keyboard on every Android & iOS device. ── */}
            <View style={{ flex: 1, paddingTop: headerHeight, paddingBottom: keyboardHeight }}>
              {renderChatStreamAndInput()}
            </View>
          </View>
        );
      })() : (
        /* ─────────────────────────────────────────────────────────────
           2. CONVERSATIONS LIST VIEW (With Unread Badges)
          ───────────────────────────────────────────────────────────── */
        <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: themeColors.bg }}>
          {/* Header — WhatsApp green for conversations list too */}
          <View
            style={[
              styles.header,
              {
                borderBottomColor: '#128C7E',
                backgroundColor: '#075E54',
                paddingTop: topInset + 6,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              style={{ padding: 6 }}
            >
              <Text style={{ fontSize: 22, color: '#FFFFFF' }}>‹</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF' }}>SpiritMed Chats</Text>
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.8)' }}>
                {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.newChatBtn, { backgroundColor: themeColors.accent }]}
              onPress={() => {
                loadStaffDirectory();
                setStaffModalVisible(true);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.newChatBtnText}>+ New Chat</Text>
            </TouchableOpacity>
          </View>

          {/* Search Conversations */}
          <View style={[styles.searchContainer, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border }]}>
            <View style={[styles.searchBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}>
              <Text style={{ fontSize: 14, color: themeColors.subText, marginRight: 6 }}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Search conversations..."
                placeholderTextColor={themeColors.subText}
                value={searchConvo}
                onChangeText={setSearchConvo}
              />
              {searchConvo.length > 0 && (
                <TouchableOpacity onPress={() => setSearchConvo('')}>
                  <Text style={{ color: themeColors.subText, fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Conversations List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={[styles.loadingText, { color: themeColors.subText }]}>Loading chats...</Text>
            </View>
          ) : filteredConversations.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 44, marginBottom: 8 }}>💬</Text>
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Conversations</Text>
              <Text style={[styles.emptySub, { color: themeColors.subText }]}>
                Start a private chat with any hospital staff member.
              </Text>
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: themeColors.accent }]}
                onPress={() => {
                  loadStaffDirectory();
                  setStaffModalVisible(true);
                }}
              >
                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>+ Start New Chat</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredConversations}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[themeColors.accent]} />}
              contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
              renderItem={({ item }) => {
                const title = getConvoTitle(item);
                const subtitle = getConvoSub(item);
                const unreadCount = unreadMap[item.id] || 0;
                const timeStr = item.last_message_at
                  ? new Date(item.last_message_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '';

                return (
                  <TouchableOpacity
                    style={[styles.convoCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                    onPress={() => setActiveChat(item)}
                    onLongPress={() => handleLongPressConversation(item)}
                    delayLongPress={350}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.convoAvatar, { backgroundColor: themeColors.accentBg }]}>
                      <Text style={{ fontSize: 18 }}>👤</Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.convoTitle, { color: themeColors.text }]} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={[styles.convoTime, { color: unreadCount > 0 ? themeColors.accent : themeColors.subText }]}>
                          {timeStr}
                        </Text>
                      </View>

                      <Text style={[styles.convoRoleTag, { color: themeColors.accent }]}>{subtitle}</Text>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
                        <Text style={[styles.convoLastMsg, { color: themeColors.subText }]} numberOfLines={1}>
                          {formatLastMessagePreview(item.last_message)}
                        </Text>

                        {unreadCount > 0 && (
                          <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. FULLSCREEN IMAGE PREVIEW MODAL
         ───────────────────────────────────────────────────────────── */}
      {previewImageUrl && (
        <Modal
          visible={!!previewImageUrl}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPreviewImageUrl(null)}
        >
          <View style={styles.imageModalBackground}>
            <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }}>
              <View style={styles.imageModalTopBar}>
                <Text style={styles.imageModalTitle} numberOfLines={1}>
                  {previewImageTitle || 'Photo'}
                </Text>
                <TouchableOpacity
                  style={styles.imageModalCloseBtn}
                  onPress={() => setPreviewImageUrl(null)}
                >
                  <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.imageModalCenter}>
                <Image
                  source={{ uri: previewImageUrl }}
                  style={styles.imageModalFull}
                  resizeMode="contain"
                />
              </View>

              <View style={[styles.imageModalBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <TouchableOpacity
                  style={styles.imageModalActionBtn}
                  onPress={() => {
                    if (previewImageUrl) Linking.openURL(previewImageUrl);
                  }}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>⬇️ Open / Save Image</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. STAFF DIRECTORY / NEW CHAT MODAL
         ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={staffModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setStaffModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: themeColors.bg, paddingTop: topInset }]}>
          <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={() => setStaffModalVisible(false)}
            >
              <Text style={{ fontSize: 18, color: themeColors.text }}>✕</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.modalHeaderTitle, { color: themeColors.text }]}>Staff Directory</Text>
              <Text style={[styles.headerSub, { color: themeColors.subText }]}>
                Select colleague to message
              </Text>
            </View>
          </View>

          {/* Search Box in Modal */}
          <View style={[styles.searchContainer, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border }]}>
            <View style={[styles.searchBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}>
              <Text style={{ fontSize: 14, color: themeColors.subText, marginRight: 6 }}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: themeColors.text }]}
                placeholder="Search by name or role..."
                placeholderTextColor={themeColors.subText}
                value={staffSearch}
                onChangeText={setStaffSearch}
              />
              {staffSearch.length > 0 && (
                <TouchableOpacity onPress={() => setSearchConvo('')}>
                  <Text style={{ color: themeColors.subText, fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Role Filter Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
              {(['all', 'doctor', 'nurse', 'admin', 'pharmacist', 'receptionist'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.rolePill,
                    selectedRoleFilter === r
                      ? { backgroundColor: themeColors.accent }
                      : { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                  ]}
                  onPress={() => setSelectedRoleFilter(r)}
                >
                  <Text
                    style={[
                      styles.rolePillText,
                      selectedRoleFilter === r ? { color: '#FFF' } : { color: themeColors.text },
                    ]}
                  >
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Staff List */}
          {loadingStaff ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={themeColors.accent} />
              <Text style={[styles.loadingText, { color: themeColors.subText }]}>Loading colleagues...</Text>
            </View>
          ) : filteredStaff.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 32, marginBottom: 6 }}>👥</Text>
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Staff Found</Text>
              <Text style={[styles.emptySub, { color: themeColors.subText }]}>
                No hospital members match your search.
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredStaff}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 12, paddingBottom: 40 + insets.bottom }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.staffCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                  onPress={() => startChatWithUser(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.staffAvatar, { backgroundColor: themeColors.accentBg }]}>
                    <Text style={{ fontSize: 18 }}>👤</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.staffName, { color: themeColors.text }]}>{item.full_name}</Text>
                    <Text style={[styles.staffMeta, { color: themeColors.accent }]}>
                      {(item.role || 'Staff').toUpperCase()}
                      {item.specialization ? ` • ${item.specialization}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.msgActionBadge, { backgroundColor: themeColors.accent }]}>
                    <Text style={styles.msgActionBadgeText}>Chat</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  newChatBtn: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
  },
  newChatBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  searchContainer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  emptyAddBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  convoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  convoAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  convoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 6,
  },
  convoTime: {
    fontSize: 11,
    fontWeight: '600',
  },
  convoRoleTag: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 1,
  },
  convoLastMsg: {
    fontSize: 12,
    flex: 1,
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  toastContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 999,
    borderRadius: 12,
    borderWidth: 1.5,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  toastAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  toastBody: {
    fontSize: 11,
    marginTop: 1,
  },
  toastOpenText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  activeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  activeTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  activeSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyMessagesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dateSeparatorRow: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateSeparatorPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dateSeparatorText: {
    fontSize: 10,
    fontWeight: '700',
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 3,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  bubbleLeft: {
    borderTopLeftRadius: 3,
    borderWidth: 1,
  },
  bubbleRight: {
    borderTopRightRadius: 3,
  },
  msgSenderName: {
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  msgText: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  msgTime: {
    fontSize: 9,
    alignSelf: 'flex-end',
    marginTop: 3,
  },
  voiceNoteBubble: {
    minWidth: 170,
    paddingVertical: 2,
  },
  voiceNoteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  voicePlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  voiceStatusLabel: {
    fontSize: 9.5,
    marginTop: 1,
  },
  voiceTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
    width: '100%',
    marginTop: 6,
  },
  voiceFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  mediaContainer: {
    marginVertical: 2,
  },
  imageCard: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  chatImage: {
    width: Math.min(SCREEN_WIDTH * 0.65, 230),
    height: 150,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    gap: 6,
    marginVertical: 2,
  },
  fileName: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  chatTextInput: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13.5,
    maxHeight: 90,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  rolePill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 10,
  },
  rolePillText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffName: {
    fontSize: 13.5,
    fontWeight: 'bold',
  },
  staffMeta: {
    fontSize: 10.5,
    marginTop: 1,
  },
  msgActionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  msgActionBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  imageModalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  imageModalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  imageModalTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 10,
  },
  imageModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  imageModalFull: {
    width: '100%',
    height: '100%',
  },
  imageModalBottomBar: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  imageModalActionBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
