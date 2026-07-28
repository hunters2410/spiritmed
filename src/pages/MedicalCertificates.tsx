import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, Pencil, Trash2, X, Eye, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ClinicalDocumentPrintView } from '../components/ClinicalDocumentPrintView';
import { SearchDropdown } from '../components/SearchDropdown';

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

interface MedicalCertificate {
    id: string;
    report_date: string;
    date_attended: string;
    illness_date: string;
    resume_date: string;
    period: number;
    time_unit: string;
    purpose_template: string;
    purpose: string;
    patient_id: string;
    doctor_id: string;
    patient: Patient;
    doctor: Doctor;
    created_at?: string;
    updated_at?: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5";



const PURPOSE_TEMPLATES = [
    { id: 'sick_leave', label: 'Sick Leave' },
    { id: 'fitness_to_work', label: 'Fitness to Work' },
    { id: 'physical_examination', label: 'Physical Examination' },
    { id: 'other', label: 'Other' }
];

export default function MedicalCertificates() {
    const { profile } = useAuth();
    const [certs, setCerts] = useState<MedicalCertificate[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [selectedDoc, setSelectedDoc] = useState<MedicalCertificate | null>(null);
    const [branch, setBranch] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    /* Form State */
    const [form, setForm] = useState({
        report_date: new Date().toISOString().split('T')[0],
        date_attended: new Date().toISOString().split('T')[0],
        illness_date: new Date().toISOString().split('T')[0],
        resume_date: '',
        period: 1,
        time_unit: 'Days',
        purpose_template: 'sick_leave',
        purpose: '',
        patient_id: '',
        doctor_id: profile?.id || ''
    });

    const [newPatientForm, setNewPatientForm] = useState({ full_name: '', gender: 'Male', date_of_birth: '', email: '' });

    /* Resources */
    const [patients, setPatients] = useState<Patient[]>([]);

    useEffect(() => {
        if (profile) {
            loadAll();
            fetchBranchDetails();
        } else {
            setLoading(false);
        }
    }, [profile?.id]);

    async function fetchBranchDetails() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('branches').select('*').eq('id', profile.branch_id).maybeSingle();
        setBranch(data);
    }

    async function loadAll() {
        setLoading(true);
        try {
            const bid = profile?.branch_id;

            const forQ = supabase.from('medical_certificates').select('*, patient:patients(full_name, patient_number, gender, date_of_birth), doctor:users(full_name, specialization, qualifications, signature_url)').order('report_date', { ascending: false }).order('created_at', { ascending: false });
            const patQ = supabase.from('patients').select('id, full_name, patient_number, gender, date_of_birth');

            if (bid) {
                forQ.eq('branch_id', bid);
                patQ.eq('branch_id', bid);
            }

            const [forRes, patRes] = await Promise.all([forQ, patQ]);

            setCerts(forRes.data || []);
            setPatients(patRes.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const resetForm = () => {
        setForm({
            report_date: new Date().toISOString().split('T')[0],
            date_attended: new Date().toISOString().split('T')[0],
            illness_date: new Date().toISOString().split('T')[0],
            resume_date: '',
            period: 1,
            time_unit: 'Days',
            purpose_template: 'sick_leave',
            purpose: '',
            patient_id: '',
            doctor_id: profile?.id || ''
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
                const { error } = await supabase.from('medical_certificates').update(updateData).eq('id', selectedDoc.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('medical_certificates').insert([payload]);
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
        if (!confirm('Are you sure you want to delete this certificate?')) return;
        const { error } = await supabase.from('medical_certificates').delete().eq('id', id);
        if (error) alert(error.message);
        else loadAll();
    }

    async function handleCreatePatient(e: React.FormEvent) {
        e.preventDefault();
        const pNum = `P-${Date.now().toString().slice(-6)}`;
        const generatedEmail = newPatientForm.email || `patient.${pNum.toLowerCase().replace(/[^a-z0-9]/g, '')}@spiritmed.com`;
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
                type="certificate"
                data={selectedDoc}
                branch={branch}
                onBack={() => setViewMode('table')}
                onEdit={() => {
                    const { patient, doctor, created_at, updated_at, id, ...formData } = selectedDoc;
                    setForm(formData as any);
                    setShowModal(true);
                    setViewMode('table');
                }}
                onAddNew={() => { resetForm(); setShowModal(true); setViewMode('table'); }}
                onSendEmail={() => alert('Email functionality coming soon')}
            />
        );
    }

    const filteredCerts = certs.filter(c => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        const pName = c.patient?.full_name?.toLowerCase() || '';
        const pNum = c.patient?.patient_number?.toLowerCase() || '';
        const purpose = c.purpose?.toLowerCase() || '';
        const docName = c.doctor?.full_name?.toLowerCase() || '';
        return pName.includes(query) || pNum.includes(query) || purpose.includes(query) || docName.includes(query);
    });

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Medical Certificates</h1>
                    <p className="text-xs sm:text-sm text-gray-500">Generate and manage sick leave or fitness documents</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-3.5 py-2 rounded-xl hover:bg-indigo-700 transition shadow-sm text-xs sm:text-sm font-bold shrink-0">
                    <Plus className="w-4 h-4" /> Add New Certificate
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
                        placeholder="Search certificates by patient name, ID, purpose, or doctor..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs sm:text-sm font-medium"
                    />
                </div>
            </div>

            {/* 📱 Mobile Card View (< md) */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="py-10 text-center text-gray-400">Loading certificates...</div>
                ) : filteredCerts.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm font-medium text-gray-500">No medical certificates found matching your search.</div>
                ) : filteredCerts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(c => (
                    <div key={c.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase">{c.patient?.full_name || 'N/A'}</h3>
                                <p className="text-xs text-gray-500 font-mono">ID: {c.patient?.patient_number || 'N/A'}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                                {c.period} {c.time_unit}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-bold">Resume Date</span>
                                <span className="font-semibold text-gray-900 dark:text-white">{new Date(c.resume_date).toLocaleDateString()}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-bold">Doctor</span>
                                <span className="font-semibold text-gray-800 dark:text-gray-200">Dr. {c.doctor?.full_name || 'Staff'}</span>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <span className="text-xs text-gray-500 font-medium truncate max-w-[180px]">{c.purpose || 'General Medical'}</span>
                            <div className="flex items-center space-x-1">
                                <button onClick={() => { setSelectedDoc(c); setViewMode('detailed'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="View Detail"><Eye className="w-4 h-4" /></button>
                                <button onClick={() => {
                                    setSelectedDoc(c);
                                    const { patient, doctor, created_at, updated_at, id, ...formData } = c;
                                    setForm(formData as any);
                                    setShowModal(true);
                                }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
                                <th className="px-6 py-4">Period</th>
                                <th className="px-6 py-4">Resume Date</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Loading certificates...</td></tr>
                            ) : filteredCerts.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">No medical certificates found matching your search.</td></tr>
                            ) : filteredCerts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(c => (
                                <tr key={c.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition group">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{new Date(c.report_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">{c.patient?.full_name}</span>
                                            <span className="text-[10px] text-gray-400">{c.patient?.patient_number}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-indigo-600 dark:text-indigo-400">{c.period} {c.time_unit}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 underline font-mono">{c.resume_date ? new Date(c.resume_date).toLocaleDateString() : 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">Dr. {c.doctor?.full_name}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => { setSelectedDoc(c); setViewMode('detailed'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="View Detail"><Eye className="w-4 h-4" /></button>
                                            <button onClick={() => {
                                                setSelectedDoc(c);
                                                const { patient, doctor, created_at, updated_at, id, ...formData } = c;
                                                setForm(formData as any);
                                                setShowModal(true);
                                            }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => handleDelete(c.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Controls */}
                {!loading && certs.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
                        <div className="flex items-center gap-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Showing <span className="font-bold text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, certs.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{certs.length}</span> certificates
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
                        {Math.ceil(certs.length / itemsPerPage) > 1 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent transition text-gray-600 dark:text-gray-400"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="flex gap-1">
                                    {Array.from({ length: Math.ceil(certs.length / itemsPerPage) }, (_, i) => i + 1).map(page => (
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
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(certs.length / itemsPerPage)))}
                                    disabled={currentPage === Math.ceil(certs.length / itemsPerPage)}
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
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200 uppercase-inputs">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" /> {selectedDoc ? 'Edit' : 'Create'} Medical Certificate
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                                <div>
                                    <label className={labelCls}>Report Date</label>
                                    <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} className={inputCls} />
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
                                <div>
                                    <label className={labelCls}>Date Attended</label>
                                    <input type="date" value={form.date_attended} onChange={e => setForm({ ...form, date_attended: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Date of Illness</label>
                                    <input type="date" value={form.illness_date} onChange={e => setForm({ ...form, illness_date: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>Date to Resume</label>
                                    <input type="date" value={form.resume_date} onChange={e => setForm({ ...form, resume_date: e.target.value })} className={`${inputCls} font-bold border-indigo-200 bg-indigo-50/50`} />
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className={labelCls}>Period</label>
                                        <input type="number" min={1} value={form.period} onChange={e => setForm({ ...form, period: parseInt(e.target.value) })} className={inputCls} />
                                    </div>
                                    <div className="w-24">
                                        <label className={labelCls}>Unit</label>
                                        <select value={form.time_unit} onChange={e => setForm({ ...form, time_unit: e.target.value })} className={inputCls}>
                                            <option>Days</option>
                                            <option>Weeks</option>
                                            <option>Months</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className={labelCls}>Purpose / Certification</label>
                                    <select value={form.purpose_template} onChange={e => setForm({ ...form, purpose_template: e.target.value })} className={inputCls + " mb-3 font-bold"}>
                                        {PURPOSE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                    <textarea rows={6} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className={inputCls} placeholder="Detailed purpose or clinical remarks..." />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
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
