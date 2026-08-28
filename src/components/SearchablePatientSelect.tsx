import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, X, User } from 'lucide-react';

interface PatientOption {
  id: string;
  full_name: string;
  patient_number?: string;
  file_number?: string;
  phone?: string;
}

interface SearchablePatientSelectProps {
  patients: PatientOption[];
  value: string;
  onChange: (patientId: string, patient?: PatientOption) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export function SearchablePatientSelect({
  patients,
  value,
  onChange,
  placeholder = 'Search or select patient...',
  required = false,
  className = ''
}: SearchablePatientSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedPatient = patients.find(p => p.id === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPatients = patients.filter(p => {
    const q = search.toLowerCase();
    const cleanPNo = p.patient_number ? p.patient_number : '';
    const cleanFNo = p.file_number ? p.file_number : '';
    return (
      p.full_name.toLowerCase().includes(q) ||
      cleanPNo.toLowerCase().includes(q) ||
      cleanFNo.toLowerCase().includes(q) ||
      (p.phone && p.phone.toLowerCase().includes(q))
    );
  });

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white flex items-center justify-between cursor-pointer text-sm outline-none transition"
      >
        {selectedPatient ? (
          <div className="flex items-center gap-2 overflow-hidden pr-2">
            <User className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className="font-bold truncate text-gray-900 dark:text-white">{selectedPatient.full_name}</span>
            {selectedPatient.patient_number && (
              <span className="text-xs font-mono text-gray-400 dark:text-gray-400 flex-shrink-0">
                ({selectedPatient.patient_number.split('-').pop()})
              </span>
            )}
          </div>
        ) : (
          <span className="text-gray-400 font-bold">{placeholder}</span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedPatient && (
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

      {/* Required Hidden Input for native form validation */}
      {required && (
        <input
          type="text"
          value={value}
          onChange={() => {}}
          required
          className="opacity-0 absolute inset-0 pointer-events-none -z-10"
        />
      )}

      {isOpen && (
        <div className="absolute z-[999] left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patient name, ID, or phone..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-green-500 font-medium"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/50">
            {filteredPatients.length === 0 ? (
              <div className="px-4 py-3 text-xs text-gray-400 italic text-center">
                No patients found matching "{search}"
              </div>
            ) : (
              filteredPatients.map((p) => {
                const isSelected = p.id === value;
                const cleanPNo = p.patient_number ? p.patient_number : '';
                const cleanFNo = p.file_number ? p.file_number : '';

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onChange(p.id, p);
                      setIsOpen(false);
                    }}
                    className={`px-4 py-2.5 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer transition flex items-center justify-between ${
                      isSelected ? 'bg-green-50/80 dark:bg-green-900/30' : ''
                    }`}
                  >
                    <div>
                      <div className="text-xs font-extrabold text-gray-900 dark:text-white uppercase tracking-tight">
                        {p.full_name}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-400 font-mono mt-0.5">
                        {cleanPNo && <span>ID: {cleanPNo.split('-').pop()}</span>}
                        {cleanFNo && <span>File: {cleanFNo}</span>}
                        {p.phone && <span>Tel: {p.phone}</span>}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-green-600 flex-shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
