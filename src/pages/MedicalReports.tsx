import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, FileText, Pencil, Trash2, X, Eye } from 'lucide-react';
import { MedicalReportPrintView } from '../components/MedicalReportPrintView';
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

interface MedicalReport {
    id: string;
    report_date: string;
    recipient: string;
    content: string;
    status: string;
    patient_id: string;
    doctor_id: string;
    diagnosis_id?: string;
    patient: Patient;
    doctor: Doctor;
    diagnosis?: Diagnosis;
    created_at?: string;
    updated_at?: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5";



export default function MedicalReports() {
    const { profile } = useAuth();
    const [reports, setReports] = useState<MedicalReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [selectedReport, setSelectedReport] = useState<MedicalReport | null>(null);
    const [branch, setBranch] = useState<any>(null);

    /* Form State */
    const [form, setForm] = useState({
        report_date: new Date().toISOString().split('T')[0],
        patient_id: '',
        doctor_id: profile?.id || '',
        diagnosis_id: '',
        recipient: '',
        content: '',
        status: 'active'
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
            const [repRes, patRes, diaRes] = await Promise.all([
                supabase.from('medical_reports').select('*, patient:patients(full_name, patient_number, gender, date_of_birth), doctor:users(full_name, specialization, qualifications, signature_url), diagnosis:diagnoses(name)').eq('branch_id', profile?.branch_id).order('created_at', { ascending: false }),
                supabase.from('patients').select('id, full_name, patient_number, gender, date_of_birth').eq('branch_id', profile?.branch_id),
                supabase.from('diagnoses').select('id, name, icd10_code').eq('branch_id', profile?.branch_id)
            ]);

            setReports(repRes.data || []);
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
            diagnosis_id: '',
            recipient: '',
            content: '',
            status: 'active'
        });
        setSelectedReport(null);
    };

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form.patient_id || !form.content) {
            alert('Please select a patient and enter the report content.');
            return;
        }

        const payload = { ...form, branch_id: profile?.branch_id };

        try {
            if (selectedReport) {
                const { patient, doctor, diagnosis, created_at, updated_at, id, ...cleanForm } = selectedReport;
                // Since this is from 'r', we need to re-merge form fields
                const updateData = { ...cleanForm, ...form, branch_id: profile?.branch_id };
                const { error } = await supabase.from('medical_reports').update(updateData).eq('id', selectedReport.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('medical_reports').insert([payload]);
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
        if (!confirm('Are you sure you want to delete this report?')) return;
        const { error } = await supabase.from('medical_reports').delete().eq('id', id);
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
            setForm(prev => ({ ...prev, diagnosis_id: data.id }));
            setShowDiagnosisModal(false);
            setNewDiagnosisForm({ label: '', code: '' });
        }
    }

    if (viewMode === 'detailed' && selectedReport && branch) {
        return (
            <MedicalReportPrintView
                report={selectedReport}
                branch={branch}
                onBack={() => setViewMode('table')}
                onEdit={() => {
                    const { patient, doctor, diagnosis, created_at, updated_at, id, ...formData } = selectedReport;
                    setForm(formData as any);
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
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Medical Reports</h1>
                    <p className="text-sm text-gray-500">Manage and generate professional reports for patients</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add New Report
                </button>
            </div>

            {/* Reports Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-[11px] uppercase tracking-wider text-gray-500 font-bold border-b border-gray-100 dark:border-gray-700">
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Patient</th>
                                <th className="px-6 py-4">TO (Recipient)</th>
                                <th className="px-6 py-4">Diagnosis</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Loading reports...</td></tr>
                            ) : reports.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">No medical reports found.</td></tr>
                            ) : reports.map(r => (
                                <tr key={r.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition group">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{new Date(r.report_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">{r.patient?.full_name}</span>
                                            <span className="text-[10px] text-gray-400">{r.patient?.patient_number}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 italic">
                                        {r.recipient || <span className="text-gray-300">N/A</span>}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                                        {r.diagnosis?.name || 'General Report'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">Dr. {r.doctor?.full_name}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                            <button onClick={() => { setSelectedReport(r); setViewMode('detailed'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="View Detail"><Eye className="w-4 h-4" /></button>
                                            <button onClick={() => {
                                                setSelectedReport(r);
                                                const { patient, doctor, diagnosis, created_at, updated_at, id, ...formData } = r;
                                                setForm(formData as any);
                                                setShowModal(true);
                                            }} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Edit"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => handleDelete(r.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" /> {selectedReport ? 'Edit' : 'Add'} Medical Report
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label className={labelCls}>Report Date</label>
                                    <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} className={inputCls} />
                                </div>
                                <div>
                                    <label className={labelCls}>TO (Recipient)</label>
                                    <input type="text" placeholder="e.g. WHOM IT MAY CONCERN or Dr. Smith" value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} className={inputCls} />
                                </div>
                                <SearchDropdown
                                    label="Patient"
                                    placeholder="Search Patient..."
                                    items={patients}
                                    selectedId={form.patient_id}
                                    onSelect={(id: string) => setForm({ ...form, patient_id: id })}
                                    displayFn={(p: any) => `${p.full_name} (${p.patient_number})`}
                                    onAddNew={() => setShowPatientModal(true)}
                                    addNewLabel="Add New Patient"
                                />
                                <SearchDropdown
                                    label="Diagnosis & ICD 10 Code"
                                    placeholder="Search Diagnosis..."
                                    items={diagnoses}
                                    selectedId={form.diagnosis_id}
                                    onSelect={(id: string) => setForm({ ...form, diagnosis_id: id })}
                                    displayFn={(d: any) => d.name + (d.icd10_code ? ` (${d.icd10_code})` : '')}
                                    onAddNew={() => setShowDiagnosisModal(true)}
                                    addNewLabel="Add New Diagnosis"
                                />
                            </div>

                            <div className="mb-6">
                                <label className={labelCls}>Medical Report Content</label>
                                <textarea
                                    required
                                    rows={12}
                                    placeholder="Type the clinical findings and medical report here..."
                                    value={form.content}
                                    onChange={e => setForm({ ...form, content: e.target.value })}
                                    className={`${inputCls} font-mono text-xs resize-none`}
                                />
                                <p className="text-[10px] text-gray-400 mt-2 italic">Tip: Use the detailed view (Eye icon) after saving to format for printing.</p>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" className="px-8 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none">Save & Finalize</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                                <input required type="text" placeholder="John Doe" value={newPatientForm.full_name} onChange={e => setNewPatientForm({ ...newPatientForm, full_name: e.target.value })} className={inputCls} />
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
