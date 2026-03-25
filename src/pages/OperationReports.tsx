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
interface Procedure {
    id: string;
    name: string;
    description?: string;
}

interface OperationReport {
    id: string;
    report_date: string;
    hospital_id?: string;
    anaesthetist_ids?: string[];
    assistant_ids?: string[];
    anaesthesia_type: string;
    description: string;
    post_op_plan: string;
    follow_up_date: string;
    follow_up_time: string;
    remarks: string;
    doctor_id: string; // Doctor
    procedure_id?: string;
    patient: {
        full_name: string;
        patient_number: string;
        gender: string;
        date_of_birth: string;
    };
    doctor: Doctor; // Doctor
    procedure?: Procedure;
    hospital?: { name: string };
    created_at?: string;
    updated_at?: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5";

export default function OperationReports() {
    const { profile } = useAuth();
    const [reports, setReports] = useState<OperationReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [selectedDoc, setSelectedDoc] = useState<OperationReport | null>(null);
    const [branch, setBranch] = useState<any>(null);

    /* Form State */
    const [form, setForm] = useState({
        report_date: new Date().toISOString().split('T')[0],
        hospital_id: '',
        anaesthetist_ids: [] as string[],
        assistant_ids: [] as string[],
        anaesthesia_type: 'General',
        procedure_id: '',
        description: '',
        post_op_plan: '',
        follow_up_date: '',
        follow_up_time: '',
        remarks: '',
        patient_id: '',
        doctor_id: profile?.id || ''
    });

    const [newPatientForm, setNewPatientForm] = useState({ full_name: '', gender: 'Male', date_of_birth: '', email: '' });
    const [newHospitalForm, setNewHospitalForm] = useState({ name: '', address: '' });
    const [newAnaesthetistForm, setNewAnaesthetistForm] = useState({ full_name: '', specialization: '' });
    const [newAssistantForm, setNewAssistantForm] = useState({ full_name: '', role: '' });
    const [newProcedureForm, setNewProcedureForm] = useState({ name: '', description: '' });

    const [showHospitalModal, setShowHospitalModal] = useState(false);
    const [showAnaesthetistModal, setShowAnaesthetistModal] = useState(false);
    const [showAssistantModal, setShowAssistantModal] = useState(false);
    const [showProcedureModal, setShowProcedureModal] = useState(false);

    /* Resources */
    const [patients, setPatients] = useState<Patient[]>([]);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [hospitals, setHospitals] = useState<any[]>([]);
    const [procedures, setProcedures] = useState<Procedure[]>([]);
    const [anaesthetists, setAnaesthetists] = useState<any[]>([]);
    const [assistants, setAssistants] = useState<any[]>([]);

    useEffect(() => {
        if (profile?.branch_id) {
            loadAll();
            fetchBranchDetails();
        } else {
            setLoading(false);
        }
    }, [profile?.branch_id]);

    async function fetchBranchDetails() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('branches').select('*').eq('id', profile?.branch_id).maybeSingle();
        setBranch(data);
    }

