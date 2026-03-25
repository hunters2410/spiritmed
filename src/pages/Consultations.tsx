import { useEffect, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Search, Stethoscope, FileText, ClipboardList,
    Activity, Receipt, Pill, X, ChevronDown,
    History, FlaskConical, Microscope, Cigarette, Wine, HeartPulse, Syringe,
    Eye, Pencil, Trash2, Printer, Download, ChevronLeft, ChevronRight, Filter
} from 'lucide-react';
import { ConsultationPrintView } from '../components/ConsultationPrintView';

/* ─── interfaces ─────────────────────────────────────────── */
interface VitalSigns {
    temperature: number;
    blood_pressure_systolic: number;
    blood_pressure_diastolic: number;
    pulse_rate: number;
    recorded_at: string;
}

interface Patient {
    full_name: string;
    patient_number: string;
}

interface Doctor {
    full_name: string;
}

interface PrescriptionItem {
    medicine_name: string;
    dosage: string;
    period: string;
    duration: string;
    instructions: string;
}

interface Consultation {
    id: string; patient_id: string; doctor_id: string;
    chief_complaint: string; medical_history: string;
    physical_examination: string; diagnosis: string;
    treatment_plan: string; notes: string; status: string;
    prescriptions?: PrescriptionItem[];
    created_at: string; investigations?: string;
    referred_by?: string; follow_up_period?: string;
    follow_up_time?: string; follow_up_date?: string;
    patient: Patient;
    doctor: Doctor;
}

interface Prescription {
    medicine_id: string;
    period: string;
    time_unit: string;
    advice: string;
}

/* ─── style constants ──────────────────────────────────── */
const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";
const sectionTitle = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

/* ─── helper: dropdown with "Add New" ────────────────────── */
interface SearchDropdownProps {
    label: string;
    placeholder: string;
    items: { id: string; label: string }[];
    selected: string[];           // ids of selected items (for multi)
    singleValue?: string;         // for single-select (patient / referred-by)
    multi?: boolean;
    onSelect: (id: string, label: string) => void;
    onClearSingle?: () => void;
    onRemove?: (id: string) => void;
    onAddNew?: () => void; // Made optional
    tagColor?: string;
}

