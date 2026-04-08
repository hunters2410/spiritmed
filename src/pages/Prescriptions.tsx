import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Search, Pill, Pencil, Trash2, X, ChevronDown, ChevronLeft,
    ChevronRight, Activity, Eye, Printer, UserPlus, ClipboardList
} from 'lucide-react';
import { PrescriptionPrintView } from '../components/PrescriptionPrintView';
import { logActivity } from '../utils/auditLogger';

/* ─── types ─── */
interface Patient { id: string; full_name: string; patient_number: string; }
interface Doctor { id: string; full_name: string; }
interface Medicine { id: string; name: string; dosage: string; }
interface Frequency { id: string; name: string; }
interface PrescriptionItem {
    id?: string;
    medicine_id: string;
    period: string;
    time_unit: string;
    advice: string;
    // UI-only for display
    medicine?: Medicine;
}
interface Prescription {
    id: string;
    prescription_date: string;
    prescription_number: string;
    status: string;
    notes: string;
    patient_id: string;
    doctor_id: string;
    patient?: { full_name: string; patient_number: string };
    doctor?: { full_name: string };
    prescription_items?: { id: string; medicine?: { name: string; dosage: string }; period: string; time_unit: string; advice: string }[];
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

const TIME_UNITS = ['Days', 'Weeks', 'Months', 'Years'];

/* ─── Generic SearchDropdown ─── */
function SearchDropdown({ label, placeholder, items, selectedId, onSelect, onAddNew, displayFn }: any) {
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

    const selectedItem = items.find((i: any) => i.id === selectedId);
    const filtered = items.filter((i: any) => {
        const text = displayFn ? displayFn(i) : i.full_name || i.name || '';
        return text.toLowerCase().includes(search.toLowerCase());
    });

    const getLabel = (i: any) => displayFn ? displayFn(i) : i.full_name || i.name || '';

    return (
        <div className="relative" ref={ref}>
            {label && <label className={labelCls}>{label}</label>}
            <button type="button" onClick={() => setIsOpen(v => !v)}
                className={`${inputCls} flex items-center justify-between text-left`}>
                <span className={selectedItem ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>
                    {selectedItem ? getLabel(selectedItem) : placeholder}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 space-y-2">
                        {onAddNew && (
                            <button type="button" onClick={() => { onAddNew(); setIsOpen(false); }}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700/50 rounded-md hover:bg-blue-100 transition">
                                <Plus className="w-3 h-3" /> Add New
                            </button>
                        )}
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
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition ${selectedId === item.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {getLabel(item)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Quick Add Patient Modal ─── */
function QuickAddPatient({ onClose, onSave, branchId }: any) {
    const [form, setForm] = useState({ full_name: '', email: '', phone: '', gender: 'Male' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        // Auto-generate a unique patient number so the user doesn't need to provide one
        const patient_number = `P${Date.now().toString().slice(-6)}`;
        // Auto-generate an email if not provided
        const email = form.email.trim() ||
            `${form.full_name.toLowerCase().replace(/\s+/g, '.')}${Date.now().toString().slice(-4)}@patient.local`;
        const { data, error } = await supabase
            .from('patients')
            .insert([{ ...form, email, patient_number, branch_id: branchId, status: 'active' }])
            .select()
            .single();
        if (error) { setError(error.message); setSaving(false); return; }
        onSave(data);
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl">
                <div className="p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-blue-600" /> Quick Add Patient
                    </h3>
                    <form onSubmit={handleSave} className="space-y-3">
                        {error && <div className="p-2 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">{error}</div>}
                        <div><label className={labelCls}>Full Name</label><input required value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} className={inputCls} placeholder="Full Name" autoFocus /></div>
                        <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="email@example.com" /></div>
                        <div><label className={labelCls}>Phone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="Phone number" /></div>
                        <div>
                            <label className={labelCls}>Gender</label>
                            <select value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))} className={inputCls}>
                                <option>Male</option><option>Female</option><option>Other</option>
                            </select>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
                            <button type="submit" disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">{saving ? '...' : 'Add Patient'}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

/* ─── Quick Add Medicine Modal ─── */
function QuickAddMedicine({ onClose, onSave, branchId, frequencies }: any) {
    const [form, setForm] = useState({ name: '', dosage: '', route: '', frequency_id: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const { data, error } = await supabase.from('medicines').insert([{ ...form, branch_id: branchId, frequency_id: form.frequency_id || null }]).select().single();
        if (error) { if (error.code === '23505') setError('Medicine already exists.'); else setError(error.message); setSaving(false); return; }
        onSave(data);
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl">
                <div className="p-6">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <Pill className="w-5 h-5 text-blue-600" /> Quick Add Medicine
                    </h3>
                    <form onSubmit={handleSave} className="space-y-3">
                        {error && <div className="p-2 bg-red-50 text-red-600 text-xs rounded-lg border border-red-200">{error}</div>}
                        <div><label className={labelCls}>Medicine Name</label><input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Amoxicillin" autoFocus /></div>
                        <div><label className={labelCls}>Dosage</label><input value={form.dosage} onChange={e => setForm(p => ({ ...p, dosage: e.target.value }))} className={inputCls} placeholder="e.g. 500mg" /></div>
                        <div><label className={labelCls}>Route</label><input value={form.route} onChange={e => setForm(p => ({ ...p, route: e.target.value }))} className={inputCls} placeholder="e.g. po, iv" /></div>
                        <div>
                            <label className={labelCls}>Default Frequency</label>
                            <select value={form.frequency_id} onChange={e => setForm(p => ({ ...p, frequency_id: e.target.value }))} className={inputCls}>
                                <option value="">— None —</option>
                                {frequencies.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50">Cancel</button>
                            <button type="submit" disabled={saving} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">{saving ? '...' : 'Add Medicine'}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

/* ─── Empty item factory ─── */
const emptyItem = (): PrescriptionItem => ({ medicine_id: '', period: '', time_unit: 'Days', advice: '' });

/* ─── Main Page ─── */
export function Prescriptions() {
    const { profile } = useAuth();

    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [frequencies, setFrequencies] = useState<Frequency[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    /* modals */
    const [showModal, setShowModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState<Prescription | null>(null);
    const [editingRx, setEditingRx] = useState<Prescription | null>(null);
    const [showAddPatient, setShowAddPatient] = useState(false);
    const [showAddMedicine, setShowAddMedicine] = useState(false);
    const [addMedForIdx, setAddMedForIdx] = useState<number | null>(null);

    /* form */
    const [form, setForm] = useState({
        prescription_date: new Date().toISOString().split('T')[0],
        patient_id: '',
        doctor_id: (profile?.role === 'doctor') ? profile?.id : '',
        notes: '',
        status: 'active',
    });
    const [items, setItems] = useState<PrescriptionItem[]>([emptyItem()]);

    /* pagination & search */
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [branch, setBranch] = useState<any>(null);

    const resetForm = () => {
        setForm({
            prescription_date: new Date().toISOString().split('T')[0],
            patient_id: '',
            doctor_id: (profile?.role === 'doctor') ? profile?.id : '',
            notes: '',
            status: 'active',
        });
        setItems([emptyItem()]);
        setEditingRx(null);
        setError(null);
    };

    useEffect(() => {
        if (profile?.branch_id) {
            supabase.from('branches').select('*').eq('id', profile.branch_id).maybeSingle()
                .then(({ data }) => setBranch(data));
        }
    }, [profile?.branch_id]);

    useEffect(() => { loadAll(); }, [profile?.branch_id]);

    async function loadAll() {
        if (!profile?.branch_id) return;
        setLoading(true);
        const [rxRes, patRes, docRes, medRes, freqRes] = await Promise.all([
            supabase.from('prescriptions')
                .select('*, patient:patients(full_name,patient_number), doctor:users(full_name, specialization, qualifications, signature_url), prescription_items(id, period, time_unit, advice, medicine:medicines(name,dosage))')
                .eq('branch_id', profile.branch_id)
                .order('created_at', { ascending: false }),
            supabase.from('patients').select('id, full_name, patient_number').eq('branch_id', profile.branch_id).eq('status', 'active').order('full_name'),
            supabase.from('users').select('id, full_name').eq('branch_id', profile.branch_id).eq('role', 'doctor').eq('is_active', true).order('full_name'),
            supabase.from('medicines').select('id, name, dosage').eq('branch_id', profile.branch_id).order('name'),
            supabase.from('medicine_frequencies').select('id, name').or(`branch_id.eq.${profile.branch_id},branch_id.is.null`).order('name'),
        ]);
        if (!rxRes.error) setPrescriptions((rxRes.data as any[]) || []);
        if (!patRes.error) setPatients(patRes.data || []);
        if (!docRes.error) setDoctors(docRes.data || []);
        if (!medRes.error) setMedicines(medRes.data || []);
        if (!freqRes.error) setFrequencies(freqRes.data || []);
        setLoading(false);
    }

    function openAdd() {
        setEditingRx(null);
        setForm({ prescription_date: new Date().toISOString().split('T')[0], patient_id: '', doctor_id: profile?.id || '', notes: '', status: 'active' });
        setItems([emptyItem()]);
        setError(null);
        setShowModal(true);
    }

    function openEdit(rx: Prescription) {
        setEditingRx(rx);
        setForm({
            prescription_date: rx.prescription_date || new Date().toISOString().split('T')[0],
            patient_id: rx.patient_id,
            doctor_id: rx.doctor_id,
            notes: rx.notes || '',
            status: rx.status || 'active',
        });
        const existingItems: PrescriptionItem[] = (rx.prescription_items || []).map(i => ({
            id: i.id,
            medicine_id: (i.medicine as any)?.id || '',
            period: i.period || '',
            time_unit: i.time_unit || 'Days',
            advice: i.advice || '',
        }));
        setItems(existingItems.length ? existingItems : [emptyItem()]);
        setError(null);
        setShowModal(true);
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this prescription?')) return;
        await supabase.from('prescriptions').delete().eq('id', id);
        loadAll();
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!profile?.branch_id) return;
        if (!form.patient_id) { setError('Please select a patient.'); return; }
        if (items.some(i => !i.medicine_id)) { setError('Please select a medicine for each section.'); return; }
        setSubmitting(true);
        setError(null);

        let rxId: string;
        if (editingRx) {
            const { error } = await supabase.from('prescriptions').update({ ...form }).eq('id', editingRx.id);
            if (error) { setError(error.message); setSubmitting(false); return; }
            rxId = editingRx.id;
            // delete existing items and re-insert
            await supabase.from('prescription_items').delete().eq('prescription_id', rxId);
        } else {
            const { data, error } = await supabase.from('prescriptions').insert([{ ...form, branch_id: profile.branch_id }]).select().single();
            if (error) { setError(error.message); setSubmitting(false); return; }
            rxId = data.id;
        }

        const payload = items.map(i => ({
            prescription_id: rxId,
            medicine_id: i.medicine_id,
            period: i.period,
            time_unit: i.time_unit,
            advice: i.advice,
        }));
        const { error: itemErr } = await supabase.from('prescription_items').insert(payload);
        if (itemErr) { setError(itemErr.message); setSubmitting(false); return; }

        if (profile?.id && profile?.branch_id) {
            const patientName = patients.find(p => p.id === form.patient_id)?.full_name || form.patient_id;
            await logActivity(supabase, {
                userId: profile.id,
                branchId: profile.branch_id,
                action: editingRx ? 'UPDATE' : 'CREATE',
                tableName: 'prescriptions',
                recordId: rxId,
                details: `${editingRx ? 'Updated' : 'Issued new'} prescription for patient: ${patientName}`,
                newValues: { ...form, items: payload }
            });
        }

        setShowModal(false);
        loadAll();
        setSubmitting(false);
    }

    /* item helpers */
    const updateItem = (idx: number, field: keyof PrescriptionItem, value: string) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
    };
    const addItem = () => setItems(prev => [...prev, emptyItem()]);
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

    /* after quick-add patient */
    function handlePatientAdded(patient: Patient) {
        setPatients(prev => [...prev, patient].sort((a, b) => a.full_name.localeCompare(b.full_name)));
        setForm(prev => ({ ...prev, patient_id: patient.id }));
        setShowAddPatient(false);
    }

    /* after quick-add medicine */
    function handleMedicineAdded(med: Medicine) {
        setMedicines(prev => [...prev, med].sort((a, b) => a.name.localeCompare(b.name)));
        if (addMedForIdx !== null) updateItem(addMedForIdx, 'medicine_id', med.id);
        setShowAddMedicine(false);
        setAddMedForIdx(null);
    }

    /* filtered + paginated */
    const filtered = prescriptions.filter(rx =>
        rx.patient?.full_name.toLowerCase().includes(search.toLowerCase()) ||
        rx.doctor?.full_name.toLowerCase().includes(search.toLowerCase()) ||
        rx.prescription_number?.toLowerCase().includes(search.toLowerCase()) ||
        rx.prescription_date?.includes(search)
    );
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <ClipboardList className="w-8 h-8 text-blue-600" /> Prescriptions
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Issue and manage patient prescriptions</p>
                </div>
                <button onClick={openAdd}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add Prescription
                </button>
            </div>

            {/* Search */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Search by patient, doctor, date..." value={search}
                        onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">#</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Date</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Patient</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Doctor</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Items</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Status</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={7} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" /></td></tr>
                            ) : paginated.length === 0 ? (
                                <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-500">No prescriptions found</td></tr>
                            ) : paginated.map((rx, idx) => (
                                <tr key={rx.id} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                                    <td className="px-6 py-4 text-gray-400 font-mono text-xs">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300 font-medium">{rx.prescription_date || '—'}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900 dark:text-white">{rx.patient?.full_name || '—'}</div>
                                        <div className="text-xs text-gray-400">{rx.patient?.patient_number}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{rx.doctor?.full_name || '—'}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-bold">
                                            {rx.prescription_items?.length || 0} med{rx.prescription_items?.length !== 1 ? 's' : ''}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${rx.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500'}`}>
                                            {rx.status || 'active'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button title="View" onClick={() => { setShowViewModal(rx); setViewMode('detailed'); }}
                                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button title="Edit" onClick={() => openEdit(rx)}
                                                className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button title="Delete" onClick={() => handleDelete(rx.id)}
                                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                            Showing <span className="font-bold text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> – <span className="font-bold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{filtered.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            {[...Array(totalPages)].map((_, i) => (
                                <button key={i} onClick={() => setCurrentPage(i + 1)}
                                    className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                    {i + 1}
                                </button>
                            ))}
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {viewMode === 'detailed' && showViewModal && branch && (
                <div className="fixed inset-0 z-[100] bg-gray-100 dark:bg-gray-900 overflow-y-auto">
                    <PrescriptionPrintView
                        prescription={{
                            id: showViewModal.id,
                            created_at: showViewModal.prescription_date, // or use created_at if available
                            patient: showViewModal.patient as any,
                            doctor: showViewModal.doctor as any,
                            items: (showViewModal.prescription_items || []).map(i => ({
                                id: i.id,
                                medicine_name: i.medicine?.name || 'Unknown Medicine',
                                dosage: i.medicine?.dosage || '',
                                frequency: '', // Could be derived from advice or frequencies if mapped
                                duration: `${i.period} ${i.time_unit}`,
                                instructions: i.advice
                            }))
                        }}
                        branch={branch}
                        onBack={() => setViewMode('table')}
                        onEdit={() => {
                            setEditingRx(showViewModal);
                            setForm({
                                prescription_date: showViewModal.prescription_date,
                                patient_id: showViewModal.patient_id,
                                doctor_id: showViewModal.doctor_id,
                                notes: showViewModal.notes,
                                status: showViewModal.status
                            });
                            setItems((showViewModal.prescription_items || []).map(pi => ({
                                id: pi.id,
                                medicine_id: (pi as any).medicine_id || '', // Need to ensure medicine_id is fetched
                                period: pi.period,
                                time_unit: pi.time_unit,
                                advice: pi.advice
                            })));
                            setShowModal(true);
                            setViewMode('table');
                        }}
                        onAddNew={() => {
                            resetForm();
                            setShowModal(true);
                            setViewMode('table');
                        }}
                        onSendEmail={() => alert('Email functionality coming soon')}
                    />
                </div>
            )}

            {/* ─── Add/Edit Prescription Modal ─── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl shadow-2xl my-8">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 rounded-t-xl sticky top-0">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <ClipboardList className="w-5 h-5 text-blue-600" />
                                {editingRx ? 'Edit Prescription' : 'Add Prescription'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 text-xs font-bold">
                                    <Activity className="w-4 h-4 flex-shrink-0" />{error}
                                </div>
                            )}

                            {/* Date + Patient */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Date</label>
                                    <input type="date" value={form.prescription_date}
                                        onChange={e => setForm(f => ({ ...f, prescription_date: e.target.value }))}
                                        className={inputCls} />
                                </div>
                                <SearchDropdown
                                    label="Patient"
                                    placeholder="Search Patient Name / ID"
                                    items={patients}
                                    selectedId={form.patient_id}
                                    onSelect={(id: string) => setForm(f => ({ ...f, patient_id: id }))}
                                    onAddNew={() => setShowAddPatient(true)}
                                    displayFn={(p: Patient) => `${p.full_name} (${p.patient_number})`}
                                />
                            </div>

                            {/* Doctor */}
                            <SearchDropdown
                                label="Doctor"
                                placeholder="Search Doctor Name"
                                items={doctors}
                                selectedId={form.doctor_id}
                                onSelect={(id: string) => setForm(f => ({ ...f, doctor_id: id }))}
                                displayFn={(d: Doctor) => d.full_name}
                            />

                            {/* Medicine Sections */}
                            <div className="space-y-4">
                                {items.map((item, idx) => (
                                    <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/30 relative">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Medicine Section {idx + 1}</h3>
                                            {items.length > 1 && (
                                                <button type="button" onClick={() => removeItem(idx)}
                                                    className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 p-1 rounded-lg transition">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Medicine dropdown */}
                                        <SearchDropdown
                                            label="Medicine & Dosage"
                                            placeholder="Select Medicine"
                                            items={medicines}
                                            selectedId={item.medicine_id}
                                            onSelect={(id: string) => updateItem(idx, 'medicine_id', id)}
                                            onAddNew={() => { setAddMedForIdx(idx); setShowAddMedicine(true); }}
                                            displayFn={(m: Medicine) => m.dosage ? `${m.name} — ${m.dosage}` : m.name}
                                        />

                                        {/* Period + Time Unit */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                            <div>
                                                <label className={labelCls}>Period</label>
                                                <input type="text" value={item.period}
                                                    onChange={e => updateItem(idx, 'period', e.target.value)}
                                                    className={inputCls} placeholder="e.g. 7" />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Time</label>
                                                <select value={item.time_unit}
                                                    onChange={e => updateItem(idx, 'time_unit', e.target.value)}
                                                    className={inputCls}>
                                                    {TIME_UNITS.map(u => <option key={u}>{u}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Advice */}
                                        <div className="mt-3">
                                            <label className={labelCls}>Advice</label>
                                            <textarea value={item.advice}
                                                onChange={e => updateItem(idx, 'advice', e.target.value)}
                                                className={`${inputCls} h-16 resize-none`}
                                                placeholder="e.g. Take with food, twice daily after meals" />
                                        </div>
                                    </div>
                                ))}

                                <button type="button" onClick={addItem}
                                    className="w-full py-2.5 border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition flex items-center justify-center gap-2">
                                    <Plus className="w-4 h-4" /> Add Another Medicine
                                </button>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className={labelCls}>General Notes</label>
                                <textarea value={form.notes}
                                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                    className={`${inputCls} h-20 resize-none`}
                                    placeholder="Optional notes..." />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                                    Cancel
                                </button>
                                <button type="submit" disabled={submitting}
                                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition shadow-md disabled:opacity-50">
                                    {submitting ? 'Saving...' : (editingRx ? 'Update Prescription' : 'Save Prescription')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── View Prescription Modal ─── */}
            {showViewModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/20 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Eye className="w-5 h-5 text-indigo-600" /> Prescription Details
                            </h2>
                            <div className="flex items-center gap-2">
                                <button onClick={() => window.print()} className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition" title="Print">
                                    <Printer className="w-4 h-4" />
                                </button>
                                <button onClick={() => setShowViewModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                            </div>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-xs font-bold text-gray-400 uppercase">Date</span>
                                    <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{showViewModal.prescription_date}</p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-gray-400 uppercase">Status</span>
                                    <p className="mt-0.5"><span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase">{showViewModal.status}</span></p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-gray-400 uppercase">Patient</span>
                                    <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{showViewModal.patient?.full_name} <span className="text-gray-400 font-normal text-xs">({showViewModal.patient?.patient_number})</span></p>
                                </div>
                                <div>
                                    <span className="text-xs font-bold text-gray-400 uppercase">Doctor</span>
                                    <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{showViewModal.doctor?.full_name}</p>
                                </div>
                            </div>

                            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                                <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Medicines</h4>
                                <div className="space-y-3">
                                    {(showViewModal.prescription_items || []).map((item) => (
                                        <div key={item.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30">
                                            <div className="flex items-center justify-between">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{item.medicine?.name} {item.medicine?.dosage && <span className="text-gray-400 font-normal">— {item.medicine.dosage}</span>}</p>
                                                <span className="text-xs text-blue-600 dark:text-blue-400 font-bold bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">{item.period} {item.time_unit}</span>
                                            </div>
                                            {item.advice && <p className="text-xs text-gray-500 mt-1">{item.advice}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {showViewModal.notes && (
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                                    <span className="text-xs font-bold text-gray-400 uppercase">Notes</span>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{showViewModal.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Add Patient */}
            {showAddPatient && (
                <QuickAddPatient
                    branchId={profile?.branch_id}
                    onClose={() => setShowAddPatient(false)}
                    onSave={handlePatientAdded}
                />
            )}

            {/* Quick Add Medicine */}
            {showAddMedicine && (
                <QuickAddMedicine
                    branchId={profile?.branch_id}
                    frequencies={frequencies}
                    onClose={() => { setShowAddMedicine(false); setAddMedForIdx(null); }}
                    onSave={handleMedicineAdded}
                />
            )}
        </div>
    );
}
