import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, Pencil, Trash2, X, Eye } from 'lucide-react';
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

interface DischargeSummary {
    id: string;
    report_date: string;
    recipient: string;
    diagnosis_text: string;
    medical_history: string;
    treatment_done: string;
    follow_up_plan: string;
    patient_id: string;
    doctor_id: string;
    diagnosis_id?: string; // Legacy
    diagnosis_ids?: string[];
    patient: Patient;
    doctor: Doctor;
    diagnosis?: Diagnosis; // Legacy
    created_at?: string;
    updated_at?: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5";



export default function DischargeSummaries() {
    const { profile } = useAuth();
    const [summaries, setSummaries] = useState<DischargeSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [selectedDoc, setSelectedDoc] = useState<DischargeSummary | null>(null);
    const [branch, setBranch] = useState<any>(null);

    /* Form State */
    const [form, setForm] = useState({
        report_date: new Date().toISOString().split('T')[0],
        patient_id: '',
        doctor_id: profile?.id || '',
        diagnosis_ids: [] as string[],
        recipient: '',
        diagnosis_text: '',
        medical_history: '',
        treatment_done: '',
        follow_up_plan: ''
    });

    const [newPatientForm, setNewPatientForm] = useState({ full_name: '', gender: 'Male', date_of_birth: '', email: '' });
    const [newDiagnosisForm, setNewDiagnosisForm] = useState({ label: '', code: '' });

    /* Resources */
    const [patients, setPatients] = useState<Patient[]>([]);
    const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);

    useEffect(() => {
        if (profile?.branch_id) {
            loadAll();
            fetchBranchDetails();
        } else {
            setLoading(false);
        }
    }, [profile?.branch_id]);

    async function fetchBranchDetails() {
        const { data } = await supabase.from('branches').select('*').eq('id', profile?.branch_id).maybeSingle();
        setBranch(data);
    }

    async function loadAll() {
        setLoading(true);
        try {
            const [sumRes, patRes, diaRes] = await Promise.all([
                supabase.from('discharge_summaries').select('*, patient:patients(full_name, patient_number, gender, date_of_birth), doctor:users(full_name, specialization, qualifications, signature_url), diagnosis:diagnoses(name)').eq('branch_id', profile?.branch_id).order('created_at', { ascending: false }),
                supabase.from('patients').select('id, full_name, patient_number, gender, date_of_birth').eq('branch_id', profile?.branch_id),
                supabase.from('diagnoses').select('id, name, icd10_code').eq('branch_id', profile?.branch_id)
            ]);

            setSummaries(sumRes.data || []);
            setPatients(patRes.data || []);
            setDiagnoses(diaRes.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const resetForm = () => {
        setForm({
            report_date: new Date().toISOString().split('T')[0],
            patient_id: '',
            doctor_id: profile?.id || '',
            diagnosis_ids: [],
            recipient: '',
            diagnosis_text: '',
            medical_history: '',
            treatment_done: '',
            follow_up_plan: ''
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
                const { patient, doctor, diagnosis, created_at, updated_at, id, ...cleanDoc } = selectedDoc;
                const updateData = { ...cleanDoc, ...form, branch_id: profile?.branch_id };
                const { error } = await supabase.from('discharge_summaries').update(updateData).eq('id', selectedDoc.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('discharge_summaries').insert([payload]);
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
        if (!confirm('Are you sure you want to delete this summary?')) return;
        const { error } = await supabase.from('discharge_summaries').delete().eq('id', id);
        if (error) alert(error.message);
        else loadAll();
    }

    async function handleCreatePatient(e: React.FormEvent) {
        e.preventDefault();
        const pNum = `P-${Date.now().toString().slice(-6)}`;
        const { data, error } = await supabase.from('patients').insert([{
            ...newPatientForm,
            patient_number: pNum,
            branch_id: profile?.branch_id
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
                type="discharge"
                data={selectedDoc}
                branch={branch}
                allDiagnoses={diagnoses}
                onBack={() => setViewMode('table')}
                onEdit={() => {
                    const { patient, doctor, diagnosis, created_at, updated_at, id, ...formData } = selectedDoc;
                    setForm({
                        ...formData,
                        diagnosis_ids: formData.diagnosis_ids || []
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
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Discharge Summaries</h1>
                    <p className="text-sm text-gray-500">Manage and generate professional discharge documents</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add New Summary
                </button>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-[11px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100 dark:border-gray-700">
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Patient</th>
                                <th className="px-6 py-4">Diagnosis</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {loading ? (
                                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">Loading summaries...</td></tr>
                            ) : summaries.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">No discharge summaries found.</td></tr>
                            ) : summaries.map(s => (
                                <tr key={s.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition group">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{new Date(s.report_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">{s.patient?.full_name}</span>
                                            <span className="text-[10px] text-gray-400">{s.patient?.patient_number}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                                        {s.diagnosis?.name || s.diagnosis_text || 'General Summary'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">Dr. {s.doctor?.full_name}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                            <button onClick={() => { setSelectedDoc(s); setViewMode('detailed'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="View Detail"><Eye className="w-4 h-4" /></button>
                                            <button onClick={() => {
                                                setSelectedDoc(s);
                                                const { patient, doctor, diagnosis, created_at, updated_at, id, ...formData } = s;
                                                setForm({
                                                    ...formData,
                                                    diagnosis_ids: formData.diagnosis_ids || []
                                                } as any);
                                                setShowModal(true);
                                            }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => handleDelete(s.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200 uppercase-inputs">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" /> {selectedDoc ? 'Edit' : 'Add'} Discharge Summary
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className={labelCls}>Date</label>
                                    <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>TO</label>
                                    <input type="text" placeholder="e.g. WHOM IT MAY CONCERN" value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} className={inputCls} />
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
                                <SearchDropdown
                                    label="Diagnosis(es)"
                                    placeholder="Select ICD-10 Diagnosis..."
                                    items={diagnoses}
                                    multiSelect={true}
                                    selectedIds={form.diagnosis_ids}
                                    onSelectMultiple={(ids: string[]) => setForm({ ...form, diagnosis_ids: ids })}
                                    displayFn={(d: any) => d.name + (d.icd10_code ? ` (${d.icd10_code})` : '')}
                                    onAddNew={() => setShowDiagnosisModal(true)}
                                    addNewLabel="Add New Diagnosis"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label className={labelCls}>Diagnosis Text (Optional)</label>
                                    <textarea rows={3} value={form.diagnosis_text} onChange={e => setForm({ ...form, diagnosis_text: e.target.value })} className={inputCls} placeholder="Specific diagnosis details..." />
                                </div>
                                <div>
                                    <label className={labelCls}>Medical History</label>
                                    <textarea rows={3} value={form.medical_history} onChange={e => setForm({ ...form, medical_history: e.target.value })} className={inputCls} placeholder="Patient's medical history..." />
                                </div>
                                <div>
                                    <label className={labelCls}>Treatment Done</label>
                                    <textarea rows={3} value={form.treatment_done} onChange={e => setForm({ ...form, treatment_done: e.target.value })} className={inputCls} placeholder="Summary of treatment..." />
                                </div>
                                <div>
                                    <label className={labelCls}>Follow-up Plan</label>
                                    <textarea rows={3} value={form.follow_up_plan} onChange={e => setForm({ ...form, follow_up_plan: e.target.value })} className={inputCls} placeholder="Next steps for the patient..." />
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
        </div>
    );
}
