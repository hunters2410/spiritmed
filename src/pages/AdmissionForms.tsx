import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, FileText, Pencil, Trash2, X, Eye, Check, ChevronLeft, ChevronRight, Search
} from 'lucide-react';
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
interface Diagnosis { id: string; name: string; icd10_code?: string; }
interface SurgicalProcedure { id: string; name: string; description?: string; }

interface AdmissionForm {
    id: string;
    report_date: string;
    hospital_id?: string;
    admission_date: string;
    procedure_text: string;
    procedure_date: string;
    plan_bloods: string[];
    plan_imaging: string[];
    plan_other: string;
    npo_oral: string;
    npo_date?: string;
    npo_time?: string;
    iv_fluids: string;
    medication: string;
    other: string;
    patient_id: string;
    doctor_id: string;
    diagnosis_id?: string; // Legacy
    diagnosis_ids?: string[];
    patient: Patient;
    doctor: Doctor;
    diagnosis?: Diagnosis; // Legacy
    hospital?: { name: string };
    created_at?: string;
    updated_at?: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5";



const BLOOD_TESTS = ['NONE', 'FBC', 'U&E', 'LFTs', 'CAMP', 'PSA', 'INR'];
const IMAGING_TESTS = ['NONE', 'CXR', 'Xray KUB', 'USS KUB', 'CT SCAN', 'Echocardiography', '12 Lead ECG'];

export default function AdmissionForms() {
    const { profile } = useAuth();
    const [forms, setForms] = useState<AdmissionForm[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [selectedDoc, setSelectedDoc] = useState<AdmissionForm | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [branch, setBranch] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredForms = forms.filter(f => {
        const query = searchQuery.toLowerCase();
        const patientName = f.patient?.full_name?.toLowerCase() || '';
        const patientNum = f.patient?.patient_number?.toLowerCase() || '';
        const hospitalName = (f.hospital?.name || f.hospital || '').toLowerCase();
        const diagnosisName = (f.diagnosis?.name || '').toLowerCase();
        const procedureText = (f.procedure_text || '').toLowerCase();
        const planOther = (f.plan_other || '').toLowerCase();
        
        return patientName.includes(query) ||
               patientNum.includes(query) ||
               hospitalName.includes(query) ||
               diagnosisName.includes(query) ||
               procedureText.includes(query) ||
               planOther.includes(query);
    });

    /* Historical Suggestions for "Other Plans" */
    const historicalPlans = Array.from(new Set(
        forms
            .map(f => f.plan_other)
            .filter(t => t && t.trim().length > 0)
    )).slice(0, 10);

    /* Form State */
    const [form, setForm] = useState({
        report_date: new Date().toISOString().split('T')[0],
        hospital_id: '',
        admission_date: new Date().toISOString().slice(0, 16),
        procedure_text: '',
        procedure_date: '',
        plan_bloods: [] as string[],
        plan_imaging: [] as string[],
        plan_other: '',
        npo_oral: 'Select',
        npo_date: '',
        npo_time: '',
        iv_fluids: '',
        medication: '',
        other: '',
        patient_id: '',
        doctor_id: profile?.id || '',
        diagnosis_ids: [] as string[]
    });

    const [newPatientForm, setNewPatientForm] = useState({ full_name: '', gender: 'Male', date_of_birth: '', email: '' });
    const [newDiagnosisForm, setNewDiagnosisForm] = useState({ label: '', code: '' });
    const [newHospitalForm, setNewHospitalForm] = useState({ name: '', address: '' });

    const [showHospitalModal, setShowHospitalModal] = useState(false);

    /* Resources */
    const [patients, setPatients] = useState<Patient[]>([]);
    const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
    const [hospitals, setHospitals] = useState<any[]>([]);
    const [procedures, setProcedures] = useState<SurgicalProcedure[]>([]);
    const [showProcedureModal, setShowProcedureModal] = useState(false);
    const [newProcedureForm, setNewProcedureForm] = useState({ name: '', description: '' });

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

            const forQ = supabase.from('admission_forms').select('*, patient:patients(full_name, patient_number, gender, date_of_birth), doctor:users(full_name, specialization, qualifications, signature_url), diagnosis:diagnoses(name), hospital:hospitals(name)').order('admission_date', { ascending: false }).order('created_at', { ascending: false });
            const patQ = supabase.from('patients').select('id, full_name, patient_number, gender, date_of_birth');
            const diaQ = supabase.from('diagnoses').select('id, name, icd10_code');
            const hospQ = supabase.from('hospitals').select('*').order('name');
            const proQ = supabase.from('surgical_procedures').select('id, name').order('name');

            if (bid) {
                forQ.eq('branch_id', bid);
                patQ.eq('branch_id', bid);
                diaQ.eq('branch_id', bid);
                hospQ.eq('branch_id', bid);
                proQ.eq('branch_id', bid);
            }

            const [forRes, patRes, diaRes, hospRes, proRes] = await Promise.all([forQ, patQ, diaQ, hospQ, proQ]);

            setForms(forRes.data || []);
            setPatients(patRes.data || []);
            setDiagnoses(diaRes.data || []);
            setHospitals(hospRes.data || []);
            setProcedures(proRes.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const resetForm = () => {
        setForm({
            report_date: new Date().toISOString().split('T')[0],
            hospital_id: '',
            admission_date: new Date().toISOString().slice(0, 16),
            procedure_text: '',
            procedure_date: '',
            plan_bloods: [] as string[],
            plan_imaging: [] as string[],
            plan_other: '',
            npo_oral: 'Select',
            npo_date: '',
            npo_time: '',
            iv_fluids: '',
            medication: '',
            other: '',
            patient_id: '',
            doctor_id: profile?.id || '',
            diagnosis_ids: [] as string[]
        });
        setSelectedDoc(null);
    };

    const toggleBlood = (test: string) => {
        setForm(prev => {
            let next = [...prev.plan_bloods];
            if (test === 'NONE') {
                next = next.includes('NONE') ? [] : ['NONE'];
            } else {
                next = next.filter(t => t !== 'NONE');
                next = next.includes(test) ? next.filter(t => t !== test) : [...next, test];
            }
            return { ...prev, plan_bloods: next };
        });
    };

    const toggleImaging = (test: string) => {
        setForm(prev => {
            let next = [...prev.plan_imaging];
            if (test === 'NONE') {
                next = next.includes('NONE') ? [] : ['NONE'];
            } else {
                next = next.filter(t => t !== 'NONE');
                next = next.includes(test) ? next.filter(t => t !== test) : [...next, test];
            }
            return { ...prev, plan_imaging: next };
        });
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
                const { patient, doctor, diagnosis, hospital, created_at, updated_at, id, ...cleanDoc } = selectedDoc;
                const updateData = { ...cleanDoc, ...form, branch_id: profile?.branch_id };
                const { error } = await supabase.from('admission_forms').update(updateData).eq('id', selectedDoc.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('admission_forms').insert([payload]);
                if (error) throw error;
            }

            setShowModal(false);
            resetForm();
            loadAll();
        } catch (err: any) {
            alert(err.message);
        }
    }

    async function handleCreateHospital(e: React.FormEvent) {
        e.preventDefault();
        const { data, error } = await supabase.from('hospitals').insert([{ ...newHospitalForm, branch_id: profile?.branch_id }]).select().single();
        if (error) alert(error.message);
        else {
            setHospitals(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setForm(prev => ({ ...prev, hospital_id: data.id }));
            setShowHospitalModal(false);
            setNewHospitalForm({ name: '', address: '' });
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this admission form?')) return;
        const { error } = await supabase.from('admission_forms').delete().eq('id', id);
        if (error) alert(error.message);
        else loadAll();
    }

    async function handleCreateProcedure(e: React.FormEvent) {
        e.preventDefault();
        const { data, error } = await supabase.from('surgical_procedures').insert([{ ...newProcedureForm, branch_id: profile?.branch_id }]).select().single();
        if (error) alert(error.message);
        else {
            setProcedures(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setForm(prev => ({ ...prev, procedure_text: data.name }));
            setShowProcedureModal(false);
            setNewProcedureForm({ name: '', description: '' });
        }
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

    async function handleCreateDiagnosis(e: React.FormEvent) {
        e.preventDefault();
        const { data, error } = await supabase.from('diagnoses').insert([{
            ...newDiagnosisForm,
            branch_id: profile?.branch_id
        }]).select().single();

        if (error) alert(error.message);
        else {
            setDiagnoses(prev => [data, ...prev]);
            setForm(prev => ({ ...prev, diagnosis_ids: [...prev.diagnosis_ids, data.id] }));
            setShowDiagnosisModal(false);
            setNewDiagnosisForm({ label: '', code: '' });
        }
    }

    if (viewMode === 'detailed' && selectedDoc && branch) {
        return (
            <ClinicalDocumentPrintView
                type="admission"
                data={selectedDoc}
                branch={branch}
                allDiagnoses={diagnoses}
                onBack={() => setViewMode('table')}
                onEdit={() => {
                    const { patient, doctor, diagnosis, hospital, created_at, updated_at, id, ...formData } = selectedDoc;
                    setForm({
                        ...formData,
                        diagnosis_ids: formData.diagnosis_ids || [],
                        npo_date: formData.npo_date || '',
                        npo_time: formData.npo_time || ''
                    } as any);
                    setShowModal(true);
                    setViewMode('table');
                }}
                onAddNew={() => { resetForm(); setShowModal(true); setViewMode('table'); }}
                onSendEmail={() => alert('Email functionality coming soon')}
            />
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admission Forms</h1>
                    <p className="text-sm text-gray-500">Prepare and track hospital admission instructions</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Create Admission Form
                </button>
            </div>

            {/* Search Input */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search admission records by patient name, number, hospital, or diagnosis..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                </div>
            </div>

            {/* 📱 Mobile Card View (< md) */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="py-10 text-center text-gray-400">Loading forms...</div>
                ) : filteredForms.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm font-medium text-gray-500">No admission forms found matching your search.</div>
                ) : filteredForms.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(f => (
                    <div key={f.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase">{f.patient?.full_name || 'N/A'}</h3>
                                <p className="text-xs text-gray-500 font-mono">ID: {f.patient?.patient_number || 'N/A'}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                                {f.hospital?.name || 'Hospital'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-bold">Admission Date</span>
                                <span className="font-semibold text-gray-900 dark:text-white">{new Date(f.admission_date).toLocaleDateString()}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-bold">Doctor</span>
                                <span className="font-semibold text-gray-800 dark:text-gray-200">Dr. {f.doctor?.full_name || 'Staff'}</span>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <span className="text-xs text-gray-500 font-medium truncate max-w-[180px]">{f.procedure_text || f.diagnosis?.name || 'Procedure N/A'}</span>
                            <div className="flex items-center space-x-1">
                                <button onClick={() => { setSelectedDoc(f); setViewMode('detailed'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="View Detail"><Eye className="w-4 h-4" /></button>
                                <button onClick={() => {
                                    setSelectedDoc(f);
                                    const { patient, doctor, diagnosis, hospital, created_at, updated_at, id, ...formData } = f;
                                    setForm({
                                        ...formData,
                                        diagnosis_ids: formData.diagnosis_ids || []
                                    } as any);
                                    setShowModal(true);
                                }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(f.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
                                <th className="px-6 py-4">Admission Date</th>
                                <th className="px-6 py-4">Patient</th>
                                <th className="px-6 py-4">Hospital</th>
                                <th className="px-6 py-4">Diagnosis</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {loading ? (
                                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">Loading forms...</td></tr>
                            ) : filteredForms.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">No admission forms found.</td></tr>
                            ) : filteredForms.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(f => (
                                <tr key={f.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition group">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{new Date(f.admission_date).toLocaleString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">{f.patient?.full_name}</span>
                                            <span className="text-[10px] text-gray-400">{f.patient?.patient_number}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{f.hospital?.name || 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-indigo-600 dark:text-indigo-400">{f.diagnosis?.name || 'N/A'}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => { setSelectedDoc(f); setViewMode('detailed'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="View Detail"><Eye className="w-4 h-4" /></button>
                                            <button onClick={() => {
                                                setSelectedDoc(f);
                                                const { patient, doctor, diagnosis, hospital, created_at, updated_at, id, ...formData } = f;
                                                setForm({
                                                    ...formData,
                                                    diagnosis_ids: formData.diagnosis_ids || []
                                                } as any);
                                                setShowModal(true);
                                            }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => handleDelete(f.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Controls */}
                {!loading && filteredForms.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
                        <div className="flex items-center gap-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Showing <span className="font-bold text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filteredForms.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{filteredForms.length}</span> forms
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
                        {Math.ceil(filteredForms.length / itemsPerPage) > 1 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent transition text-gray-600 dark:text-gray-400"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="flex gap-1">
                                    {Array.from({ length: Math.ceil(filteredForms.length / itemsPerPage) }, (_, i) => i + 1).map(page => (
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
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredForms.length / itemsPerPage)))}
                                    disabled={currentPage === Math.ceil(filteredForms.length / itemsPerPage)}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent transition text-gray-600 dark:text-gray-400"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200 uppercase-inputs max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" /> {selectedDoc ? 'Edit' : 'Create'} Admission Form
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 overflow-y-auto">
                            <div className="space-y-4 mb-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <SearchDropdown
                                        label="Hospital"
                                        placeholder="Search Hospital"
                                        items={hospitals}
                                        selectedId={form.hospital_id}
                                        onSelect={(id: string) => setForm({ ...form, hospital_id: id })}
                                        displayFn={(h: any) => h.name}
                                        onAddNew={() => setShowHospitalModal(true)}
                                        addNewLabel="Add New Hospital"
                                    />
                                    <div>
                                        <label className={labelCls}>Admission Date</label>
                                        <input type="datetime-local" value={form.admission_date} onChange={e => setForm({ ...form, admission_date: e.target.value })} className={inputCls} />
                                    </div>
                                </div>

                                <SearchDropdown
                                    label="Surname"
                                    placeholder="Search Patient Name / ID"
                                    items={patients}
                                    selectedId={form.patient_id}
                                    onSelect={(id: string) => setForm({ ...form, patient_id: id })}
                                    displayFn={(p: any) => `${p.full_name} (${p.patient_number})`}
                                    onAddNew={() => setShowPatientModal(true)}
                                    addNewLabel="Add New Patient"
                                />

                                <SearchDropdown
                                    label="Clinical Diagnosis"
                                    placeholder="Search Diagnosis & Icd 10 Code"
                                    items={diagnoses}
                                    multiSelect={true}
                                    selectedIds={form.diagnosis_ids}
                                    onSelectMultiple={(ids: string[]) => setForm({ ...form, diagnosis_ids: ids })}
                                    displayFn={(d: any) => d.name + (d.icd10_code ? ` (${d.icd10_code})` : '')}
                                    onAddNew={() => setShowDiagnosisModal(true)}
                                    addNewLabel="Add New Diagnosis"
                                />

                                <SearchDropdown
                                    label="Surgical Procedure"
                                    placeholder="Search Surgical Procedure"
                                    items={procedures}
                                    selectedId={procedures.find(p => p.name === form.procedure_text)?.id || ''}
                                    onSelect={(id: string) => {
                                        const p = procedures.find(proc => proc.id === id);
                                        if (p) setForm({ ...form, procedure_text: p.name });
                                    }}
                                    displayFn={(p: any) => p.name}
                                    onAddNew={() => setShowProcedureModal(true)}
                                    addNewLabel="Add New Procedure"
                                />

                                <div>
                                    <label className={labelCls}>Date Of Procedure</label>
                                    <input type="date" value={form.procedure_date} onChange={e => setForm({ ...form, procedure_date: e.target.value })} className={inputCls} />
                                </div>
                            </div>

                            <div className="border-t border-gray-100 dark:border-gray-700 pt-6 mb-8 text-center">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Admission Plan: (Please do the following selected Investigations)</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                                    <div>
                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase text-center mb-3">Bloods</h4>
                                        <div className="flex flex-col gap-2 max-w-xs mx-auto">
                                            {BLOOD_TESTS.map(test => (
                                                <button key={test} type="button" onClick={() => toggleBlood(test)}
                                                    className="flex items-center gap-2 group text-left">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition ${form.plan_bloods.includes(test) ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 group-hover:border-indigo-500'}`}>
                                                        {form.plan_bloods.includes(test) && <Check className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <span className={`text-xs ${form.plan_bloods.includes(test) ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{test}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase text-center mb-3">Imaging</h4>
                                        <div className="flex flex-col gap-2 max-w-xs mx-auto">
                                            {IMAGING_TESTS.map(test => (
                                                <button key={test} type="button" onClick={() => toggleImaging(test)}
                                                    className="flex items-center gap-2 group text-left">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition ${form.plan_imaging.includes(test) ? 'bg-indigo-600 border-indigo-600' : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 group-hover:border-indigo-500'}`}>
                                                        {form.plan_imaging.includes(test) && <Check className="w-3 h-3 text-white" />}
                                                    </div>
                                                    <span className={`text-xs ${form.plan_imaging.includes(test) ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{test}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 pt-6 border-t border-gray-100 dark:border-gray-700 mb-6">
                                <div>
                                    <label className={labelCls}>Other Tests</label>
                                    <SearchDropdown
                                        placeholder="Search Other Tests"
                                        items={historicalPlans.map(p => ({ id: p, label: p }))}
                                        selectedId={null}
                                        onSelect={(val) => setForm({ ...form, plan_other: form.plan_other ? `${form.plan_other}, ${val}` : val })}
                                    />
                                    <textarea rows={2} value={form.plan_other} onChange={e => setForm({ ...form, plan_other: e.target.value })} className={`${inputCls} mt-2`} placeholder="Any other specific tests or plans..." />
                                </div>

                                <div>
                                    <label className={labelCls}>Nil Per Oral</label>
                                    <select value={form.npo_oral} onChange={e => setForm({ ...form, npo_oral: e.target.value })} className={inputCls}>
                                        <option value="Select">Select</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Date</label>
                                        <input type="date" value={form.npo_date} onChange={e => setForm({ ...form, npo_date: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Time</label>
                                        <input type="time" value={form.npo_time} onChange={e => setForm({ ...form, npo_time: e.target.value })} className={inputCls} />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelCls}>Iv Fluids</label>
                                    <textarea rows={4} value={form.iv_fluids} onChange={e => setForm({ ...form, iv_fluids: e.target.value })} className={inputCls} placeholder="Instructions for IV fluids..." />
                                </div>
                                <div>
                                    <label className={labelCls}>Medication</label>
                                    <textarea rows={4} value={form.medication} onChange={e => setForm({ ...form, medication: e.target.value })} className={inputCls} placeholder="Admission medications..." />
                                </div>
                                <div>
                                    <label className={labelCls}>Other</label>
                                    <textarea rows={4} value={form.other} onChange={e => setForm({ ...form, other: e.target.value })} className={inputCls} placeholder="Any other nursing or medical instructions..." />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
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

            {/* Add Diagnosis Modal */}
            {showDiagnosisModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-600" /> Add New Diagnosis
                            </h2>
                            <button onClick={() => setShowDiagnosisModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreateDiagnosis} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Diagnosis Label</label>
                                <input required type="text" placeholder="e.g. Hypertension" value={newDiagnosisForm.label} onChange={e => setNewDiagnosisForm({ ...newDiagnosisForm, label: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>ICD-10 Code (Optional)</label>
                                <input type="text" placeholder="e.g. I10" value={newDiagnosisForm.code} onChange={e => setNewDiagnosisForm({ ...newDiagnosisForm, code: e.target.value })} className={inputCls} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowDiagnosisModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-md">Save Diagnosis</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Add Hospital Modal */}
            {showHospitalModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-600" /> Add New Hospital
                            </h2>
                            <button onClick={() => setShowHospitalModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreateHospital} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Hospital Name</label>
                                <input required type="text" placeholder="Mater Dei Hospital" value={newHospitalForm.name} onChange={e => setNewHospitalForm({ ...newHospitalForm, name: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Address</label>
                                <input type="text" placeholder="1st Ave, Bulawayo" value={newHospitalForm.address} onChange={e => setNewHospitalForm({ ...newHospitalForm, address: e.target.value })} className={inputCls} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowHospitalModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-md">Save Hospital</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showProcedureModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/20 rounded-t-xl">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add New Procedure</h2>
                            <button onClick={() => setShowProcedureModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleCreateProcedure} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Procedure Name</label>
                                <input required value={newProcedureForm.name} onChange={e => setNewProcedureForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Appendectomy" />
                            </div>
                            <div>
                                <label className={labelCls}>Description (Optional)</label>
                                <textarea rows={2} value={newProcedureForm.description} onChange={e => setNewProcedureForm(p => ({ ...p, description: e.target.value }))} className={inputCls} placeholder="Details about the procedure..." />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowProcedureModal(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition">Save Procedure</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
