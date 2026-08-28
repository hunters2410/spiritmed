import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllPatients } from '../utils/patientUtils';
import { logActivity } from '../utils/auditLogger';
import { formatFileNumber, formatPatientNumber } from '../utils/patientUtils';
import { exportElementToPdf } from '../utils/exportUtils';
import { SearchDropdown } from '../components/SearchDropdown';
import { RemarksQuickInput } from '../components/RemarksQuickInput';
import { AppointmentPatientFilesModal } from '../components/AppointmentPatientFilesModal';
import { getAppointmentTypeBadge, fetchOrGenerateDoctorSlots } from '../utils/appointmentUtils';
import { recordRemarkUsage } from '../utils/remarksUtils';
import { smsService } from '../utils/smsService';
import { emailService } from '../utils/emailService';
import { notificationService } from '../utils/notificationService';
import {
    Search, Calendar, Calendar as CalendarIcon, Clock, User, Phone, Mail, MapPin, Heart, Shield,
    DollarSign, CreditCard, Receipt, FileText, Activity, Stethoscope, Pill,
    ClipboardList, FilePlus, ClipboardCheck, FileCheck, ScrollText, ChevronDown,
    ChevronRight, ArrowLeft, Plus, Eye, Printer, Download, CheckCircle2,
    AlertCircle, X, History, Building2, UserPlus, Sparkles, ExternalLink,
    Filter, ArrowUpRight, FolderOpen, HeartPulse, RefreshCw, Send, Check, Edit, Trash2
} from 'lucide-react';

/* ─── Interfaces ─── */
interface Patient {
    id: string;
    title?: string;
    patient_number: string;
    file_number?: string;
    national_id?: string;
    full_name: string;
    date_of_birth: string;
    gender: string;
    phone: string;
    email: string;
    address?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relationship?: string;
    responsible_person_name?: string;
    responsible_person_phone?: string;
    responsible_person_email?: string;
    responsible_person_address?: string;
    responsible_person_relationship?: string;
    marital_status?: string;
    occupation?: string;
    blood_group?: string;
    allergies?: string;
    status: string;
    medical_aid_id?: string;
    medical_aid_number?: string;
    medical_aid_suffix?: string;
    medical_aid_main_member?: string;
    medical_aid?: { name: string };
    total_due?: number;
    total_shortfall_due?: number;
    total_medical_aid_due?: number;
    created_at: string;
}

interface Doctor {
    id: string;
    full_name: string;
    specialization?: string;
}

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5);
};

const getAge = (dobString?: string) => {
    if (!dobString) return 'N/A';
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return 'N/A';
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return `${age} YRS`;
};

const renderHtmlOrText = (text?: string) => {
    if (!text) return '—';
    if (/<[a-z][\s\S]*>/i.test(text)) {
        return <div dangerouslySetInnerHTML={{ __html: text }} className="rich-text-content inline-block text-xs" />;
    }
    return text;
};

