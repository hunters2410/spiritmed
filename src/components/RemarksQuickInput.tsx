import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Check } from 'lucide-react';
import {
  getStoredRemarks,
  recordRemarkUsage,
  fetchMostTypedRemarksFromDb
} from '../utils/remarksUtils';

interface RemarksQuickInputProps {
  value: string;
  onChange: (val: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
  className?: string;
  required?: boolean;
}

export const RemarksQuickInput: React.FC<RemarksQuickInputProps> = ({
  value,
  onChange,
  label = 'Remarks / Notes',
  placeholder = 'Add any remarks or notes...',
  rows = 3,
  className = '',
  required = false
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // 1. Instant load from localStorage + defaults
    setSuggestions(getStoredRemarks());

    // 2. Background async load from actual DB appointments
    fetchMostTypedRemarksFromDb().then(dbList => {
      if (dbList && dbList.length > 0) {
        setSuggestions(dbList);
      }
    });
  }, []);

  const handleChipClick = (phrase: string) => {
    if (!value || !value.trim()) {
      onChange(phrase);
    } else {
      // If the phrase is already present, avoid duplicating
      if (value.toLowerCase().includes(phrase.toLowerCase())) {
        return;
      }
      onChange(`${value.trim()}, ${phrase}`);
    }
    // Boost phrase count in storage
    recordRemarkUsage(phrase);
  };

  const visibleSuggestions = showAll ? suggestions.slice(0, 16) : suggestions.slice(0, 7);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {suggestions.length > 7 && (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="text-[11px] text-green-600 hover:text-green-700 dark:text-green-400 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            {showAll ? 'Show Fewer' : 'More Suggestions'}
          </button>
        )}
      </div>

      {/* Suggestion Chips */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-0.5">
          {visibleSuggestions.map((phrase, idx) => {
            const isSelected = value.toLowerCase().includes(phrase.toLowerCase());
            return (
              <button
                key={`${phrase}-${idx}`}
                type="button"
                onClick={() => handleChipClick(phrase)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition flex items-center gap-1 border cursor-pointer ${
                  isSelected
                    ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700 shadow-xs'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-green-50 hover:border-green-300 hover:text-green-700 dark:bg-gray-800/80 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-green-950/40 dark:hover:border-green-600'
                }`}
                title={`Click to insert "${phrase}"`}
              >
                {isSelected ? (
                  <Check className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0" />
                ) : (
                  <Plus className="w-2.5 h-2.5 text-gray-400 dark:text-gray-500 shrink-0" />
                )}
                <span>{phrase}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Textarea */}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        required={required}
        className={
          className ||
          "w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
        }
      />
    </div>
  );
};