function SearchDropdown({
    label, placeholder, items, selected, singleValue,
    multi, onSelect, onClearSingle, onRemove, onAddNew, tagColor = 'blue'
}: SearchDropdownProps) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // close on outside click
    useEffect(() => {
        const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', fn);
        return () => document.removeEventListener('mousedown', fn);
    }, []);

    const filtered = items.filter(i =>
        i.label.toLowerCase().includes(q.toLowerCase()) && !selected.includes(i.id)
    );

    const tag = tagColor === 'blue'
        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
        : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300';

    return (
        <div ref={ref} className="relative">
            <label className={sectionTitle}>{label}</label>

            {/* input */}
            <div className="relative">
                <input
                    type="text"
                    placeholder={singleValue ? singleValue : placeholder}
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    className={`${inputCls} ${singleValue ? 'text-gray-400 placeholder-gray-700 dark:placeholder-gray-200' : ''}`}
                    readOnly={!!singleValue}
                />
                {singleValue && onClearSingle && (
                    <button type="button" onClick={onClearSingle}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-rose-500">
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* dropdown */}
            {open && (
                <div className="absolute z-30 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl mt-1 max-h-52 overflow-y-auto">
                    {onAddNew && (
                        <button type="button" onMouseDown={onAddNew}
                            className="w-full text-left px-4 py-2 text-sm text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 flex items-center gap-1">
                            <Plus className="w-3.5 h-3.5" /> Add New {label}
                        </button>
                    )}
                    {filtered.length === 0 && q && (
                        <p className="px-4 py-2 text-xs text-gray-400 italic">No results found</p>
                    )}
                    {filtered.map(i => (
                        <button key={i.id} type="button"
                            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200"
                            onMouseDown={() => { onSelect(i.id, i.label); setQ(''); if (!multi) setOpen(false); }}>
                            {i.label}
                        </button>
                    ))}
                </div>
            )}

            {/* multi-select tags */}
            {multi && selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {selected.map(id => {
                        const item = items.find(i => i.id === id);
                        return item ? (
                            <span key={id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tag}`}>
                                {item.label}
                                <button type="button" onClick={() => onRemove?.(id)}><X className="w-3 h-3" /></button>
                            </span>
                        ) : null;
                    })}
                </div>
            )}
        </div>
    );
}

/* ─── Quick-Add Modal helper ─────────────────────────────── */
interface QuickModalProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}
function QuickModal({ title, onClose, children }: QuickModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export function Consultations() {
    const { profile } = useAuth();

    /* list state */
    const [consultations, setConsultations] = useState<Consultation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    /* dropdown data */
    const [patients, setPatients] = useState<{ id: string; label: string }[]>([]);
    const [doctors, setDoctors] = useState<{ id: string; label: string }[]>([]);
    const [complaints, setComplaints] = useState<{ id: string; label: string }[]>([]);
    const [investigations, setInvestigations] = useState<{ id: string; label: string }[]>([]);
    const [diagnoses, setDiagnoses] = useState<{ id: string; label: string }[]>([]);
    const [medicines, setMedicines] = useState<{ id: string; name: string; dosage: string }[]>([]);
    const [frequencies, setFrequencies] = useState<{ id: string; name: string }[]>([]);

    /* selected multi values */
    const [selectedComplaints, setSelectedComplaints] = useState<string[]>([]);
    const [selectedInvestigations, setSelectedInvestigations] = useState<string[]>([]);
    const [selectedDiagnoses, setSelectedDiagnoses] = useState<string[]>([]);

    /* vitals */
    const [latestVitals, setLatestVitals] = useState<VitalSigns | null>(null);

    /* patient history modal */
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyTab, setHistoryTab] = useState<'clinical' | 'vitals' | 'labs' | 'notes' | 'ops'>('clinical');
    const [patientHistory, setPatientHistory] = useState<{
        patient: any;
        vitals: any[];
        labs: any[];
        consultations: any[];
        operations: any[];
    } | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    /* ── Add-New Modals ─── */
    const [showAddPatient, setShowAddPatient] = useState(false);
    const [showAddComplaint, setShowAddComplaint] = useState(false);
    const [showAddInvestigation, setShowAddInvestigation] = useState(false);
    const [showAddDiagnosis, setShowAddDiagnosis] = useState(false);
    const [showAddDoctor, setShowAddDoctor] = useState(false);

    /* quick-add form states */
    const [newPatient, setNewPatient] = useState({ full_name: '', date_of_birth: '', gender: 'male', phone: '', email: '' });
    const [newComplaint, setNewComplaint] = useState('');
    const [newInvestigation, setNewInvestigation] = useState('');
    const [newDiagnosis, setNewDiagnosis] = useState({ name: '', icd10: '' });
    const [newDoctor, setNewDoctor] = useState({ full_name: '', specialization: '', phone: '', email: '' });

    /* main form */
    const [formData, setFormData] = useState({
        patient_id: '', diagnosis: '', physical_examination: '',
        treatment_plan: '', notes: '', status: 'completed',
        referred_by: '', follow_up_period: '', follow_up_time: '', follow_up_date: ''
    });

    /* prescriptions */
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [newRx, setNewRx] = useState<Prescription>({ medicine_id: '', period: '', time_unit: 'Days', advice: '' });

    /* ─── data loaders ─── */
    useEffect(() => {
        loadConsultations(); loadPatients(); loadDoctors();
        loadComplaintsFromDB(); loadInvestigationsFromDB();
        loadDiagnosesFromDB();
        loadMedicinesFromDB();
        loadFrequenciesFromDB();
    }, [profile?.branch_id]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const patientId = params.get('patientId');
        if (patientId) { setFormData(prev => ({ ...prev, patient_id: patientId })); setShowModal(true); }
    }, [profile]);

    useEffect(() => {
        if (formData.patient_id) loadLatestVitals(formData.patient_id);
        else setLatestVitals(null);
    }, [formData.patient_id]);

    async function loadConsultations() {
        try {
            let query = supabase.from('consultations').select(`
                *, patient:patients(full_name, patient_number), doctor:users!doctor_id(full_name),
                prescriptions(prescription_items(medicine:medicines(name, dosage), period, time_unit, advice))
            `).order('created_at', { ascending: false });
            if (profile?.role === 'doctor') query = query.eq('doctor_id', profile.id);
            else if (profile?.role !== 'super_admin' && profile?.role !== 'admin')
                if (profile?.branch_id) query = query.eq('branch_id', profile.branch_id);
            const { data, error } = await query;
            if (error) throw error;

            const formattedConsultations = (data || []).map(c => {
                const prescriptionItems = c.prescriptions?.[0]?.prescription_items?.map((item: any) => ({
                    medicine_name: item.medicine?.name || 'N/A',
                    dosage: item.medicine?.dosage || '',
                    period: item.period,
                    duration: item.time_unit,
                    instructions: item.advice
                })) || [];
                return {
                    ...c,
                    prescriptions: prescriptionItems,
                };
            });
            setConsultations(formattedConsultations);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    async function loadPatients() {
        const { data } = await supabase.from('patients').select('id, full_name, patient_number').eq('status', 'active').order('full_name');
        setPatients((data || []).map(p => ({ id: p.id, label: `${p.full_name} (${p.patient_number})` })));
    }

    async function loadDoctors() {
        const { data } = await supabase.from('users').select('id, full_name').eq('role', 'doctor').eq('is_active', true).order('full_name');
        setDoctors((data || []).map(d => ({ id: d.id, label: `Dr. ${d.full_name}` })));
    }

    async function loadComplaintsFromDB() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('complaints').select('id, name').eq('branch_id', profile.branch_id).order('name');
        setComplaints((data || []).map(c => ({ id: c.id, label: c.name })));
    }

    async function loadInvestigationsFromDB() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('investigations').select('id, name').eq('branch_id', profile.branch_id).order('name');
        setInvestigations((data || []).map(i => ({ id: i.id, label: i.name })));
    }

    async function loadDiagnosesFromDB() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('diagnoses').select('id, name, icd10_code').eq('branch_id', profile.branch_id).order('name');
        setDiagnoses((data || []).map(d => ({
            id: d.id,
            label: d.icd10_code ? `${d.name} (${d.icd10_code})` : d.name
        })));
    }

    async function loadMedicinesFromDB() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('medicines').select('id, name, dosage').eq('branch_id', profile.branch_id).order('name');
        setMedicines((data || []).map(m => ({ id: m.id, name: m.name, dosage: m.dosage || '' })));
    }

    async function loadFrequenciesFromDB() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('medicine_frequencies').select('id, name').or(`branch_id.eq.${profile.branch_id},branch_id.is.null`).order('name');
        setFrequencies((data || []).map(f => ({ id: f.id, name: f.name })));
    }

    async function loadLatestVitals(patientId: string) {
        const { data, error } = await supabase.from('vital_signs').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }).limit(1).single();
        if (!error || error.code === 'PGRST116') setLatestVitals(data || null);
    }

    async function loadPatientHistory(patientId: string) {
        setHistoryLoading(true);
        try {
            const [patientRes, vitalsRes, labsRes, consultRes, opsRes] = await Promise.all([
                supabase.from('patients').select('full_name, patient_number, date_of_birth, gender, blood_group, allergies, chronic_conditions, clinical_history, chronic_medications, smoke, alcohol, flags').eq('id', patientId).single(),
                supabase.from('vital_signs').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }).limit(10),
                supabase.from('lab_results').select('*').eq('patient_id', patientId).order('test_date', { ascending: false }).limit(20),
                supabase.from('consultations').select('*, doctor:users!doctor_id(full_name)').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(10),
                supabase.from('operation_reports').select('*, surgeon:users!surgeon_id(full_name)').eq('patient_id', patientId).order('operation_date', { ascending: false }).limit(10),
            ]);
            setPatientHistory({
                patient: patientRes.data,
                vitals: vitalsRes.data || [],
                labs: labsRes.data || [],
                consultations: consultRes.data || [],
                operations: opsRes.data || [],
            });
        } catch (e) { console.error(e); }
        finally { setHistoryLoading(false); }
    }

    /* ─── submit ─── */
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            setLoading(true);
            const payload = {
                ...formData,
                chief_complaint: selectedComplaints.join(', '),
                investigations: selectedInvestigations.join(', '),
                diagnosis: selectedDiagnoses.join(', '),
                doctor_id: profile?.id,
                branch_id: profile?.branch_id,
                referred_by: formData.referred_by || null,
                follow_up_date: formData.follow_up_date || null,
                created_at: new Date().toISOString()
            };
            const { data, error } = await supabase.from('consultations').insert([payload]).select();
            if (error) throw error;
            const consId = data[0].id;

            // 1. Save Prescriptions if any
            if (prescriptions.length > 0) {
                // Create prescription header
                const { data: rxHeader, error: rxErr } = await supabase.from('prescriptions').insert([{
                    patient_id: formData.patient_id,
                    doctor_id: profile?.id,
                    branch_id: profile?.branch_id,
                    consultation_id: consId,
                    prescription_date: new Date().toISOString().split('T')[0],
                    status: 'active'
                }]).select().single();

                if (!rxErr && rxHeader) {
                    // Create prescription items
                    const itemsPayload = prescriptions.map(rx => ({
                        prescription_id: rxHeader.id,
                        medicine_id: rx.medicine_id,
                        period: rx.period,
                        time_unit: rx.time_unit,
                        advice: rx.advice
                    }));
                    await supabase.from('prescription_items').insert(itemsPayload);
                }
            }

            // 2. Auto-create Appointment for Follow-up
            if (formData.follow_up_date) {
                await supabase.from('appointments').insert([{
                    branch_id: profile?.branch_id,
                    patient_id: formData.patient_id,
                    doctor_id: profile?.id,
                    appointment_date: formData.follow_up_date,
                    appointment_type: 'Follow Up',
                    status: 'pending_confirmation',
                    notes: `Follow up from consultation on ${new Date().toLocaleDateString()}`,
                    created_by: profile?.id
                }]);
            }

            setShowModal(false); resetForm(); loadConsultations();
            alert('Consultation recorded successfully!');
        } catch (e) { console.error(e); alert('Failed to save consultation'); }
        finally { setLoading(false); }
    }

    /* ─── quick-add handlers ─── */
    async function handleAddPatient() {
        if (!newPatient.full_name) return;
        try {
            const patNum = `P-${Date.now().toString().slice(-6)}`;
            const { data, error } = await supabase.from('patients').insert([{
                ...newPatient, patient_number: patNum,
                branch_id: profile?.branch_id, status: 'active'
            }]).select().single();
            if (error) throw error;
            const entry = { id: data.id, label: `${data.full_name} (${data.patient_number})` };
            setPatients(prev => [entry, ...prev]);
            setFormData(prev => ({ ...prev, patient_id: data.id }));
            setNewPatient({ full_name: '', date_of_birth: '', gender: 'male', phone: '', email: '' });
            setShowAddPatient(false);
        } catch (e) { console.error(e); alert('Failed to add patient'); }
    }

    async function handleAddComplaint() {
        if (!newComplaint.trim() || !profile?.branch_id) return;
        const { data, error } = await supabase
            .from('complaints')
            .insert([{ name: newComplaint.trim(), branch_id: profile.branch_id }])
            .select().single();
        if (error) { alert(error.code === '23505' ? 'This complaint already exists.' : error.message); return; }
        const entry = { id: data.id, label: data.name };
        setComplaints(prev => [...prev, entry]);
        setSelectedComplaints(prev => [...prev, entry.id]);
        setNewComplaint(''); setShowAddComplaint(false);
    }

    async function handleAddInvestigation() {
        if (!newInvestigation.trim() || !profile?.branch_id) return;
        const { data, error } = await supabase
            .from('investigations')
            .insert([{ name: newInvestigation.trim(), branch_id: profile.branch_id }])
            .select().single();
        if (error) { alert(error.code === '23505' ? 'This investigation already exists.' : error.message); return; }
        const entry = { id: data.id, label: data.name };
        setInvestigations(prev => [...prev, entry]);
        setSelectedInvestigations(prev => [...prev, entry.id]);
        setNewInvestigation(''); setShowAddInvestigation(false);
    }

    async function handleAddDiagnosis() {
        if (!newDiagnosis.name.trim() || !profile?.branch_id) return;
        const { data, error } = await supabase
            .from('diagnoses')
            .insert([{
                name: newDiagnosis.name.trim(),
                icd10_code: newDiagnosis.icd10.trim() || null,
                branch_id: profile.branch_id
            }])
            .select().single();
        if (error) { alert(error.code === '23505' ? 'This diagnosis already exists.' : error.message); return; }

        const label = data.icd10_code ? `${data.name} (${data.icd10_code})` : data.name;
        const entry = { id: data.id, label };
        setDiagnoses(prev => [...prev, entry]);
        setSelectedDiagnoses(prev => [...prev, entry.id]);
        setNewDiagnosis({ name: '', icd10: '' });
        setShowAddDiagnosis(false);
    }

    async function handleAddDoctor() {
        if (!newDoctor.full_name) return;
        try {
            const { data, error } = await supabase.from('users').insert([{
                ...newDoctor, role: 'doctor', is_active: true,
                branch_id: profile?.branch_id, email: newDoctor.email || `doc${Date.now()}@placeholder.com`,
                id: crypto.randomUUID()
            }]).select().single();
            if (error) throw error;
            const entry = { id: data.id, label: `Dr. ${data.full_name}` };
            setDoctors(prev => [...prev, entry]);
            setFormData(prev => ({ ...prev, referred_by: data.id }));
            setNewDoctor({ full_name: '', specialization: '', phone: '', email: '' });
            setShowAddDoctor(false);
        } catch (e) { console.error(e); alert('Failed to add doctor. Use the Staff module instead.'); setShowAddDoctor(false); }
    }

    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [branch, setBranch] = useState<any>(null);

    useEffect(() => {
        if (profile?.branch_id) {
            supabase.from('branches').select('*').eq('id', profile.branch_id).maybeSingle()
                .then(({ data }) => setBranch(data));
        }
    }, [profile?.branch_id]);

    /* ─── helpers ─── */
    function resetForm() {
        setFormData({ patient_id: '', diagnosis: '', physical_examination: '', treatment_plan: '', notes: '', status: 'completed', referred_by: '', follow_up_period: '', follow_up_time: '', follow_up_date: '' });
        setSelectedComplaints([]); setSelectedInvestigations([]); setSelectedDiagnoses([]);
        setPrescriptions([]); setNewRx({ medicine_id: '', period: '', time_unit: 'Days', advice: '' });
    }

    /* ─── table: filters & pagination ─── */
    const [filterPatient, setFilterPatient] = useState('');
    const [filterDiagnosis, setFilterDiagnosis] = useState('');
    const [filterDoctor, setFilterDoctor] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 10;

    /* ─── crud modals ─── */
    const [viewConsultation, setViewConsultation] = useState<Consultation | null>(null);
    const [editConsultation, setEditConsultation] = useState<Consultation | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Consultation>>({});

    const handleViewDetailed = (c: Consultation) => {
        setViewConsultation(c);
        setViewMode('detailed');
    };

    const filteredConsultations = consultations.filter(c => {
        const patientOk = !filterPatient || c.patient?.full_name.toLowerCase().includes(filterPatient.toLowerCase()) || c.patient?.patient_number.toLowerCase().includes(filterPatient.toLowerCase());
        const diagOk = !filterDiagnosis || c.diagnosis?.toLowerCase().includes(filterDiagnosis.toLowerCase());
        const docOk = !filterDoctor || c.doctor?.full_name?.toLowerCase().includes(filterDoctor.toLowerCase());
        const statusOk = !filterStatus || c.status === filterStatus;
        const dateFrom = filterDateFrom ? new Date(filterDateFrom) : null;
        const dateTo = filterDateTo ? new Date(filterDateTo + 'T23:59:59') : null;
        const cDate = new Date(c.created_at);
        const dateOk = (!dateFrom || cDate >= dateFrom) && (!dateTo || cDate <= dateTo);
        return patientOk && diagOk && docOk && statusOk && dateOk;
    });

    const totalPages = Math.max(1, Math.ceil(filteredConsultations.length / PAGE_SIZE));
    const paginated = filteredConsultations.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    function clearFilters() {
        setFilterPatient(''); setFilterDiagnosis(''); setFilterDoctor('');
        setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo('');
        setCurrentPage(1);
    }

    async function handleDelete() {
        if (!deleteId) return;
        await supabase.from('consultations').delete().eq('id', deleteId);
        setDeleteId(null);
        loadConsultations();
    }

    async function handleEditSave() {
        if (!editConsultation) return;
        await supabase.from('consultations').update(editForm).eq('id', editConsultation.id);
        setEditConsultation(null);
        loadConsultations();
    }

    function exportPDF() {
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14);
        doc.text('Clinical Consultations Report', 14, 14);
        doc.setFontSize(9);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 20);
        autoTable(doc, {
            startY: 26,
            head: [['#', 'Patient', 'ID', 'Date', 'Doctor', 'Complaints', 'Diagnosis', 'Status']],
            body: filteredConsultations.map((c, i) => [
                i + 1,
                c.patient?.full_name || '',
                c.patient?.patient_number || '',
                new Date(c.created_at).toLocaleDateString(),
                `Dr. ${c.doctor?.full_name || ''}`,
                (c.chief_complaint || '').substring(0, 40),
                (c.diagnosis || '').substring(0, 40),
                c.status || '',
            ]),
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235] },
            alternateRowStyles: { fillColor: [245, 247, 250] },
        });
        doc.save(`consultations-${new Date().toISOString().slice(0, 10)}.pdf`);
    }

    function handlePrint() {
        const rows = filteredConsultations.map((c, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
                <td>${i + 1}</td>
                <td><strong>${c.patient?.full_name}</strong><br/><small>${c.patient?.patient_number}</small></td>
                <td>${new Date(c.created_at).toLocaleDateString()}</td>
                <td>Dr. ${c.doctor?.full_name || ''}</td>
                <td>${(c.chief_complaint || '').substring(0, 50)}</td>
                <td>${(c.diagnosis || '').substring(0, 50)}</td>
                <td>${c.treatment_plan || ''}</td>
                <td><span style="padding:2px 8px;border-radius:999px;font-size:10px;font-weight:bold;background:${c.status === 'completed' ? '#dcfce7' : '#fef3c7'};color:${c.status === 'completed' ? '#166534' : '#92400e'}">${c.status}</span></td>
            </tr>`);
        const w = window.open('', '_blank');
        if (!w) return;
        w.document.write(`<html><head><title>Consultations</title><style>
            body{font-family:Arial,sans-serif;margin:20px;font-size:12px}
            h2{color:#1e40af}table{border-collapse:collapse;width:100%}
            th{background:#1d4ed8;color:#fff;padding:8px;text-align:left;font-size:11px}
            td{padding:7px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
        </style></head><body>
        <h2>Clinical Consultations Report</h2>
        <p style="color:#6b7280">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Total: ${filteredConsultations.length} records</p>
        <table><thead><tr><th>#</th><th>Patient</th><th>Date</th><th>Doctor</th><th>Complaints</th><th>Diagnosis</th><th>Treatment</th><th>Status</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table></body></html>`);
        w.document.close();
        w.print();
    }

    const selectedPatientLabel = patients.find(p => p.id === formData.patient_id)?.label;
    const selectedDoctorLabel = doctors.find(d => d.id === formData.referred_by)?.label;

    /* ═══════════ RENDER ═══════════ */
    if (viewMode === 'detailed' && viewConsultation && branch) {
        return (
            <ConsultationPrintView
                consultation={viewConsultation as any}
                branch={branch}
                onBack={() => setViewMode('table')}
                onEdit={() => {
                    setEditConsultation(viewConsultation);
                    setEditForm(viewConsultation);
                    setViewMode('table');
                }}
                onAddNew={() => {
                    resetForm();
                    setViewMode('table');
                    setShowModal(true); // Assuming setShowModal is the state for the add consultation form
                }}
                onSendEmail={() => {
                    alert('Send Email functionality coming soon!');
                }}
            />
        );
    }

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Stethoscope className="w-8 h-8 text-blue-600" /> Clinical Consultations
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage patient medical records and visit notes</p>
                </div>
                <button onClick={() => setShowModal(true)}
                    className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md">
                    <Plus className="w-5 h-5" /><span>New Consultation</span>
                </button>
            </div>

            {/* ── Filter Bar ── */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input type="text" placeholder="Patient..." value={filterPatient} onChange={e => { setFilterPatient(e.target.value); setCurrentPage(1); }} className="w-full pl-8 pr-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <input type="text" placeholder="Diagnosis..." value={filterDiagnosis} onChange={e => { setFilterDiagnosis(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    <input type="text" placeholder="Doctor..." value={filterDoctor} onChange={e => { setFilterDoctor(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="">All Statuses</option>
                        <option value="completed">Completed</option>
                        <option value="pending">Pending</option>
                        <option value="follow_up">Follow Up</option>
                    </select>
                    <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" title="Date From" />
                    <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setCurrentPage(1); }} className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" title="Date To" />
                </div>
                <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-500">{filteredConsultations.length} record{filteredConsultations.length !== 1 ? 's' : ''} found</span>
                    <div className="flex gap-2">
                        <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Filter className="w-3 h-3" /> Clear
                        </button>
                        <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Printer className="w-3 h-3" /> Print
                        </button>
                        <button onClick={exportPDF} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                            <Download className="w-3 h-3" /> Export PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Table ── */}
            {loading && consultations.length === 0 ? (
                <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>
            ) : filteredConsultations.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                    <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No consultations match your filters</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-blue-600 text-white text-xs uppercase tracking-wide">
                                    <th className="px-4 py-3 text-left border-r border-blue-500 w-8">#</th>
                                    <th className="px-4 py-3 text-left border-r border-blue-500">Patient</th>
                                    <th className="px-4 py-3 text-left border-r border-blue-500">Date</th>
                                    <th className="px-4 py-3 text-left border-r border-blue-500">Doctor</th>
                                    <th className="px-4 py-3 text-left border-r border-blue-500">Complaints</th>
                                    <th className="px-4 py-3 text-left border-r border-blue-500">Diagnosis</th>
                                    <th className="px-4 py-3 text-left border-r border-blue-500">Follow Up</th>
                                    <th className="px-4 py-3 text-left border-r border-blue-500">Status</th>
                                    <th className="px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginated.map((c, idx) => (
                                    <tr key={c.id} className={`border-b border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700/50 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/60'}`}>
                                        <td className="px-4 py-3 text-gray-500 border-r border-gray-200 dark:border-gray-700 text-xs">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                                        <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                            <p className="font-semibold text-gray-900 dark:text-white">{c.patient?.full_name}</p>
                                            <p className="text-xs text-gray-400">{c.patient?.patient_number}</p>
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">{new Date(c.created_at).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300">Dr. {c.doctor?.full_name}</td>
                                        <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700 max-w-[160px]">
                                            <p className="text-xs text-gray-700 dark:text-gray-300 truncate" title={c.chief_complaint}>{c.chief_complaint || '—'}</p>
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700 max-w-[160px]">
                                            <p className="text-xs text-gray-700 dark:text-gray-300 truncate" title={c.diagnosis}>{c.diagnosis || '—'}</p>
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                            {c.follow_up_period ? `${c.follow_up_period} ${c.follow_up_time}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => handleViewDetailed(c)}
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition"
                                                    title="View Detailed Report"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => { setEditConsultation(c); setEditForm({ chief_complaint: c.chief_complaint, diagnosis: c.diagnosis, physical_examination: c.physical_examination, treatment_plan: c.treatment_plan, notes: c.notes, status: c.status, follow_up_period: c.follow_up_period, follow_up_time: c.follow_up_time, follow_up_date: c.follow_up_date }); }} className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => window.location.href = `/invoices?patientId=${c.patient_id}&consultationId=${c.id}`} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg" title="Invoice"><Receipt className="w-3.5 h-3.5" /></button>
                                                <button onClick={() => setDeleteId(c.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                        <p className="text-xs text-gray-500">
                            Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredConsultations.length)}–{Math.min(currentPage * PAGE_SIZE, filteredConsultations.length)} of {filteredConsultations.length}
                        </p>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const start = Math.max(1, currentPage - 2);
                                const page = start + i;
                                if (page > totalPages) return null;
                                return (
                                    <button key={page} onClick={() => setCurrentPage(page)}
                                        className={`w-8 h-8 rounded-lg text-xs font-semibold border ${page === currentPage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                        {page}
                                    </button>
                                );
                            })}
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── View Modal ── */}
            {viewConsultation && (
                <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[55] p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl shadow-2xl my-6">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 rounded-t-xl">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Eye className="w-5 h-5 text-blue-600" /> Consultation Details</h2>
                                <p className="text-xs text-gray-500">{viewConsultation.patient?.full_name} · {new Date(viewConsultation.created_at).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setViewConsultation(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[75vh] overflow-y-auto">
                            {[
                                { label: 'Patient', val: `${viewConsultation.patient?.full_name} (${viewConsultation.patient?.patient_number})` },
                                { label: 'Doctor', val: `Dr. ${viewConsultation.doctor?.full_name}` },
                                { label: 'Date', val: new Date(viewConsultation.created_at).toLocaleString() },
                                { label: 'Status', val: viewConsultation.status },
                                { label: 'Main Complaints', val: viewConsultation.chief_complaint },
                                { label: 'Diagnosis', val: viewConsultation.diagnosis },
                                { label: 'Investigations', val: viewConsultation.investigations },
                                { label: 'Observations', val: viewConsultation.physical_examination },
                                { label: 'Treatment Plan', val: viewConsultation.treatment_plan },
                                { label: 'Remarks', val: viewConsultation.notes },
                                { label: 'Follow Up', val: viewConsultation.follow_up_period ? `${viewConsultation.follow_up_period} ${viewConsultation.follow_up_time}${viewConsultation.follow_up_date ? ` (${viewConsultation.follow_up_date})` : ''}` : null },
                            ].map(r => r.val ? (
                                <div key={r.label} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{r.label}</p>
                                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{r.val}</p>
                                </div>
                            ) : null)}
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                            <button onClick={() => setViewConsultation(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Close</button>
                            <button onClick={() => { setEditConsultation(viewConsultation); setEditForm({ chief_complaint: viewConsultation.chief_complaint, diagnosis: viewConsultation.diagnosis, physical_examination: viewConsultation.physical_examination, treatment_plan: viewConsultation.treatment_plan, notes: viewConsultation.notes, status: viewConsultation.status, follow_up_period: viewConsultation.follow_up_period, follow_up_time: viewConsultation.follow_up_time, follow_up_date: viewConsultation.follow_up_date }); setViewConsultation(null); }} className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 flex items-center justify-center gap-2"><Pencil className="w-4 h-4" /> Edit</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Modal ── */}
            {editConsultation && (
                <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[55] p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl shadow-2xl my-6">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Pencil className="w-5 h-5 text-amber-500" /> Edit Consultation</h2>
                            <button onClick={() => setEditConsultation(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className={labelCls}>Main Complaints</label><textarea value={editForm.chief_complaint || ''} onChange={e => setEditForm(f => ({ ...f, chief_complaint: e.target.value }))} className={`${inputCls} resize-none`} rows={3} /></div>
                                <div><label className={labelCls}>Diagnosis</label><textarea value={editForm.diagnosis || ''} onChange={e => setEditForm(f => ({ ...f, diagnosis: e.target.value }))} className={`${inputCls} resize-none`} rows={3} /></div>
                                <div><label className={labelCls}>Observations</label><textarea value={editForm.physical_examination || ''} onChange={e => setEditForm(f => ({ ...f, physical_examination: e.target.value }))} className={`${inputCls} resize-none`} rows={4} /></div>
                                <div><label className={labelCls}>Treatment Plan</label><textarea value={editForm.treatment_plan || ''} onChange={e => setEditForm(f => ({ ...f, treatment_plan: e.target.value }))} className={`${inputCls} resize-none`} rows={4} /></div>
                                <div><label className={labelCls}>Remarks</label><textarea value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} rows={3} /></div>
                                <div className="space-y-3">
                                    <div><label className={labelCls}>Status</label>
                                        <select value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                                            <option value="completed">Completed</option>
                                            <option value="pending">Pending</option>
                                            <option value="follow_up">Follow Up</option>
                                        </select>
                                    </div>
                                    <div><label className={labelCls}>Follow Up Period</label><input type="text" value={editForm.follow_up_period || ''} onChange={e => setEditForm(f => ({ ...f, follow_up_period: e.target.value }))} className={inputCls} /></div>
                                    <div><label className={labelCls}>Follow Up Date</label><input type="date" value={editForm.follow_up_date || ''} onChange={e => setEditForm(f => ({ ...f, follow_up_date: e.target.value }))} className={inputCls} /></div>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                            <button onClick={() => setEditConsultation(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button onClick={handleEditSave} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirm ── */}
            {deleteId && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[55] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl p-6">
                        <div className="text-center mb-4">
                            <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-3"><Trash2 className="w-6 h-6 text-rose-600" /></div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Delete Consultation?</h3>
                            <p className="text-sm text-gray-500 mt-1">This action cannot be undone.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteId(null)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button onClick={handleDelete} className="flex-1 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ ADD CONSULTATION MODAL ═══════════ */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-5xl shadow-2xl my-6">
                        {/* Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" /> Add Consultation
                            </h2>
                            <button onClick={() => { setShowModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">

                            {/* Patient */}
                            <SearchDropdown
                                label="Patient"
                                placeholder="Search Patient Name / ID"
                                items={patients}
                                selected={[]}
                                singleValue={selectedPatientLabel}
                                onSelect={(id) => setFormData(prev => ({ ...prev, patient_id: id }))}
                                onClearSingle={() => setFormData(prev => ({ ...prev, patient_id: '' }))}
                                onAddNew={() => { setShowAddPatient(true); }}
                            />

                            {/* View Patient History Button */}
                            {formData.patient_id && (
                                <button
                                    type="button"
                                    onClick={() => { loadPatientHistory(formData.patient_id); setHistoryTab('clinical'); setShowHistoryModal(true); }}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition w-full justify-center"
                                >
                                    <History className="w-4 h-4" />
                                    View Patient History &amp; Clinical Background
                                </button>
                            )}

                            {/* Diagnosis & ICD 10 */}
                            <SearchDropdown
                                label="Diagnosis & Icd 10 Code"
                                placeholder="Search Diagnosis & Icd 10 Code"
                                items={diagnoses}
                                selected={selectedDiagnoses}
                                multi
                                onSelect={(id) => setSelectedDiagnoses(prev => prev.includes(id) ? prev : [...prev, id])}
                                onRemove={(id) => setSelectedDiagnoses(prev => prev.filter(x => x !== id))}
                                onAddNew={() => setShowAddDiagnosis(true)}
                                tagColor="blue"
                            />

                            {/* Main Complaints | Investigations */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <SearchDropdown
                                    label="Main Complaints"
                                    placeholder="Search Complaints"
                                    items={complaints}
                                    selected={selectedComplaints}
                                    multi
                                    onSelect={(id) => setSelectedComplaints(prev => prev.includes(id) ? prev : [...prev, id])}
                                    onRemove={(id) => setSelectedComplaints(prev => prev.filter(x => x !== id))}
                                    onAddNew={() => setShowAddComplaint(true)}
                                    tagColor="blue"
                                />
                                <SearchDropdown
                                    label="Investigations"
                                    placeholder="Search Investigations"
                                    items={investigations}
                                    selected={selectedInvestigations}
                                    multi
                                    onSelect={(id) => setSelectedInvestigations(prev => prev.includes(id) ? prev : [...prev, id])}
                                    onRemove={(id) => setSelectedInvestigations(prev => prev.filter(x => x !== id))}
                                    onAddNew={() => setShowAddInvestigation(true)}
                                    tagColor="emerald"
                                />
                            </div>

                            {/* Latest Vitals banner */}
                            {latestVitals && (
                                <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-lg px-4 py-3 flex flex-wrap gap-6 text-sm">
                                    <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300"><Activity className="w-4 h-4 text-rose-500" /><span className="font-bold">BP:</span> {latestVitals.blood_pressure_systolic}/{latestVitals.blood_pressure_diastolic} mmHg</span>
                                    <span className="text-gray-700 dark:text-gray-300"><span className="font-bold">Pulse:</span> {latestVitals.pulse_rate} bpm</span>
                                    <span className="text-gray-700 dark:text-gray-300"><span className="font-bold">Temp:</span> {latestVitals.temperature}°C</span>
                                    <span className="text-xs text-gray-400 ml-auto self-center">Recorded: {new Date(latestVitals.recorded_at).toLocaleString()}</span>
                                </div>
                            )}

                            {/* Observations | Treatment Plan */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={sectionTitle}>Observations</label>
                                    <textarea value={formData.physical_examination}
                                        onChange={e => setFormData(prev => ({ ...prev, physical_examination: e.target.value }))}
                                        className={`${inputCls} resize-none`} rows={6}
                                        placeholder="Enter clinical observations and examination findings..." />
                                </div>
                                <div>
                                    <label className={sectionTitle}>Treatment Plan</label>
                                    <textarea value={formData.treatment_plan}
                                        onChange={e => setFormData(prev => ({ ...prev, treatment_plan: e.target.value }))}
                                        className={`${inputCls} resize-none`} rows={6}
                                        placeholder="Enter treatment plan, medications, and recommendations..." />
                                </div>
                            </div>

                            {/* Referred By */}
                            <SearchDropdown
                                label="Referred By"
                                placeholder="Search Doctor"
                                items={doctors}
                                selected={[]}
                                singleValue={selectedDoctorLabel}
                                onSelect={(id) => setFormData(prev => ({ ...prev, referred_by: id }))}
                                onClearSingle={() => setFormData(prev => ({ ...prev, referred_by: '' }))}
                                onAddNew={() => setShowAddDoctor(true)}
                            />

                            {/* Follow Up */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Follow Up</label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className={labelCls}>Period</label>
                                        <input type="number" min="0" placeholder="e.g. 2"
                                            value={formData.follow_up_period}
                                            onChange={e => setFormData(prev => ({ ...prev, follow_up_period: e.target.value }))}
                                            className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Time</label>
                                        <select value={formData.follow_up_time}
                                            onChange={e => setFormData(prev => ({ ...prev, follow_up_time: e.target.value }))}
                                            className={inputCls}>
                                            <option value="">Days, Weeks, Months, Years</option>
                                            <option>Days</option><option>Weeks</option>
                                            <option>Months</option><option>Years</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Follow Up Date</label>
                                        <input type="date" value={formData.follow_up_date}
                                            onChange={e => setFormData(prev => ({ ...prev, follow_up_date: e.target.value }))}
                                            className={inputCls} />
                                    </div>
                                </div>
                            </div>

                            {/* Remarks */}
                            <div>
                                <label className={sectionTitle}>Remarks</label>
                                <textarea value={formData.notes}
                                    onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    className={`${inputCls} resize-none`} rows={4}
                                    placeholder="Additional remarks or notes..." />
                            </div>

                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                                    <Pill className="w-4 h-4 text-emerald-600" /> Prescriptions
                                </h3>
                                {prescriptions.map((rx, idx) => {
                                    const med = medicines.find(m => m.id === rx.medicine_id);
                                    return (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 mb-2">
                                            <div>
                                                <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">{med?.name || 'Unknown Medicine'}</p>
                                                <p className="text-xs text-gray-500">{rx.period} {rx.time_unit} · {rx.advice}</p>
                                            </div>
                                            <button type="button" onClick={() => setPrescriptions(p => p.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
                                        </div>
                                    );
                                })}
                                <div className="space-y-3 mt-2">
                                    <SearchDropdown
                                        label="Select Medicine"
                                        placeholder="Search Medicine..."
                                        items={medicines.map(m => ({ id: m.id, label: m.dosage ? `${m.name} (${m.dosage})` : m.name }))}
                                        selected={[]}
                                        singleValue={medicines.find(m => m.id === newRx.medicine_id)?.name || ''}
                                        onSelect={(id) => setNewRx(r => ({ ...r, medicine_id: id }))}
                                        onClearSingle={() => setNewRx(r => ({ ...r, medicine_id: '' }))}
                                    />
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase">Period</label>
                                            <input type="text" placeholder="e.g. 7" value={newRx.period} onChange={e => setNewRx(r => ({ ...r, period: e.target.value }))} className={inputCls} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase">Unit</label>
                                            <select value={newRx.time_unit} onChange={e => setNewRx(r => ({ ...r, time_unit: e.target.value }))} className={inputCls}>
                                                <option>Days</option><option>Weeks</option><option>Months</option>
                                            </select>
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase">Advice</label>
                                            <input type="text" placeholder="e.g. After meals" value={newRx.advice} onChange={e => setNewRx(r => ({ ...r, advice: e.target.value }))} className={inputCls} />
                                        </div>
                                    </div>
                                </div>
                                <button type="button" onClick={() => { if (!newRx.medicine_id) return; setPrescriptions(p => [...p, newRx]); setNewRx({ medicine_id: '', period: '', time_unit: 'Days', advice: '' }); }}
                                    className="mt-3 w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold text-sm transition shadow-sm">
                                    + Add to List
                                </button>
                            </div>

                            {/* Submit bar */}
                            <div className="flex gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => { setShowModal(false); resetForm(); }}
                                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition font-medium">
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading}
                                    className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg font-bold disabled:opacity-50 transition">
                                    {loading ? 'Saving...' : 'Submit'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ═══ Quick-Add: Patient ═══ */}
            {showAddPatient && (
                <QuickModal title="Add New Patient" onClose={() => setShowAddPatient(false)}>
                    <div className="space-y-3">
                        <div>
                            <label className={labelCls}>Full Name *</label>
                            <input type="text" value={newPatient.full_name} onChange={e => setNewPatient(p => ({ ...p, full_name: e.target.value }))} className={inputCls} placeholder="Patient full name" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Date of Birth</label>
                                <input type="date" value={newPatient.date_of_birth} onChange={e => setNewPatient(p => ({ ...p, date_of_birth: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Gender</label>
                                <select value={newPatient.gender} onChange={e => setNewPatient(p => ({ ...p, gender: e.target.value }))} className={inputCls}>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Phone</label>
                            <input type="tel" value={newPatient.phone} onChange={e => setNewPatient(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="+263..." />
                        </div>
                        <div>
                            <label className={labelCls}>Email</label>
                            <input type="email" value={newPatient.email} onChange={e => setNewPatient(p => ({ ...p, email: e.target.value }))} className={inputCls} placeholder="patient@email.com" />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowAddPatient(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={handleAddPatient} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">Add Patient</button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* ═══ Quick-Add: Complaint ═══ */}
            {showAddComplaint && (
                <QuickModal title="Add New Complaint" onClose={() => setShowAddComplaint(false)}>
                    <div className="space-y-3">
                        <div>
                            <label className={labelCls}>Complaint Name *</label>
                            <input type="text" value={newComplaint} onChange={e => setNewComplaint(e.target.value)} className={inputCls} placeholder="e.g. Rash, Insomnia..." onKeyDown={e => e.key === 'Enter' && handleAddComplaint()} />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowAddComplaint(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={handleAddComplaint} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">Add &amp; Select</button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* ═══ Quick-Add: Investigation ═══ */}
            {showAddInvestigation && (
                <QuickModal title="Add New Investigation" onClose={() => setShowAddInvestigation(false)}>
                    <div className="space-y-3">
                        <div>
                            <label className={labelCls}>Investigation Name *</label>
                            <input type="text" value={newInvestigation} onChange={e => setNewInvestigation(e.target.value)} className={inputCls} placeholder="e.g. Thyroid Function Test..." onKeyDown={e => e.key === 'Enter' && handleAddInvestigation()} />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowAddInvestigation(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={handleAddInvestigation} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">Add &amp; Select</button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* ═══ Quick-Add: Diagnosis ═══ */}
            {showAddDiagnosis && (
                <QuickModal title="Add New Diagnosis / ICD-10 Code" onClose={() => setShowAddDiagnosis(false)}>
                    <div className="space-y-3">
                        <div>
                            <label className={labelCls}>Diagnosis Name *</label>
                            <input type="text" value={newDiagnosis.name} onChange={e => setNewDiagnosis(d => ({ ...d, name: e.target.value }))} className={inputCls} placeholder="e.g. Hypertension" />
                        </div>
                        <div>
                            <label className={labelCls}>ICD-10 Code (optional)</label>
                            <input type="text" value={newDiagnosis.icd10} onChange={e => setNewDiagnosis(d => ({ ...d, icd10: e.target.value }))} className={inputCls} placeholder="e.g. I10" onKeyDown={e => e.key === 'Enter' && handleAddDiagnosis()} />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowAddDiagnosis(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={handleAddDiagnosis} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">Add &amp; Select</button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* ═══ Quick-Add: Doctor (Referred By) ═══ */}
            {showAddDoctor && (
                <QuickModal title="Add New Doctor" onClose={() => setShowAddDoctor(false)}>
                    <div className="space-y-3">
                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                            Note: For full doctor setup (login access), use the <strong>Staff</strong> module. This adds a quick reference only.
                        </p>
                        <div>
                            <label className={labelCls}>Full Name *</label>
                            <input type="text" value={newDoctor.full_name} onChange={e => setNewDoctor(d => ({ ...d, full_name: e.target.value }))} className={inputCls} placeholder="Dr. John Smith" />
                        </div>
                        <div>
                            <label className={labelCls}>Specialization</label>
                            <input type="text" value={newDoctor.specialization} onChange={e => setNewDoctor(d => ({ ...d, specialization: e.target.value }))} className={inputCls} placeholder="e.g. Cardiologist" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Phone</label>
                                <input type="tel" value={newDoctor.phone} onChange={e => setNewDoctor(d => ({ ...d, phone: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Email</label>
                                <input type="email" value={newDoctor.email} onChange={e => setNewDoctor(d => ({ ...d, email: e.target.value }))} className={inputCls} />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setShowAddDoctor(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button type="button" onClick={handleAddDoctor} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700">Add Doctor</button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* ═══ Patient History Modal ═══ */}
            {showHistoryModal && (
                <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-4xl shadow-2xl my-6">
                        {/* Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/20 rounded-t-xl">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <History className="w-5 h-5 text-indigo-600" />
                                    Patient History &amp; Clinical Background
                                </h2>
                                {patientHistory?.patient && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        {patientHistory.patient.full_name} · {patientHistory.patient.patient_number} · {patientHistory.patient.gender} · DOB: {patientHistory.patient.date_of_birth || '—'}
                                    </p>
                                )}
                            </div>
                            <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>

                        {historyLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {/* Tabs */}
                                <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 overflow-x-auto">
                                    {([
                                        { id: 'clinical', label: 'Clinical Background', icon: <HeartPulse className="w-3.5 h-3.5" /> },
                                        { id: 'vitals', label: 'Vital Signs', icon: <Activity className="w-3.5 h-3.5" /> },
                                        { id: 'labs', label: 'Lab Results', icon: <FlaskConical className="w-3.5 h-3.5" /> },
                                        { id: 'notes', label: 'Previous Notes', icon: <FileText className="w-3.5 h-3.5" /> },
                                        { id: 'ops', label: 'Operations', icon: <Syringe className="w-3.5 h-3.5" /> },
                                    ] as const).map(tab => (
                                        <button key={tab.id} type="button"
                                            onClick={() => setHistoryTab(tab.id)}
                                            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 whitespace-nowrap transition ${historyTab === tab.id
                                                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                                            {tab.icon} {tab.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">

                                    {/* ─ Clinical Background ─ */}
                                    {historyTab === 'clinical' && patientHistory?.patient && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-center">
                                                    <Cigarette className="w-5 h-5 text-rose-500 mx-auto mb-1" />
                                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Smoking</p>
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">{patientHistory.patient.smoke || 'Never'}</p>
                                                </div>
                                                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
                                                    <Wine className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Alcohol</p>
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">{patientHistory.patient.alcohol || 'Never'}</p>
                                                </div>
                                                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                                                    <HeartPulse className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                                                    <p className="text-[10px] text-gray-500 uppercase font-bold">Blood Group</p>
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{patientHistory.patient.blood_group || '—'}</p>
                                                </div>
                                            </div>
                                            {[
                                                { label: 'Allergies', value: patientHistory.patient.allergies },
                                                { label: 'Chronic Conditions', value: patientHistory.patient.chronic_conditions },
                                                { label: 'Clinical History', value: patientHistory.patient.clinical_history },
                                                { label: 'Chronic Medications', value: patientHistory.patient.chronic_medications },
                                                { label: 'Flags / Alerts', value: patientHistory.patient.flags },
                                            ].map(item => item.value ? (
                                                <div key={item.label} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                                    <p className="text-xs font-bold text-gray-500 uppercase mb-1">{item.label}</p>
                                                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{item.value}</p>
                                                </div>
                                            ) : null)}
                                        </div>
                                    )}

                                    {/* ─ Vitals ─ */}
                                    {historyTab === 'vitals' && (
                                        patientHistory?.vitals.length === 0 ? (
                                            <p className="text-center text-gray-400 py-10">No vital signs recorded.</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {patientHistory?.vitals.map((v, i) => (
                                                    <div key={i} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                                        <p className="text-[10px] text-gray-400 mb-2">{new Date(v.recorded_at).toLocaleString()}</p>
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                            {[
                                                                { label: 'BP', val: v.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic} mmHg` : null },
                                                                { label: 'Pulse', val: v.heart_rate ? `${v.heart_rate} bpm` : (v.pulse_rate ? `${v.pulse_rate} bpm` : null) },
                                                                { label: 'Temp', val: v.temperature ? `${v.temperature}°C` : null },
                                                                { label: 'O₂ Sat', val: v.oxygen_saturation ? `${v.oxygen_saturation}%` : null },
                                                                { label: 'Resp Rate', val: v.respiratory_rate ? `${v.respiratory_rate} /min` : null },
                                                                { label: 'Weight', val: v.weight ? `${v.weight} kg` : null },
                                                                { label: 'Height', val: v.height ? `${v.height} cm` : null },
                                                            ].filter(r => r.val).map(r => (
                                                                <div key={r.label}>
                                                                    <p className="text-[10px] text-gray-400 uppercase">{r.label}</p>
                                                                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200">{r.val}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}

                                    {/* ─ Lab Results ─ */}
                                    {historyTab === 'labs' && (
                                        patientHistory?.labs.length === 0 ? (
                                            <p className="text-center text-gray-400 py-10">No lab results found.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {patientHistory?.labs.map((l, i) => (
                                                    <div key={i} className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                                                        <div className="flex gap-3">
                                                            <Microscope className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                                                            <div>
                                                                <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{l.test_name}</p>
                                                                <p className="text-xs text-gray-500">{l.result || 'Result pending'}{l.reference_range ? ` · Ref: ${l.reference_range}` : ''}</p>
                                                                {l.notes && <p className="text-xs text-gray-400 mt-1">{l.notes}</p>}
                                                            </div>
                                                        </div>
                                                        <div className="text-right flex-shrink-0 ml-4">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${l.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{l.status}</span>
                                                            <p className="text-[10px] text-gray-400 mt-1">{new Date(l.test_date).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}

                                    {/* ─ Previous Notes ─ */}
                                    {historyTab === 'notes' && (
                                        patientHistory?.consultations.length === 0 ? (
                                            <p className="text-center text-gray-400 py-10">No previous consultations found.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {patientHistory?.consultations.map((c, i) => (
                                                    <div key={i} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <p className="text-xs font-bold text-indigo-600">{new Date(c.created_at).toLocaleDateString()}</p>
                                                                <p className="text-xs text-gray-400">Dr. {c.doctor?.full_name}</p>
                                                            </div>
                                                            {c.status && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${c.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{c.status}</span>}
                                                        </div>
                                                        {[
                                                            { label: 'Chief Complaint', val: c.chief_complaint },
                                                            { label: 'Diagnosis', val: c.diagnosis },
                                                            { label: 'Observations', val: c.physical_examination || c.examination },
                                                            { label: 'Treatment Plan', val: c.treatment_plan },
                                                            { label: 'Remarks', val: c.notes },
                                                        ].map(r => r.val ? (
                                                            <div key={r.label} className="mt-2">
                                                                <p className="text-[10px] text-gray-400 uppercase font-bold">{r.label}</p>
                                                                <p className="text-sm text-gray-700 dark:text-gray-300">{r.val}</p>
                                                            </div>
                                                        ) : null)}
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}

                                    {/* ─ Operations ─ */}
                                    {historyTab === 'ops' && (
                                        patientHistory?.operations.length === 0 ? (
                                            <p className="text-center text-gray-400 py-10">No operation reports found.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {patientHistory?.operations.map((op, idx) => (
                                                    <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                                        <div className="flex justify-between items-start mb-2">
                                                            <p className="font-bold text-gray-800 dark:text-white text-sm">{op.operation_name}</p>
                                                            <p className="text-xs text-gray-400">{new Date(op.operation_date).toLocaleDateString()}</p>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mb-2">Doctor: Dr. {op.surgeon?.full_name}</p>
                                                        {[
                                                            { label: 'Pre-Op Diagnosis', val: op.pre_operative_diagnosis },
                                                            { label: 'Post-Op Diagnosis', val: op.post_operative_diagnosis },
                                                            { label: 'Procedure', val: op.procedure_description },
                                                            { label: 'Findings', val: op.findings },
                                                            { label: 'Complications', val: op.complications },
                                                        ].map(r => r.val ? (
                                                            <div key={r.label} className="mt-2">
                                                                <p className="text-[10px] text-gray-400 uppercase font-bold">{r.label}</p>
                                                                <p className="text-sm text-gray-700 dark:text-gray-300">{r.val}</p>
                                                            </div>
                                                        ) : null)}
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}
                                </div>

                                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                                    <button type="button" onClick={() => setShowHistoryModal(false)}
                                        className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition text-sm">
                                        Close
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