export function PatientHistory() {
    const { profile, hasPermission } = useAuth();
    const printRef = useRef<HTMLDivElement>(null);

    const canAppts = hasPermission('appointments', 'view');
    const canConsults = hasPermission('consultations', 'view') || hasPermission('medical_records', 'view');
    const canRx = hasPermission('prescriptions', 'view') || hasPermission('medical_records', 'view');
    const canAdm = hasPermission('admission_letters', 'view') || hasPermission('clinical_reports', 'view');
    const canOps = hasPermission('operation_reports', 'view') || hasPermission('clinical_reports', 'view');
    const canDisch = hasPermission('discharge_summaries', 'view') || hasPermission('clinical_reports', 'view');
    const canCert = hasPermission('medical_certificates', 'view') || hasPermission('clinical_reports', 'view');
    const canMedRep = hasPermission('medical_reports', 'view') || hasPermission('clinical_reports', 'view');
    const canRef = hasPermission('referral_forms', 'view') || hasPermission('clinical_reports', 'view');
    const canVitals = hasPermission('vital_signs', 'view') || hasPermission('medical_records', 'view');
    const canLabs = hasPermission('lab_results', 'view') || hasPermission('medical_records', 'view');
    const canFiles = hasPermission('patient_files', 'view') || hasPermission('patients', 'view');
    const canBills = hasPermission('billing', 'view');
    const canEstimates = hasPermission('estimates', 'view') || hasPermission('billing', 'view');
    const canPayments = hasPermission('payments', 'view') || hasPermission('billing', 'view');

    // Patient selection
    const [patients, setPatients] = useState<Patient[]>([]);
    const [selectedPatientId, setSelectedPatientId] = useState<string>('');
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
    const [searchPatientText, setSearchPatientText] = useState('');
    const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
    const patientDropdownRef = useRef<HTMLDivElement>(null);

    // Doctors & metadata
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [branch, setBranch] = useState<any>(null);

    // Loading & Active tab
    const [loadingPatients, setLoadingPatients] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [activeTab, setActiveTab] = useState<'timeline' | 'appointments' | 'consultations' | 'prescriptions' | 'admissions' | 'surgeries' | 'discharges' | 'certificates' | 'vitals' | 'financials' | 'files'>('timeline');

    // Clinical & Financial Data
    const [appointments, setAppointments] = useState<any[]>([]);
    const [consultations, setConsultations] = useState<any[]>([]);
    const [prescriptions, setPrescriptions] = useState<any[]>([]);
    const [admissions, setAdmissions] = useState<any[]>([]);
    const [operationReports, setOperationReports] = useState<any[]>([]);
    const [dischargeSummaries, setDischargeSummaries] = useState<any[]>([]);
    const [medicalCertificates, setMedicalCertificates] = useState<any[]>([]);
    const [medicalReports, setMedicalReports] = useState<any[]>([]);
    const [referralForms, setReferralForms] = useState<any[]>([]);
    const [vitalSigns, setVitalSigns] = useState<any[]>([]);
    const [labResults, setLabResults] = useState<any[]>([]);
    const [patientFiles, setPatientFiles] = useState<any[]>([]);
    const [bills, setBills] = useState<any[]>([]);
    const [estimateBills, setEstimateBills] = useState<any[]>([]);
    const [payments, setPayments] = useState<any[]>([]);

    // Book / Edit Appointment Modal State
    const [showBookModal, setShowBookModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [submittingBooking, setSubmittingBooking] = useState(false);
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [availableSlots, setAvailableSlots] = useState<any[]>([]);
    const [selectedSlotId, setSelectedSlotId] = useState<string>('');
    const [slotMessage, setSlotMessage] = useState<string>('');
    const [selectedHistoryAppointmentIds, setSelectedHistoryAppointmentIds] = useState<string[]>([]);
    const [showQuickAddPatientModal, setShowQuickAddPatientModal] = useState(false);
    const [submittingQuickPatient, setSubmittingQuickPatient] = useState(false);
    const [newQuickPatient, setNewQuickPatient] = useState({
        full_name: '',
        phone: '',
        gender: 'male',
        date_of_birth: '',
        email: '',
        file_number: '',
        address: ''
    });
    const [bookingForm, setBookingForm] = useState({
        patient_id: '',
        doctor_id: '',
        appointment_date: new Date().toISOString().split('T')[0],
        appointment_time: '',
        duration_minutes: 30,
        appointment_type: 'consultation',
        notes: '',
        status: 'pending_confirmation',
        cancellation_reason: ''
    });

    // Inline Table Editing State
    const [editingCell, setEditingCell] = useState<{ id: string; type: 'date' | 'time' } | null>(null);
    const [tempValue, setTempValue] = useState<string>('');

    // Cancel Appointment Modal State
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancellingAppointmentId, setCancellingAppointmentId] = useState<string | null>(null);
    const [cancellationReason, setCancellationReason] = useState('');

    // Patient Files Modal State
    const [showFilesModal, setShowFilesModal] = useState(false);
    const [selectedPatientForFiles, setSelectedPatientForFiles] = useState<{ id: string; name: string; number?: string } | null>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (patientDropdownRef.current && !patientDropdownRef.current.contains(e.target as Node)) {
                setIsPatientDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Load branch info and doctors
    useEffect(() => {
        if (!profile?.branch_id) return;
        supabase.from('branches').select('*').eq('id', profile.branch_id).maybeSingle()
            .then(({ data }) => { if (data) setBranch(data); });

        supabase.from('users').select('id, full_name, specialization').eq('role', 'doctor').eq('is_active', true).order('full_name')
            .then(({ data }) => {
                if (data) setDoctors(data);
            });
    }, [profile?.branch_id]);

    const fetchPatientById = async (patientId: string): Promise<Patient | null> => {
        if (!patientId) return null;
        try {
            const { data, error } = await supabase
                .from('patients')
                .select('*, medical_aid:medical_aids(name)')
                .eq('id', patientId)
                .maybeSingle();

            if (!error && data) {
                setSelectedPatient(data as Patient);
                return data as Patient;
            }

            // Fallback direct query if foreign join fails
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('patients')
                .select('*')
                .eq('id', patientId)
                .maybeSingle();

            if (!fallbackError && fallbackData) {
                // Also attempt to get medical aid name separately if available
                if (fallbackData.medical_aid_id) {
                    const { data: maData } = await supabase.from('medical_aids').select('name').eq('id', fallbackData.medical_aid_id).maybeSingle();
                    if (maData) fallbackData.medical_aid = maData;
                }
                setSelectedPatient(fallbackData as Patient);
                return fallbackData as Patient;
            }
        } catch (err) {
            console.error('Error fetching patient by ID:', err);
        }
        return null;
    };

    // Load initial patient list & parse URL param
    useEffect(() => {
        let isMounted = true;

        async function init() {
            setLoadingPatients(true);

            // 1. Check URL for ?patientId=
            const urlParams = new URLSearchParams(window.location.search);
            const urlPatientId = urlParams.get('patientId');

            if (urlPatientId) {
                setSelectedPatientId(urlPatientId);
                fetchPatientById(urlPatientId);
                loadFullHistory(urlPatientId);
            }

            // 2. Fetch complete list for dropdown selector (all patients without 1,000 ceiling)
            try {
                const all = await fetchAllPatients({
                    select: 'id, full_name, patient_number, file_number, national_id, phone, gender, date_of_birth, status',
                    activeOnly: false
                });

                if (isMounted && all && all.length > 0) {
                    setPatients(all);
                    // If no URL param, select the first patient
                    if (!urlPatientId && all[0]) {
                        setSelectedPatientId(all[0].id);
                        fetchPatientById(all[0].id);
                        loadFullHistory(all[0].id);
                    }
                }
            } catch (err) {
                console.error('Error loading patients:', err);
            } finally {
                if (isMounted) setLoadingPatients(false);
            }
        }

        init();

        const onPopState = () => {
            const params = new URLSearchParams(window.location.search);
            const pid = params.get('patientId');
            if (pid && pid !== selectedPatientId) {
                setSelectedPatientId(pid);
                fetchPatientById(pid);
                loadFullHistory(pid);
            }
        };
        window.addEventListener('popstate', onPopState);

        return () => {
            isMounted = false;
            window.removeEventListener('popstate', onPopState);
        };
    }, []);

    // Live search query to find any matching patient directly from database
    useEffect(() => {
        if (!searchPatientText || searchPatientText.trim().length < 2) return;
        const q = searchPatientText.trim();
        const timeout = setTimeout(async () => {
            try {
                const { data, error } = await supabase
                    .from('patients')
                    .select('id, full_name, patient_number, file_number, national_id, phone, gender, date_of_birth, status')
                    .or(`full_name.ilike.%${q}%,patient_number.ilike.%${q}%,file_number.ilike.%${q}%,national_id.ilike.%${q}%,phone.ilike.%${q}%`)
                    .limit(200);

                if (!error && data && data.length > 0) {
                    setPatients(prev => {
                        const map = new Map<string, Patient>();
                        prev.forEach(p => map.set(p.id, p));
                        data.forEach(p => map.set(p.id, p as Patient));
                        return Array.from(map.values()).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
                    });
                }
            } catch (err) {
                console.error('Live search error:', err);
            }
        }, 200);

        return () => clearTimeout(timeout);
    }, [searchPatientText]);

    const handleSelectPatient = (patientId: string) => {
        setSelectedPatientId(patientId);
        setIsPatientDropdownOpen(false);
        setSearchPatientText('');
        fetchPatientById(patientId);
        loadFullHistory(patientId);

        // Update URL query string without reloading page
        const newUrl = `${window.location.pathname}?patientId=${patientId}`;
        window.history.pushState({ path: newUrl }, '', newUrl);
    };

    const loadFullHistory = async (patientId: string) => {
        if (!patientId) return;
        setLoadingHistory(true);
        try {
            const safeQuery = async (queryPromise: PromiseLike<any>) => {
                try {
                    const res = await queryPromise;
                    if (res?.error) {
                        console.warn('Sub-query warning:', res.error.message || res.error);
                        return [];
                    }
                    return res?.data || [];
                } catch (e) {
                    console.warn('Patient history sub-query catch:', e);
                    return [];
                }
            };

            // 1. Fetch Reference Maps in Parallel
            const [
                usersRes,
                hospitalsRes,
                diagnosesRes,
                proceduresRes,
                medicinesRes,
                frequenciesRes,
                referralDocsRes,
                medicalAidsRes
            ] = await Promise.all([
                safeQuery(supabase.from('users').select('id, full_name, specialization, email, role')),
                safeQuery(supabase.from('hospitals').select('id, name')),
                safeQuery(supabase.from('diagnoses').select('id, name, icd10_code')),
                safeQuery(supabase.from('surgical_procedures').select('id, name')),
                safeQuery(supabase.from('medicines').select('id, name, dosage, route, frequency_id')),
                safeQuery(supabase.from('medicine_frequencies').select('id, name')),
                safeQuery(supabase.from('referral_doctors').select('id, full_name, hospital_affiliation, specialty')),
                safeQuery(supabase.from('medical_aids').select('id, name'))
            ]);

            const usersMap = new Map<string, any>(usersRes.map((u: any) => [u.id, u]));
            const hospitalsMap = new Map<string, any>(hospitalsRes.map((h: any) => [h.id, h]));
            const diagnosesMap = new Map<string, any>(diagnosesRes.map((d: any) => [d.id, d]));
            const proceduresMap = new Map<string, any>(proceduresRes.map((p: any) => [p.id, p]));
            const frequenciesMap = new Map<string, any>(frequenciesRes.map((f: any) => [f.id, f]));
            const medicinesMap = new Map<string, any>(medicinesRes.map((m: any) => [
                m.id,
                { ...m, frequency: m.frequency_id ? frequenciesMap.get(m.frequency_id) : undefined }
            ]));
            const referralDocsMap = new Map<string, any>(referralDocsRes.map((r: any) => [r.id, r]));
            const medicalAidsMap = new Map<string, any>(medicalAidsRes.map((ma: any) => [ma.id, ma]));

            // 2. Fetch all raw patient records across all clinical and financial modules (Strictly gated)
            const [
                rawAppts,
                rawConsults,
                rawRx,
                rawAdm,
                rawOps,
                rawDisch,
                rawCert,
                rawMedRep,
                rawRef,
                rawVitals,
                rawLabs,
                rawFiles,
                rawBills,
                rawEstimateBills,
                rawPaymentsDirect
            ] = await Promise.all([
                canAppts ? safeQuery(supabase.from('appointments').select('*').eq('patient_id', patientId).order('appointment_date', { ascending: false })) : Promise.resolve([]),
                canConsults ? safeQuery(supabase.from('consultations').select('*').eq('patient_id', patientId).order('consultation_date', { ascending: false })) : Promise.resolve([]),
                canRx ? safeQuery(supabase.from('prescriptions').select('*').eq('patient_id', patientId).order('prescription_date', { ascending: false })) : Promise.resolve([]),
                canAdm ? safeQuery(supabase.from('admission_forms').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canOps ? safeQuery(supabase.from('operation_reports').select('*').eq('patient_id', patientId).order('operation_date', { ascending: false })) : Promise.resolve([]),
                canDisch ? safeQuery(supabase.from('discharge_summaries').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canCert ? safeQuery(supabase.from('medical_certificates').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canMedRep ? safeQuery(supabase.from('medical_reports').select('*').eq('patient_id', patientId).order('report_date', { ascending: false })) : Promise.resolve([]),
                canRef ? safeQuery(supabase.from('referral_forms').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canVitals ? safeQuery(supabase.from('vital_signs').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canLabs ? safeQuery(supabase.from('lab_results').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canFiles ? safeQuery(supabase.from('patient_files').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canBills ? safeQuery(supabase.from('bills').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canEstimates ? safeQuery(supabase.from('estimate_bills').select('*').eq('patient_id', patientId).order('created_at', { ascending: false })) : Promise.resolve([]),
                canPayments ? safeQuery(supabase.from('payments').select('*').eq('patient_id', patientId).order('payment_date', { ascending: false })) : Promise.resolve([]),
            ]);

            // 3. Child records (Prescription Items, Bill Items, Estimate Bill Items, Payments by bill_id)
            const rxIds = rawRx.map((r: any) => r.id).filter(Boolean);
            const billIds = rawBills.map((b: any) => b.id).filter(Boolean);
            const estimateIds = rawEstimateBills.map((e: any) => e.id).filter(Boolean);

            const [rawRxItems, rawBillItems, rawEstItems, extraPayments] = await Promise.all([
                rxIds.length > 0
                    ? safeQuery(supabase.from('prescription_items').select('*').in('prescription_id', rxIds))
                    : Promise.resolve([]),
                billIds.length > 0
                    ? safeQuery(supabase.from('bill_items').select('*').in('bill_id', billIds))
                    : Promise.resolve([]),
                estimateIds.length > 0
                    ? safeQuery(supabase.from('estimate_bill_items').select('*').in('estimate_bill_id', estimateIds))
                    : Promise.resolve([]),
                billIds.length > 0
                    ? safeQuery(supabase.from('payments').select('*').in('bill_id', billIds))
                    : Promise.resolve([]),
            ]);

            // Combine and deduplicate payments
            const allPaymentsMap = new Map<string, any>();
            rawPaymentsDirect.forEach((p: any) => allPaymentsMap.set(p.id, p));
            extraPayments.forEach((p: any) => allPaymentsMap.set(p.id, p));
            const unifiedPayments = Array.from(allPaymentsMap.values()).sort(
                (a, b) => new Date(b.payment_date || b.created_at || 0).getTime() - new Date(a.payment_date || a.created_at || 0).getTime()
            );

            // Group prescription items
            const rxItemsMap = new Map<string, any[]>();
            rawRxItems.forEach((item: any) => {
                const list = rxItemsMap.get(item.prescription_id) || [];
                const med = medicinesMap.get(item.medicine_id) || {
                    id: item.medicine_id,
                    name: item.medicine_name || 'Prescribed Medicine',
                    dosage: item.dosage || '',
                    route: item.route || ''
                };
                list.push({
                    ...item,
                    medicine: med
                });
                rxItemsMap.set(item.prescription_id, list);
            });

            // Group bill items
            const billItemsMap = new Map<string, any[]>();
            rawBillItems.forEach((item: any) => {
                const list = billItemsMap.get(item.bill_id) || [];
                list.push(item);
                billItemsMap.set(item.bill_id, list);
            });

            // Group estimate bill items
            const estimateItemsMap = new Map<string, any[]>();
            rawEstItems.forEach((item: any) => {
                const list = estimateItemsMap.get(item.estimate_bill_id) || [];
                list.push(item);
                estimateItemsMap.set(item.estimate_bill_id, list);
            });

            // 4. Enrich Clinical Records with Relationships
            const activePatient = patients.find(p => p.id === patientId) || selectedPatient;
            const enrichedAppts = rawAppts.map((a: any) => ({
                ...a,
                doctor: usersMap.get(a.doctor_id) || { full_name: 'Attending Doctor' },
                users: usersMap.get(a.doctor_id) || { full_name: 'Attending Doctor' },
                patients: activePatient || { id: a.patient_id, full_name: 'Patient', phone: '', email: '', file_number: '', patient_number: '' }
            }));

            const enrichedConsults = rawConsults.map((c: any) => ({
                ...c,
                doctor: usersMap.get(c.doctor_id) || { full_name: 'Consulting Physician' },
                referral_doctor: referralDocsMap.get(c.referred_by)
            }));

            const enrichedRx = rawRx.map((r: any) => ({
                ...r,
                doctor: usersMap.get(r.doctor_id) || { full_name: 'Prescribing Doctor' },
                prescription_items: rxItemsMap.get(r.id) || []
            }));

            const enrichedAdm = rawAdm.map((adm: any) => ({
                ...adm,
                doctor: usersMap.get(adm.doctor_id) || { full_name: 'Admitting Doctor' },
                hospital: hospitalsMap.get(adm.hospital_id) || (adm.hospital_name ? { name: adm.hospital_name } : undefined),
                diagnosis: diagnosesMap.get(adm.diagnosis_id) || (adm.diagnosis_ids?.[0] ? diagnosesMap.get(adm.diagnosis_ids[0]) : undefined)
            }));

            const enrichedOps = rawOps.map((op: any) => ({
                ...op,
                surgeon: usersMap.get(op.surgeon_id || op.doctor_id) || { full_name: 'Lead Surgeon' },
                doctor: usersMap.get(op.surgeon_id || op.doctor_id) || { full_name: 'Lead Surgeon' },
                hospital: hospitalsMap.get(op.hospital_id) || (op.hospital_name ? { name: op.hospital_name } : undefined),
                procedure: proceduresMap.get(op.procedure_id) || (op.procedure_name ? { name: op.procedure_name } : undefined)
            }));

            const enrichedDisch = rawDisch.map((d: any) => ({
                ...d,
                doctor: usersMap.get(d.doctor_id) || { full_name: 'Discharging Doctor' },
                diagnosis: diagnosesMap.get(d.diagnosis_id) || (d.diagnosis_ids?.[0] ? diagnosesMap.get(d.diagnosis_ids[0]) : undefined)
            }));

            const enrichedCert = rawCert.map((mc: any) => ({
                ...mc,
                doctor: usersMap.get(mc.doctor_id) || { full_name: 'Attending Doctor' }
            }));

            const enrichedMedRep = rawMedRep.map((mr: any) => ({
                ...mr,
                doctor: usersMap.get(mr.doctor_id) || { full_name: 'Reporting Doctor' },
                diagnosis: diagnosesMap.get(mr.diagnosis_id)
            }));

            const enrichedRef = rawRef.map((ref: any) => ({
                ...ref,
                referring_doctor: usersMap.get(ref.doctor_id || ref.referring_doctor_id) || { full_name: 'Referring Doctor' }
            }));

            const enrichedVitals = rawVitals.map((v: any) => {
                const systolic = v.blood_pressure_systolic;
                const diastolic = v.blood_pressure_diastolic;
                const bpFormatted = (systolic && diastolic) ? `${systolic}/${diastolic}` : (v.blood_pressure || '—');
                const pulseFormatted = v.pulse_rate || v.pulse || '—';
                const spo2Formatted = v.oxygen_saturation || v.spo2 || '—';
                const weightNum = parseFloat(v.weight);
                const heightNum = parseFloat(v.height);
                const computedBmi = (weightNum && heightNum)
                    ? (weightNum / Math.pow(heightNum > 3 ? heightNum / 100 : heightNum, 2)).toFixed(1)
                    : (v.bmi || '—');

                return {
                    ...v,
                    blood_pressure: bpFormatted,
                    pulse: pulseFormatted,
                    spo2: spo2Formatted,
                    bmi: computedBmi,
                    recorded_by_user: usersMap.get(v.recorded_by) || { full_name: 'Staff / Nurse' }
                };
            });

            const enrichedFiles = rawFiles.map((f: any) => ({
                ...f,
                uploader: usersMap.get(f.uploaded_by) || { full_name: 'Hospital Staff' }
            }));

            const enrichedBills = rawBills.map((b: any) => ({
                ...b,
                bill_items: billItemsMap.get(b.id) || [],
                medical_aid: medicalAidsMap.get(b.medical_aid_id)
            }));

            const enrichedEstimates = rawEstimateBills.map((e: any) => ({
                ...e,
                estimate_bill_items: estimateItemsMap.get(e.id) || [],
                medical_aid: medicalAidsMap.get(e.medical_aid_id)
            }));

            const billsMap = new Map<string, any>(enrichedBills.map((b: any) => [b.id, b]));
            const enrichedPayments = unifiedPayments.map((p: any) => ({
                ...p,
                bill: billsMap.get(p.bill_id) || p.bill
            }));

            // 5. Update All Component States
            setAppointments(enrichedAppts);
            setConsultations(enrichedConsults);
            setPrescriptions(enrichedRx);
            setAdmissions(enrichedAdm);
            setOperationReports(enrichedOps);
            setDischargeSummaries(enrichedDisch);
            setMedicalCertificates(enrichedCert);
            setMedicalReports(enrichedMedRep);
            setReferralForms(enrichedRef);
            setVitalSigns(enrichedVitals);
            setLabResults(rawLabs);
            setPatientFiles(enrichedFiles);
            setBills(enrichedBills);
            setEstimateBills(enrichedEstimates);
            setPayments(enrichedPayments);
        } catch (err) {
            console.error('Error loading patient history:', err);
        } finally {
            setLoadingHistory(false);
        }
    };

    // Calculate Financial KPIs
    const totalBilled = bills.reduce((acc, b) => acc + Number(b.total_amount || b.amount || 0), 0);
    const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const totalBalance = Math.max(0, totalBilled - totalPaid);

    // Doctor slot and duration effects
    useEffect(() => {
        if (bookingForm.doctor_id && bookingForm.appointment_date) {
            loadAvailableSlots(bookingForm.doctor_id, bookingForm.appointment_date);
        } else {
            setAvailableSlots([]);
        }
    }, [bookingForm.doctor_id, bookingForm.appointment_date]);

    useEffect(() => {
        if (bookingForm.doctor_id) {
            fetchDoctorDuration(bookingForm.doctor_id);
        }
    }, [bookingForm.doctor_id]);

    const fetchDoctorDuration = async (doctorId: string) => {
        if (!doctorId) return;
        try {
            const { data, error } = await supabase
                .from('doctor_availability')
                .select('slot_duration')
                .eq('doctor_id', doctorId)
                .eq('is_active', true)
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (data && data.slot_duration) {
                setBookingForm(prev => ({ ...prev, duration_minutes: data.slot_duration }));
            } else {
                setBookingForm(prev => ({ ...prev, duration_minutes: 30 }));
            }
        } catch (error) {
            console.error('Error fetching doctor slot duration:', error);
        }
    };

    const loadAvailableSlots = async (doctorId: string, date: string) => {
        try {
            setSelectedSlotId('');
            const { slots, message } = await fetchOrGenerateDoctorSlots(
                supabase,
                doctorId,
                date,
                profile?.branch_id
            );
            setAvailableSlots(slots || []);
            setSlotMessage(message || '');
        } catch (error) {
            console.error('Error loading available slots:', error);
        }
    };

    const getLocalDateTimeComponents = (dateString: string) => {
        const d = new Date(dateString);
        if (isNaN(d.getTime())) {
            return { dateStr: '', timeStr: '' };
        }
        const dateStr = [
            d.getFullYear(),
            String(d.getMonth() + 1).padStart(2, '0'),
            String(d.getDate()).padStart(2, '0')
        ].join('-');

        const timeStr = [
            String(d.getHours()).padStart(2, '0'),
            String(d.getMinutes()).padStart(2, '0')
        ].join(':');

        return { dateStr, timeStr };
    };

    const handleSelectSlot = (slot: any) => {
        setSelectedSlotId(slot.id);
        const { dateStr, timeStr } = getLocalDateTimeComponents(slot.start_time);
        const duration = Math.round((new Date(slot.end_time).getTime() - new Date(slot.start_time).getTime()) / 60000) || bookingForm.duration_minutes;
        setBookingForm(prev => ({
            ...prev,
            appointment_date: dateStr,
            appointment_time: timeStr,
            duration_minutes: duration
        }));
    };

    const formatTime = (dateString: string) => {
        if (!dateString) return '—';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return '—';
        const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
        if (isDateOnly) return '—';
        return d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmed': return 'bg-green-100 text-green-700';
            case 'pending_confirmation': return 'bg-yellow-100 text-yellow-700';
            case 'cancelled': return 'bg-red-100 text-red-700';
            case 'treated': return 'bg-blue-100 text-blue-700';
            case 'completed': return 'bg-purple-100 text-purple-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const saveInlineDate = async (id: string) => {
        setEditingCell(null);
        const appointment = appointments.find(a => a.id === id);
        if (!appointment) return;

        const { timeStr } = getLocalDateTimeComponents(appointment.appointment_date);
        const newDateTime = `${tempValue}T${timeStr || '09:00:00'}`;

        // Prevent duplicate booking for the same patient on the same date
        const dateStr = tempValue;
        const startOfDay = `${dateStr}T00:00:00`;
        const endOfDay = `${dateStr}T23:59:59`;

        const { data: existingAppts } = await supabase
            .from('appointments')
            .select('id')
            .eq('patient_id', appointment.patient_id || selectedPatientId)
            .gte('appointment_date', startOfDay)
            .lte('appointment_date', endOfDay)
            .neq('id', id)
            .neq('status', 'cancelled');

        if (existingAppts && existingAppts.length > 0) {
            alert(`Duplicate Booking Blocked: Patient "${appointment.patients?.full_name || selectedPatient?.full_name || 'Selected patient'}" already has another active appointment booked on ${dateStr}.`);
            return;
        }

        try {
            const { error } = await supabase
                .from('appointments')
                .update({ appointment_date: newDateTime })
                .eq('id', id);

            if (error) throw error;
            setAppointments(prev => prev.map(a => a.id === id ? { ...a, appointment_date: newDateTime } : a));
        } catch (err) {
            console.error('Error saving inline date:', err);
            alert('Failed to update date');
        }
    };

    const saveInlineTime = async (id: string) => {
        setEditingCell(null);
        const appointment = appointments.find(a => a.id === id);
        if (!appointment) return;

        const { dateStr } = getLocalDateTimeComponents(appointment.appointment_date);
        const newDateTime = `${dateStr || new Date().toISOString().split('T')[0]}T${tempValue}:00`;

        try {
            const { error } = await supabase
                .from('appointments')
                .update({ appointment_date: newDateTime })
                .eq('id', id);

            if (error) throw error;
            setAppointments(prev => prev.map(a => a.id === id ? { ...a, appointment_date: newDateTime } : a));
        } catch (err) {
            console.error('Error saving inline time:', err);
            alert('Failed to update time');
        }
    };

    const updateAppointmentType = async (id: string, type: string) => {
        try {
            const { error } = await supabase
                .from('appointments')
                .update({ appointment_type: type })
                .eq('id', id);

            if (error) throw error;
            setAppointments(prev => prev.map(a => a.id === id ? { ...a, appointment_type: type } : a));
        } catch (err) {
            console.error('Error saving inline appointment type:', err);
            alert('Failed to update appointment type');
        }
    };

    const updateStatus = async (id: string, newStatus: string, reason?: string) => {
        if (newStatus === 'cancelled' && !reason) {
            setCancellingAppointmentId(id);
            setShowCancelModal(true);
            return;
        }

        try {
            const updateData: any = { status: newStatus };
            if (reason) updateData.cancellation_reason = reason;

            const { error } = await supabase
                .from('appointments')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'STATUS_CHANGE',
                    tableName: 'appointments',
                    recordId: id,
                    details: `Changed appointment status to ${newStatus.toUpperCase()}${reason ? ` (Reason: ${reason})` : ''}`,
                    newValues: updateData
                });
            }

            const appointment = appointments.find(a => a.id === id);
            if (appointment) {
                if (newStatus === 'confirmed' || newStatus === 'cancelled') {
                    const branchId = (profile?.branch_id || appointment.branch_id) as string;
                    if (branchId) {
                        const doctorName = appointment.doctor?.full_name || appointment.users?.full_name || 'Doctor';
                        const formattedDate = new Date(appointment.appointment_date).toLocaleDateString();
                        const formattedTime = formatTime(appointment.appointment_date);
                        const triggerType = newStatus === 'confirmed' ? 'appointment_confirmed' : 'appointment_cancelled';

                        if (appointment.patients?.phone || selectedPatient?.phone) {
                            await smsService.sendSms({
                                recipientPhone: appointment.patients?.phone || selectedPatient?.phone,
                                triggerType: triggerType as any,
                                variables: {
                                    patient_name: appointment.patients?.full_name || selectedPatient?.full_name || 'Patient',
                                    doctor_name: doctorName,
                                    date: formattedDate,
                                    time: formattedTime,
                                    reason: reason || ''
                                },
                                branchId,
                                patientId: appointment.patient_id || selectedPatientId
                            });
                        }

                        if ((appointment.patients as any)?.email || selectedPatient?.email) {
                            await emailService.sendEmail({
                                recipientEmail: (appointment.patients as any)?.email || selectedPatient?.email,
                                recipientName: appointment.patients?.full_name || selectedPatient?.full_name || 'Patient',
                                triggerType,
                                placeholders: {
                                    patient_name: appointment.patients?.full_name || selectedPatient?.full_name || 'Patient',
                                    doctor_name: doctorName,
                                    date: formattedDate,
                                    time: formattedTime,
                                    reason: reason || ''
                                },
                                branchId
                            });
                        }
                    }
                }

                if (appointment.doctor_id) {
                    await notificationService.send({
                        userId: appointment.doctor_id,
                        title: 'Appointment Status Updated',
                        message: `Appointment for ${appointment.patients?.full_name || selectedPatient?.full_name || 'Patient'} is now ${newStatus.replace('_', ' ')}.`,
                        type: newStatus === 'cancelled' ? 'warning' : 'info',
                        link: '/appointments',
                        branchId: profile?.branch_id || appointment.branch_id
                    });
                }
            }

            setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus, ...(reason ? { cancellation_reason: reason } : {}) } : a));
            setShowCancelModal(false);
            setCancellationReason('');
            setCancellingAppointmentId(null);
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status');
        }
    };

    const handleStatusChange = (id: string, newStatus: string) => {
        if (newStatus === 'cancelled') {
            setCancellingAppointmentId(id);
            setShowCancelModal(true);
        } else {
            updateStatus(id, newStatus);
        }
    };

    const handleCancelSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (cancellingAppointmentId && cancellationReason) {
            updateStatus(cancellingAppointmentId, 'cancelled', cancellationReason);
        }
    };

    const sendAppointmentSms = async (appointment: any) => {
        const patientPhone = appointment.patients?.phone || selectedPatient?.phone;
        const patientEmail = appointment.patients?.email || selectedPatient?.email;

        if (!patientPhone && !patientEmail) {
            alert('Patient does not have a registered phone number or email address.');
            return;
        }
        const branchId = profile?.branch_id || appointment.branch_id;
        if (!branchId) {
            alert('Branch ID is required to send notifications.');
            return;
        }

        try {
            const formattedDate = new Date(appointment.appointment_date).toLocaleDateString();
            const formattedTime = formatTime(appointment.appointment_date);
            const triggerType = appointment.status === 'confirmed' ? 'appointment_confirmed' : 'appointment_booked';
            const doctorName = appointment.doctor?.full_name || appointment.users?.full_name || 'Doctor';
            const dispatched: string[] = [];

            if (patientPhone) {
                const smsRes = await smsService.sendSms({
                    recipientPhone: patientPhone,
                    triggerType,
                    variables: {
                        patient_name: appointment.patients?.full_name || selectedPatient?.full_name || 'Patient',
                        doctor_name: doctorName,
                        date: formattedDate,
                        time: formattedTime
                    },
                    branchId,
                    patientId: appointment.patient_id || selectedPatientId
                });
                if (smsRes.success) dispatched.push('SMS');
            }

            if (patientEmail) {
                const emailRes = await emailService.sendEmail({
                    recipientEmail: patientEmail,
                    recipientName: appointment.patients?.full_name || selectedPatient?.full_name || 'Patient',
                    triggerType,
                    placeholders: {
                        patient_name: appointment.patients?.full_name || selectedPatient?.full_name || 'Patient',
                        doctor_name: doctorName,
                        date: formattedDate,
                        time: formattedTime
                    },
                    branchId
                });
                if (emailRes.success) dispatched.push('Email');
            }

            alert(`Notification (${dispatched.join(' & ') || 'Logged'}) processed for ${appointment.patients?.full_name || selectedPatient?.full_name || 'Patient'}!`);
        } catch (err: any) {
            console.error('Error sending notifications:', err);
            alert('Failed to send notification: ' + (err.message || 'Unknown error'));
        }
    };

    const openEditModal = (appointment: any) => {
        const { dateStr, timeStr } = getLocalDateTimeComponents(appointment.appointment_date);

        setBookingForm({
            patient_id: appointment.patient_id || selectedPatientId || '',
            doctor_id: appointment.doctor_id || '',
            appointment_date: dateStr,
            appointment_time: timeStr,
            duration_minutes: appointment.duration_minutes || 30,
            appointment_type: appointment.appointment_type || 'consultation',
            notes: appointment.notes || '',
            status: appointment.status || 'pending_confirmation',
            cancellation_reason: appointment.cancellation_reason || ''
        });
        setEditingId(appointment.id);
        setIsEditing(true);
        setSelectedSlotId('');
        setShowBookModal(true);
    };

    const openBookingModal = () => {
        setBookingForm({
            patient_id: selectedPatientId || '',
            doctor_id: '',
            appointment_date: new Date().toISOString().split('T')[0],
            appointment_time: '',
            duration_minutes: 30,
            appointment_type: 'consultation',
            notes: '',
            status: 'pending_confirmation',
            cancellation_reason: ''
        });
        setIsEditing(false);
        setEditingId(null);
        setSelectedSlotId('');
        setShowBookModal(true);
    };

    // Quick Add Patient Handler
    const handleCreateQuickPatient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newQuickPatient.full_name || !newQuickPatient.phone) {
            alert('Full Name and Phone are required');
            return;
        }
        setSubmittingQuickPatient(true);
        try {
            const patientNumber = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
            const email = newQuickPatient.email.trim() || `${newQuickPatient.full_name.toLowerCase().replace(/\s+/g, '.')}@spiritmed.placeholder`;

            const sanitized = Object.fromEntries(
                Object.entries(newQuickPatient).map(([k, v]) => [
                    k,
                    typeof v === 'string' && v.trim() === '' ? null : (typeof v === 'string' ? v.trim() : v)
                ])
            );

            const { data, error } = await supabase
                .from('patients')
                .insert([{
                    ...sanitized,
                    email,
                    file_number: newQuickPatient.file_number.trim() || null,
                    address: newQuickPatient.address.trim() || null,
                    date_of_birth: newQuickPatient.date_of_birth.trim() || null,
                    patient_number: patientNumber,
                    branch_id: profile?.branch_id,
                    status: 'active'
                }])
                .select();

            if (error) throw error;

            if (data && data[0]) {
                const created = data[0];
                setPatients(prev => [created, ...prev]);
                setBookingForm(f => ({ ...f, patient_id: created.id }));
                setSelectedPatientId(created.id);
                fetchPatientById(created.id);
                loadFullHistory(created.id);
                setShowQuickAddPatientModal(false);
                setNewQuickPatient({
                    full_name: '',
                    phone: '',
                    gender: 'male',
                    date_of_birth: '',
                    email: '',
                    file_number: '',
                    address: ''
                });
            }
        } catch (err: any) {
            console.error('Error creating patient:', err);
            alert(`Failed to create patient: ${err?.message || err}`);
        } finally {
            setSubmittingQuickPatient(false);
        }
    };

    // Book / Edit Appointment Handler
    const handleBookAppointment = async (e: React.FormEvent) => {
        e.preventDefault();
        const targetPatientId = bookingForm.patient_id || selectedPatientId;
        if (!targetPatientId || !profile?.branch_id) {
            alert('Please select a patient.');
            return;
        }
        if (!bookingForm.appointment_date || !bookingForm.appointment_time) {
            alert('Please select both appointment date and time.');
            return;
        }

        // Prevent duplicate booking for the same patient on the same date
        const dateStr = bookingForm.appointment_date;
        const startOfDay = `${dateStr}T00:00:00`;
        const endOfDay = `${dateStr}T23:59:59`;

        let dupQuery = supabase
            .from('appointments')
            .select('id')
            .eq('patient_id', targetPatientId)
            .gte('appointment_date', startOfDay)
            .lte('appointment_date', endOfDay)
            .neq('status', 'cancelled');

        if (isEditing && editingId) {
            dupQuery = dupQuery.neq('id', editingId);
        }

        const { data: existingAppts } = await dupQuery;
        if (existingAppts && existingAppts.length > 0) {
            alert(`Duplicate Booking Blocked: Patient "${selectedPatient?.full_name || 'Selected patient'}" already has an active appointment on ${dateStr}. Double bookings on the same date are not allowed.`);
            setSubmittingBooking(false);
            return;
        }

        setSubmittingBooking(true);
        try {
            if (isEditing && editingId) {
                const { error: updateError } = await supabase
                    .from('appointments')
                    .update({
                        patient_id: targetPatientId,
                        doctor_id: bookingForm.doctor_id || null,
                        appointment_date: `${bookingForm.appointment_date}T${bookingForm.appointment_time}:00`,
                        duration_minutes: Number(bookingForm.duration_minutes) || 30,
                        appointment_type: bookingForm.appointment_type,
                        notes: bookingForm.notes || null,
                        status: bookingForm.status,
                        ...(bookingForm.status === 'cancelled' ? { cancellation_reason: bookingForm.cancellation_reason || 'Manually Cancelled' } : {})
                    })
                    .eq('id', editingId);

                if (updateError) throw updateError;

                if (profile?.id) {
                    await logActivity(supabase, {
                        userId: profile.id,
                        branchId: profile.branch_id,
                        action: 'UPDATE',
                        tableName: 'appointments',
                        recordId: editingId,
                        details: `Updated appointment details from Patient History for ${selectedPatient?.full_name || targetPatientId}`,
                        newValues: bookingForm
                    });
                }

                setBookingSuccess(true);
                setTimeout(() => {
                    setBookingSuccess(false);
                    setShowBookModal(false);
                    setIsEditing(false);
                    setEditingId(null);
                    loadFullHistory(targetPatientId);
                }, 1200);
            } else {
                const payload = {
                    patient_id: targetPatientId,
                    doctor_id: bookingForm.doctor_id || null,
                    appointment_date: `${bookingForm.appointment_date}T${bookingForm.appointment_time}:00`,
                    duration_minutes: Number(bookingForm.duration_minutes) || 30,
                    appointment_type: bookingForm.appointment_type,
                    notes: bookingForm.notes || null,
                    status: bookingForm.status || 'pending_confirmation',
                    cancellation_reason: bookingForm.status === 'cancelled' ? bookingForm.cancellation_reason : null,
                    branch_id: profile.branch_id
                };

                const { data, error } = await supabase.from('appointments').insert([payload]).select().single();
                if (error) throw error;

                if (selectedSlotId) {
                    await supabase
                        .from('appointment_slots')
                        .update({ is_booked: true, appointment_id: data.id })
                        .eq('id', selectedSlotId);
                }

                if (profile?.id) {
                    await logActivity(supabase, {
                        userId: profile.id,
                        branchId: profile.branch_id,
                        action: 'CREATE',
                        tableName: 'appointments',
                        recordId: data?.id,
                        details: `Scheduled appointment from Patient History for ${selectedPatient?.full_name || targetPatientId}`,
                        newValues: payload
                    });
                }

                if (bookingForm.notes) {
                    recordRemarkUsage(bookingForm.notes);
                }

                setBookingSuccess(true);
                setTimeout(() => {
                    setBookingSuccess(false);
                    setShowBookModal(false);
                    loadFullHistory(targetPatientId);
                }, 1200);
            }
        } catch (err: any) {
            console.error('Error booking appointment:', err);
            alert(`Error handling appointment: ${err.message || err}`);
        } finally {
            setSubmittingBooking(false);
        }
    };

    const handleSelectAllHistoryAppointments = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedHistoryAppointmentIds(appointments.map(a => a.id));
        } else {
            setSelectedHistoryAppointmentIds([]);
        }
    };

    const handleToggleSelectHistoryAppointment = (id: string) => {
        setSelectedHistoryAppointmentIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleDeleteHistoryAppointment = async (id: string, patientName?: string) => {
        if (!window.confirm(`Are you sure you want to delete this appointment for "${patientName || selectedPatient?.full_name || 'this patient'}"? This action cannot be undone.`)) {
            return;
        }

        try {
            // Release any booked slots
            await supabase
                .from('appointment_slots')
                .update({ is_booked: false, appointment_id: null })
                .eq('appointment_id', id);

            const { error } = await supabase
                .from('appointments')
                .delete()
                .eq('id', id);

            if (error) throw error;

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'DELETE',
                    tableName: 'appointments',
                    recordId: id,
                    details: `Deleted appointment from Patient History for: ${patientName || selectedPatient?.full_name || id}`
                });
            }

            setAppointments(prev => prev.filter(a => a.id !== id));
            setSelectedHistoryAppointmentIds(prev => prev.filter(x => x !== id));
            alert('Appointment deleted successfully!');
        } catch (err: any) {
            console.error('Error deleting appointment:', err);
            alert('Failed to delete appointment: ' + (err?.message || 'Unknown error'));
        }
    };

    const handleBulkDeleteHistoryAppointments = async () => {
        if (selectedHistoryAppointmentIds.length === 0) return;

        if (!window.confirm(`PERMANENT BULK DELETE CONFIRMATION:\n\nAre you sure you want to delete ${selectedHistoryAppointmentIds.length} selected appointments?\n\nThis action cannot be undone.`)) {
            return;
        }

        try {
            await supabase
                .from('appointment_slots')
                .update({ is_booked: false, appointment_id: null })
                .in('appointment_id', selectedHistoryAppointmentIds);

            const { error } = await supabase
                .from('appointments')
                .delete()
                .in('id', selectedHistoryAppointmentIds);

            if (error) throw error;

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'DELETE',
                    tableName: 'appointments',
                    recordId: selectedHistoryAppointmentIds.join(', '),
                    details: `Bulk deleted ${selectedHistoryAppointmentIds.length} appointments from Patient History for ${selectedPatient?.full_name || selectedPatientId}`
                });
            }

            const count = selectedHistoryAppointmentIds.length;
            setAppointments(prev => prev.filter(a => !selectedHistoryAppointmentIds.includes(a.id)));
            setSelectedHistoryAppointmentIds([]);
            alert(`${count} appointments deleted successfully!`);
        } catch (err: any) {
            console.error('Error bulk deleting appointments:', err);
            alert('Failed to delete appointments: ' + (err?.message || 'Unknown error'));
        }
    };

    // Print & PDF Export
    const handleExportPdf = async () => {
        if (!printRef.current) return;
        await exportElementToPdf(printRef.current, `PATIENT_HISTORY_${selectedPatient?.full_name || 'DOSSIER'}.pdf`);
    };

    // Construct Chronological Timeline
    const timelineItems = [
        ...(canAppts ? appointments.map(a => ({
            type: 'appointment',
            date: a.appointment_date,
            title: `Appointment: ${a.appointment_type || 'Consultation'}`,
            subtitle: a.doctor?.full_name ? `Dr. ${a.doctor.full_name}` : 'Scheduled Visit',
            badge: a.status || 'scheduled',
            badgeColor: a.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
            details: a.notes,
            link: `/appointments`,
            icon: Calendar,
            iconColor: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
        })) : []),
        ...(canConsults ? consultations.map(c => ({
            type: 'consultation',
            date: c.consultation_date || c.created_at,
            title: `Consultation: ${c.chief_complaint || 'Clinical Examination'}`,
            subtitle: c.doctor?.full_name ? `Dr. ${c.doctor.full_name}` : 'Doctor Visit',
            badge: c.status || 'completed',
            badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
            details: c.clinical_notes || c.diagnosis_text || c.symptoms,
            link: `/consultations`,
            icon: Stethoscope,
            iconColor: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
        })) : []),
        ...(canRx ? prescriptions.map(p => ({
            type: 'prescription',
            date: p.prescription_date || p.created_at,
            title: `Prescription #${p.prescription_number || ''}`,
            subtitle: p.doctor?.full_name ? `Dr. ${p.doctor.full_name}` : 'Prescribed Medications',
            badge: `${p.prescription_items?.length || 0} drugs`,
            badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
            details: (p.prescription_items || []).map((i: any) => `${i.medicine?.name || 'Medicine'} (${i.medicine?.dosage || '-'}, ${i.medicine?.route || '-'}, ${i.period} ${i.time_unit})`).join(' • '),
            link: `/prescriptions`,
            icon: Pill,
            iconColor: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30'
        })) : []),
        ...(canAdm ? admissions.map(adm => ({
            type: 'admission',
            date: adm.procedure_date || adm.admission_date || adm.created_at,
            title: `Hospital Admission: ${adm.hospital?.name || 'Admission Letter'}`,
            subtitle: adm.doctor?.full_name ? `Dr. ${adm.doctor.full_name}` : 'Admitting Physician',
            badge: 'Admitted',
            badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            details: adm.special_instructions || adm.procedure_text || adm.notes,
            link: `/admission-letters`,
            icon: FilePlus,
            iconColor: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30'
        })) : []),
        ...(canOps ? operationReports.map(op => ({
            type: 'operation',
            date: op.operation_date || op.created_at,
            title: `Operation: ${op.procedure?.name || op.procedure_name || 'Surgical Procedure'}`,
            subtitle: op.surgeon?.full_name ? `Surgeon: Dr. ${op.surgeon.full_name}` : (op.hospital?.name ? `At ${op.hospital.name}` : 'Surgery'),
            badge: 'Procedure',
            badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
            details: op.findings || op.post_operative_diagnosis || op.pre_operative_diagnosis,
            link: `/operation-reports`,
            icon: ClipboardCheck,
            iconColor: 'text-rose-600 bg-rose-50 dark:bg-rose-900/30'
        })) : []),
        ...(canDisch ? dischargeSummaries.map(d => ({
            type: 'discharge',
            date: d.discharge_date || d.report_date || d.created_at,
            title: `Discharge Summary`,
            subtitle: d.doctor?.full_name ? `Dr. ${d.doctor.full_name}` : 'Discharge Note',
            badge: d.condition_on_discharge || 'Discharged',
            badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
            details: d.summary || d.management_during_admission || d.medical_history,
            link: `/discharge-summaries`,
            icon: FileCheck,
            iconColor: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
        })) : []),
        ...(canCert ? medicalCertificates.map(mc => ({
            type: 'certificate',
            date: mc.report_date || mc.date_attended || mc.created_at,
            title: `Medical Certificate / Sick Leave`,
            subtitle: mc.doctor?.full_name ? `Dr. ${mc.doctor.full_name}` : 'Medical Clearance',
            badge: `${mc.recommended_days || mc.period || 1} Days Leave`,
            badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
            details: mc.purpose || mc.diagnosis_text || mc.purpose_template,
            link: `/medical-certificates`,
            icon: ScrollText,
            iconColor: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/30'
        })) : []),
        ...(canMedRep ? medicalReports.map(mr => ({
            type: 'report',
            date: mr.report_date || mr.created_at,
            title: `Formal Medical Report`,
            subtitle: mr.doctor?.full_name ? `Dr. ${mr.doctor.full_name}` : 'Attending Doctor',
            badge: 'Medical Report',
            badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
            details: mr.findings || mr.report_text || mr.summary,
            link: `/medical-reports`,
            icon: FileText,
            iconColor: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30'
        })) : []),
        ...(canRef ? referralForms.map(rf => ({
            type: 'referral',
            date: rf.report_date || rf.referral_date || rf.created_at,
            title: `Doctor Referral Letter: ${rf.referred_to || 'Specialist'}`,
            subtitle: rf.referring_doctor?.full_name ? `Dr. ${rf.referring_doctor.full_name}` : 'Referring Doctor',
            badge: 'Referral',
            badgeColor: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
            details: rf.referral_reason || rf.clinical_summary || rf.reason,
            link: `/referral-forms`,
            icon: ArrowUpRight,
            iconColor: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30'
        })) : []),
        ...(canVitals ? vitalSigns.map(v => ({
            type: 'vitals',
            date: v.recorded_at || v.created_at || v.date,
            title: `Vital Signs Recording`,
            subtitle: `BP: ${v.blood_pressure || '—'} | Pulse: ${v.pulse || '—'} bpm | Temp: ${v.temperature ? `${v.temperature}°C` : '—'}`,
            badge: 'Vitals',
            badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
            details: `SpO2: ${v.spo2 ? `${v.spo2}%` : '—'} • Weight: ${v.weight ? `${v.weight}kg` : '—'} • Height: ${v.height ? `${v.height}cm` : '—'} • BMI: ${v.bmi || '—'}`,
            link: `/vital-signs`,
            icon: HeartPulse,
            iconColor: 'text-teal-600 bg-teal-50 dark:bg-teal-900/30'
        })) : []),
        ...(canBills ? bills.map(b => ({
            type: 'bill',
            date: b.bill_date || b.created_at,
            title: `Invoice #${b.bill_number || b.id.substring(0, 8)}: $${Number(b.total_amount || b.amount || 0).toLocaleString()}`,
            subtitle: `Status: ${(b.status || 'unpaid').toUpperCase()} • Paid: $${Number(b.paid_amount || 0).toLocaleString()} • Balance: $${Number(b.balance || 0).toLocaleString()}`,
            badge: b.status || 'issued',
            badgeColor: b.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            details: (b.bill_items || []).map((bi: any) => `${bi.description || 'Procedure'} ($${Number(bi.total_price || 0).toLocaleString()})`).join(' • ') || b.notes,
            link: `/bills`,
            icon: DollarSign,
            iconColor: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
        })) : []),
        ...(canEstimates ? estimateBills.map(est => ({
            type: 'estimate',
            date: est.estimate_date || est.created_at,
            title: `Estimate Bill #${est.estimate_number || est.id.substring(0, 8)}: $${Number(est.total_amount || 0).toLocaleString()}`,
            subtitle: `Status: ${(est.status || 'draft').toUpperCase()} • Method: ${(est.payment_method || 'Cash').toUpperCase()}`,
            badge: est.status || 'estimate',
            badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
            details: (est.estimate_bill_items || []).map((ei: any) => `${ei.description || 'Item'} ($${Number(ei.total_price || 0).toLocaleString()})`).join(' • ') || est.notes,
            link: `/estimate-bills`,
            icon: Receipt,
            iconColor: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
        })) : []),
        ...(canPayments ? payments.map(p => ({
            type: 'payment',
            date: p.payment_date || p.created_at,
            title: `Payment Received: $${Number(p.amount || 0).toLocaleString()}`,
            subtitle: `Method: ${(p.payment_method || 'Cash').toUpperCase()} ${p.receipt_number ? `• Receipt #${p.receipt_number}` : ''}`,
            badge: 'Paid',
            badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
            details: p.notes || p.reference,
            link: `/payments`,
            icon: DollarSign,
            iconColor: 'text-green-600 bg-green-50 dark:bg-green-900/30'
        })) : []),
        ...(canFiles ? patientFiles.map(f => ({
            type: 'file',
            date: f.created_at || f.upload_date,
            title: `Patient File Upload: ${f.file_name || f.title || 'Document'}`,
            subtitle: `Uploaded by ${f.uploader?.full_name || 'Hospital Staff'}`,
            badge: f.file_type || 'Document',
            badgeColor: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
            details: f.notes || f.file_path,
            link: `/patient-files`,
            icon: FolderOpen,
            iconColor: 'text-gray-600 bg-gray-50 dark:bg-gray-800'
        })) : []),
    ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    const availableTabs = [
        { id: 'timeline', label: 'Timeline', icon: History, count: timelineItems.length, show: true },
        { id: 'appointments', label: 'Appointments', icon: Calendar, count: appointments.length, show: canAppts },
        { id: 'consultations', label: 'Consultations', icon: Stethoscope, count: consultations.length, show: canConsults },
        { id: 'prescriptions', label: 'Prescriptions', icon: Pill, count: prescriptions.length, show: canRx },
        { id: 'admissions', label: 'Admissions', icon: FilePlus, count: admissions.length, show: canAdm },
        { id: 'surgeries', label: 'Surgeries', icon: ClipboardCheck, count: operationReports.length, show: canOps },
        { id: 'discharges', label: 'Discharges', icon: FileCheck, count: dischargeSummaries.length, show: canDisch },
        { id: 'certificates', label: 'Certificates & Reports', icon: ScrollText, count: medicalCertificates.length + medicalReports.length + referralForms.length, show: canCert || canMedRep || canRef },
        { id: 'vitals', label: 'Vitals & Labs', icon: HeartPulse, count: vitalSigns.length + labResults.length, show: canVitals || canLabs },
        { id: 'financials', label: 'Financials & Bills', icon: DollarSign, count: bills.length + payments.length + estimateBills.length, show: canBills || canPayments || canEstimates },
        { id: 'files', label: 'Files & Scans', icon: FolderOpen, count: patientFiles.length, show: canFiles },
    ].filter(t => t.show);

    // Filter patients in dropdown
    const filteredDropdownPatients = patients.filter(p =>
        (p.full_name || '').toLowerCase().includes(searchPatientText.toLowerCase()) ||
        (p.patient_number || '').toLowerCase().includes(searchPatientText.toLowerCase()) ||
        (p.phone || '').includes(searchPatientText) ||
        (p.file_number || '').toLowerCase().includes(searchPatientText.toLowerCase())
    );

    return (
        <div className="space-y-4">
            {/* ─── Top Control Bar ─── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.history.back()}
                        className="p-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition text-gray-700 dark:text-gray-200"
                        title="Go Back"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <History className="w-5 h-5 text-green-600 dark:text-green-400" />
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">Patient History</h1>
                        </div>
                        <p className="text-xs text-gray-500 font-medium">360° Consolidated Clinical Dossier & Financial Ledger</p>
                    </div>
                </div>

                {/* Patient Search / Selector */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[280px]" ref={patientDropdownRef}>
                        <button
                            type="button"
                            onClick={() => setIsPatientDropdownOpen(v => !v)}
                            className="w-full flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-semibold text-left hover:border-green-500 transition"
                        >
                            <span className="truncate text-gray-900 dark:text-white">
                                {selectedPatient ? `${selectedPatient.full_name} (${formatPatientNumber(selectedPatient.patient_number)})` : 'Select Patient...'}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-gray-400 ml-2 transition-transform ${isPatientDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isPatientDropdownOpen && (
                            <div className="absolute right-0 z-50 mt-1 w-full min-w-[340px] md:min-w-[380px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
                                <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-1.5">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                                        <input
                                            type="text"
                                            value={searchPatientText}
                                            onChange={e => setSearchPatientText(e.target.value)}
                                            placeholder="Search name, ID, file, phone, national ID..."
                                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                                        <span>Showing <b>{filteredDropdownPatients.length}</b> of <b>{patients.length}</b> patients</span>
                                        {searchPatientText && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchPatientText('')}
                                                className="text-gray-400 hover:text-gray-600 underline text-[10px]"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredDropdownPatients.length === 0 ? (
                                        <div className="p-4 text-xs text-gray-400 text-center space-y-1">
                                            <p>No matching patients found</p>
                                            {searchPatientText && <p className="text-[11px]">Searching database...</p>}
                                        </div>
                                    ) : (
                                        filteredDropdownPatients.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => handleSelectPatient(p.id)}
                                                className={`w-full text-left px-3 py-2 text-xs hover:bg-green-50 dark:hover:bg-green-950/30 transition flex items-center justify-between ${selectedPatientId === p.id ? 'bg-green-50 dark:bg-green-900/30 font-bold text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'}`}
                                            >
                                                <div className="min-w-0 pr-2">
                                                    <p className="font-bold text-xs uppercase truncate">{p.full_name}</p>
                                                    <p className="text-[11px] text-gray-400 font-mono flex flex-wrap gap-1 mt-0.5">
                                                        <span>ID: {formatPatientNumber(p.patient_number)}</span>
                                                        {p.file_number && <span>• File: {formatFileNumber(p.file_number)}</span>}
                                                        {p.phone && <span>• {p.phone}</span>}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 uppercase font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                                                    {p.gender || 'N/A'}
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {(hasPermission('appointments', 'add') || hasPermission('appointments', 'edit')) && (
                        <button
                            onClick={openBookingModal}
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-bold text-xs uppercase transition shadow-xs"
                        >
                            <Calendar className="w-3.5 h-3.5" /> Book Appointment
                        </button>
                    )}

                    <button
                        onClick={handleExportPdf}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 text-gray-700 dark:text-gray-200 rounded-md font-bold text-xs uppercase transition shadow-xs"
                        title="Print / Export PDF"
                    >
                        <Download className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" /> Export PDF
                    </button>
                </div>
            </div>

            {loadingPatients ? (
                <div className="flex items-center justify-center py-24">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
                </div>
            ) : !selectedPatient ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-gray-200 dark:border-gray-700 shadow-xs">
                    <User className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">No Patient Selected</h3>
                    <p className="text-sm text-gray-500 mt-1">Please select a patient from the dropdown above to view their complete history.</p>
                </div>
            ) : (
                <div ref={printRef} className="space-y-4">
                    {/* ─── Patient Profile Header Card ─── */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 shadow-xs">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Left: Avatar + Details */}
                            <div className="flex items-start md:items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800 flex items-center justify-center text-lg uppercase shrink-0">
                                    {selectedPatient.full_name.charAt(0)}
                                </div>
                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-lg font-bold uppercase tracking-tight text-gray-900 dark:text-white">
                                            {selectedPatient.title ? `${selectedPatient.title} ` : ''}{selectedPatient.full_name}
                                        </h2>
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${selectedPatient.status === 'discharged' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400' : selectedPatient.status === 'deceased' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400' : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400'}`}>
                                            {selectedPatient.status || 'Active'}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                        <span className="font-mono bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800 font-semibold">
                                            ID: {formatPatientNumber(selectedPatient.patient_number)}
                                        </span>
                                        {selectedPatient.file_number && (
                                            <span className="font-mono bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800 font-semibold">
                                                File: {formatFileNumber(selectedPatient.file_number)}
                                            </span>
                                        )}
                                        {selectedPatient.national_id && (
                                            <span className="font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600">
                                                Nat ID: {selectedPatient.national_id}
                                            </span>
                                        )}
                                        <span>•</span>
                                        <span className="font-medium">{selectedPatient.gender?.toUpperCase() || 'N/A'}</span>
                                        <span>•</span>
                                        <span>DOB: {formatDate(selectedPatient.date_of_birth)} ({getAge(selectedPatient.date_of_birth)})</span>
                                    </div>

                                    {/* Contact & Medical Aid */}
                                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 pt-0.5">
                                        {selectedPatient.phone && (
                                            <a href={`tel:${selectedPatient.phone}`} className="flex items-center gap-1 hover:text-green-600 transition">
                                                <Phone className="w-3.5 h-3.5 text-gray-400" /> {selectedPatient.phone}
                                            </a>
                                        )}
                                        {selectedPatient.email && (
                                            <a href={`mailto:${selectedPatient.email}`} className="flex items-center gap-1 hover:text-blue-600 transition">
                                                <Mail className="w-3.5 h-3.5 text-gray-400" /> {selectedPatient.email}
                                            </a>
                                        )}
                                        {selectedPatient.address && (
                                            <span className="flex items-center gap-1">
                                                <MapPin className="w-3.5 h-3.5 text-gray-400" /> {selectedPatient.address}
                                            </span>
                                        )}
                                        {(selectedPatient.medical_aid || selectedPatient.medical_aid_number) && (
                                            <span className="flex items-center gap-1 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded font-semibold">
                                                <Shield className="w-3.5 h-3.5 text-purple-600" />
                                                {selectedPatient.medical_aid?.name || 'Medical Aid'}: {selectedPatient.medical_aid_number || 'N/A'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Right: Quick Action Links (Permission-Gated) */}
                            <div className="flex flex-wrap items-center gap-2 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 pt-3 lg:pt-0 lg:pl-4">
                                {(canConsults || hasPermission('consultations', 'add') || hasPermission('medical_records', 'add')) && (
                                    <a
                                        href={`/consultations?patientId=${selectedPatient.id}`}
                                        className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 text-gray-700 dark:text-gray-200 hover:text-blue-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs font-semibold transition flex items-center gap-1"
                                        title="Start Consultation"
                                    >
                                        <Stethoscope className="w-3.5 h-3.5 text-blue-600" /> Consult
                                    </a>
                                )}
                                {(canRx || hasPermission('prescriptions', 'add') || hasPermission('medical_records', 'add')) && (
                                    <a
                                        href={`/prescriptions?patientId=${selectedPatient.id}`}
                                        className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/50 hover:bg-purple-50 text-gray-700 dark:text-gray-200 hover:text-purple-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs font-semibold transition flex items-center gap-1"
                                        title="Write Prescription"
                                    >
                                        <Pill className="w-3.5 h-3.5 text-purple-600" /> Prescribe
                                    </a>
                                )}
                                {(canVitals || hasPermission('vital_signs', 'add') || hasPermission('medical_records', 'add')) && (
                                    <a
                                        href={`/vital-signs?patientId=${selectedPatient.id}`}
                                        className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/50 hover:bg-rose-50 text-gray-700 dark:text-gray-200 hover:text-rose-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs font-semibold transition flex items-center gap-1"
                                        title="Record Vital Signs"
                                    >
                                        <HeartPulse className="w-3.5 h-3.5 text-rose-600" /> Vitals
                                    </a>
                                )}
                                {(canBills || hasPermission('billing', 'add')) && (
                                    <a
                                        href={`/bills?patientId=${selectedPatient.id}`}
                                        className="px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700/50 hover:bg-amber-50 text-gray-700 dark:text-gray-200 hover:text-amber-700 border border-gray-200 dark:border-gray-600 rounded-md text-xs font-semibold transition flex items-center gap-1"
                                        title="Create Bill / Invoice"
                                    >
                                        <Receipt className="w-3.5 h-3.5 text-amber-600" /> Bill
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ─── Financials & Dues KPI Banner (Only if Billing is Permitted) ─── */}
                    {(canBills || canPayments) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Invoiced</span>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mt-1">${totalBilled.toLocaleString()}</h3>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{bills.length} bill(s) issued</p>
                                </div>
                                <div className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-blue-600 rounded-lg">
                                    <Receipt className="w-5 h-5" />
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Paid</span>
                                    <h3 className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">${totalPaid.toLocaleString()}</h3>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{payments.length} payment(s) made</p>
                                </div>
                                <div className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-green-600 rounded-lg">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Balance Due</span>
                                    <h3 className={`text-xl font-bold mt-1 ${totalBalance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                                        ${totalBalance.toLocaleString()}
                                    </h3>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{totalBalance > 0 ? 'Outstanding Dues' : 'Account Settled'}</p>
                                </div>
                                <div className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-amber-600 rounded-lg">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Medical Aid / Shortfall</span>
                                    <h3 className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                                        ${(selectedPatient.total_shortfall_due || 0).toLocaleString()}
                                    </h3>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{selectedPatient.medical_aid?.name || 'Self-Pay'}</p>
                                </div>
                                <div className="p-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-purple-600 rounded-lg">
                                    <Shield className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── Navigation Tabs (Strictly Permitted) ─── */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-xs overflow-x-auto">
                        <div className="flex border-b border-gray-200 dark:border-gray-700 min-w-max">
                            {availableTabs.map(tab => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition border-b-2 -mb-px ${isActive ? 'border-green-600 text-green-700 dark:text-green-400 bg-green-50/50 dark:bg-green-950/20' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        <span>{tab.label}</span>
                                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${isActive ? 'bg-green-200 dark:bg-green-800 text-green-900 dark:text-green-100' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                            {tab.count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ─── Tab Contents ─── */}
                    {loadingHistory ? (
                        <div className="flex items-center justify-center py-20 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
                        </div>
                    ) : (
                        <div className="space-y-4">

                            {/* ── 1. UNIFIED TIMELINE TAB ── */}
                            {activeTab === 'timeline' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Complete Chronological Timeline</h3>
                                            <p className="text-xs text-gray-500">Every appointment, consultation, prescription, surgery, admission, and bill</p>
                                        </div>
                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600">
                                            {timelineItems.length} Records
                                        </span>
                                    </div>

                                    {timelineItems.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No recorded events found for this patient.</div>
                                    ) : (
                                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700 w-12">#</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Date</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Category</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Event Title & Subtitle</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Details / Notes</th>
                                                        <th className="px-4 py-2.5 text-center text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700 w-24">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                    {timelineItems.map((item, idx) => {
                                                        return (
                                                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition">
                                                                <td className="px-4 py-2.5 font-mono text-gray-400 border border-gray-200 dark:border-gray-700">{idx + 1}</td>
                                                                <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                                                                    {formatDate(item.date)}
                                                                </td>
                                                                <td className="px-4 py-2.5 border border-gray-200 dark:border-gray-700">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${item.badgeColor}`}>
                                                                        {item.type}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2.5 border border-gray-200 dark:border-gray-700">
                                                                    <div className="font-bold text-gray-900 dark:text-white">{item.title}</div>
                                                                    <div className="text-[11px] text-gray-500">{item.subtitle}</div>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 max-w-md">
                                                                    {item.details ? renderHtmlOrText(item.details) : '—'}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-center border border-gray-200 dark:border-gray-700">
                                                                    <a
                                                                        href={item.link}
                                                                        className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 hover:text-green-800 font-bold text-xs"
                                                                    >
                                                                        View <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 2. APPOINTMENTS TAB (matching Appointments.tsx) ── */}
                            {activeTab === 'appointments' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Appointments History</h3>
                                            <p className="text-xs text-gray-500">Schedule, update status, and manage appointments</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {selectedHistoryAppointmentIds.length > 0 && (
                                                <button
                                                    onClick={handleBulkDeleteHistoryAppointments}
                                                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 transition shadow-xs"
                                                >
                                                    <Trash2 className="w-4 h-4" /> Delete Selected ({selectedHistoryAppointmentIds.length})
                                                </button>
                                            )}
                                            <button
                                                onClick={openBookingModal}
                                                className="px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold uppercase flex items-center gap-1.5 transition shadow-xs"
                                            >
                                                <Plus className="w-4 h-4" /> Book Appointment
                                            </button>
                                        </div>
                                    </div>

                                    {appointments.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No appointments booked yet.</div>
                                    ) : (
                                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-3.5 text-center w-10">
                                                            <input
                                                                type="checkbox"
                                                                checked={appointments.length > 0 && appointments.every(a => selectedHistoryAppointmentIds.includes(a.id))}
                                                                onChange={handleSelectAllHistoryAppointments}
                                                                className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer"
                                                                title="Select all appointments"
                                                            />
                                                        </th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Date</th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Time</th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">File No.</th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Patient Name</th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Contact</th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Type</th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Remarks / Notes</th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                                                        <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-right">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                                    {appointments.map((a) => (
                                                        <tr key={a.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${selectedHistoryAppointmentIds.includes(a.id) ? 'bg-green-50/40 dark:bg-green-950/20' : ''}`}>
                                                            <td className="px-4 py-3.5 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedHistoryAppointmentIds.includes(a.id)}
                                                                    onChange={() => handleToggleSelectHistoryAppointment(a.id)}
                                                                    className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4 cursor-pointer"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                                                                {editingCell?.id === a.id && editingCell?.type === 'date' ? (
                                                                    <input
                                                                        type="date"
                                                                        value={tempValue}
                                                                        onChange={e => setTempValue(e.target.value)}
                                                                        onBlur={() => saveInlineDate(a.id)}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter') saveInlineDate(a.id);
                                                                            if (e.key === 'Escape') setEditingCell(null);
                                                                        }}
                                                                        className="px-2 py-1 border border-green-500 rounded text-sm w-36 outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                        autoFocus
                                                                    />
                                                                ) : (
                                                                    <div
                                                                        onClick={() => {
                                                                            const { dateStr } = getLocalDateTimeComponents(a.appointment_date);
                                                                            setEditingCell({ id: a.id, type: 'date' });
                                                                            setTempValue(dateStr);
                                                                        }}
                                                                        className="flex items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-green-700 dark:hover:text-green-400 p-1 -m-1 rounded transition group"
                                                                        title="Click to edit date inline"
                                                                    >
                                                                        <CalendarIcon className="w-4 h-4 text-green-600 dark:text-green-400 mr-2 opacity-70 group-hover:opacity-100 transition-opacity" />
                                                                        <span>{new Date(a.appointment_date).toLocaleDateString()}</span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-900 dark:text-white font-bold">
                                                                {editingCell?.id === a.id && editingCell?.type === 'time' ? (
                                                                    <input
                                                                        type="time"
                                                                        value={tempValue}
                                                                        onChange={e => setTempValue(e.target.value)}
                                                                        onBlur={() => saveInlineTime(a.id)}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter') saveInlineTime(a.id);
                                                                            if (e.key === 'Escape') setEditingCell(null);
                                                                        }}
                                                                        className="px-2 py-1 border border-green-500 rounded text-sm w-28 outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                        autoFocus
                                                                    />
                                                                ) : (
                                                                    <div
                                                                        onClick={() => {
                                                                            const { timeStr } = getLocalDateTimeComponents(a.appointment_date);
                                                                            setEditingCell({ id: a.id, type: 'time' });
                                                                            setTempValue(timeStr);
                                                                        }}
                                                                        className="flex items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-green-700 dark:hover:text-green-400 p-1 -m-1 rounded transition group"
                                                                        title="Click to edit time inline"
                                                                    >
                                                                        <Clock className="w-4 h-4 text-green-600 dark:text-green-400 mr-2 opacity-70 group-hover:opacity-100 transition-opacity" />
                                                                        <span>{formatTime(a.appointment_date)}</span>
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3.5 whitespace-nowrap text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                                                {a.patients?.file_number || selectedPatient?.file_number ? (
                                                                    <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-800">
                                                                        {(a.patients?.file_number || selectedPatient?.file_number).split('-')[0]}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-gray-400 font-sans italic font-normal">NO FILE</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3.5 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                                                {a.patients?.full_name || selectedPatient?.full_name || 'Patient'}
                                                            </td>
                                                            <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                                {a.patients?.phone || selectedPatient?.phone || 'N/A'}
                                                            </td>
                                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                                <select
                                                                    value={a.appointment_type}
                                                                    onChange={(e) => updateAppointmentType(a.id, e.target.value)}
                                                                    className={`px-2.5 py-1 text-xs rounded-full font-bold border cursor-pointer outline-none focus:ring-2 focus:ring-green-500 transition-all ${getAppointmentTypeBadge(a.appointment_type)}`}
                                                                    title="Click to change appointment type inline"
                                                                >
                                                                    <option value="consultation" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">New Consultation</option>
                                                                    <option value="initial_new_old" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">Initial - New Old Patient</option>
                                                                    <option value="follow_up" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">Review</option>
                                                                    <option value="emergency" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">Emergency</option>
                                                                    <option value="procedure" className="bg-white text-gray-800 dark:bg-gray-800 dark:text-white font-medium">Procedure</option>
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-3.5 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={a.notes}>
                                                                {a.notes || '—'}
                                                            </td>
                                                            <td className="px-4 py-3.5 whitespace-nowrap">
                                                                <select
                                                                    value={a.status}
                                                                    onChange={(e) => handleStatusChange(a.id, e.target.value)}
                                                                    className={`px-2.5 py-1 text-xs rounded-full font-medium border-0 cursor-pointer outline-none focus:ring-2 focus:ring-green-500 bg-opacity-100 ${getStatusColor(a.status)}`}
                                                                    title="Click to change status inline"
                                                                >
                                                                    <option value="pending_confirmation" className="bg-white text-gray-700 font-normal">Pending Confirmation</option>
                                                                    <option value="confirmed" className="bg-white text-gray-700 font-normal">Confirmed</option>
                                                                    <option value="treated" className="bg-white text-gray-700 font-normal">Treated</option>
                                                                    <option value="cancelled" className="bg-white text-gray-700 font-normal">Cancelled</option>
                                                                    <option value="completed" className="bg-white text-gray-700 font-normal">Completed</option>
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-3.5 text-right">
                                                                <div className="flex items-center justify-end space-x-1.5">
                                                                    <button
                                                                        onClick={() => sendAppointmentSms(a)}
                                                                        className="p-1.5 text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/40 rounded-lg border border-purple-100 dark:border-purple-800 transition"
                                                                        title={`Send SMS notification/reminder to ${a.patients?.full_name || selectedPatient?.full_name || 'Patient'}`}
                                                                    >
                                                                        <Send className="w-4 h-4" />
                                                                    </button>
                                                                    {a.status === 'pending_confirmation' && (
                                                                        <>
                                                                            <button
                                                                                onClick={() => updateStatus(a.id, 'confirmed')}
                                                                                className="p-1.5 bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400 rounded-lg hover:bg-green-100 transition border border-green-200 dark:border-green-800"
                                                                                title="Confirm Appointment"
                                                                            >
                                                                                <Check className="w-4 h-4" />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setCancellingAppointmentId(a.id);
                                                                                    setShowCancelModal(true);
                                                                                }}
                                                                                className="p-1.5 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 rounded-lg hover:bg-red-100 transition border border-red-200 dark:border-red-800"
                                                                                title="Cancel Appointment"
                                                                            >
                                                                                <Plus className="w-4 h-4 rotate-45" />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedPatientForFiles({
                                                                                id: a.patient_id || selectedPatientId || '',
                                                                                name: a.patients?.full_name || selectedPatient?.full_name || 'Patient',
                                                                                number: a.patients?.patient_number || selectedPatient?.patient_number
                                                                            });
                                                                            setShowFilesModal(true);
                                                                        }}
                                                                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40 rounded-lg border border-emerald-100 dark:border-emerald-800 transition"
                                                                        title="Patient Files (View, Download, Upload)"
                                                                    >
                                                                        <FolderOpen className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => openEditModal(a)}
                                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 rounded-lg border border-blue-100 dark:border-blue-800 transition"
                                                                        title="Edit Appointment"
                                                                    >
                                                                        <Edit className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteHistoryAppointment(a.id, a.patients?.full_name)}
                                                                        className="p-1.5 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 rounded-lg border border-rose-100 dark:border-rose-800 transition"
                                                                        title="Delete Appointment"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 3. CONSULTATIONS TAB ── */}
                            {activeTab === 'consultations' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Clinical Consultations</h3>
                                            <p className="text-xs text-gray-500">Doctor assessments, clinical symptoms, diagnoses, and treatment plans</p>
                                        </div>
                                        <a
                                            href={`/consultations?patientId=${selectedPatient.id}`}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> New Consultation
                                        </a>
                                    </div>

                                    {consultations.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No consultation records found.</div>
                                    ) : (
                                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700 w-12">#</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Date</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Doctor</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Symptoms</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Clinical Findings</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Diagnosis</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Treatment Plan</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                    {consultations.map((c, idx) => (
                                                        <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition">
                                                            <td className="px-4 py-2.5 font-mono text-gray-400 border border-gray-200 dark:border-gray-700">{idx + 1}</td>
                                                            <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                                                                {formatDate(c.consultation_date || c.created_at)}
                                                            </td>
                                                            <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">
                                                                Dr. {c.doctor?.full_name || 'Attending Physician'}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 max-w-xs">{c.symptoms ? renderHtmlOrText(c.symptoms) : '—'}</td>
                                                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 max-w-xs">{c.clinical_notes ? renderHtmlOrText(c.clinical_notes) : '—'}</td>
                                                            <td className="px-4 py-2.5 font-semibold text-indigo-700 dark:text-indigo-400 border border-gray-200 dark:border-gray-700 max-w-xs">{c.diagnosis_text ? renderHtmlOrText(c.diagnosis_text) : '—'}</td>
                                                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 max-w-xs">{c.treatment_plan ? renderHtmlOrText(c.treatment_plan) : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 4. PRESCRIPTIONS TAB ── */}
                            {activeTab === 'prescriptions' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Prescriptions & Medicines</h3>
                                            <p className="text-xs text-gray-500">Prescribed pharmaceuticals, dosage, route, frequency, and duration</p>
                                        </div>
                                        <a
                                            href={`/prescriptions?patientId=${selectedPatient.id}`}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Issue Prescription
                                        </a>
                                    </div>

                                    {prescriptions.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No prescriptions recorded for this patient.</div>
                                    ) : (
                                        <div className="space-y-4">
                                            {prescriptions.map(rx => (
                                                <div key={rx.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 space-y-3">
                                                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-bold text-xs text-gray-900 dark:text-white uppercase">Prescription #{rx.prescription_number || rx.id.substring(0, 8)}</h4>
                                                            <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold rounded uppercase">{rx.status || 'active'}</span>
                                                            <span className="text-xs text-gray-500">Doctor: <b>Dr. {rx.doctor?.full_name || 'Attending Doctor'}</b></span>
                                                        </div>
                                                        <span className="text-xs font-mono font-bold text-gray-500 bg-gray-50 dark:bg-gray-700 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600">
                                                            {formatDate(rx.prescription_date || rx.created_at)}
                                                        </span>
                                                    </div>

                                                    {/* Drugs Table with proper visible borders */}
                                                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-md">
                                                        <table className="w-full text-xs text-left border-collapse border border-gray-200 dark:border-gray-700">
                                                            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                                <tr>
                                                                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-700 font-bold uppercase text-[11px] text-gray-700 dark:text-gray-300">Medicine</th>
                                                                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-700 font-bold uppercase text-[11px] text-gray-700 dark:text-gray-300">Dosage</th>
                                                                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-700 font-bold uppercase text-[11px] text-gray-700 dark:text-gray-300">Route</th>
                                                                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-700 font-bold uppercase text-[11px] text-gray-700 dark:text-gray-300">Frequency</th>
                                                                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-700 font-bold uppercase text-[11px] text-gray-700 dark:text-gray-300">Duration</th>
                                                                    <th className="px-3 py-2 border border-gray-200 dark:border-gray-700 font-bold uppercase text-[11px] text-gray-700 dark:text-gray-300">Advice / Instructions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                                {(rx.prescription_items || []).map((item: any) => {
                                                                    const freq = (typeof item.medicine?.frequency === 'object' ? item.medicine?.frequency?.name : item.medicine?.frequency) || '—';
                                                                    return (
                                                                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                                                                            <td className="px-3 py-2 font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{item.medicine?.name || 'Medicine'}</td>
                                                                            <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">{item.medicine?.dosage || '—'}</td>
                                                                            <td className="px-3 py-2 font-mono font-semibold uppercase text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-700">{item.medicine?.route || '—'}</td>
                                                                            <td className="px-3 py-2 font-semibold text-purple-600 dark:text-purple-400 border border-gray-200 dark:border-gray-700">{freq}</td>
                                                                            <td className="px-3 py-2 font-semibold border border-gray-200 dark:border-gray-700">{item.period} {item.time_unit}</td>
                                                                            <td className="px-3 py-2 text-gray-500 border border-gray-200 dark:border-gray-700">{renderHtmlOrText(item.advice)}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {rx.notes && (
                                                        <div className="text-xs text-gray-500 pt-1">
                                                            <b>Notes:</b> {renderHtmlOrText(rx.notes)}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 5. ADMISSIONS TAB ── */}
                            {activeTab === 'admissions' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Hospital Admissions</h3>
                                            <p className="text-xs text-gray-500">Admission letters, hospital bookings, and procedure pre-authorizations</p>
                                        </div>
                                        <a
                                            href={`/admission-letters?patientId=${selectedPatient.id}`}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> New Admission Letter
                                        </a>
                                    </div>

                                    {admissions.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No hospital admissions recorded.</div>
                                    ) : (
                                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700 w-12">#</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Date / Procedure Date</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Hospital</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Admitting Doctor</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Special Instructions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                    {admissions.map((adm, idx) => (
                                                        <tr key={adm.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition">
                                                            <td className="px-4 py-2.5 font-mono text-gray-400 border border-gray-200 dark:border-gray-700">{idx + 1}</td>
                                                            <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                                                                {formatDate(adm.procedure_date || adm.created_at)}
                                                            </td>
                                                            <td className="px-4 py-2.5 font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">
                                                                {adm.hospital?.name || 'Hospital Admission'}
                                                            </td>
                                                            <td className="px-4 py-2.5 border border-gray-200 dark:border-gray-700">
                                                                {adm.doctor?.full_name ? `Dr. ${adm.doctor.full_name}` : 'Attending Physician'}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 max-w-md">
                                                                {adm.special_instructions ? renderHtmlOrText(adm.special_instructions) : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 6. SURGERIES / OPERATIONS TAB ── */}
                            {activeTab === 'surgeries' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Operation Reports & Surgeries</h3>
                                            <p className="text-xs text-gray-500">Surgical procedures performed, findings, and post-operative diagnoses</p>
                                        </div>
                                        <a
                                            href={`/operation-reports?patientId=${selectedPatient.id}`}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> New Operation Report
                                        </a>
                                    </div>

                                    {operationReports.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No surgical operation reports found.</div>
                                    ) : (
                                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700 w-12">#</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Date</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Procedure</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Surgeon</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Hospital</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Pre-Op Diagnosis</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Post-Op Diagnosis</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Findings</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                    {operationReports.map((op, idx) => (
                                                        <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition">
                                                            <td className="px-4 py-2.5 font-mono text-gray-400 border border-gray-200 dark:border-gray-700">{idx + 1}</td>
                                                            <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                                                                {formatDate(op.operation_date || op.created_at)}
                                                            </td>
                                                            <td className="px-4 py-2.5 font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">
                                                                {op.procedure_name || 'Surgical Procedure'}
                                                            </td>
                                                            <td className="px-4 py-2.5 border border-gray-200 dark:border-gray-700">Dr. {op.surgeon?.full_name || 'Surgeon'}</td>
                                                            <td className="px-4 py-2.5 border border-gray-200 dark:border-gray-700">{op.hospital?.name || 'Hospital'}</td>
                                                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{op.pre_operative_diagnosis || '—'}</td>
                                                            <td className="px-4 py-2.5 font-semibold text-rose-700 dark:text-rose-400 border border-gray-200 dark:border-gray-700">{op.post_operative_diagnosis || '—'}</td>
                                                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 max-w-xs">{op.findings ? renderHtmlOrText(op.findings) : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 7. DISCHARGES TAB ── */}
                            {activeTab === 'discharges' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Discharge Summaries</h3>
                                            <p className="text-xs text-gray-500">Inpatient discharge records, condition on discharge, and follow-up plans</p>
                                        </div>
                                        <a
                                            href={`/discharge-summaries?patientId=${selectedPatient.id}`}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> New Discharge Summary
                                        </a>
                                    </div>

                                    {dischargeSummaries.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No discharge summaries recorded.</div>
                                    ) : (
                                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700 w-12">#</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Discharge Date</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Doctor</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Condition</th>
                                                        <th className="px-4 py-2.5 text-left text-xs font-bold text-gray-700 dark:text-gray-200 uppercase border border-gray-200 dark:border-gray-700">Summary Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                    {dischargeSummaries.map((d, idx) => (
                                                        <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition">
                                                            <td className="px-4 py-2.5 font-mono text-gray-400 border border-gray-200 dark:border-gray-700">{idx + 1}</td>
                                                            <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                                                                {formatDate(d.discharge_date || d.created_at)}
                                                            </td>
                                                            <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">
                                                                Dr. {d.doctor?.full_name || 'Attending Physician'}
                                                            </td>
                                                            <td className="px-4 py-2.5 border border-gray-200 dark:border-gray-700">
                                                                <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold rounded uppercase">
                                                                    {d.condition_on_discharge || 'Discharged'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 max-w-md">
                                                                {d.summary ? renderHtmlOrText(d.summary) : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 8. CERTIFICATES & REPORTS TAB ── */}
                            {activeTab === 'certificates' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-6">
                                    <div className="pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Certificates, Medical Reports & Referrals</h3>
                                        <p className="text-xs text-gray-500">Official medical certificates, sick leave notes, formal reports, and referral letters</p>
                                    </div>

                                    {/* Medical Certificates */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300 tracking-wider">Medical Certificates / Sick Leave ({medicalCertificates.length})</h4>
                                            <a href={`/medical-certificates?patientId=${selectedPatient.id}`} className="text-xs font-bold text-green-600 hover:underline flex items-center gap-1">+ Issue Certificate</a>
                                        </div>
                                        {medicalCertificates.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic py-2">No medical certificates issued.</p>
                                        ) : (
                                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                                <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 w-10">#</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Date</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Doctor</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Days Off</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Diagnosis / Notes</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {medicalCertificates.map((mc, idx) => (
                                                            <tr key={mc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                                <td className="px-3 py-2 font-mono text-gray-400 border border-gray-200 dark:border-gray-700">{idx + 1}</td>
                                                                <td className="px-3 py-2 font-mono border border-gray-200 dark:border-gray-700">{formatDate(mc.created_at)}</td>
                                                                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">Dr. {mc.doctor?.full_name || 'Doctor'}</td>
                                                                <td className="px-3 py-2 font-bold text-green-700 border border-gray-200 dark:border-gray-700">{mc.recommended_days || 1} Days</td>
                                                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{mc.diagnosis_text || '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {/* Medical Reports */}
                                    <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300 tracking-wider">Formal Medical Reports ({medicalReports.length})</h4>
                                            <a href={`/medical-reports?patientId=${selectedPatient.id}`} className="text-xs font-bold text-green-600 hover:underline flex items-center gap-1">+ Create Report</a>
                                        </div>
                                        {medicalReports.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic py-2">No medical reports issued.</p>
                                        ) : (
                                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                                <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 w-10">#</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Date</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Doctor</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Report Details</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {medicalReports.map((mr, idx) => (
                                                            <tr key={mr.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                                <td className="px-3 py-2 font-mono text-gray-400 border border-gray-200 dark:border-gray-700">{idx + 1}</td>
                                                                <td className="px-3 py-2 font-mono border border-gray-200 dark:border-gray-700">{formatDate(mr.report_date || mr.created_at)}</td>
                                                                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">Dr. {mr.doctor?.full_name || 'Doctor'}</td>
                                                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{mr.findings || mr.report_text || 'Medical Report'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── 9. VITALS & LABS TAB ── */}
                            {activeTab === 'vitals' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-5">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Vital Signs & Pathology</h3>
                                            <p className="text-xs text-gray-500">Triage vitals records and laboratory investigations</p>
                                        </div>
                                        <a
                                            href={`/vital-signs?patientId=${selectedPatient.id}`}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Record Vitals
                                        </a>
                                    </div>

                                    {vitalSigns.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No vital signs recordings found.</div>
                                    ) : (
                                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-3 py-2.5 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Date</th>
                                                        <th className="px-3 py-2.5 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">BP (mmHg)</th>
                                                        <th className="px-3 py-2.5 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Pulse (bpm)</th>
                                                        <th className="px-3 py-2.5 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Temp (°C)</th>
                                                        <th className="px-3 py-2.5 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">SpO2 (%)</th>
                                                        <th className="px-3 py-2.5 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Weight (kg)</th>
                                                        <th className="px-3 py-2.5 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">BMI</th>
                                                        <th className="px-3 py-2.5 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Recorded By</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                                    {vitalSigns.map(v => (
                                                        <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                                                            <td className="px-3 py-2.5 font-mono font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{formatDate(v.created_at || v.date)}</td>
                                                            <td className="px-3 py-2.5 font-bold text-rose-600 border border-gray-200 dark:border-gray-700">{v.blood_pressure || '—'}</td>
                                                            <td className="px-3 py-2.5 border border-gray-200 dark:border-gray-700">{v.pulse || '—'}</td>
                                                            <td className="px-3 py-2.5 border border-gray-200 dark:border-gray-700">{v.temperature ? `${v.temperature}°C` : '—'}</td>
                                                            <td className="px-3 py-2.5 font-bold text-blue-600 border border-gray-200 dark:border-gray-700">{v.spo2 ? `${v.spo2}%` : '—'}</td>
                                                            <td className="px-3 py-2.5 border border-gray-200 dark:border-gray-700">{v.weight || '—'}</td>
                                                            <td className="px-3 py-2.5 border border-gray-200 dark:border-gray-700">{v.bmi || '—'}</td>
                                                            <td className="px-3 py-2.5 text-gray-500 border border-gray-200 dark:border-gray-700">{v.recorded_by_user?.full_name || 'Nurse'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── 10. FINANCIALS & BILLS TAB ── */}
                            {activeTab === 'financials' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-6">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Invoices & Payment Receipts</h3>
                                            <p className="text-xs text-gray-500">Breakdown of bills, itemized procedures, payments, and balance dues</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <a
                                                href={`/bills?patientId=${selectedPatient.id}`}
                                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Create Bill
                                            </a>
                                            <a
                                                href={`/payments?patientId=${selectedPatient.id}`}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                            >
                                                <DollarSign className="w-3.5 h-3.5" /> Record Payment
                                            </a>
                                        </div>
                                    </div>

                                    {/* Invoices List */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300 tracking-wider">Invoices & Bills ({bills.length})</h4>
                                        {bills.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic py-2">No bills created for this patient.</p>
                                        ) : (
                                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                                <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Invoice #</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Date</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Total Amount</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Paid</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Balance</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {bills.map(b => (
                                                            <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                                                                <td className="px-3 py-2 font-mono font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{b.bill_number || b.invoice_number || b.id.substring(0, 8)}</td>
                                                                <td className="px-3 py-2 font-mono border border-gray-200 dark:border-gray-700">{formatDate(b.bill_date || b.created_at)}</td>
                                                                <td className="px-3 py-2 font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">${Number(b.total_amount || b.amount || 0).toLocaleString()}</td>
                                                                <td className="px-3 py-2 text-green-600 font-bold border border-gray-200 dark:border-gray-700">${Number(b.paid_amount || 0).toLocaleString()}</td>
                                                                <td className="px-3 py-2 text-amber-600 font-bold border border-gray-200 dark:border-gray-700">${Number(b.balance || 0).toLocaleString()}</td>
                                                                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${b.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : b.status === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                                        {b.status || 'unpaid'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {/* Receipts List */}
                                    <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                                        <h4 className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300 tracking-wider">Payment Receipts ({payments.length})</h4>
                                        {payments.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic py-2">No payment receipts recorded.</p>
                                        ) : (
                                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                                <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Receipt #</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Date</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Amount Paid</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Method</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Notes / Reference</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {payments.map(p => (
                                                            <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                                                                <td className="px-3 py-2 font-mono font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{p.receipt_number || p.id.substring(0, 8)}</td>
                                                                <td className="px-3 py-2 font-mono border border-gray-200 dark:border-gray-700">{formatDate(p.payment_date || p.created_at)}</td>
                                                                <td className="px-3 py-2 font-bold text-green-600 border border-gray-200 dark:border-gray-700">${Number(p.amount || 0).toLocaleString()}</td>
                                                                <td className="px-3 py-2 uppercase font-semibold border border-gray-200 dark:border-gray-700">{p.payment_method || 'Cash'}</td>
                                                                <td className="px-3 py-2 text-gray-500 border border-gray-200 dark:border-gray-700">{p.notes || p.reference || '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {/* Estimate Bills List */}
                                    <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                                        <h4 className="text-xs font-bold uppercase text-gray-700 dark:text-gray-300 tracking-wider">Proforma / Estimate Bills ({estimateBills.length})</h4>
                                        {estimateBills.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic py-2">No estimate bills created for this patient.</p>
                                        ) : (
                                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                                <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Estimate #</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Date</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Total Estimate</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Payment Method</th>
                                                            <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {estimateBills.map(est => (
                                                            <tr key={est.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition">
                                                                <td className="px-3 py-2 font-mono font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{est.estimate_number || est.id.substring(0, 8)}</td>
                                                                <td className="px-3 py-2 font-mono border border-gray-200 dark:border-gray-700">{formatDate(est.estimate_date || est.created_at)}</td>
                                                                <td className="px-3 py-2 font-bold text-blue-600 border border-gray-200 dark:border-gray-700">${Number(est.total_amount || 0).toLocaleString()}</td>
                                                                <td className="px-3 py-2 uppercase font-semibold border border-gray-200 dark:border-gray-700">{est.payment_method || 'Cash'}</td>
                                                                <td className="px-3 py-2 border border-gray-200 dark:border-gray-700">
                                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                                                        {est.status || 'estimate'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ── 11. FILES & SCANS TAB ── */}
                            {activeTab === 'files' && (
                                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 shadow-xs space-y-4">
                                    <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase">Attached Files & Scans</h3>
                                            <p className="text-xs text-gray-500">Radiology X-rays, MRI scans, clinical uploads, and external patient documents</p>
                                        </div>
                                        <a
                                            href={`/patient-files?patientId=${selectedPatient.id}`}
                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-bold uppercase flex items-center gap-1 transition"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Upload File
                                        </a>
                                    </div>

                                    {patientFiles.length === 0 ? (
                                        <div className="py-12 text-center text-gray-400 text-xs">No files or scans attached for this patient.</div>
                                    ) : (
                                        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700 text-xs">
                                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 w-10">#</th>
                                                        <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Document / File Name</th>
                                                        <th className="px-3 py-2 text-left font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700">Upload Date</th>
                                                        <th className="px-3 py-2 text-center font-bold uppercase text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 w-24">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                    {patientFiles.map((f, idx) => (
                                                        <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                            <td className="px-3 py-2 font-mono text-gray-400 border border-gray-200 dark:border-gray-700">{idx + 1}</td>
                                                            <td className="px-3 py-2 font-bold text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{f.file_name || f.name || 'Document'}</td>
                                                            <td className="px-3 py-2 font-mono border border-gray-200 dark:border-gray-700">{formatDate(f.created_at)}</td>
                                                            <td className="px-3 py-2 text-center border border-gray-200 dark:border-gray-700">
                                                                {f.file_url ? (
                                                                    <a
                                                                        href={f.file_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-bold hover:underline"
                                                                    >
                                                                        <Eye className="w-3.5 h-3.5" /> View
                                                                    </a>
                                                                ) : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    )}
                </div>
            )}

            {/* ─── Exact New / Edit Appointment Modal (matching Appointments.tsx) ─── */}
            {showBookModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6 shadow-xl overflow-y-auto max-h-[90vh]">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                            {isEditing ? 'Edit Appointment' : 'New Appointment'}
                        </h2>

                        {bookingSuccess ? (
                            <div className="py-8 text-center space-y-3">
                                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
                                <h4 className="text-base font-bold text-gray-900 dark:text-white">
                                    {isEditing ? 'Appointment Updated!' : 'Appointment Scheduled!'}
                                </h4>
                                <p className="text-xs text-gray-500">
                                    {isEditing ? 'The appointment has been successfully updated.' : 'The appointment has been successfully booked.'}
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleBookAppointment} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Column 1 */}
                                    <div className="space-y-4">
                                        <SearchDropdown
                                            label="Patient"
                                            placeholder="Search patient..."
                                            items={patients}
                                            selectedId={bookingForm.patient_id || selectedPatientId}
                                            displayFn={p => p?.full_name ? `${p.full_name} (${p.patient_number || 'N/A'})` : (p?.patient_number || p?.id || 'Unknown Patient')}
                                            onSelect={id => {
                                                setBookingForm(f => ({ ...f, patient_id: id }));
                                                if (id !== selectedPatientId) {
                                                    setSelectedPatientId(id);
                                                    fetchPatientById(id);
                                                    loadFullHistory(id);
                                                }
                                            }}
                                            onAddNew={() => setShowQuickAddPatientModal(true)}
                                        />
                                        <SearchDropdown
                                            label="Doctor"
                                            placeholder="Search doctor..."
                                            items={doctors}
                                            selectedId={bookingForm.doctor_id}
                                            displayFn={d => d?.full_name ? `Dr. ${d.full_name} ${d.specialization ? `(${d.specialization})` : ''}` : 'Doctor'}
                                            onSelect={id => setBookingForm(f => ({ ...f, doctor_id: id }))}
                                        />
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Appointment Type</label>
                                            <select
                                                value={bookingForm.appointment_type}
                                                onChange={e => setBookingForm(f => ({ ...f, appointment_type: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            >
                                                <option value="consultation">New Consultation</option>
                                                <option value="initial_new_old">Initial - New Old Patient</option>
                                                <option value="follow_up">Review</option>
                                                <option value="emergency">Emergency</option>
                                                <option value="procedure">Procedure</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Duration (minutes)</label>
                                            <input
                                                type="number"
                                                value={bookingForm.duration_minutes}
                                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg outline-none text-sm bg-gray-50 dark:bg-gray-700/50 cursor-not-allowed text-gray-500 dark:text-gray-300"
                                                readOnly
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                                            <select
                                                value={bookingForm.status}
                                                onChange={e => setBookingForm(f => ({ ...f, status: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            >
                                                <option value="pending_confirmation">Pending Confirmation</option>
                                                <option value="confirmed">Confirmed</option>
                                                <option value="treated">Treated</option>
                                                <option value="cancelled">Cancelled</option>
                                                <option value="completed">Completed</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Column 2 */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Date</label>
                                            <input
                                                type="date"
                                                value={bookingForm.appointment_date}
                                                onChange={e => setBookingForm(f => ({ ...f, appointment_date: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Time</label>
                                            <input
                                                type="time"
                                                value={bookingForm.appointment_time}
                                                onChange={e => setBookingForm(f => ({ ...f, appointment_time: e.target.value }))}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                required
                                            />
                                        </div>

                                        {/* Slot picker (helper) */}
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Available Slots (Quick Select)</label>
                                            <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                                                {availableSlots.length === 0 ? (
                                                    <p className="col-span-3 text-center text-xs text-gray-400 py-2 italic">
                                                        {slotMessage || (bookingForm.doctor_id && bookingForm.appointment_date
                                                            ? 'No available slots for this doctor on this date.'
                                                            : 'Select doctor & date to view slots.')}
                                                    </p>
                                                ) : (
                                                    availableSlots.map(slot => (
                                                        <button
                                                            key={slot.id}
                                                            type="button"
                                                            onClick={() => !slot.is_booked && handleSelectSlot(slot)}
                                                            className={`p-1.5 text-[10px] font-semibold rounded border transition ${
                                                                slot.is_booked
                                                                    ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed dark:bg-red-950/20 dark:border-red-900'
                                                                    : selectedSlotId === slot.id
                                                                    ? 'bg-green-600 text-white border-green-600 shadow-sm font-bold ring-2 ring-green-400'
                                                                    : 'bg-white dark:bg-gray-800 hover:border-green-500 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:shadow-xs'
                                                            }`}
                                                            disabled={slot.is_booked}
                                                            title={slot.is_booked ? 'Already booked' : 'Click to select this slot'}
                                                        >
                                                            {formatTime(slot.start_time)}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom Row spanned fields */}
                                    <div className="md:col-span-2 space-y-4">
                                        <RemarksQuickInput
                                            value={bookingForm.notes}
                                            onChange={val => setBookingForm(f => ({ ...f, notes: val }))}
                                            placeholder="Add any remarks or notes..."
                                        />

                                        {bookingForm.status === 'cancelled' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 text-red-600">Cancellation Reason</label>
                                                <textarea
                                                    value={bookingForm.cancellation_reason}
                                                    onChange={e => setBookingForm(f => ({ ...f, cancellation_reason: e.target.value }))}
                                                    className="w-full px-3 py-2 border border-red-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500 text-sm bg-red-50"
                                                    rows={2}
                                                    placeholder="Enter cancellation reason..."
                                                    required
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex space-x-3 mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowBookModal(false)}
                                        className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition text-gray-700 dark:text-gray-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submittingBooking}
                                        className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-60"
                                    >
                                        {submittingBooking ? 'Saving...' : (isEditing ? 'Update Appointment' : 'Save')}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Quick Add Patient Modal (matching Appointments.tsx) ─── */}
            {showQuickAddPatientModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-500">
                            <h2 className="text-lg font-black text-white tracking-tight">Quick Add Patient</h2>
                            <p className="text-green-100 text-xs mt-0.5">Fill in the details to register a new patient</p>
                        </div>

                        <form onSubmit={handleCreateQuickPatient} className="p-6 space-y-4">
                            {/* Name — required */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Full Name <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    placeholder="Enter full name"
                                    value={newQuickPatient.full_name}
                                    onChange={e => setNewQuickPatient({ ...newQuickPatient, full_name: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    required
                                />
                            </div>

                            {/* Phone + Gender row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Phone <span className="text-red-500">*</span></label>
                                    <input
                                        type="tel"
                                        placeholder="e.g. +263771234567"
                                        value={newQuickPatient.phone}
                                        onChange={e => setNewQuickPatient({ ...newQuickPatient, phone: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Gender <span className="text-red-500">*</span></label>
                                    <select
                                        value={newQuickPatient.gender}
                                        onChange={e => setNewQuickPatient({ ...newQuickPatient, gender: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white text-gray-900 font-medium"
                                        required
                                    >
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>

                            {/* Date of Birth + File Number row */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Date of Birth</label>
                                    <input
                                        type="date"
                                        value={newQuickPatient.date_of_birth}
                                        onChange={e => setNewQuickPatient({ ...newQuickPatient, date_of_birth: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">File Number</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. F-00123"
                                        value={newQuickPatient.file_number}
                                        onChange={e => setNewQuickPatient({ ...newQuickPatient, file_number: e.target.value })}
                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Email</label>
                                <input
                                    type="email"
                                    placeholder="patient@email.com"
                                    value={newQuickPatient.email}
                                    onChange={e => setNewQuickPatient({ ...newQuickPatient, email: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </div>

                            {/* Address */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Address</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 123 Main St, Harare"
                                    value={newQuickPatient.address}
                                    onChange={e => setNewQuickPatient({ ...newQuickPatient, address: e.target.value })}
                                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowQuickAddPatientModal(false)}
                                    className="flex-1 py-2.5 border border-gray-300 hover:bg-gray-50 rounded-xl text-sm font-semibold transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingQuickPatient}
                                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-60"
                                >
                                    {submittingQuickPatient ? 'Saving...' : 'Add Patient'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── Cancel Appointment Modal (matching Appointments.tsx) ─── */}
            {showCancelModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-xl animate-in zoom-in-95 duration-150">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Cancel Appointment</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Please provide a reason for cancelling this appointment.</p>
                        <form onSubmit={handleCancelSubmit}>
                            <textarea
                                value={cancellationReason}
                                onChange={(e) => setCancellationReason(e.target.value)}
                                placeholder="Reason for cancellation..."
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none mb-4"
                                rows={3}
                                required
                                autoFocus
                            />
                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCancelModal(false);
                                        setCancellationReason('');
                                        setCancellingAppointmentId(null);
                                    }}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                                >
                                    Close
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-xs"
                                >
                                    Confirm Cancellation
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── Patient Files Modal ─── */}
            {showFilesModal && selectedPatientForFiles && (
                <AppointmentPatientFilesModal
                    isOpen={showFilesModal}
                    onClose={() => {
                        setShowFilesModal(false);
                        setSelectedPatientForFiles(null);
                    }}
                    patientId={selectedPatientForFiles.id}
                    patientName={selectedPatientForFiles.name}
                    patientNumber={selectedPatientForFiles.number}
                />
            )}
        </div>
    );
}
