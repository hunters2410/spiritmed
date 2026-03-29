import { useEffect, useState, useRef } from 'react';
import { Search, ChevronDown, Plus, X, Check } from 'lucide-react';

interface Props {
    label?: string;
    placeholder: string;
    items: any[];
    selectedId?: string | null;
    selectedIds?: string[];
    onSelect?: (id: string) => void;
    onSelectMultiple?: (ids: string[]) => void;
    displayFn?: (item: any) => string;
    onAddNew?: () => void;
    addNewLabel?: string;
    multiSelect?: boolean;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all shadow-sm";
const labelCls = "block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5";

export function SearchDropdown({
    label, placeholder, items,
    selectedId, selectedIds = [],
    onSelect, onSelectMultiple,
    displayFn, onAddNew, addNewLabel,
    multiSelect = false
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const getLabel = (i: any) => displayFn ? displayFn(i) : i.full_name || i.name || i.label || '';

    const selectedItem = multiSelect ? null : items.find((i: any) => i.id === selectedId);
    const selectedItemsList = multiSelect ? items.filter((i: any) => selectedIds.includes(i.id)) : [];

    const filtered = items.filter((i: any) => {
        const text = getLabel(i);
        return text.toLowerCase().includes(search.toLowerCase());
    });

    const toggleSelection = (id: string) => {
        if (multiSelect && onSelectMultiple) {
            const newIds = selectedIds.includes(id)
                ? selectedIds.filter(i => i !== id)
                : [...selectedIds, id];
            onSelectMultiple(newIds);
        } else if (onSelect) {
            onSelect(id);
            setIsOpen(false);
            setSearch('');
        }
    };

    return (
        <div className="relative" ref={ref}>
            {label && <label className={labelCls}>{label}</label>}
            <button type="button" onClick={() => setIsOpen(v => !v)}
                className={`${inputCls} flex flex-wrap items-center gap-1.5 min-h-[42px] py-1.5 text-left ${(selectedItem || selectedItemsList.length > 0) ? 'border-green-200 dark:border-green-900' : ''}`}>
                {!multiSelect && (
                    <span className={selectedItem ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400'}>
                        {selectedItem ? getLabel(selectedItem) : placeholder}
                    </span>
                )}
                {multiSelect && (
                    <div className="flex flex-wrap gap-1 items-center flex-1">
                        {selectedItemsList.length > 0 ? (
                            selectedItemsList.map(item => (
                                <span key={item.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-[11px] font-bold border border-green-100 dark:border-green-800 animate-in zoom-in-95 duration-200">
                                    {getLabel(item)}
                                    <X className="w-3 h-3 cursor-pointer hover:text-green-900" onClick={(e) => { e.stopPropagation(); toggleSelection(item.id); }} />
                                </span>
                            ))
                        ) : (
                            <span className="text-gray-400">{placeholder}</span>
                        )}
                    </div>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search..." className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:ring-1 focus:ring-green-500" autoFocus />
                        </div>
                    </div>

                    {onAddNew && (
                        <button
                            type="button"
                            onClick={() => { onAddNew(); setIsOpen(false); }}
                            className="w-full text-left px-4 py-2.5 text-xs font-bold text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 transition-colors"
                        >
                            <div className="w-5 h-5 bg-green-100 dark:bg-green-900/40 rounded flex items-center justify-center">
                                <Plus className="w-3.5 h-3.5" />
                            </div>
                            {addNewLabel || 'Add New'}
                        </button>
                    )}

                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="p-4 text-xs text-gray-500 text-center italic">No results found</div>
                        ) : filtered.map((item: any) => {
                            const isSelected = multiSelect ? selectedIds.includes(item.id) : selectedId === item.id;
                            return (
                                <button key={item.id} type="button"
                                    onClick={() => toggleSelection(item.id)}
                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-green-50 dark:hover:bg-green-900/10 transition border-b border-gray-50 dark:border-gray-700/50 last:border-0 flex items-center justify-between ${isSelected ? 'bg-green-50/50 dark:bg-green-900/20 text-green-600 dark:text-green-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                    <span>{getLabel(item)}</span>
                                    {isSelected && <Check className="w-4 h-4 text-green-600" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
