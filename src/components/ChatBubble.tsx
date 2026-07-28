

interface ChatBubbleProps {
  content: string;
  sender_name: string;
  sender_avatar?: string | null | undefined;
  is_own: boolean;
  created_at: string;
}

export function ChatBubble({ content, sender_name, sender_avatar, is_own, created_at }: ChatBubbleProps) {
  const time = new Date(created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex items-end gap-2 mb-4 ${is_own ? 'flex-row-reverse' : 'flex-row'}`}>
      {!is_own && (
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 overflow-hidden border border-indigo-200">
          {sender_avatar ? (
            <img src={sender_avatar} alt={sender_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-indigo-600 uppercase">{sender_name.charAt(0)}</span>
          )}
        </div>
      )}
      
      <div className={`max-w-[70%] sm:max-w-md ${is_own ? 'items-end' : 'items-start'} flex flex-col`}>
        {!is_own && (
          <span className="text-[10px] font-bold text-gray-500 mb-1 ml-1">{sender_name}</span>
        )}
        <div className={`px-4 py-2 rounded-2xl shadow-sm text-sm ${
          is_own 
            ? 'bg-indigo-600 text-white rounded-br-none' 
            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-100 dark:border-gray-700 rounded-bl-none'
        }`}>
          {content}
        </div>
        <span className="text-[10px] text-gray-400 mt-1">{time}</span>
      </div>
    </div>
  );
}
