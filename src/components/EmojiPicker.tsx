import React, { useState, useRef, useEffect } from 'react';
import { Smile, Search, X } from 'lucide-react';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  isOpen: boolean;
  onClose: () => void;
  position?: 'top' | 'bottom';
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '😎', '🤓', '🥳', '🤩', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😯', '😦', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🤢', '🤮', '🤧', '😷', '🤒', '🤕']
  },
  {
    name: 'Medical & Hospital',
    emojis: ['🏥', '🏨', '🩺', '💉', '💊', '🩹', '🩸', '🧬', '🔬', '🩻', '🧪', '🧴', '🚑', '👨‍⚕️', '👩‍⚕️', '👨‍🔬', '👩‍🔬', '🦷', '👁️', '🧠', '🫀', '🫁', '🦴', '🦽', '♿', '🤒', '😷', '🤕', '🤢', '🤧', '🧼', '🧽', '🌡️']
  },
  {
    name: 'Hands & Gestures',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦵', '🦿', '🦶', '👂', '👃', '👀', '👁️', '👅', '👄']
  },
  {
    name: 'Hearts & Symbols',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '🔥', '✨', '⭐', '🌟', '💫', '💥', '🎉', '🎊', '💯', '✅', '❌', '⚠️', '❗', '❓', 'ℹ️', '🔔', '🔕', '💡', '🔒', '🔓', '🔑', '📅', '⏰', '⏱️', '⏳', '📊', '📈', '📋', '📄', '📁', '✉️', '📞']
  }
];

export function EmojiPicker({ onSelectEmoji, isOpen, onClose, position = 'top' }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredEmojis = search.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((emoji) => emoji.includes(search.trim()))
    : null;

  return (
    <div
      ref={pickerRef}
      className={`absolute z-50 w-72 sm:w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col ${
        position === 'top' ? 'bottom-full mb-3' : 'top-full mt-3'
      } left-0 animate-in fade-in zoom-in-95 duration-150`}
      style={{ maxHeight: '340px' }}
    >
      {/* Header with Search & Close */}
      <div className="p-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 bg-gray-50/70 dark:bg-gray-900/40">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emoji..."
            className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-gray-900 dark:text-white"
            autoFocus
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category Tabs (if not searching) */}
      {!search.trim() && (
        <div className="flex border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 px-2 py-1 gap-1 overflow-x-auto">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setActiveCategory(idx)}
              className={`px-2 py-1 text-[10px] font-bold rounded-md whitespace-nowrap transition ${
                activeCategory === idx
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="p-2 overflow-y-auto flex-1 max-h-56 grid grid-cols-7 sm:grid-cols-8 gap-1 scroll-smooth">
        {(filteredEmojis || EMOJI_CATEGORIES[activeCategory].emojis).map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            type="button"
            onClick={() => onSelectEmoji(emoji)}
            className="w-8 h-8 flex items-center justify-center text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition hover:scale-125 active:scale-95 select-none"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