    async function loadAll() {
        if (!profile?.branch_id) return;
        setLoading(true);
        try {
            const [forRes, patRes, hospRes, anaRes, astRes, docRes, prcRes] = await Promise.all([
                supabase.from('operation_reports').select('*, patient:patients(full_name, patient_number, gender, date_of_birth), doctor:users(full_name, specialization, qualifications, signature_url), procedure:surgical_procedures(name), hospital:hospitals(name)').eq('branch_id', profile?.branch_id).order('created_at', { ascending: false }),
                supabase.from('patients').select('id, full_name, patient_number, gender, date_of_birth').eq('branch_id', profile?.branch_id),
                supabase.from('hospitals').select('*').eq('branch_id', profile?.branch_id).order('name'),
                supabase.from('anaesthetists').select('*').eq('branch_id', profile?.branch_id).order('full_name'),
                supabase.from('assistants').select('*').eq('branch_id', profile?.branch_id).order('full_name'),
                supabase.from('users').select('id, full_name, specialization, qualifications').eq('role', 'doctor').eq('is_active', true).order('full_name'),
                supabase.from('surgical_procedures').select('*').eq('branch_id', profile?.branch_id).order('name')
            ]);

            setReports(forRes.data || []);
            setPatients(patRes.data || []);
            setHospitals(hospRes.data || []);
            setAnaesthetists(anaRes.data || []);
            setAssistants(astRes.data || []);
            setDoctors(docRes.data || []);
            setProcedures(prcRes.data || []);
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
            anaesthetist_ids: [],
            assistant_ids: [],
            anaesthesia_type: 'General',
            procedure_id: '',
            description: '',
            post_op_plan: '',
            follow_up_date: '',
            follow_up_time: '',
            remarks: '',
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
                const { patient, doctor, hospital, procedure, created_at, updated_at, id, ...cleanDoc } = selectedDoc as any;
                const updateData = { ...cleanDoc, ...form, branch_id: profile?.branch_id };
                const { error } = await supabase.from('operation_reports').update(updateData).eq('id', selectedDoc.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('operation_reports').insert([payload]);
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
        if (!confirm('Are you sure you want to delete this operation report?')) return;
        const { error } = await supabase.from('operation_reports').delete().eq('id', id);
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

    async function handleCreateAnaesthetist(e: React.FormEvent) {
        e.preventDefault();
        const { data, error } = await supabase.from('anaesthetists').insert([{ ...newAnaesthetistForm, branch_id: profile?.branch_id }]).select().single();
        if (error) alert(error.message);
        else {
            setAnaesthetists(prev => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
            setForm(prev => ({ ...prev, anaesthetist_ids: [...prev.anaesthetist_ids, data.id] }));
            setShowAnaesthetistModal(false);
            setNewAnaesthetistForm({ full_name: '', specialization: '' });
        }
    }

    async function handleCreateAssistant(e: React.FormEvent) {
        e.preventDefault();
        const { data, error } = await supabase.from('assistants').insert([{ ...newAssistantForm, branch_id: profile?.branch_id }]).select().single();
        if (error) alert(error.message);
        else {
            setAssistants(prev => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
            setForm(prev => ({ ...prev, assistant_ids: [...prev.assistant_ids, data.id] }));
            setShowAssistantModal(false);
            setNewAssistantForm({ full_name: '', role: '' });
        }
    }

    async function handleAddProcedure(e: React.FormEvent) {
        e.preventDefault();
        if (!profile?.branch_id) return;
        const { data, error } = await supabase.from('surgical_procedures').insert([{ ...newProcedureForm, branch_id: profile.branch_id }]).select().single();
        if (error) { alert(error.message); return; }
        setProcedures(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setForm(prev => ({ ...prev, procedure_id: data.id }));
        setShowProcedureModal(false);
        setNewProcedureForm({ name: '', description: '' });
    }

    if (viewMode === 'detailed' && selectedDoc && branch) {
        return (
            <ClinicalDocumentPrintView
                type="operation"
                data={selectedDoc}
                branch={branch}
                allAnaesthetists={anaesthetists}
                allAssistants={assistants}
                onBack={() => setViewMode('table')}
                onEdit={() => {
                    const { patient, doctor, hospital, procedure, anaesthetist_ids, assistant_ids, created_at, updated_at, id, ...formData } = selectedDoc as any;
                    setForm({
                        ...formData,
                        anaesthetist_ids: anaesthetist_ids || [],
                        assistant_ids: assistant_ids || []
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
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Operation Reports</h1>
                    <p className="text-sm text-gray-500">Document and manage surgical procedure details</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add New Report
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
                                <th className="px-6 py-4">Procedure</th>
                                <th className="px-6 py-4">Hospital</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Loading reports...</td></tr>
                            ) : reports.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">No operation reports found.</td></tr>
                            ) : reports.map(r => (
                                <tr key={r.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition group">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{new Date(r.report_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">{r.patient?.full_name}</span>
                                            <span className="text-[10px] text-gray-400">{r.patient?.patient_number}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-indigo-600 dark:text-indigo-400">{r.procedure?.name || 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{r.hospital?.name || 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 font-medium">Dr. {r.doctor?.full_name}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
                                            <button onClick={() => { setSelectedDoc(r); setViewMode('detailed'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="View Detail"><Eye className="w-4 h-4" /></button>
                                            <button onClick={() => {
                                                setSelectedDoc(r);
                                                const { patient, doctor, hospital, procedure, created_at, updated_at, id, ...formData } = r as any;
                                                setForm({
                                                    ...formData,
                                                    anaesthetist_ids: formData.anaesthetist_ids || [],
                                                    assistant_ids: formData.assistant_ids || []
                                                } as any);
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
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200 uppercase-inputs max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" /> {selectedDoc ? 'Edit' : 'Create'} Operation Report
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 overflow-y-auto">
                            <div className="space-y-4 mb-6">
                                <SearchDropdown
                                    label="Patient"
                                    placeholder="Search Patient Name / ID..."
                                    items={patients}
                                    selectedId={form.patient_id}
                                    onSelect={(id: string) => setForm({ ...form, patient_id: id })}
                                    displayFn={(p: any) => `${p.full_name} (${p.patient_number})`}
                                    onAddNew={() => setShowPatientModal(true)}
                                    addNewLabel="Add New Patient"
                                />

                                <SearchDropdown
                                    label="Doctor"
                                    placeholder="Search Doctor Name / ID..."
                                    items={doctors}
                                    selectedId={form.doctor_id}
                                    onSelect={(id: string) => setForm({ ...form, doctor_id: id })}
                                    displayFn={(d: any) => `Dr. ${d.full_name}${d.specialization ? ` (${d.specialization})` : ''}`}
                                />

                                <div>
                                    <label className={labelCls}>Date Of Operation</label>
                                    <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} className={inputCls} />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <SearchDropdown
                                        label="Hospital"
                                        placeholder="Select Hospital..."
                                        items={hospitals}
                                        selectedId={form.hospital_id}
                                        onSelect={(id: string) => setForm({ ...form, hospital_id: id })}
                                        displayFn={(h: any) => h.name}
                                        onAddNew={() => setShowHospitalModal(true)}
                                        addNewLabel="Add New Hospital"
                                    />
                                    <SearchDropdown
                                        label="Anaesthetist"
                                        placeholder="Search Anaesthetists..."
                                        items={anaesthetists}
                                        multiSelect={true}
                                        selectedIds={form.anaesthetist_ids}
                                        onSelectMultiple={(ids) => setForm({ ...form, anaesthetist_ids: ids })}
                                        displayFn={(a: any) => a.full_name}
                                        onAddNew={() => setShowAnaesthetistModal(true)}
                                        addNewLabel="Add New Anaesthetist"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <SearchDropdown
                                        label="Assistant"
                                        placeholder="Search Assistants..."
                                        items={assistants}
                                        multiSelect={true}
                                        selectedIds={form.assistant_ids}
                                        onSelectMultiple={(ids) => setForm({ ...form, assistant_ids: ids })}
                                        displayFn={(a: any) => a.full_name}
                                        onAddNew={() => setShowAssistantModal(true)}
                                        addNewLabel="Add New Assistant"
                                    />
                                    <div>
                                        <label className={labelCls}>Type Of Anaesthesia</label>
                                        <select value={form.anaesthesia_type} onChange={e => setForm({ ...form, anaesthesia_type: e.target.value })} className={inputCls}>
                                            <option value="General">General</option>
                                            <option value="Spinal">Spinal</option>
                                            <option value="Local">Local</option>
                                            <option value="Sedation">Sedation</option>
                                            <option value="Regional Block">Regional Block</option>
                                        </select>
                                    </div>
                                </div>

                                <SearchDropdown
                                    label="Operation Procedure (s)"
                                    placeholder="Search Surgical Procedure..."
                                    items={procedures}
                                    selectedId={form.procedure_id}
                                    onSelect={(id: string) => setForm({ ...form, procedure_id: id })}
                                    displayFn={(p: any) => p.name}
                                    onAddNew={() => setShowProcedureModal(true)}
                                    addNewLabel="Add New Procedure"
                                />

                                <div>
                                    <label className={labelCls}>Description</label>
                                    <textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="Detailed description of the procedure..." />
                                </div>

                                <div>
                                    <label className={labelCls}>Post Operation Plan</label>
                                    <textarea rows={4} value={form.post_op_plan} onChange={e => setForm({ ...form, post_op_plan: e.target.value })} className={inputCls} placeholder="Immediate post-operative instructions..." />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Follow Up Date</label>
                                        <input type="date" value={form.follow_up_date} onChange={e => setForm({ ...form, follow_up_date: e.target.value })} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Follow Up Time</label>
                                        <input type="time" value={form.follow_up_time} onChange={e => setForm({ ...form, follow_up_time: e.target.value })} className={inputCls} />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelCls}>Remarks</label>
                                    <textarea rows={4} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} className={inputCls} placeholder="Any other observations or notes..." />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
                                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" className="px-8 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-lg">Save Report</button>
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

            {/* Add Anaesthetist Modal */}
            {showAnaesthetistModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-600" /> Add New Anaesthetist
                            </h2>
                            <button onClick={() => setShowAnaesthetistModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreateAnaesthetist} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Full Name</label>
                                <input required type="text" placeholder="Dr. John Smith" value={newAnaesthetistForm.full_name} onChange={e => setNewAnaesthetistForm({ ...newAnaesthetistForm, full_name: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Specialization</label>
                                <input type="text" placeholder="Cardiac Anaesthesia" value={newAnaesthetistForm.specialization} onChange={e => setNewAnaesthetistForm({ ...newAnaesthetistForm, specialization: e.target.value })} className={inputCls} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowAnaesthetistModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-md">Save Anaesthetist</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Assistant Modal */}
            {showAssistantModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-600" /> Add New Assistant
                            </h2>
                            <button onClick={() => setShowAssistantModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleCreateAssistant} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Full Name</label>
                                <input required type="text" placeholder="Nurse Sarah Jane" value={newAssistantForm.full_name} onChange={e => setNewAssistantForm({ ...newAssistantForm, full_name: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Role / Designation</label>
                                <input type="text" placeholder="Scrub Nurse" value={newAssistantForm.role} onChange={e => setNewAssistantForm({ ...newAssistantForm, role: e.target.value })} className={inputCls} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowAssistantModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-md">Save Assistant</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Add Procedure Modal */}
            {showProcedureModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-600" /> Add New Procedure
                            </h2>
                            <button onClick={() => setShowProcedureModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleAddProcedure} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Procedure Name</label>
                                <input required type="text" placeholder="e.g. Appendectomy" value={newProcedureForm.name} onChange={e => setNewProcedureForm({ ...newProcedureForm, name: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Description</label>
                                <textarea rows={3} placeholder="Optional details..." value={newProcedureForm.description} onChange={e => setNewProcedureForm({ ...newProcedureForm, description: e.target.value })} className={inputCls} />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowProcedureModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
                                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-md">Save Procedure</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
