import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { SearchDropdown } from '../components/SearchDropdown';
import { Plus, Search, Microscope, Pencil, Trash2, X, Activity, FlaskConical, Filter, Eye } from 'lucide-react';

interface Patient { id: string; full_name: string; patient_number: string; }
interface HistologyType { id: string; name: string; value: string; }

interface LabResult {
    id: string;
    patient_id: string;
    doctor_id: string;
    branch_id: string;
    fbc_date: string;
    hb: string;
    wbc: string;
    platelets: string;
    neutro: string;
    electrolytes_date: string;
    na: string;
    k: string;
    urea: string;
    creatinine: string;
    psa_date: string;
    psa_value: string;
    testo_date: string;
    testo_value: string;
    urine_culture_date: string;
    isolate: string;
    sensitivity: string;
    histology_date: string;
    histology_type_id: string;
    histology_value: string;
    imaging_date: string;
    imaging_type: string;
    imaging_description: string;
    other_test_date: string;
    other_test_name: string;
    other_test_result: string;
    created_at: string;
    patient?: { full_name: string; patient_number: string; };
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
    return (
        <div className="flex items-center gap-2 text-sm font-bold text-teal-700 dark:text-teal-400 uppercase tracking-widest border-b border-teal-100 dark:border-teal-900/50 pb-2 mt-6 mb-4">
            <Icon className="w-4 h-4" />
            {title}
        </div>
    );
}

const emptyForm = {
    patient_id: '',
    fbc_date: '', hb: '', wbc: '', platelets: '', neutro: '',
    electrolytes_date: '', na: '', k: '', urea: '', creatinine: '',
    psa_date: '', psa_value: '', testo_date: '', testo_value: '',
    urine_culture_date: '', isolate: '', sensitivity: '',
    histology_date: '', histology_type_id: '', histology_value: '',
    imaging_date: '', imaging_type: '', imaging_description: '',
    other_test_date: '', other_test_name: '', other_test_result: ''
};

