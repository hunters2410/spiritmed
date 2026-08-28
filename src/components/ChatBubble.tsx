import React, { useState } from 'react';
import { FileText, Download, Play, Pause, Mic, Image as ImageIcon, ExternalLink, X } from 'lucide-react';

interface ChatBubbleProps {
  content: string;
  sender_name: string;
  sender_avatar?: string | null | undefined;
  sender_role?: string;
  is_own: boolean;
  created_at: string;
  is_read?: boolean;
}

export function ChatBubble({ content, sender_name, sender_avatar, sender_role, is_own, created_at, is_read }: ChatBubbleProps) {
  const dateObj = new Date(created_at);
  const time = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fullDateTime = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Helper to parse content types
  const isImage = content.startsWith('[IMAGE:');
  const isFile = content.startsWith('[FILE:');
  const isAudio = content.startsWith('[AUDIO:');

  let mediaUrl = '';
  let mediaMeta = '';

  if (isImage) {
    const raw = content.slice(7, -1); // remove [IMAGE: and ]
    const parts = raw.split('|');
    mediaUrl = parts[0];
    mediaMeta = parts[1] || 'Image';
  } else if (isFile) {
    const raw = content.slice(6, -1); // remove [FILE: and ]
    const parts = raw.split('|');
    mediaUrl = parts[0];
    mediaMeta = parts[1] || 'Document';
  } else if (isAudio) {
    const raw = content.slice(7, -1); // remove [AUDIO: and ]
    const parts = raw.split('|');
    mediaUrl = parts[0];
    mediaMeta = parts[1] || 'Voice Note';
  }

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  return (
    <>
      <div className={`flex items-end gap-2 mb-4 ${is_own ? 'flex-row-reverse' : 'flex-row'}`}>
        {!is_own && (
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0 overflow-hidden border border-indigo-200 dark:border-indigo-800 shadow-xs">
            {sender_avatar ? (
              <img src={sender_avatar} alt={sender_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300 uppercase">{sender_name.charAt(0)}</span>
            )}
          </div>
        )}

        <div className={`max-w-[80%] sm:max-w-md ${is_own ? 'items-end' : 'items-start'} flex flex-col`}>
          {!is_own && (
            <div className="flex items-center gap-1.5 mb-1 ml-1">
              <span className="text-[11px] font-extrabold text-gray-700 dark:text-gray-300">{sender_name}</span>
              {sender_role && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 bg-gray-100 dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 rounded uppercase tracking-wider">
                  {sender_role}
                </span>
              )}
            </div>
          )}

          <div
            className={`p-3 rounded-2xl shadow-xs text-sm ${
              is_own
                ? 'bg-indigo-600 text-white rounded-br-none'
                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700 rounded-bl-none'
            }`}
          >
            {isImage ? (
              <div className="space-y-1">
                <div 
                  onClick={() => setShowImageModal(true)}
                  className="cursor-pointer overflow-hidden rounded-xl border border-black/10 dark:border-white/10 relative group"
                >
                  <img src={mediaUrl} alt={mediaMeta} className="max-h-60 w-full object-cover group-hover:scale-105 transition duration-300" />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                    <ExternalLink className="w-5 h-5 drop-shadow-md" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] opacity-80 pt-1">
                  <span className="truncate max-w-[180px] font-medium">{mediaMeta}</span>
                  <a href={mediaUrl} download={mediaMeta} target="_blank" rel="noreferrer" className="underline hover:opacity-100 flex items-center gap-1">
                    <Download className="w-3 h-3" /> Save
                  </a>
                </div>
              </div>
            ) : isFile ? (
              <div className="flex items-center gap-3 p-1">
                <div className={`p-2.5 rounded-xl ${is_own ? 'bg-white/20' : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600'}`}>
                  <FileText className="w-6 h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-xs truncate max-w-[180px]" title={mediaMeta}>
                    {mediaMeta}
                  </p>
                  <a
                    href={mediaUrl}
                    download={mediaMeta}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1 text-[11px] font-bold mt-0.5 ${
                      is_own ? 'text-indigo-100 hover:text-white' : 'text-indigo-600 dark:text-indigo-400 hover:underline'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" /> Download Document
                  </a>
                </div>
              </div>
            ) : isAudio ? (
              <div className="flex items-center gap-3 p-1 min-w-[200px]">
                <button
                  type="button"
                  onClick={toggleAudio}
                  className={`p-2.5 rounded-full transition flex-shrink-0 ${
                    is_own ? 'bg-white text-indigo-600 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="flex items-center gap-1">
                      <Mic className="w-3.5 h-3.5" /> Voice Note
                    </span>
                  </div>
                  <audio
                    ref={audioRef}
                    src={mediaUrl}
                    onEnded={() => setIsPlayingAudio(false)}
                    className="hidden"
                  />
                  <div className="w-full bg-current/20 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full ${isPlayingAudio ? 'animate-pulse bg-current' : 'w-full bg-current/50'}`} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{content}</p>
            )}
          </div>

          <div className={`flex items-center gap-1 mt-1 px-1 ${is_own ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-gray-400 font-medium cursor-help" title={fullDateTime}>
              {time}
            </span>
            {is_own && (
              is_read ? (
                <span className="text-[11px] font-bold text-sky-500 flex items-center leading-none" title="Read by recipient">
                  ✓✓
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-gray-400 flex items-center leading-none" title="Sent (Unread)">
                  ✓
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {/* Image Modal Preview */}
      {showImageModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <X className="w-6 h-6" />
            </button>
            <img src={mediaUrl} alt={mediaMeta} className="max-h-[80vh] w-auto object-contain rounded-2xl shadow-2xl border border-white/20" />
            <div className="mt-4 flex items-center justify-between w-full text-white px-4">
              <span className="text-sm font-semibold">{mediaMeta}</span>
              <a
                href={mediaUrl}
                download={mediaMeta}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Download Image
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
