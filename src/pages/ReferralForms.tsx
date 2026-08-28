import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllPatients } from '../utils/patientUtils';
import { Plus, FileText, Pencil, Trash2, X, Eye, ChevronLeft, ChevronRight, Search, Printer, Download } from 'lucide-react';
import { ClinicalDocumentPrintView } from '../components/ClinicalDocumentPrintView';
import { SearchDropdown } from '../components/SearchDropdown';
import { RichTextEditor } from '../components/RichTextEditor';

/* ─── types ─── */
interface Patient {
    id: string;
    full_name: string;
    patient_number: string;
    gender: string;
    date_of_birth: string;
}
interface Doctor {
    id: string;
    full_name: string;
    specialization?: string;
    qualifications?: string;
    signature_url?: string;
}

interface ReferralForm {
    id: string;
    report_date: string;
    recipient: string;
    reason_for_referral: string;
    background_history: string;
    treatment_done: string;
    patient_id: string;
    doctor_id: string;
    patient: Patient;
    doctor: Doctor;
    created_at?: string;
    updated_at?: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5";



export default function ReferralForms() {
    const { profile } = useAuth();
    const [forms, setForms] = useState<ReferralForm[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasLoadedOnce = useRef(false);
    const [totalDbCount, setTotalDbCount] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [selectedDoc, setSelectedDoc] = useState<ReferralForm | null>(null);
    const [actionTrigger, setActionTrigger] = useState<'none' | 'print' | 'download'>('none');
    const [branch, setBranch] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const handleSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => { setDebouncedSearch(value); setCurrentPage(1); }, 300);
    }, []);

    /* Form State */
    const [form, setForm] = useState({
        report_date: new Date().toISOString().split('T')[0],
        patient_id: '',
        doctor_id: profile?.id || '',
        recipient: '',
        reason_for_referral: '',
        background_history: '',
        treatment_done: ''
    });

    const [newPatientForm, setNewPatientForm] = useState({ full_name: '', gender: 'Male', date_of_birth: '', email: '' });

    /* Resources */
    const [patients, setPatients] = useState<Patient[]>([]);

    useEffect(() => {
        if (profile) { loadReferences(); fetchBranchDetails(); }
        else { setLoading(false); }
    }, [profile?.id]);

    useEffect(() => {
        if (profile) loadRecords();
    }, [currentPage, debouncedSearch, itemsPerPage, profile?.id]);

    async function fetchBranchDetails() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('branches').select('name, logo_url, phone, email, address').eq('id', profile.branch_id).maybeSingle();
        setBranch(data);
    }

    async function loadReferences() {
        try {
            const bid = profile?.branch_id;
            const allPats = await fetchAllPatients({ branchId: bid, select: 'id, full_name, patient_number, gender, date_of_birth' });
            setPatients(allPats || []);
        } catch (e) { console.error(e); }
    }

    async function loadRecords() {
        if (!hasLoadedOnce.current) setLoading(true);
        try {
            const bid = profile?.branch_id;
            const from = (currentPage - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            let q = supabase.from('referral_forms')
                .select('*, patient:patients(full_name, patient_number, gender, date_of_birth), doctor:users!doctor_id(full_name, specialization, qualifications, signature_url)', { count: 'exact' })
                .order('report_date', { ascending: false }).order('created_at', { ascending: false })
                .range(from, to);
            if (bid) q = q.eq('branch_id', bid);

            const { data, error, count } = await q;
            if (error) throw error;
            setForms(data || []);
            setTotalDbCount(count || 0);
            hasLoadedOnce.current = true;
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    const loadAll = () => { loadRecords(); loadReferences(); };

    const resetForm = () => {
        setForm({
            report_date: new Date().toISOString().split('T')[0],
            patient_id: '',
            doctor_id: profile?.id || '',
            recipient: '',
            reason_for_referral: '',
            background_history: '',
            treatment_done: ''
        });
        setSelectedDoc(null);
    };

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form.patient_id) {
            alert('Please select a patient.');
            return;
        }

        const payload = { ...form, branch_id: profile?.branch_id };

        try {
            if (selectedDoc) {
                const { patient, doctor, created_at, updated_at, id, ...cleanDoc } = selectedDoc;
                const updateData = { ...cleanDoc, ...form, branch_id: profile?.branch_id };
                const { error } = await supabase.from('referral_forms').update(updateData).eq('id', selectedDoc.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('referral_forms').insert([payload]);
                if (error) throw error;
            }

            setShowModal(false);
            resetForm();
            loadAll();
        } catch (err: any) {
            alert(err.message);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this referral form?')) return;
        const { error } = await supabase.from('referral_forms').delete().eq('id', id);
        if (error) alert(error.message);
        else loadAll();
    }

    async function handleCreatePatient(e: React.FormEvent) {
        e.preventDefault();
        const pNum = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
        const generatedEmail = newPatientForm.email || `patient.${pNum}@spiritmed.com`;
        const generatedPassword = 'patient123456';
        const { data, error } = await supabase.from('patients').insert([{
            ...newPatientForm,
            email: generatedEmail,
            password: generatedPassword,
            patient_number: pNum,
            branch_id: profile?.branch_id,
            status: 'active'
        }]).select().single();

        if (error) alert(error.message);
        else {
            setPatients(prev => [data, ...prev]);
            setForm(prev => ({ ...prev, patient_id: data.id }));
            setShowPatientModal(false);
            setNewPatientForm({ full_name: '', gender: 'Male', date_of_birth: '', email: '' });
        }
    }

    if (viewMode === 'detailed' && selectedDoc && branch) {
        return (
            <ClinicalDocumentPrintView
                type="referral"
                data={selectedDoc}
                branch={branch}
                autoPrint={actionTrigger === 'print'}
                autoDownload={actionTrigger === 'download'}
                onBack={() => { setViewMode('table'); setActionTrigger('none'); }}
                onEdit={() => {
                    const { patient, doctor, created_at, updated_at, id, ...formData } = selectedDoc;
                    setForm(formData as any);
                    setShowModal(true);
                    setViewMode('table');
                    setActionTrigger('none');
                }}
                onAddNew={() => { resetForm(); setShowModal(true); setViewMode('table'); setActionTrigger('none'); }}
                onSendEmail={() => alert('Email functionality coming soon')}
            />
        );
    }

    const filteredForms = forms.filter(f => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        const pName = f.patient?.full_name?.toLowerCase() || '';
        const pNum = f.patient?.patient_number?.toLowerCase() || '';
        const recipient = f.recipient?.toLowerCase() || '';
        const docName = f.doctor?.full_name?.toLowerCase() || '';
        const reason = f.reason_for_referral?.toLowerCase() || '';
        return pName.includes(query) || pNum.includes(query) || recipient.includes(query) || docName.includes(query) || reason.includes(query);
    });

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Referral Forms</h1>
                    <p className="text-xs sm:text-sm text-gray-500">Fill and manage formal referral documents</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-3.5 py-2 rounded-xl hover:bg-indigo-700 transition shadow-sm text-xs sm:text-sm font-bold shrink-0">
                    <Plus className="w-4 h-4" /> Add New Referral
                </button>
            </div>

            {/* 🔍 Search Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3.5 mb-5">
                <div className="relative w-full">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        placeholder="Search referral forms by patient name, ID, recipient, doctor, or reason..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs sm:text-sm font-medium"
                    />
                </div>
            </div>

            {/* 📱 Mobile Card View (< md) */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="py-10 text-center text-gray-400">Loading forms...</div>
                ) : filteredForms.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm font-medium text-gray-500">No referral forms found matching your search.</div>
                ) : filteredForms.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(f => (
                    <div key={f.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase">{f.patient?.full_name || 'N/A'}</h3>
                                <p className="text-xs text-gray-500 font-mono">ID: {f.patient?.patient_number || 'N/A'}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                To: {f.recipient || 'Specialist'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-bold">Report Date</span>
                                <span className="font-semibold text-gray-900 dark:text-white">{new Date(f.report_date).toLocaleDateString()}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-bold">Doctor</span>
                                <span className="font-semibold text-gray-800 dark:text-gray-200">Dr. {f.doctor?.full_name || 'Staff'}</span>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <span className="text-xs text-gray-500 font-medium truncate max-w-[180px]">{f.reason_for_referral || 'Reason N/A'}</span>
                            <div className="flex items-center space-x-1">
                                <button onClick={() => { setSelectedDoc(f); setViewMode('detailed'); setActionTrigger('none'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition" title="View Detail"><Eye className="w-4 h-4" /></button>
                                <button onClick={() => { setSelectedDoc(f); setViewMode('detailed'); setActionTrigger('print'); }} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition" title="Print Form"><Printer className="w-4 h-4" /></button>
                                <button onClick={() => { setSelectedDoc(f); setViewMode('detailed'); setActionTrigger('download'); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition" title="Download PDF"><Download className="w-4 h-4" /></button>
                                <button onClick={() => {
                                    setSelectedDoc(f);
                                    const { patient, doctor, created_at, updated_at, id, ...formData } = f;
                                    setForm(formData as any);
                                    setShowModal(true);
                                }} className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition" title="Edit"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(f.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 💻 Desktop Table View (>= md) */}
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse clinical-table">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-900/50 text-[11px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100 dark:border-gray-700">
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Patient</th>
                                <th className="px-6 py-4">To (Recipient)</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {loading ? (
                                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">Loading forms...</td></tr>
                            ) : filteredForms.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">No referral forms found matching your search.</td></tr>
                            ) : filteredForms.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(f => (
                                <tr key={f.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition group">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{new Date(f.report_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">{f.patient?.full_name}</span>
                                            <span className="text-[10px] text-gray-400">{f.patient?.patient_number}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 font-semibold italic">{f.recipient || 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">Dr. {f.doctor?.full_name}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1.5">
                                            <button onClick={() => { setSelectedDoc(f); setViewMode('detailed'); setActionTrigger('none'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition" title="View Detail"><Eye className="w-4 h-4" /></button>
                                            <button onClick={() => { setSelectedDoc(f); setViewMode('detailed'); setActionTrigger('print'); }} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition" title="Print Form"><Printer className="w-4 h-4" /></button>
                                            <button onClick={() => { setSelectedDoc(f); setViewMode('detailed'); setActionTrigger('download'); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition" title="Download PDF"><Download className="w-4 h-4" /></button>
                                            <button onClick={() => {
                                                setSelectedDoc(f);
                                                const { patient, doctor, created_at, updated_at, id, ...formData } = f;
                                                setForm(formData as any);
                                                setShowModal(true);
                                            }} className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition" title="Edit"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => handleDelete(f.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Controls */}
                {!loading && forms.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
                        <div className="flex items-center gap-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Showing <span className="font-bold text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, forms.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{forms.length}</span> forms
                            </p>
                            <div className="flex items-center gap-1.5 border-l pl-4 border-gray-200 dark:border-gray-700">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Show</span>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>
                        {Math.ceil(forms.length / itemsPerPage) > 1 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent transition text-gray-600 dark:text-gray-400"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="flex gap-1">
                                    {Array.from({ length: Math.ceil(forms.length / itemsPerPage) }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-8 rounded-lg font-bold transition text-xs ${currentPage === page ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-white dark:hover:bg-gray-700 border border-transparent text-gray-600 dark:text-gray-400'}`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(forms.length / itemsPerPage)))}
                                    disabled={currentPage === Math.ceil(forms.length / itemsPerPage)}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent transition text-gray-600 dark:text-gray-400"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200 uppercase-inputs max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" /> {selectedDoc ? 'Edit' : 'Fill'} Referral Form
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className={labelCls}>Date</label>
                                    <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>To (Recipient Specialist/Clinic)</label>
                                    <input type="text" placeholder="e.g. Dr. Collen Hunters, Harare Oncology" value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} className={inputCls} />
                                </div>
                                <SearchDropdown
                                    label="Patient (REF)"
                                    placeholder="Search Patient Name / ID..."
                                    items={patients}
                                    selectedId={form.patient_id}
                                    onSelect={(id: string) => setForm({ ...form, patient_id: id })}
                                    displayFn={(p: any) => `${p.full_name} (${p.patient_number})`}
                                    onAddNew={() => setShowPatientModal(true)}
                                    addNewLabel="Add New Patient"
                                />
                            </div>

                            <div className="space-y-6 mb-6">
                                <div>
                                    <label className={labelCls}>Reason for Referral</label>
                                    <RichTextEditor value={form.reason_for_referral} onChange={val => setForm({ ...form, reason_for_referral: val })} placeholder="Clinical reason for this referral..." />
                                </div>
                                <div>
                                    <label className={labelCls}>Background History</label>
                                    <RichTextEditor value={form.background_history} onChange={val => setForm({ ...form, background_history: val })} placeholder="Relevant medical background..." />
                                </div>
                                <div>
                                    <label className={labelCls}>Treatment Done</label>
                                    <RichTextEditor value={form.treatment_done} onChange={val => setForm({ ...form, treatment_done: val })} placeholder="Treatments already administered..." />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" className="px-8 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-lg">Save & Finalize</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quick-Add Modals */}
            {/* Add Patient Modal */}
            {showPatientModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-600" /> Add New Patient
                            </h2>
                            <button onClick={() => setShowPatientModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreatePatient} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Full Name</label>
                                <input required type="text" placeholder="Collen Hunters" value={newPatientForm.full_name} onChange={e => setNewPatientForm({ ...newPatientForm, full_name: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Gender</label>
                                <select value={newPatientForm.gender} onChange={e => setNewPatientForm({ ...newPatientForm, gender: e.target.value })} className={inputCls}>
                                    <option>Male</option>
                                    <option>Female</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Date of Birth</label>
                                <input required type="date" value={newPatientForm.date_of_birth} onChange={e => setNewPatientForm({ ...newPatientForm, date_of_birth: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Email Address (Unique)</label>
                                <input type="email" placeholder="patient@example.com" value={newPatientForm.email} onChange={e => setNewPatientForm({ ...newPatientForm, email: e.target.value })} className={inputCls} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowPatientModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-md">Save Patient</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
