import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string, option?: SelectOption) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  searchPlaceholder = 'Search options...',
  required = false,
  className = '',
  disabled = false
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => {
    const q = search.toLowerCase();
    return (
      o.label.toLowerCase().includes(q) ||
      (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  });

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white flex items-center justify-between text-sm outline-none transition ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        {selectedOption ? (
          <div className="flex items-center gap-2 overflow-hidden pr-2">
            <span className="font-bold truncate text-gray-900 dark:text-white">{selectedOption.label}</span>
            {selectedOption.sublabel && (
              <span className="text-xs font-mono text-gray-400 dark:text-gray-400 flex-shrink-0">
                ({selectedOption.sublabel})
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-400 font-bold">{placeholder}</span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedOption && !disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearch('');
              }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Hidden input for native HTML form validation */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required
          className="opacity-0 absolute inset-0 pointer-events-none -z-10"
        />
      )}

      {isOpen && !disabled && (
        <div className="absolute z-[999] left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-green-500 font-medium"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-xs text-gray-400 italic text-center">
                No options found matching "{search}"
              </div>
            ) : (
              filteredOptions.slice(0, 100).map((o) => {
                const isSelected = o.value === value;
                return (
                  <div
                    key={o.value}
                    onClick={() => {
                      onChange(o.value, o);
                      setIsOpen(false);
                    }}
                    className={`px-4 py-2.5 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer transition flex items-center justify-between ${
                      isSelected ? 'bg-green-50/80 dark:bg-green-900/30' : ''
                    }`}
                  >
                    <div>
                      <div className="text-xs font-extrabold text-gray-900 dark:text-white tracking-tight">
                        {o.label}
                      </div>
                      {o.sublabel && (
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                          {o.sublabel}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-green-600 flex-shrink-0" />}
                  </div>
                );
              })
            )}
            {filteredOptions.length > 100 && (
              <div className="px-4 py-2 text-[10px] font-bold text-gray-400 text-center bg-gray-50 dark:bg-gray-900/40">
                Showing first 100 of {filteredOptions.length} matches. Type to narrow search.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
