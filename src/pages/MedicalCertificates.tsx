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
    const [showModal, setShowModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [selectedDoc, setSelectedDoc] = useState<MedicalCertificate | null>(null);
    const [branch, setBranch] = useState<any>(null);

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
            const [forRes, patRes] = await Promise.all([
                supabase.from('medical_certificates').select('*, patient:patients(full_name, patient_number, gender, date_of_birth), doctor:users(full_name, specialization, qualifications, signature_url)').eq('branch_id', profile?.branch_id).order('created_at', { ascending: false }),
                supabase.from('patients').select('id, full_name, patient_number, gender, date_of_birth').eq('branch_id', profile?.branch_id)
            ]);

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

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Medical Certificates</h1>
                    <p className="text-sm text-gray-500">Generate and manage sick leave or fitness documents</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add New Certificate
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
                                <th className="px-6 py-4">Period</th>
                                <th className="px-6 py-4">Resume Date</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Loading certificates...</td></tr>
                            ) : certs.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">No medical certificates found.</td></tr>
                            ) : certs.map(c => (
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
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
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
        </div>
    );
}