export default function LabResults() {
    const { profile } = useAuth();
    const [results, setResults] = useState<LabResult[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [histologyTypes, setHistologyTypes] = useState<HistologyType[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showHistologyModal, setShowHistologyModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState({ ...emptyForm });
    const [newHistologyForm, setNewHistologyForm] = useState({ name: '', value: '' });
    const [newPatientForm, setNewPatientForm] = useState({ full_name: '', email: '', gender: 'male', date_of_birth: '' });

    useEffect(() => {
        if (profile?.branch_id) loadAll();
    }, [profile?.branch_id]);

    async function loadAll() {
        setLoading(true);
        try {
            const [resData, patData, histData] = await Promise.all([
                supabase.from('lab_results').select('*, patient:patients(full_name, patient_number)').eq('branch_id', profile?.branch_id).order('created_at', { ascending: false }),
                supabase.from('patients').select('id, full_name, patient_number').eq('branch_id', profile?.branch_id),
                supabase.from('histology_types').select('id, name, value').eq('branch_id', profile?.branch_id).order('name')
            ]);
            setResults(resData.data || []);
            setPatients(patData.data || []);
            setHistologyTypes(histData.data || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    function openAdd() { setForm({ ...emptyForm }); setSelectedResult(null); setShowModal(true); }

    function openEdit(r: LabResult) {
        const { patient, created_at, id, doctor_id, branch_id, ...rest } = r;
        setForm({ ...emptyForm, ...rest });
        setSelectedResult(r);
        setShowModal(true);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form.patient_id) return alert('Please select a patient');
        const payload = { ...form, doctor_id: profile?.id, branch_id: profile?.branch_id };
        try {
            if (selectedResult) {
                const { error } = await supabase.from('lab_results').update(payload).eq('id', selectedResult.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('lab_results').insert([payload]);
                if (error) throw error;
            }
            setShowModal(false);
            loadAll();
        } catch (err: any) { alert(err.message); }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this record?')) return;
        const { error } = await supabase.from('lab_results').delete().eq('id', id);
        if (error) alert(error.message);
        else loadAll();
    }

    async function handleAddHistologyType(e: React.FormEvent) {
        e.preventDefault();
        if (!profile?.branch_id) return;
        const { data, error } = await supabase.from('histology_types').insert([{ ...newHistologyForm, branch_id: profile.branch_id }]).select().single();
        if (error) { alert(error.message); return; }
        setHistologyTypes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setForm(prev => ({ ...prev, histology_type_id: data.id, histology_value: data.value || '' }));
        setShowHistologyModal(false);
        setNewHistologyForm({ name: '', value: '' });
    }

    async function handleAddPatient(e: React.FormEvent) {
        e.preventDefault();
        if (!profile?.branch_id) return;
        const patient_number = `P${Date.now().toString().slice(-6)}`;
        const { data, error } = await supabase.from('patients').insert([{ ...newPatientForm, patient_number, branch_id: profile.branch_id, status: 'active' }]).select().single();
        if (error) { alert(error.message); return; }
        setPatients(prev => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
        setForm(prev => ({ ...prev, patient_id: data.id }));
        setShowPatientModal(false);
        setNewPatientForm({ full_name: '', email: '', gender: 'male', date_of_birth: '' });
    }

    const f = (field: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm(prev => ({ ...prev, [field]: e.target.value }));

    const filtered = results.filter(r =>
        r.patient?.full_name.toLowerCase().includes(search.toLowerCase()) ||
        r.patient?.patient_number.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Microscope className="w-8 h-8 text-teal-600" /> Lab Results
                    </h1>
                    <p className="text-sm text-gray-500">Record and manage clinical laboratory data</p>
                </div>
                <button onClick={openAdd} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition flex items-center gap-2 shadow-md font-semibold">
                    <Plus className="w-5 h-5" /> Add Lab Results
                </button>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input type="text" placeholder="Search by patient..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 bg-gray-50 dark:bg-gray-900 outline-none" />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">#</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Patient</th>
                                <th className="px-6 py-4 text-left font-bold border-b border-gray-200 dark:border-gray-700">Date Recorded</th>
                                <th className="px-6 py-4 text-center font-bold border-b border-gray-200 dark:border-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-10 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600 mx-auto" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-500">No lab results found.</td></tr>
                            ) : filtered.map((r, idx) => (
                                <tr key={r.id} className="hover:bg-teal-50/30 dark:hover:bg-teal-900/10 transition-colors">
                                    <td className="px-6 py-4 text-gray-400 font-mono text-xs">{idx + 1}</td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900 dark:text-white">{r.patient?.full_name}</div>
                                        <div className="text-xs text-gray-500">{r.patient?.patient_number}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button onClick={() => openEdit(r)} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-100 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 rounded-lg text-xs font-bold hover:bg-teal-200 transition"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                                            <button onClick={() => handleDelete(r.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 transition"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
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
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center px-8 py-5 border-b border-gray-100 dark:border-gray-700 rounded-t-2xl flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FlaskConical className="w-6 h-6 text-teal-600" />
                                {selectedResult ? 'Edit Lab Results' : 'Add Lab Results'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="w-6 h-6" /></button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 overflow-y-auto space-y-2">
                            {/* Patient */}
                            <div>
                                <label className={labelCls}>Patient *</label>
                                <SearchDropdown
                                    label=""
                                    placeholder="Search Patient by Name or ID..."
                                    items={patients.map(p => ({ id: p.id, label: `${p.full_name} (${p.patient_number})` }))}
                                    selectedId={form.patient_id}
                                    onSelect={(id) => setForm(prev => ({ ...prev, patient_id: id }))}
                                    onAddNew={() => setShowPatientModal(true)}
                                    addNewLabel="Add New Patient"
                                />
                            </div>

                            {/* FULL BLOOD COUNT */}
                            <SectionHeader icon={Activity} title="Full Blood Count" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Date Done</label><input type="date" value={form.fbc_date} onChange={f('fbc_date')} className={inputCls} /></div>
                                <div><label className={labelCls}>Hemoglobin (Hb)</label><input type="text" value={form.hb} onChange={f('hb')} className={inputCls} placeholder="e.g. 14.5 g/dL" /></div>
                                <div><label className={labelCls}>WBC</label><input type="text" value={form.wbc} onChange={f('wbc')} className={inputCls} placeholder="e.g. 7.5 x10³/µL" /></div>
                                <div><label className={labelCls}>Platelets</label><input type="text" value={form.platelets} onChange={f('platelets')} className={inputCls} placeholder="e.g. 250 x10³/µL" /></div>
                                <div><label className={labelCls}>Neutrophils (Neutro)</label><input type="text" value={form.neutro} onChange={f('neutro')} className={inputCls} placeholder="e.g. 65%" /></div>
                            </div>

                            {/* ELECTROLYTES */}
                            <SectionHeader icon={FlaskConical} title="Electrolytes" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Date Done</label><input type="date" value={form.electrolytes_date} onChange={f('electrolytes_date')} className={inputCls} /></div>
                                <div><label className={labelCls}>Sodium (Na)</label><input type="text" value={form.na} onChange={f('na')} className={inputCls} placeholder="e.g. 140 mmol/L" /></div>
                                <div><label className={labelCls}>Potassium (K)</label><input type="text" value={form.k} onChange={f('k')} className={inputCls} placeholder="e.g. 4.0 mmol/L" /></div>
                                <div><label className={labelCls}>Urea</label><input type="text" value={form.urea} onChange={f('urea')} className={inputCls} placeholder="e.g. 5.5 mmol/L" /></div>
                                <div><label className={labelCls}>Creatinine</label><input type="text" value={form.creatinine} onChange={f('creatinine')} className={inputCls} placeholder="e.g. 85 µmol/L" /></div>
                            </div>

                            {/* OTHER TESTS - PSA / TESTO */}
                            <SectionHeader icon={Filter} title="Other Tests" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className={labelCls}>PSA Date Done</label><input type="date" value={form.psa_date} onChange={f('psa_date')} className={inputCls} /></div>
                                <div><label className={labelCls}>PSA</label><input type="text" value={form.psa_value} onChange={f('psa_value')} className={inputCls} placeholder="e.g. 1.2 ng/mL" /></div>
                                <div><label className={labelCls}>Testosterone Date Done</label><input type="date" value={form.testo_date} onChange={f('testo_date')} className={inputCls} /></div>
                                <div><label className={labelCls}>Testosterone</label><input type="text" value={form.testo_value} onChange={f('testo_value')} className={inputCls} placeholder="e.g. 15.5 nmol/L" /></div>
                            </div>

                            {/* URINE CULTURE */}
                            <SectionHeader icon={FlaskConical} title="Urine Culture" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Date Done</label><input type="date" value={form.urine_culture_date} onChange={f('urine_culture_date')} className={inputCls} /></div>
                                <div><label className={labelCls}>Isolate</label><input type="text" value={form.isolate} onChange={f('isolate')} className={inputCls} placeholder="e.g. E. coli" /></div>
                                <div className="col-span-2"><label className={labelCls}>Sensitivity</label><input type="text" value={form.sensitivity} onChange={f('sensitivity')} className={inputCls} placeholder="e.g. Sensitive to Amoxicillin" /></div>
                            </div>

                            {/* HISTOLOGY */}
                            <SectionHeader icon={Microscope} title="Histology" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Date Done</label><input type="date" value={form.histology_date} onChange={f('histology_date')} className={inputCls} /></div>
                                <div>
                                    <label className={labelCls}>Histology Type</label>
                                    <SearchDropdown
                                        label=""
                                        placeholder="Select histology type..."
                                        items={histologyTypes.map(h => ({ id: h.id, label: h.name }))}
                                        selectedId={form.histology_type_id}
                                        onSelect={(id) => {
                                            const ht = histologyTypes.find(h => h.id === id);
                                            setForm(prev => ({ ...prev, histology_type_id: id, histology_value: ht?.value || '' }));
                                        }}
                                        onAddNew={() => setShowHistologyModal(true)}
                                        addNewLabel="Add New Histology Type"
                                    />
                                </div>
                                <div className="col-span-2"><label className={labelCls}>Value / Result</label><input type="text" value={form.histology_value} onChange={f('histology_value')} className={inputCls} placeholder="Override or enter result..." /></div>
                            </div>

                            {/* IMAGING */}
                            <SectionHeader icon={Eye} title="Imaging" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Date Done</label><input type="date" value={form.imaging_date} onChange={f('imaging_date')} className={inputCls} /></div>
                                <div>
                                    <label className={labelCls}>Imaging Type</label>
                                    <select value={form.imaging_type} onChange={f('imaging_type')} className={inputCls}>
                                        <option value="">Select Type</option>
                                        <option value="CT">CT</option>
                                        <option value="MRI">MRI</option>
                                        <option value="X-RAY">X-RAY</option>
                                        <option value="ULTRASOUND">ULTRASOUND</option>
                                        <option value="PET SCAN">PET SCAN</option>
                                        <option value="MAMMOGRAM">MAMMOGRAM</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className={labelCls}>Description</label>
                                    <textarea rows={4} value={form.imaging_description} onChange={f('imaging_description')} className={`${inputCls} resize-none`} placeholder="Enter imaging findings..." />
                                </div>
                            </div>

                            {/* OTHER TESTS */}
                            <SectionHeader icon={Plus} title="Other Tests" />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Date Done</label><input type="date" value={form.other_test_date} onChange={f('other_test_date')} className={inputCls} /></div>
                                <div><label className={labelCls}>Test Name</label><input type="text" value={form.other_test_name} onChange={f('other_test_name')} className={inputCls} placeholder="e.g. HbA1c" /></div>
                                <div className="col-span-2"><label className={labelCls}>Result</label><input type="text" value={form.other_test_result} onChange={f('other_test_result')} className={inputCls} placeholder="Enter result..." /></div>
                            </div>

                            <div className="flex gap-4 mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 px-4 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancel</button>
                                <button type="submit" className="flex-1 py-3 px-4 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition shadow-lg">Save Lab Results</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Inline Add Patient Modal */}
            {showPatientModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-900 dark:text-white">Add New Patient</h3>
                            <button type="button" onClick={() => setShowPatientModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddPatient} className="p-6 space-y-4">
                            <div><label className={labelCls}>Full Name *</label><input required value={newPatientForm.full_name} onChange={e => setNewPatientForm(p => ({ ...p, full_name: e.target.value }))} className={inputCls} placeholder="e.g. John Doe" autoFocus /></div>
                            <div><label className={labelCls}>Email</label><input type="email" value={newPatientForm.email} onChange={e => setNewPatientForm(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="e.g. john@example.com" /></div>
                            <div>
                                <label className={labelCls}>Gender *</label>
                                <select value={newPatientForm.gender} onChange={e => setNewPatientForm(p => ({ ...p, gender: e.target.value }))} className={inputCls}>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div><label className={labelCls}>Date of Birth</label><input type="date" value={newPatientForm.date_of_birth} onChange={e => setNewPatientForm(p => ({ ...p, date_of_birth: e.target.value }))} className={inputCls} /></div>
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowPatientModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition">Add Patient</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Inline Add Histology Type Modal */}
            {showHistologyModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="font-bold text-gray-900 dark:text-white">Add Histology Type</h3>
                            <button type="button" onClick={() => setShowHistologyModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleAddHistologyType} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Name *</label>
                                <input required value={newHistologyForm.name} onChange={e => setNewHistologyForm(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="e.g. Prostate Biopsy" autoFocus />
                            </div>
                            <div>
                                <label className={labelCls}>Value / Description</label>
                                <textarea value={newHistologyForm.value} onChange={e => setNewHistologyForm(p => ({ ...p, value: e.target.value }))} className={`${inputCls} h-20 resize-none`} placeholder="Associated value or description..." />
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowHistologyModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                                <button type="submit" className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-bold hover:bg-teal-700 transition">Add</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
