import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Search, Pill, Pencil, Trash2, X, ChevronDown, Clock,
    ChevronLeft, ChevronRight, Activity
} from 'lucide-react';

interface Medicine {
    id: string;
    branch_id: string;
    name: string;
    dosage: string;
    route: string;
    frequency_id: string | null;
    frequency?: { name: string };
    created_at: string;
}

interface Frequency {
    id: string;
    name: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

/* ─── reusable dropdown component ─── */
function SearchDropdown({ label, placeholder, items, selectedId, onSelect, onAddNew }: any) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selectedItem = items.find((i: any) => i.id === selectedId);
    const filtered = items.filter((i: any) => i.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="relative" ref={dropdownRef}>
            <label className={labelCls}>{label}</label>
            <button type="button" onClick={() => setIsOpen(!isOpen)}
                className={`${inputCls} flex items-center justify-between text-left`}>
                <span className={selectedItem ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>
                    {selectedItem ? selectedItem.name : placeholder}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-100">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                        <button type="button" onClick={() => { onAddNew(); setIsOpen(false); }}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-green-600 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700/50 rounded-md hover:bg-green-100 transition mb-2">
                            <Plus className="w-3 h-3" /> Add New Frequency
                        </button>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search..." className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md outline-none" autoFocus />
                        </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="p-3 text-xs text-gray-500 text-center">No results found</div>
                        ) : filtered.map((item: any) => (
                            <button key={item.id} type="button"
                                onClick={() => { onSelect(item.id); setIsOpen(false); setSearch(''); }}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-green-50 dark:hover:bg-green-900/20 transition ${selectedId === item.id ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {item.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function Medicines() {
    const { profile } = useAuth();
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [frequencies, setFrequencies] = useState<Frequency[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingMed, setEditingMed] = useState<Medicine | null>(null);
    const [formData, setFormData] = useState({ name: '', dosage: '', route: '', frequency_id: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /* ─── quick-add frequency state ─── */
    const [showAddFreq, setShowAddFreq] = useState(false);
    const [newFreq, setNewFreq] = useState({ name: '', description: '' });

    /* ─── pagination state ─── */
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        loadData();
    }, [profile?.id]);

    async function loadData() {
        setLoading(true);
        const bid = profile?.branch_id;
        let medsQ = supabase.from('medicines').select('*, frequency:medicine_frequencies(name)');
        let freqQ = supabase.from('medicine_frequencies').select('id, name');

        if (bid) {
            medsQ = medsQ.eq('branch_id', bid);
            freqQ = freqQ.or(`branch_id.eq.${bid},branch_id.is.null`);
        }

        const [medsRes, freqRes] = await Promise.all([
            medsQ.order('name', { ascending: true }),
            freqQ.order('name', { ascending: true })
        ]);

        if (!medsRes.error) setMedicines(medsRes.data || []);
        if (!freqRes.error) setFrequencies(freqRes.data || []);
        setLoading(false);
    }

    async function handleAddFrequency(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);

        const { data, error } = await supabase
            .from('medicine_frequencies')
            .insert([{ ...newFreq, branch_id: profile?.branch_id || null }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') setError('This frequency already exists.');
            else setError(error.message);
        } else {
            setFrequencies(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setFormData(prev => ({ ...prev, frequency_id: data.id }));
            setShowAddFreq(false);
            setNewFreq({ name: '', description: '' });
        }
        setSubmitting(false);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        const payload = { ...formData, branch_id: profile?.branch_id || null, frequency_id: formData.frequency_id || null };

        let res;
        if (editingMed) {
            res = await supabase.from('medicines').update(payload).eq('id', editingMed.id);
        } else {
            res = await supabase.from('medicines').insert([payload]);
        }

        if (res.error) {
            if (res.error.code === '23505') setError('This medicine with matching dosage/route already exists.');
            else setError(res.error.message);
        } else {
            setShowModal(false);
            setFormData({ name: '', dosage: '', route: '', frequency_id: '' });
            setEditingMed(null);
            loadData();
        }
        setSubmitting(false);
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this medicine?')) return;
        const { error } = await supabase.from('medicines').delete().eq('id', id);
        if (!error) loadData();
    }

    const filtered = medicines.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.dosage.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.route.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.frequency?.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    /* ─── pagination logic ─── */
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Pill className="w-8 h-8 text-green-600" /> Medicine Management
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Maintain the master list of prescription medicines</p>
                </div>
                <button onClick={() => { setEditingMed(null); setFormData({ name: '', dosage: '', route: '', frequency_id: '' }); setError(null); setShowModal(true); }}
                    className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /><span>Add Medicine</span>
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Search medicines by name, dosage, or route..." value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Id</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Medicine Name</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Dosage</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Route</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Frequency</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Options</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" /></td></tr>
                            ) : paginated.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">No medicines found</td></tr>
                            ) : paginated.map((m, idx) => (
                                <tr key={m.id} className="hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors">
                                    <td className="px-6 py-4 text-gray-400 font-mono text-xs">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{m.name}</td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{m.dosage || '—'}</td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300 uppercase text-xs font-semibold">{m.route || '—'}</td>
                                    <td className="px-6 py-4">
                                        {m.frequency?.name ? (
                                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md text-[10px] font-bold uppercase">{m.frequency.name}</span>
                                        ) : '—'}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => { setEditingMed(m); setFormData({ name: m.name, dosage: m.dosage, route: m.route, frequency_id: m.frequency_id || '' }); setError(null); setShowModal(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-xs font-bold hover:bg-green-200 dark:hover:bg-green-900/40 transition">
                                                <Pencil className="w-3.5 h-3.5" /> Edit
                                            </button>
                                            <button onClick={() => handleDelete(m.id)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/40 transition">
                                                <Trash2 className="w-3.5 h-3.5" /> Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ─── pagination controls ─── */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="text-xs text-gray-500 font-medium tracking-wide">
                            Showing <span className="text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="text-gray-900 dark:text-white">{filtered.length}</span> records
                        </div>
                        <div className="flex gap-2">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                                className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition shadow-sm">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="flex gap-1">
                                {[...Array(totalPages)].map((_, i) => (
                                    <button key={i} onClick={() => setCurrentPage(i + 1)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition shadow-sm ${currentPage === i + 1 ? 'bg-green-600 text-white' : 'border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}
                                className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition shadow-sm">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/20 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                {editingMed ? <Pencil className="w-5 h-5 text-green-600" /> : <Plus className="w-5 h-5 text-green-600" />}
                                {editingMed ? 'Edit Medicine' : 'Add New Medicine'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-bold">
                                    <Activity className="w-4 h-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}
                            <div>
                                <label className={labelCls}>Medicine Name</label>
                                <input type="text" required value={formData.name} onChange={e => setFormData(d => ({ ...d, name: e.target.value }))} className={inputCls} placeholder="e.g. Paracetamol" />
                            </div>
                            <div>
                                <label className={labelCls}>Dosage</label>
                                <input type="text" value={formData.dosage} onChange={e => setFormData(d => ({ ...d, dosage: e.target.value }))} className={inputCls} placeholder="e.g. 500mg" />
                            </div>
                            <div>
                                <label className={labelCls}>Route</label>
                                <input type="text" value={formData.route} onChange={e => setFormData(d => ({ ...d, route: e.target.value }))} className={inputCls} placeholder="e.g. po, iv, im" />
                            </div>

                            <SearchDropdown
                                label="Frequency"
                                placeholder="Search Frequency"
                                items={frequencies}
                                selectedId={formData.frequency_id}
                                onSelect={(id: string) => setFormData(d => ({ ...d, frequency_id: id }))}
                                onAddNew={() => setShowAddFreq(true)}
                            />

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition shadow-md disabled:opacity-50">
                                    {submitting ? 'Submitting...' : (editingMed ? 'Update Medicine' : 'Submit')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── quick-add frequency modal ─── */}
            {showAddFreq && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-green-600" /> Quick Add Frequency
                            </h3>
                            <form onSubmit={handleAddFrequency} className="space-y-4">
                                {error && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-bold">
                                        <Activity className="w-4 h-4 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}
                                <div>
                                    <label className={labelCls}>Frequency Name</label>
                                    <input type="text" required value={newFreq.name}
                                        onChange={e => setNewFreq(p => ({ ...p, name: e.target.value }))}
                                        className={inputCls} placeholder="e.g. q6h" autoFocus />
                                </div>
                                <div>
                                    <label className={labelCls}>Description (Optional)</label>
                                    <input type="text" value={newFreq.description}
                                        onChange={e => setNewFreq(p => ({ ...p, description: e.target.value }))}
                                        className={inputCls} placeholder="e.g. Every 6 hours" />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => setShowAddFreq(false)}
                                        className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50 transition">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={submitting}
                                        className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition shadow-md disabled:opacity-50">
                                        {submitting ? '...' : 'Add'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
