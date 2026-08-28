import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllPatients } from '../utils/patientUtils';
import { Plus, FileText, Pencil, Trash2, X, Eye, ChevronLeft, ChevronRight, Search, Printer, Download, MessageSquare, Mail, Send, CheckCircle2 } from 'lucide-react';
import { ClinicalDocumentPrintView } from '../components/ClinicalDocumentPrintView';
import { SearchDropdown } from '../components/SearchDropdown';
import { RichTextEditor } from '../components/RichTextEditor';
import { smsService } from '../utils/smsService';
import { logActivity } from '../utils/auditLogger';

/* ─── types ─── */
interface Patient {
    id: string;
    full_name: string;
    patient_number: string;
    gender: string;
    date_of_birth: string;
    phone?: string;
    email?: string;
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
        id?: string;
        full_name: string;
        patient_number: string;
        gender: string;
        date_of_birth: string;
        phone?: string;
        email?: string;
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
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasLoadedOnce = useRef(false);
    const [totalDbCount, setTotalDbCount] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [showPatientModal, setShowPatientModal] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'detailed'>('table');
    const [selectedDoc, setSelectedDoc] = useState<OperationReport | null>(null);
    const [actionTrigger, setActionTrigger] = useState<'none' | 'print' | 'download'>('none');
    const [branch, setBranch] = useState<any>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const handleSearchChange = useCallback((value: string) => {
        setSearchQuery(value);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => { setDebouncedSearch(value); setCurrentPage(1); }, 300);
    }, []);

    /* Notification Trigger States */
    const [showSmsModal, setShowSmsModal] = useState(false);
    const [smsTargetReport, setSmsTargetReport] = useState<OperationReport | null>(null);
    const [smsRecipientPhone, setSmsRecipientPhone] = useState('');
    const [smsMessage, setSmsMessage] = useState('');
    const [sendingSms, setSendingSms] = useState(false);

    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailTargetReport, setEmailTargetReport] = useState<OperationReport | null>(null);
    const [emailRecipient, setEmailRecipient] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);

    const [sendSmsOnSave, setSendSmsOnSave] = useState(false);
    const [sendEmailOnSave, setSendEmailOnSave] = useState(false);

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
        if (profile) { loadReferences(); fetchBranchDetails(); }
        else { setLoading(false); }
    }, [profile?.id]);

    useEffect(() => {
        if (profile) loadRecords();
    }, [currentPage, debouncedSearch, itemsPerPage, profile?.id]);

    async function fetchBranchDetails() {
        if (!profile?.branch_id) return;
        const { data } = await supabase.from('branches').select('name, logo_url, phone, email, address').eq('id', profile?.branch_id).maybeSingle();
        setBranch(data);
    }

    async function loadReferences() {
        try {
            const bid = profile?.branch_id;
            let hospQ = supabase.from('hospitals').select('id, name');
            let anaQ = supabase.from('anaesthetists').select('id, full_name');
            let astQ = supabase.from('assistants').select('id, full_name');
            let docQ = supabase.from('users').select('id, full_name').eq('role', 'doctor').eq('is_active', true);
            let prcQ = supabase.from('surgical_procedures').select('id, name');
            if (bid) {
                hospQ = hospQ.eq('branch_id', bid);
                anaQ = anaQ.eq('branch_id', bid);
                astQ = astQ.eq('branch_id', bid);
                docQ = docQ.eq('branch_id', bid);
                prcQ = prcQ.eq('branch_id', bid);
            }
            const [allPats, hospRes, anaRes, astRes, docRes, prcRes] = await Promise.all([
                fetchAllPatients({ branchId: bid, select: 'id, full_name, patient_number, gender, date_of_birth' }),
                hospQ.order('name'), anaQ.order('full_name'), astQ.order('full_name'),
                docQ.order('full_name'), prcQ.order('name')
            ]);
            setPatients(allPats || []);
            if (!hospRes.error) setHospitals(hospRes.data || []);
            if (!anaRes.error) setAnaesthetists(anaRes.data || []);
            if (!astRes.error) setAssistants(astRes.data || []);
            if (!docRes.error) setDoctors(docRes.data || []);
            if (!prcRes.error) setProcedures(prcRes.data || []);
        } catch (e) { console.error('loadReferences error:', e); }
    }

    async function loadRecords() {
        if (!hasLoadedOnce.current) setLoading(true);
        try {
            const bid = profile?.branch_id;
            const from = (currentPage - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            let q = supabase.from('operation_reports')
                .select('*, patient:patients(id, full_name, patient_number, gender, date_of_birth, phone, email), doctor:users(full_name, specialization, qualifications, signature_url), procedure:surgical_procedures(name), hospital:hospitals(name)', { count: 'exact' })
                .order('operation_date', { ascending: false }).order('created_at', { ascending: false })
                .range(from, to);
            if (bid) q = q.eq('branch_id', bid);

            const { data, error, count } = await q;
            if (error) throw error;

            const mapped = (data || []).map((r: any) => ({
                ...r,
                report_date: r.operation_date,
                doctor_id: r.surgeon_id,
                description: r.procedure_description,
                remarks: r.findings || r.complications
            }));
            setReports(mapped);
            setTotalDbCount(count || 0);
            hasLoadedOnce.current = true;
        } catch (e) { console.error('Operation Reports loadRecords error:', e); }
        finally { setLoading(false); }
    }

    const loadAll = () => { loadRecords(); loadReferences(); };

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
        setSendSmsOnSave(false);
        setSendEmailOnSave(false);
    };

    const handleOpenSmsModal = (report: OperationReport) => {
        const pat = report.patient as any;
        const patientPhone = pat?.phone || patients.find(p => p.id === (report as any).patient_id)?.phone || '';
        const procName = report.procedure?.name || (report as any).procedure_text || (report as any).operation_name || 'Surgical Procedure';
        const docName = report.doctor?.full_name ? `Dr. ${report.doctor.full_name}` : 'Surgeon';
        const hospName = report.hospital?.name || '';
        const reportDate = new Date(report.report_date).toLocaleDateString();

        const defaultSms = `Dear ${pat?.full_name || 'Patient'}, your Operation Report for ${procName} conducted on ${reportDate}${hospName ? ` at ${hospName}` : ''} by ${docName} has been processed. Thank you.`;

        setSmsTargetReport(report);
        setSmsRecipientPhone(patientPhone);
        setSmsMessage(defaultSms);
        setShowSmsModal(true);
    };

    const handleConfirmSendSms = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!smsRecipientPhone.trim()) {
            alert('Please enter a valid phone number.');
            return;
        }
        if (!smsMessage.trim()) {
            alert('SMS message text cannot be blank.');
            return;
        }

        setSendingSms(true);
        try {
            const branchId = profile?.branch_id || '';
            const patId = (smsTargetReport?.patient as any)?.id || (smsTargetReport as any)?.patient_id;

            const res = await smsService.sendSms({
                recipientPhone: smsRecipientPhone.trim(),
                triggerType: 'resource_shared',
                variables: {
                    patient_name: smsTargetReport?.patient?.full_name || 'Patient',
                    title: smsTargetReport?.procedure?.name || 'Operation Report',
                    link: window.location.origin + '/operation-reports',
                    expiry: 'N/A'
                },
                branchId,
                patientId: patId
            });

            if (res.success) {
                alert(`✅ SMS successfully dispatched to ${smsRecipientPhone}!`);
                setShowSmsModal(false);
            } else {
                alert(`⚠️ SMS Logged: ${res.error || 'Sent via SMS queue'}`);
                setShowSmsModal(false);
            }

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'CREATE',
                    tableName: 'sms_logs',
                    details: `Triggered SMS notification for Operation Report ID ${smsTargetReport?.id}`
                });
            }
        } catch (err: any) {
            alert(`Error sending SMS: ${err.message}`);
        } finally {
            setSendingSms(false);
        }
    };

    const handleOpenEmailModal = (report: OperationReport) => {
        const pat = report.patient as any;
        const patientEmail = pat?.email || patients.find(p => p.id === (report as any).patient_id)?.email || '';
        const procName = report.procedure?.name || (report as any).procedure_text || (report as any).operation_name || 'Surgical Procedure';
        const docName = report.doctor?.full_name ? `Dr. ${report.doctor.full_name}` : 'Surgeon';
        const hospName = report.hospital?.name || '';
        const reportDate = new Date(report.report_date).toLocaleDateString();

        const defaultSubject = `Operation Report: ${procName} - ${pat?.full_name || 'Patient'}`;
        const defaultBody = `
            <div style="font-family: Arial, sans-serif; padding: 15px; color: #333;">
                <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">Operation Report Summary</h2>
                <p><strong>Patient Name:</strong> ${pat?.full_name || ''} (${pat?.patient_number || ''})</p>
                <p><strong>Date of Operation:</strong> ${reportDate}</p>
                <p><strong>Procedure Conducted:</strong> ${procName}</p>
                <p><strong>Hospital / Facility:</strong> ${hospName || 'N/A'}</p>
                <p><strong>Surgeon:</strong> ${docName}</p>
                <p><strong>Anaesthesia Type:</strong> ${report.anaesthesia_type || 'General'}</p>
                ${report.description ? `<div style="margin-top:12px; padding:10px; background:#f8fafc; border-left:4px solid #2563eb;"><strong>Operation Description:</strong><br/>${report.description}</div>` : ''}
                ${report.post_op_plan ? `<div style="margin-top:12px; padding:10px; background:#f0fdf4; border-left:4px solid #16a34a;"><strong>Post-Op Plan:</strong><br/>${report.post_op_plan}</div>` : ''}
                ${report.remarks ? `<div style="margin-top:12px; padding:10px; background:#fffbeb; border-left:4px solid #d97706;"><strong>Remarks / Findings:</strong><br/>${report.remarks}</div>` : ''}
                <br/>
                <p style="font-size: 12px; color: #666;">Warm regards,<br/><strong>${branch?.name || 'SpiritMed Medical Center'}</strong></p>
            </div>
        `.trim();

        setEmailTargetReport(report);
        setEmailRecipient(patientEmail);
        setEmailSubject(defaultSubject);
        setEmailBody(defaultBody);
        setShowEmailModal(true);
    };

    const handleConfirmSendEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!emailRecipient.trim()) {
            alert('Please enter a recipient email address.');
            return;
        }
        if (!emailSubject.trim()) {
            alert('Please enter an email subject.');
            return;
        }

        setSendingEmail(true);
        try {
            const branchId = profile?.branch_id || '';
            const { error } = await supabase.from('email_logs').insert([{
                branch_id: branchId,
                recipient_email: emailRecipient.trim(),
                recipient_name: emailTargetReport?.patient?.full_name || 'Patient',
                subject: emailSubject.trim(),
                body: emailBody,
                status: 'sent',
                sent_at: new Date().toISOString()
            }]);

            if (error) throw error;

            alert(`✅ Email successfully logged and sent to ${emailRecipient}!`);
            setShowEmailModal(false);

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'CREATE',
                    tableName: 'email_logs',
                    details: `Triggered Email notification for Operation Report ID ${emailTargetReport?.id}`
                });
            }
        } catch (err: any) {
            alert(`Error sending email: ${err.message}`);
        } finally {
            setSendingEmail(false);
        }
    };

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!form.patient_id) {
            alert('Please select a patient.');
            return;
        }

        const procedureName = procedures.find(p => p.id === form.procedure_id)?.name || '';

        const dbPayload = {
            branch_id: profile?.branch_id,
            patient_id: form.patient_id,
            surgeon_id: form.doctor_id,
            operation_date: form.report_date,
            hospital_id: form.hospital_id || null,
            anaesthetist_ids: form.anaesthetist_ids || [],
            assistant_ids: form.assistant_ids || [],
            anaesthesia_type: form.anaesthesia_type,
            procedure_id: form.procedure_id || null,
            procedure_description: form.description,
            post_op_plan: form.post_op_plan,
            follow_up_date: form.follow_up_date || null,
            follow_up_time: form.follow_up_time || null,
            findings: form.remarks || null,
            operation_name: procedureName || 'Surgical Operation',
            procedure_text: procedureName || null
        };

        try {
            if (selectedDoc) {
                const { error } = await supabase.from('operation_reports').update(dbPayload).eq('id', selectedDoc.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('operation_reports').insert([dbPayload]);
                if (error) throw error;
            }

            // Auto-trigger notifications if checked
            const targetPatient = patients.find(p => p.id === form.patient_id);
            if (sendSmsOnSave && targetPatient?.phone) {
                smsService.sendSms({
                    recipientPhone: targetPatient.phone,
                    triggerType: 'resource_shared',
                    variables: {
                        patient_name: targetPatient.full_name,
                        title: 'Operation Report',
                        link: window.location.origin + '/operation-reports',
                        expiry: 'N/A'
                    },
                    branchId: profile?.branch_id || '',
                    patientId: targetPatient.id
                }).catch(err => console.warn('Auto SMS send warning:', err));
            }

            if (sendEmailOnSave && targetPatient?.email) {
                supabase.from('email_logs').insert([{
                    branch_id: profile?.branch_id || '',
                    recipient_email: targetPatient.email,
                    recipient_name: targetPatient.full_name,
                    subject: `Operation Report: ${procedureName || 'Surgical Operation'}`,
                    body: `<p>Dear ${targetPatient.full_name}, your operation report for ${procedureName || 'the procedure'} conducted on ${form.report_date} has been saved.</p>`,
                    status: 'sent',
                    sent_at: new Date().toISOString()
                }]).catch(err => console.warn('Auto Email send warning:', err));
            }

            setShowModal(false);
            resetForm();
            setCurrentPage(1);
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
                autoPrint={actionTrigger === 'print'}
                autoDownload={actionTrigger === 'download'}
                onBack={() => { setViewMode('table'); setActionTrigger('none'); }}
                onEdit={() => {
                    const { patient, doctor, hospital, procedure, anaesthetist_ids, assistant_ids, created_at, updated_at, id, ...formData } = selectedDoc as any;
                    setForm({
                        ...formData,
                        anaesthetist_ids: anaesthetist_ids || [],
                        assistant_ids: assistant_ids || []
                    } as any);
                    setShowModal(true);
                    setViewMode('table');
                    setActionTrigger('none');
                }}
                onAddNew={() => { resetForm(); setShowModal(true); setViewMode('table'); setActionTrigger('none'); }}
                onSendEmail={() => handleOpenEmailModal(selectedDoc)}
                onSendSms={() => handleOpenSmsModal(selectedDoc)}
            />
        );
    }

    const filteredReports = reports.filter(r => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        const patientName = r.patient?.full_name?.toLowerCase() || '';
        const patientNum = r.patient?.patient_number?.toLowerCase() || '';
        const procName = (r.procedure?.name || (r as any).procedure_text || (r as any).operation_name || '').toLowerCase();
        const docName = r.doctor?.full_name?.toLowerCase() || '';
        const hospName = r.hospital?.name?.toLowerCase() || '';
        return patientName.includes(query) || patientNum.includes(query) || procName.includes(query) || docName.includes(query) || hospName.includes(query);
    });

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Operation Reports</h1>
                    <p className="text-xs sm:text-sm text-gray-500">Document and manage surgical procedure details</p>
                </div>
                <button onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-3.5 py-2 rounded-xl hover:bg-indigo-700 transition shadow-sm text-xs sm:text-sm font-bold shrink-0">
                    <Plus className="w-4 h-4" /> Add New Report
                </button>
            </div>

            {/* 🔍 Search Input Bar */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3.5 mb-5">
                <div className="relative w-full">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        placeholder="Search by patient name, patient ID, procedure, doctor, or hospital..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs sm:text-sm font-medium"
                    />
                </div>
            </div>

            {/* 📱 Mobile Card View (< md) */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="py-10 text-center text-gray-400">Loading reports...</div>
                ) : filteredReports.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm font-medium text-gray-500">No operation reports found matching your search.</div>
                ) : filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(r => (
                    <div key={r.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase">{r.patient?.full_name || 'N/A'}</h3>
                                <p className="text-xs text-gray-500 font-mono">ID: {r.patient?.patient_number || 'N/A'}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                                {r.procedure?.name || (r as any).procedure_text || (r as any).operation_name || 'Operation'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-bold">Report Date</span>
                                <span className="font-semibold text-gray-900 dark:text-white">{new Date(r.report_date).toLocaleDateString()}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block text-[10px] uppercase font-bold">Doctor</span>
                                <span className="font-semibold text-gray-800 dark:text-gray-200">Dr. {r.doctor?.full_name || 'Staff'}</span>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <span className="text-xs text-gray-500 font-medium">{r.hospital?.name || 'Main Hospital'}</span>
                            <div className="flex items-center space-x-1">
                                <button onClick={() => { setSelectedDoc(r); setViewMode('detailed'); setActionTrigger('none'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition" title="View Detail"><Eye className="w-4 h-4" /></button>
                                <button onClick={() => { setSelectedDoc(r); setViewMode('detailed'); setActionTrigger('print'); }} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition" title="Print Report"><Printer className="w-4 h-4" /></button>
                                <button onClick={() => { setSelectedDoc(r); setViewMode('detailed'); setActionTrigger('download'); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition" title="Download PDF"><Download className="w-4 h-4" /></button>
                                <button onClick={() => {
                                    setSelectedDoc(r);
                                    const { patient, doctor, hospital, procedure, created_at, updated_at, id, ...formData } = r as any;
                                    setForm({
                                        ...formData,
                                        anaesthetist_ids: formData.anaesthetist_ids || [],
                                        assistant_ids: formData.assistant_ids || []
                                    } as any);
                                    setShowModal(true);
                                }} className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition" title="Edit"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(r.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
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
                                <th className="px-6 py-4">Procedure</th>
                                <th className="px-6 py-4">Hospital</th>
                                <th className="px-6 py-4">Doctor</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {loading ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Loading reports...</td></tr>
                            ) : filteredReports.length === 0 ? (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">No operation reports found matching your search.</td></tr>
                            ) : filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(r => (
                                <tr key={r.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition group">
                                    <td className="px-6 py-4 text-sm font-medium text-gray-600 dark:text-gray-400">{new Date(r.report_date).toLocaleDateString()}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">{r.patient?.full_name}</span>
                                            <span className="text-[10px] text-gray-400">{r.patient?.patient_number}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-indigo-600 dark:text-indigo-400">{r.procedure?.name || (r as any).procedure_text || (r as any).operation_name || 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{r.hospital?.name || 'N/A'}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500 font-medium">Dr. {r.doctor?.full_name}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-1.5">
                                            <button onClick={() => { setSelectedDoc(r); setViewMode('detailed'); setActionTrigger('none'); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition" title="View Detail"><Eye className="w-4 h-4" /></button>
                                            <button onClick={() => { setSelectedDoc(r); setViewMode('detailed'); setActionTrigger('print'); }} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition" title="Print Report"><Printer className="w-4 h-4" /></button>
                                            <button onClick={() => { setSelectedDoc(r); setViewMode('detailed'); setActionTrigger('download'); }} className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition" title="Download PDF"><Download className="w-4 h-4" /></button>
                                            <button onClick={() => handleOpenSmsModal(r)} className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition" title="Send SMS"><MessageSquare className="w-4 h-4" /></button>
                                            <button onClick={() => handleOpenEmailModal(r)} className="p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded transition" title="Send Email"><Mail className="w-4 h-4" /></button>
                                            <button onClick={() => {
                                                setSelectedDoc(r);
                                                const { patient, doctor, hospital, procedure, created_at, updated_at, id, ...formData } = r as any;
                                                setForm({
                                                    ...formData,
                                                    anaesthetist_ids: formData.anaesthetist_ids || [],
                                                    assistant_ids: formData.assistant_ids || []
                                                } as any);
                                                setShowModal(true);
                                            }} className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition" title="Edit"><Pencil className="w-4 h-4" /></button>
                                            <button onClick={() => handleDelete(r.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded transition" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Controls */}
                {!loading && filteredReports.length > 0 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
                        <div className="flex items-center gap-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Showing <span className="font-bold text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filteredReports.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{filteredReports.length}</span> reports
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
                        {Math.ceil(reports.length / itemsPerPage) > 1 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent transition text-gray-600 dark:text-gray-400"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="flex gap-1">
                                    {Array.from({ length: Math.ceil(reports.length / itemsPerPage) }, (_, i) => i + 1).map(page => (
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
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(reports.length / itemsPerPage)))}
                                    disabled={currentPage === Math.ceil(reports.length / itemsPerPage)}
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
                                    <RichTextEditor value={form.description} onChange={val => setForm({ ...form, description: val })} placeholder="Detailed description of the procedure..." />
                                </div>

                                <div>
                                    <label className={labelCls}>Post Operation Plan</label>
                                    <RichTextEditor value={form.post_op_plan} onChange={val => setForm({ ...form, post_op_plan: val })} placeholder="Immediate post-operative instructions..." />
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
                                    <RichTextEditor value={form.remarks} onChange={val => setForm({ ...form, remarks: val })} placeholder="Any other observations or notes..." />
                                </div>

                                <div className="flex flex-wrap items-center gap-6 py-3 border-t border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 px-3 rounded-lg mt-4">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={sendSmsOnSave}
                                            onChange={(e) => setSendSmsOnSave(e.target.checked)}
                                            className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                        />
                                        <span>📱 Send SMS Notification on Save</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={sendEmailOnSave}
                                            onChange={(e) => setSendEmailOnSave(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <span>✉️ Send Email Notification on Save</span>
                                    </label>
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
            {/* Send SMS Modal */}
            {showSmsModal && smsTargetReport && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-purple-50 dark:bg-purple-900/30">
                            <h2 className="text-lg font-bold text-purple-900 dark:text-purple-200 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-purple-600" /> Send Operation Report SMS
                            </h2>
                            <button onClick={() => setShowSmsModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleConfirmSendSms} className="p-6 space-y-4">
                            <div>
                                <label className={labelCls}>Patient Name</label>
                                <input type="text" disabled value={smsTargetReport.patient?.full_name || 'Patient'} className={`${inputCls} bg-gray-100 dark:bg-gray-800 cursor-not-allowed`} />
                            </div>
                            <div>
                                <label className={labelCls}>Recipient Phone Number *</label>
                                <input required type="tel" placeholder="+263 77 000 0000" value={smsRecipientPhone} onChange={e => setSmsRecipientPhone(e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>SMS Message Text *</label>
                                <textarea required rows={4} value={smsMessage} onChange={e => setSmsMessage(e.target.value)} className={inputCls} placeholder="Type SMS message..." />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowSmsModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
                                <button type="submit" disabled={sendingSms} className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold transition shadow-md flex items-center gap-2 disabled:opacity-50">
                                    <Send className="w-4 h-4" /> {sendingSms ? 'Sending...' : 'Send SMS Now'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Send Email Modal */}
            {showEmailModal && emailTargetReport && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-blue-50 dark:bg-blue-900/30">
                            <h2 className="text-lg font-bold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                                <Mail className="w-5 h-5 text-blue-600" /> Send Operation Report Email
                            </h2>
                            <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleConfirmSendEmail} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Patient Name</label>
                                    <input type="text" disabled value={emailTargetReport.patient?.full_name || 'Patient'} className={`${inputCls} bg-gray-100 dark:bg-gray-800 cursor-not-allowed`} />
                                </div>
                                <div>
                                    <label className={labelCls}>Recipient Email Address *</label>
                                    <input required type="email" placeholder="patient@example.com" value={emailRecipient} onChange={e => setEmailRecipient(e.target.value)} className={inputCls} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>Email Subject *</label>
                                <input required type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Email Body (Formatted HTML Summary)</label>
                                <RichTextEditor value={emailBody} onChange={val => setEmailBody(val)} minHeight="160px" />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowEmailModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition">Cancel</button>
                                <button type="submit" disabled={sendingEmail} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition shadow-md flex items-center gap-2 disabled:opacity-50">
                                    <Send className="w-4 h-4" /> {sendingEmail ? 'Sending Email...' : 'Send Email Now'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
