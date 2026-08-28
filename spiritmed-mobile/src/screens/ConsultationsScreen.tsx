import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  Modal,
  FlatList,
  RefreshControl,
  Share,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, Consultation, Patient, Doctor, PrescriptionItem, VitalSigns } from '../types';
import { downloadConsultationPDF } from '../utils/pdfGenerator';
import { fetchAllPatients, filterPatients } from '../utils/patientLoader';
import { SearchDropdown, DropdownItem } from '../components/SearchDropdown';

type ConsultationsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Consultations'>;
type ConsultationsScreenRouteProp = RouteProp<RootStackParamList, 'Consultations'>;

interface Props {
  navigation: ConsultationsScreenNavigationProp;
  route: ConsultationsScreenRouteProp;
}

// ── HTML Stripper & Entity Decoder ──
function cleanHtmlText(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '$1')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '$1')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '$1')
    .replace(/<u[^>]*>(.*?)<\/u>/gi, '$1')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, '')
    .replace(/<ol[^>]*>/gi, '')
    .replace(/<\/ol>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const FOLLOW_UP_TIME_UNITS = ['Days', 'Weeks', 'Months', 'Years'];
const RX_TIME_UNITS = ['Days', 'Weeks', 'Months'];

export function ConsultationsScreen({ navigation, route }: Props) {
  const initialPatientId = route.params?.patientId;
  const { themeColors, isDark } = useTheme();

  // ── List & Search State ──
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  // ── Reference Data ──
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [referralDoctors, setReferralDoctors] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [investigations, setInvestigations] = useState<any[]>([]);
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [userBranchId, setUserBranchId] = useState<string>('');

  // ── View Details Modal State ──
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);

  // ── Add / Edit Modal State ──
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // ── AI Note Smart-Paste State ──
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [smartPasteText, setSmartPasteText] = useState('');
  const [smartParseMode, setSmartParseMode] = useState<'autofill' | 'raw'>('autofill');

  // Form Fields (matching Web App exactly)
  const [formPatientId, setFormPatientId] = useState('');
  const [formDoctorId, setFormDoctorId] = useState('');
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<string[]>([]);
  const [selectedComplaints, setSelectedComplaints] = useState<string[]>([]);
  const [selectedInvestigations, setSelectedInvestigations] = useState<string[]>([]);
  const [formObservations, setFormObservations] = useState('');
  const [formTreatmentPlan, setFormTreatmentPlan] = useState('');
  const [formReferredBy, setFormReferredBy] = useState('');
  const [formFollowUpPeriod, setFormFollowUpPeriod] = useState('');
  const [formFollowUpTime, setFormFollowUpTime] = useState('Days');
  const [formFollowUpDate, setFormFollowUpDate] = useState('');
  const [formRemarks, setFormRemarks] = useState('');
  const [formStatus, setFormStatus] = useState('completed');

  // Latest Vitals
  const [latestVitals, setLatestVitals] = useState<VitalSigns | null>(null);

  // Prescriptions List Builder
  const [prescriptions, setPrescriptions] = useState<{
    medicine_id: string;
    medicine_name?: string;
    period: string;
    time_unit: string;
    advice: string;
  }[]>([]);
  const [newRxMedicineId, setNewRxMedicineId] = useState('');
  const [newRxPeriod, setNewRxPeriod] = useState('7');
  const [newRxTimeUnit, setNewRxTimeUnit] = useState('Days');
  const [newRxAdvice, setNewRxAdvice] = useState('After meals');

  // Quick Add Modals State
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientGender, setNewPatientGender] = useState('Male');
  const [newPatientDOB, setNewPatientDOB] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [creatingPatient, setCreatingPatient] = useState(false);

  const [showDiagnosisModal, setShowDiagnosisModal] = useState(false);
  const [newDiagName, setNewDiagName] = useState('');
  const [newDiagIcd, setNewDiagIcd] = useState('');
  const [creatingDiag, setCreatingDiag] = useState(false);

  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [newCompName, setNewCompName] = useState('');
  const [creatingComp, setCreatingComp] = useState(false);

  const [showInvestigationModal, setShowInvestigationModal] = useState(false);
  const [newInvName, setNewInvName] = useState('');
  const [creatingInv, setCreatingInv] = useState(false);

  const [showReferralDocModal, setShowReferralDocModal] = useState(false);
  const [newRefDocName, setNewRefDocName] = useState('');
  const [newRefDocPhone, setNewRefDocPhone] = useState('');
  const [newRefDocEmail, setNewRefDocEmail] = useState('');
  const [newRefDocSpec, setNewRefDocSpec] = useState('');
  const [newRefDocHospital, setNewRefDocHospital] = useState('');
  const [creatingRefDoc, setCreatingRefDoc] = useState(false);

  const [showMedicineModal, setShowMedicineModal] = useState(false);
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');
  const [newMedRoute, setNewMedRoute] = useState('po');
  const [creatingMedicine, setCreatingMedicine] = useState(false);

  const handleCreatePatient = async () => {
    if (!newPatientName.trim()) {
      Alert.alert('Required', 'Please enter patient full name.');
      return;
    }
    setCreatingPatient(true);
    try {
      const pNum = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const generatedEmail = newPatientEmail.trim() || `patient.${pNum}@spiritmed.com`;
      const generatedPassword = 'patient123456';

      const { data, error } = await supabase
        .from('patients')
        .insert([{
          full_name: newPatientName.trim(),
          gender: newPatientGender,
          date_of_birth: newPatientDOB.trim() || null,
          phone: newPatientPhone.trim() || null,
          email: generatedEmail,
          password: generatedPassword,
          patient_number: pNum,
          branch_id: userBranchId || null,
          status: 'active',
        }])
        .select()
        .single();

      if (error) throw error;
      setPatients((prev) => [data, ...prev]);
      setFormPatientId(data.id);
      setShowPatientModal(false);
      setNewPatientName('');
      setNewPatientDOB('');
      setNewPatientPhone('');
      setNewPatientEmail('');
      Alert.alert('Patient Registered', `${data.full_name} registered and selected.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to register patient.');
    } finally {
      setCreatingPatient(false);
    }
  };

  const handleCreateDiagnosis = async () => {
    if (!newDiagName.trim()) {
      Alert.alert('Required', 'Please enter diagnosis name.');
      return;
    }
    setCreatingDiag(true);
    try {
      const { data, error } = await supabase
        .from('diagnoses')
        .insert([{
          name: newDiagName.trim(),
          icd10_code: newDiagIcd.trim() || null,
          branch_id: userBranchId || null,
        }])
        .select()
        .single();
      if (error) throw error;
      setDiagnoses((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedDiagnoses((prev) => [...prev, data.id]);
      setShowDiagnosisModal(false);
      setNewDiagName('');
      setNewDiagIcd('');
      Alert.alert('Diagnosis Added', `${data.name} created and selected.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add diagnosis.');
    } finally {
      setCreatingDiag(false);
    }
  };

  const handleCreateComplaint = async () => {
    if (!newCompName.trim()) {
      Alert.alert('Required', 'Please enter complaint name.');
      return;
    }
    setCreatingComp(true);
    try {
      const { data, error } = await supabase
        .from('complaints')
        .insert([{
          name: newCompName.trim(),
          branch_id: userBranchId || null,
        }])
        .select()
        .single();
      if (error) throw error;
      setComplaints((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedComplaints((prev) => [...prev, data.id]);
      setShowComplaintModal(false);
      setNewCompName('');
      Alert.alert('Complaint Added', `${data.name} created and selected.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add complaint.');
    } finally {
      setCreatingComp(false);
    }
  };

  const handleCreateInvestigation = async () => {
    if (!newInvName.trim()) {
      Alert.alert('Required', 'Please enter investigation name.');
      return;
    }
    setCreatingInv(true);
    try {
      const { data, error } = await supabase
        .from('investigations')
        .insert([{
          name: newInvName.trim(),
          branch_id: userBranchId || null,
        }])
        .select()
        .single();
      if (error) throw error;
      setInvestigations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedInvestigations((prev) => [...prev, data.id]);
      setShowInvestigationModal(false);
      setNewInvName('');
      Alert.alert('Investigation Added', `${data.name} created and selected.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add investigation.');
    } finally {
      setCreatingInv(false);
    }
  };

  const handleCreateReferralDoc = async () => {
    if (!newRefDocName.trim()) {
      Alert.alert('Required', 'Please enter doctor name.');
      return;
    }
    setCreatingRefDoc(true);
    try {
      const { data, error } = await supabase
        .from('referral_doctors')
        .insert([{
          full_name: newRefDocName.trim(),
          phone: newRefDocPhone.trim() || null,
          email: newRefDocEmail.trim() || null,
          specialization: newRefDocSpec.trim() || null,
          hospital: newRefDocHospital.trim() || null,
          branch_id: userBranchId || null,
        }])
        .select()
        .single();
      if (error) throw error;
      setReferralDoctors((prev) => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setFormReferredBy(data.id);
      setShowReferralDocModal(false);
      setNewRefDocName('');
      setNewRefDocPhone('');
      setNewRefDocEmail('');
      setNewRefDocSpec('');
      setNewRefDocHospital('');
      Alert.alert('Referral Doctor Added', `${data.full_name} created and selected.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add referral doctor.');
    } finally {
      setCreatingRefDoc(false);
    }
  };

  const handleCreateMedicine = async () => {
    if (!newMedName.trim()) {
      Alert.alert('Required', 'Please enter medication name.');
      return;
    }
    setCreatingMedicine(true);
    try {
      const { data, error } = await supabase
        .from('medicines')
        .insert([{
          name: newMedName.trim(),
          dosage: newMedDosage.trim() || null,
          route: newMedRoute.trim() || 'po',
          branch_id: userBranchId || null,
        }])
        .select()
        .single();
      if (error) throw error;
      setMedicines((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewRxMedicineId(data.id);
      setShowMedicineModal(false);
      setNewMedName('');
      setNewMedDosage('');
      setNewMedRoute('po');
      Alert.alert('Medicine Added', `${data.name} created and selected.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add medicine.');
    } finally {
      setCreatingMedicine(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (initialPatientId && patients.length > 0) {
      handleOpenAddModal(initialPatientId);
    }
  }, [initialPatientId, patients]);

  useEffect(() => {
    if (formPatientId) {
      loadLatestVitals(formPatientId);
    } else {
      setLatestVitals(null);
    }
  }, [formPatientId]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        setCurrentUserId(userData.user.id);
        const { data: profile } = await supabase
          .from('users')
          .select('branch_id')
          .eq('id', userData.user.id)
          .single();
        if (profile?.branch_id) setUserBranchId(profile.branch_id);
      }

      await Promise.all([
        loadDoctors(),
        loadPatients(),
        loadReferralDoctors(),
        loadComplaints(),
        loadInvestigations(),
        loadDiagnoses(),
        loadMedicines(),
        loadConsultations(),
      ]);
    } catch (e) {
      console.error('Error loading initial data:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    try {
      const { data } = await supabase
        .from('users')
        .select('id, full_name, specialization, qualifications, signature_url, role')
        .eq('role', 'doctor')
        .eq('is_active', true)
        .order('full_name', { ascending: true });
      const docList = data || [];
      setDoctors(docList);
      if (docList.length > 0) {
        setFormDoctorId((prev) => prev || docList[0].id);
      }
    } catch (e) {
      console.error('Error loading doctors:', e);
    }
  };

  const loadPatients = async (forceRefresh = false) => {
    try {
      const data = await fetchAllPatients(forceRefresh);
      setPatients(data || []);
    } catch (e) {
      console.error('Error loading patients:', e);
    }
  };

  const loadReferralDoctors = async () => {
    try {
      const { data } = await supabase
        .from('referral_doctors')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      setReferralDoctors(data || []);
    } catch (e) {
      console.error('Error loading referral doctors:', e);
    }
  };

  const loadComplaints = async () => {
    try {
      const { data } = await supabase
        .from('complaints')
        .select('id, name')
        .order('name', { ascending: true });
      setComplaints(data || []);
    } catch (e) {
      console.error('Error loading complaints:', e);
    }
  };

  const loadInvestigations = async () => {
    try {
      const { data } = await supabase
        .from('investigations')
        .select('id, name')
        .order('name', { ascending: true });
      setInvestigations(data || []);
    } catch (e) {
      console.error('Error loading investigations:', e);
    }
  };

  const loadDiagnoses = async () => {
    try {
      const { data } = await supabase
        .from('diagnoses')
        .select('id, name, icd10_code')
        .order('name', { ascending: true });
      setDiagnoses(data || []);
    } catch (e) {
      console.error('Error loading diagnoses:', e);
    }
  };

  const loadMedicines = async () => {
    try {
      const { data, error } = await supabase
        .from('medicines')
        .select('id, name, dosage, route, frequency:medicine_frequencies(name)')
        .order('name', { ascending: true });
      if (error) {
        console.error('Error loading medicines with relation, falling back:', error);
        const { data: fallbackData } = await supabase
          .from('medicines')
          .select('id, name, dosage, route')
          .order('name', { ascending: true });
        setMedicines(fallbackData || []);
      } else {
        setMedicines(data || []);
      }
    } catch (e) {
      console.error('Error loading medicines:', e);
    }
  };

  const loadLatestVitals = async (patientId: string) => {
    try {
      const { data } = await supabase
        .from('vital_signs')
        .select('*')
        .eq('patient_id', patientId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestVitals(data || null);
    } catch (e) {
      setLatestVitals(null);
    }
  };

  const loadConsultations = async () => {
    try {
      let q = supabase
        .from('consultations')
        .select(`
          *,
          patient:patients(id, full_name, patient_number, gender, date_of_birth, phone, email, file_number),
          doctor:users!doctor_id(id, full_name, specialization),
          prescriptions(id, prescription_items(id, medicine_id, medicine:medicines(name, dosage), period, time_unit, advice))
        `)
        .order('created_at', { ascending: false })
        .limit(1000);

      const { data, error } = await q;
      if (error) throw error;

      const formatted: Consultation[] = (data || []).map((c: any) => {
        const rawItems = c.prescriptions?.[0]?.prescription_items || [];
        const items: PrescriptionItem[] = rawItems.map((pi: any) => ({
          id: pi.id,
          medicine_id: pi.medicine_id,
          medicine_name: pi.medicine?.name || 'Medication',
          dosage: pi.medicine?.dosage || '',
          period: pi.period || '',
          time_unit: pi.time_unit || '',
          advice: pi.advice || '',
        }));

        return {
          ...c,
          prescriptions: items,
        };
      });

      setConsultations(formatted);
    } catch (e: any) {
      console.error('Error loading consultations:', e);
      Alert.alert('Error', e.message || 'Failed to load consultations.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadConsultations(),
      loadPatients(true),
      loadDoctors(),
      loadReferralDoctors(),
      loadComplaints(),
      loadInvestigations(),
      loadDiagnoses(),
      loadMedicines(),
    ]);
    setRefreshing(false);
  };

  // ── Open Add Modal ──
  const handleOpenAddModal = (preselectedPatientId?: string) => {
    setIsEditing(false);
    setEditingId(null);
    setFormPatientId(preselectedPatientId || '');
    const userIsDoctor = doctors.find((d) => d.id === currentUserId);
    const defaultDoctorId = userIsDoctor ? currentUserId : (doctors[0]?.id || '');
    setFormDoctorId(defaultDoctorId);
    setSelectedDiagnoses([]);
    setSelectedComplaints([]);
    setSelectedInvestigations([]);
    setFormObservations('');
    setFormTreatmentPlan('');
    setFormReferredBy('');
    setFormFollowUpPeriod('');
    setFormFollowUpTime('Days');
    setFormFollowUpDate('');
    setFormRemarks('');
    setFormStatus('completed');
    setPrescriptions([]);
    setNewRxMedicineId('');
    setNewRxPeriod('7');
    setNewRxTimeUnit('Days');
    setNewRxAdvice('After meals');
    setShowSmartPaste(false);
    setSmartPasteText('');
    setFormModalVisible(true);
  };

  // ── Open Edit Modal ──
  const handleOpenEditModal = (c: any) => {
    setIsEditing(true);
    setEditingId(c.id);
    setFormPatientId(c.patient_id || '');
    setFormDoctorId(c.doctor_id || currentUserId);

    // Map stored string values to IDs if matching
    const diagList = (c.diagnosis || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const matchedDiagIds = diagnoses
      .filter((d) => diagList.some((dl: string) => d.name?.toLowerCase() === dl.toLowerCase() || d.id === dl))
      .map((d) => d.id);
    setSelectedDiagnoses(matchedDiagIds);

    const compList = (c.chief_complaint || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const matchedCompIds = complaints
      .filter((comp) => compList.some((cl: string) => comp.name?.toLowerCase() === cl.toLowerCase() || comp.id === cl))
      .map((comp) => comp.id);
    setSelectedComplaints(matchedCompIds);

    const invList = (c.investigations || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
    const matchedInvIds = investigations
      .filter((inv) => invList.some((il: string) => inv.name?.toLowerCase() === il.toLowerCase() || inv.id === il))
      .map((inv) => inv.id);
    setSelectedInvestigations(matchedInvIds);

    setFormObservations(cleanHtmlText(c.physical_examination));
    setFormTreatmentPlan(cleanHtmlText(c.treatment_plan));
    setFormReferredBy(c.referred_by || '');
    setFormFollowUpPeriod(c.follow_up_period ? String(c.follow_up_period) : '');
    setFormFollowUpTime(c.follow_up_time || 'Days');
    setFormFollowUpDate(c.follow_up_date || '');
    setFormRemarks(cleanHtmlText(c.notes));
    setFormStatus(c.status || 'completed');

    const existingRxs = (c.prescriptions || []).map((p: any) => ({
      medicine_id: p.medicine_id,
      medicine_name: p.medicine_name || 'Medication',
      period: p.period || '7',
      time_unit: p.time_unit || 'Days',
      advice: p.advice || 'After meals',
    }));
    setPrescriptions(existingRxs);

    setShowSmartPaste(false);
    setSmartPasteText('');
    setFormModalVisible(true);
  };

  // ── AI Smart-Paste Parser ──
  const handleApplySmartPaste = () => {
    if (!smartPasteText.trim()) return;

    if (smartParseMode === 'raw') {
      setFormRemarks((prev) => (prev ? `${prev}\n\n${smartPasteText}` : smartPasteText));
      setShowSmartPaste(false);
      setSmartPasteText('');
      Alert.alert('Applied', 'Raw clinical note copied into Remarks field.');
      return;
    }

    // Auto-fill mode: attempt basic section parsing
    const lines = smartPasteText.split('\n');
    let currentSection = 'observations';
    let obsText = '';
    let planText = '';
    let notesText = '';

    for (const line of lines) {
      const lower = line.toLowerCase().trim();
      if (lower.includes('assessment') || lower.includes('plan') || lower.includes('treatment') || lower.includes('rx')) {
        currentSection = 'plan';
      } else if (lower.includes('note') || lower.includes('remark') || lower.includes('history') || lower.includes('follow')) {
        currentSection = 'notes';
      } else if (lower.includes('objective') || lower.includes('exam') || lower.includes('subjective') || lower.includes('finding')) {
        currentSection = 'observations';
      }

      if (currentSection === 'observations') obsText += line + '\n';
      else if (currentSection === 'plan') planText += line + '\n';
      else notesText += line + '\n';
    }

    if (obsText.trim()) setFormObservations((prev) => (prev ? `${prev}\n${obsText.trim()}` : obsText.trim()));
    if (planText.trim()) setFormTreatmentPlan((prev) => (prev ? `${prev}\n${planText.trim()}` : planText.trim()));
    if (notesText.trim()) setFormRemarks((prev) => (prev ? `${prev}\n${notesText.trim()}` : notesText.trim()));

    setShowSmartPaste(false);
    setSmartPasteText('');
    Alert.alert('Applied', 'AI note parsed and populated into form sections.');
  };

  // ── Add Prescription Item ──
  const handleAddPrescriptionItem = () => {
    if (!newRxMedicineId) {
      Alert.alert('Select Medicine', 'Please select a medication from the list.');
      return;
    }
    const med = medicines.find((m) => m.id === newRxMedicineId);
    setPrescriptions((prev) => [
      ...prev,
      {
        medicine_id: newRxMedicineId,
        medicine_name: med ? `${med.name} ${med.dosage ? `(${med.dosage})` : ''}` : 'Medication',
        period: newRxPeriod.trim() || '7',
        time_unit: newRxTimeUnit,
        advice: newRxAdvice.trim() || 'After meals',
      },
    ]);
    setNewRxMedicineId('');
    setNewRxPeriod('7');
    setNewRxTimeUnit('Days');
    setNewRxAdvice('After meals');
  };

  const handleRemovePrescriptionItem = (index: number) => {
    setPrescriptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  // ── Save Consultation (Insert or Update) ──
  const handleSaveConsultation = async () => {
    if (!formPatientId) {
      Alert.alert('Required Field', 'Please select a patient.');
      return;
    }

    setSaving(true);
    try {
      const chiefComplaintText = selectedComplaints
        .map((id) => complaints.find((c) => c.id === id)?.name || id)
        .join(', ');

      const investigationsText = selectedInvestigations
        .map((id) => investigations.find((i) => i.id === id)?.name || id)
        .join(', ');

      const diagnosisText = selectedDiagnoses
        .map((id) => {
          const d = diagnoses.find((diag) => diag.id === id);
          return d ? (d.icd10_code ? `${d.name} (${d.icd10_code})` : d.name) : id;
        })
        .join(', ');

      const payload: any = {
        patient_id: formPatientId,
        doctor_id: formDoctorId || currentUserId || null,
        chief_complaint: chiefComplaintText || null,
        investigations: investigationsText || null,
        diagnosis: diagnosisText || null,
        physical_examination: formObservations.trim() || null,
        treatment_plan: formTreatmentPlan.trim() || null,
        referred_by: formReferredBy || null,
        follow_up_period: formFollowUpPeriod ? parseInt(formFollowUpPeriod, 10) : null,
        follow_up_time: formFollowUpTime || 'Days',
        follow_up_date: formFollowUpDate.trim() || null,
        notes: formRemarks.trim() || null,
        status: formStatus || 'completed',
        branch_id: userBranchId || null,
      };

      let consId = editingId;

      if (isEditing && editingId) {
        const { error } = await supabase
          .from('consultations')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        payload.created_at = new Date().toISOString();
        const { data, error } = await supabase
          .from('consultations')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        consId = data.id;
      }

      // Save Prescriptions if any
      if (consId && prescriptions.length > 0) {
        const { data: rxHeader, error: rxErr } = await supabase
          .from('prescriptions')
          .insert([
            {
              patient_id: formPatientId,
              doctor_id: formDoctorId || currentUserId || null,
              branch_id: userBranchId || null,
              consultation_id: consId,
              prescription_date: new Date().toISOString().split('T')[0],
              status: 'active',
            },
          ])
          .select()
          .single();

        if (!rxErr && rxHeader) {
          const itemsPayload = prescriptions.map((rx) => ({
            prescription_id: rxHeader.id,
            medicine_id: rx.medicine_id,
            period: rx.period,
            time_unit: rx.time_unit,
            advice: rx.advice,
          }));
          await supabase.from('prescription_items').insert(itemsPayload);
        }
      }

      Alert.alert('Success', `Consultation ${isEditing ? 'updated' : 'recorded'} successfully!`);
      setFormModalVisible(false);
      await loadConsultations();
    } catch (e: any) {
      console.error('Error saving consultation:', e);
      Alert.alert('Save Failed', e.message || 'Unable to save consultation.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Consultation ──
  const handleDeleteConsultation = (consultation: Consultation) => {
    Alert.alert(
      'Delete Consultation',
      `Are you sure you want to delete this consultation for ${consultation.patient?.full_name || 'this patient'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('consultations')
                .delete()
                .eq('id', consultation.id);
              if (error) throw error;
              setViewModalVisible(false);
              setSelectedConsultation(null);
              await loadConsultations();
              Alert.alert('Deleted', 'Consultation record deleted.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete consultation.');
            }
          },
        },
      ]
    );
  };

  // ── View Details ──
  const handleOpenViewModal = (c: Consultation) => {
    setSelectedConsultation(c);
    setViewModalVisible(true);
  };

  // ── PDF Generator ──
  const handleDownloadPDF = async (c: Consultation) => {
    setDownloadingPdf(true);
    try {
      await downloadConsultationPDF(c);
    } catch (e: any) {
      Alert.alert('PDF Error', e.message || 'Failed to generate PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ── Filtered & Paginated List ──
  const filteredConsultations = consultations.filter((c) => {
    const q = search.toLowerCase();
    const patName = c.patient?.full_name?.toLowerCase() || '';
    const patNum = c.patient?.patient_number?.toLowerCase() || '';
    const fileNum = (c.patient as any)?.file_number?.toLowerCase() || '';
    const docName = c.doctor?.full_name?.toLowerCase() || '';
    const diag = c.diagnosis?.toLowerCase() || '';
    const comp = c.chief_complaint?.toLowerCase() || '';
    return (
      patName.includes(q) ||
      patNum.includes(q) ||
      fileNum.includes(q) ||
      docName.includes(q) ||
      diag.includes(q) ||
      comp.includes(q)
    );
  });

  const totalPages = Math.ceil(filteredConsultations.length / ITEMS_PER_PAGE) || 1;
  const paginatedConsultations = filteredConsultations.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  // Dropdown Items mappings
  const patientDropdownItems: DropdownItem[] = patients.map((p) => ({
    id: p.id,
    label: p.full_name,
    subLabel: `ID: ${p.patient_number || 'N/A'}${p.file_number ? ` · File: ${p.file_number}` : ''}${p.phone ? ` · 📞 ${p.phone}` : ''}`,
  }));

  const diagnosisDropdownItems: DropdownItem[] = diagnoses.map((d) => ({
    id: d.id,
    label: d.icd10_code ? `${d.name} (${d.icd10_code})` : d.name,
    subLabel: d.icd10_code ? `ICD-10: ${d.icd10_code}` : undefined,
  }));

  const complaintDropdownItems: DropdownItem[] = complaints.map((c) => ({
    id: c.id,
    label: c.name,
  }));

  const investigationDropdownItems: DropdownItem[] = investigations.map((i) => ({
    id: i.id,
    label: i.name,
  }));

  const referralDoctorDropdownItems: DropdownItem[] = referralDoctors.map((rd) => ({
    id: rd.id,
    label: rd.full_name,
  }));

  const medicineDropdownItems: DropdownItem[] = medicines.map((m) => {
    const freq = typeof m.frequency === 'object' ? (m.frequency as any)?.name : m.frequency || '-';
    return {
      id: m.id,
      label: `${m.name}${m.dosage ? ` (${m.dosage})` : ''}`,
      subLabel: `Route: ${m.route || '-'} | Frequency: ${freq}`,
    };
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

      {/* ── Top Header ── */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Consultations</Text>
          <Text style={[styles.headerSub, { color: themeColors.subText }]}>
            {consultations.length} total clinical visits
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#2563EB' }]}
          onPress={() => handleOpenAddModal()}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>+ Add Consultation</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ── */}
      <View style={[styles.searchContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search by patient, doctor, diagnosis, complaints..."
          placeholderTextColor={themeColors.subText}
          value={search}
          onChangeText={(t) => {
            setSearch(t);
            setPage(1);
          }}
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
            <Text style={{ color: themeColors.subText, fontSize: 13 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Consultations List ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={[styles.loadingText, { color: themeColors.subText }]}>
            Loading clinical consultations...
          </Text>
        </View>
      ) : (
        <FlatList
          data={paginatedConsultations}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2563EB"
              colors={['#2563EB']}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🩺</Text>
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                {search ? 'No Matching Consultations' : 'No Consultations Recorded'}
              </Text>
              <Text style={[styles.emptySub, { color: themeColors.subText }]}>
                {search
                  ? 'Try searching with different keywords.'
                  : 'Tap "+ Add Consultation" above to record your first clinical visit.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const consDate = item.created_at
              ? new Date(item.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : 'Unknown Date';

            return (
              <TouchableOpacity
                style={[
                  styles.card,
                  {
                    backgroundColor: themeColors.cardBg,
                    borderColor: themeColors.border,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => handleOpenViewModal(item)}
              >
                {/* Header Row */}
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardPatientName, { color: themeColors.text }]} numberOfLines={1}>
                      {item.patient?.full_name || 'Unnamed Patient'}
                    </Text>
                    <Text style={[styles.cardPatientSub, { color: themeColors.subText }]}>
                      ID: {item.patient?.patient_number || 'N/A'}{item.patient?.file_number ? ` · File: ${item.patient.file_number}` : ''}
                    </Text>
                  </View>
                  <View style={styles.cardDateBadge}>
                    <Text style={styles.cardDateText}>{consDate}</Text>
                  </View>
                </View>

                {/* Complaints & Diagnosis */}
                {item.chief_complaint && (
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: themeColors.subText }]}>Complaints:</Text>
                    <Text style={[styles.detailVal, { color: themeColors.text }]} numberOfLines={1}>
                      {cleanHtmlText(item.chief_complaint)}
                    </Text>
                  </View>
                )}

                {item.diagnosis && (
                  <View style={styles.diagnosisBox}>
                    <Text style={styles.diagnosisTag}>DIAGNOSIS</Text>
                    <Text style={styles.diagnosisText} numberOfLines={1}>
                      {cleanHtmlText(item.diagnosis)}
                    </Text>
                  </View>
                )}

                {/* Footer */}
                <View style={[styles.cardFooter, { borderTopColor: isDark ? '#334155' : '#F1F5F9' }]}>
                  <Text style={[styles.cardDoctor, { color: themeColors.subText }]}>
                    👨‍⚕️ Dr. {item.doctor?.full_name || 'Clinician'}
                  </Text>
                  {item.prescriptions && item.prescriptions.length > 0 && (
                    <View style={styles.rxBadge}>
                      <Text style={styles.rxBadgeText}>💊 {item.prescriptions.length} Rx</Text>
                    </View>
                  )}
                  {item.status && (
                    <View style={[styles.statusBadge, { backgroundColor: item.status === 'completed' ? '#DCFCE7' : '#FEF3C7' }]}>
                      <Text style={[styles.statusText, { color: item.status === 'completed' ? '#166534' : '#92400E' }]}>
                        {item.status}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          ADD / EDIT CONSULTATION MODAL (Exact Web App Form)
         ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={formModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setFormModalVisible(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.bg }]}>
          <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={() => setFormModalVisible(false)}
            >
              <Text style={{ fontSize: 18, color: themeColors.text }}>✕</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.modalHeaderTitle, { color: themeColors.text }]}>
                📝 {isEditing ? 'Edit' : 'Add'} Consultation
              </Text>
              <Text style={[styles.headerSub, { color: themeColors.subText }]}>
                Clinical records, diagnosis & prescriptions
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveHeaderBtn, { backgroundColor: '#2563EB' }]}
              onPress={handleSaveConsultation}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveHeaderBtnText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* ✨ AI Note Smart-Paste Banner ✨ */}
              <View
                style={[
                  styles.smartPasteBox,
                  {
                    backgroundColor: isDark ? 'rgba(30, 58, 138, 0.25)' : '#EFF6FF',
                    borderColor: isDark ? '#1E40AF' : '#BFDBFE',
                  },
                ]}
              >
                {!showSmartPaste ? (
                  <View style={styles.smartPasteHeaderRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.smartPasteTitle, { color: isDark ? '#93C5FD' : '#1E40AF' }]}>
                        {!formPatientId
                          ? '⚠️ Please select a patient first to enable AI Note Smart-Paste.'
                          : '✨ Have an AI generated consultation note (e.g. Freed AI)?'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      disabled={!formPatientId}
                      style={[
                        styles.smartPasteBtn,
                        {
                          backgroundColor: !formPatientId ? '#94A3B8' : '#2563EB',
                        },
                      ]}
                      onPress={() => setShowSmartPaste(true)}
                    >
                      <Text style={styles.smartPasteBtnText}>✨ Smart-Paste</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <View style={styles.smartPasteHeaderRow}>
                      <Text style={[styles.smartPasteTitle, { color: isDark ? '#93C5FD' : '#1E40AF', fontWeight: '800' }]}>
                        AI Note Smart-Paste Parser
                      </Text>
                      <TouchableOpacity onPress={() => setShowSmartPaste(false)}>
                        <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 14 }}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Mode Toggle */}
                    <View style={styles.modeToggleWrap}>
                      <TouchableOpacity
                        style={[
                          styles.modeToggleBtn,
                          smartParseMode === 'autofill' && styles.modeToggleActive,
                        ]}
                        onPress={() => setSmartParseMode('autofill')}
                      >
                        <Text
                          style={[
                            styles.modeToggleText,
                            smartParseMode === 'autofill' && { color: '#2563EB' },
                          ]}
                        >
                          ⚡ Auto-Fill Sections
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.modeToggleBtn,
                          smartParseMode === 'raw' && styles.modeToggleActive,
                        ]}
                        onPress={() => setSmartParseMode('raw')}
                      >
                        <Text
                          style={[
                            styles.modeToggleText,
                            smartParseMode === 'raw' && { color: '#2563EB' },
                          ]}
                        >
                          📝 Quick Raw Note
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TextInput
                      style={[
                        styles.smartPasteInput,
                        {
                          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                          color: themeColors.text,
                          borderColor: isDark ? '#334155' : '#CBD5E1',
                        },
                      ]}
                      placeholder="Paste your copied clinical note here (e.g. Subjective, Objective, Assessment, Plan)..."
                      placeholderTextColor={themeColors.subText}
                      multiline={true}
                      numberOfLines={6}
                      textAlignVertical="top"
                      value={smartPasteText}
                      onChangeText={setSmartPasteText}
                    />

                    <TouchableOpacity
                      style={styles.applyPasteBtn}
                      onPress={handleApplySmartPaste}
                    >
                      <Text style={styles.applyPasteBtnText}>✨ Parse & Populate Form</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* 1. PATIENT * */}
              <SearchDropdown
                label="Patient"
                placeholder="Search Patient Name / ID..."
                items={patientDropdownItems}
                selectedId={formPatientId}
                onSelect={(id) => setFormPatientId(id)}
                onAddNew={() => setShowPatientModal(true)}
                addNewLabel="Add New Patient"
                required={true}
                tagColor="blue"
              />

              {/* 2. DIAGNOSIS & ICD 10 CODE */}
              <SearchDropdown
                label="Diagnosis & ICD 10 Code"
                placeholder="Search Diagnosis & ICD 10 Code..."
                items={diagnosisDropdownItems}
                multiSelect={true}
                selectedIds={selectedDiagnoses}
                onSelectMultiple={(ids) => setSelectedDiagnoses(ids)}
                onAddNew={() => setShowDiagnosisModal(true)}
                addNewLabel="Add New Diagnosis"
                tagColor="blue"
              />

              {/* 3. MAIN COMPLAINTS & INVESTIGATIONS */}
              <SearchDropdown
                label="Main Complaints"
                placeholder="Search Complaints..."
                items={complaintDropdownItems}
                multiSelect={true}
                selectedIds={selectedComplaints}
                onSelectMultiple={(ids) => setSelectedComplaints(ids)}
                onAddNew={() => setShowComplaintModal(true)}
                addNewLabel="Add New Complaint"
                tagColor="blue"
              />

              <SearchDropdown
                label="Investigations"
                placeholder="Search Investigations..."
                items={investigationDropdownItems}
                multiSelect={true}
                selectedIds={selectedInvestigations}
                onSelectMultiple={(ids) => setSelectedInvestigations(ids)}
                onAddNew={() => setShowInvestigationModal(true)}
                addNewLabel="Add New Investigation"
                tagColor="emerald"
              />

              {/* Latest Vitals Banner if Available */}
              {latestVitals && (
                <View style={styles.vitalsBanner}>
                  <Text style={styles.vitalsTitle}>📊 LATEST PATIENT VITALS:</Text>
                  <Text style={styles.vitalsText}>
                    BP: {latestVitals.blood_pressure_systolic}/{latestVitals.blood_pressure_diastolic} mmHg · Pulse: {latestVitals.pulse_rate} bpm · Temp: {latestVitals.temperature}°C
                  </Text>
                </View>
              )}

              {/* 4. OBSERVATIONS */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>OBSERVATIONS</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      color: themeColors.text,
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    },
                  ]}
                  placeholder="Enter clinical observations and examination findings..."
                  placeholderTextColor={themeColors.subText}
                  multiline={true}
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={formObservations}
                  onChangeText={setFormObservations}
                />
              </View>

              {/* 5. TREATMENT PLAN */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>TREATMENT PLAN</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      color: themeColors.text,
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    },
                  ]}
                  placeholder="Enter treatment plan, medications, and recommendations..."
                  placeholderTextColor={themeColors.subText}
                  multiline={true}
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={formTreatmentPlan}
                  onChangeText={setFormTreatmentPlan}
                />
              </View>

              {/* 6. REFERRED BY */}
              <SearchDropdown
                label="Referred By"
                placeholder="Search Doctor..."
                items={referralDoctorDropdownItems}
                selectedId={formReferredBy}
                onSelect={(id) => setFormReferredBy(id)}
                onAddNew={() => setShowReferralDocModal(true)}
                addNewLabel="Add New Doctor"
                tagColor="purple"
              />

              {/* 7. FOLLOW UP SECTION */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>FOLLOW UP</Text>
                <View style={styles.followUpRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Period</Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                          color: themeColors.text,
                          borderColor: isDark ? '#334155' : '#CBD5E1',
                        },
                      ]}
                      placeholder="e.g. 2"
                      placeholderTextColor={themeColors.subText}
                      keyboardType="numeric"
                      value={formFollowUpPeriod}
                      onChangeText={setFormFollowUpPeriod}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Time Unit</Text>
                    <View style={styles.unitPillWrap}>
                      {FOLLOW_UP_TIME_UNITS.map((unit) => (
                        <TouchableOpacity
                          key={unit}
                          style={[
                            styles.unitPill,
                            formFollowUpTime === unit && styles.unitPillActive,
                          ]}
                          onPress={() => setFormFollowUpTime(unit)}
                        >
                          <Text
                            style={[
                              styles.unitPillText,
                              formFollowUpTime === unit && { color: '#2563EB', fontWeight: '800' },
                            ]}
                          >
                            {unit}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Follow Up Date</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                        color: themeColors.text,
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                      },
                    ]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={themeColors.subText}
                    value={formFollowUpDate}
                    onChangeText={setFormFollowUpDate}
                  />
                </View>
              </View>

              {/* 8. REMARKS */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>REMARKS</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      color: themeColors.text,
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    },
                  ]}
                  placeholder="Additional remarks or notes..."
                  placeholderTextColor={themeColors.subText}
                  multiline={true}
                  numberOfLines={3}
                  textAlignVertical="top"
                  value={formRemarks}
                  onChangeText={setFormRemarks}
                />
              </View>

              {/* 9. PRESCRIPTIONS BUILDER */}
              <View
                style={[
                  styles.rxBuilderBox,
                  {
                    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                    borderColor: isDark ? '#334155' : '#CBD5E1',
                  },
                ]}
              >
                <Text style={[styles.rxBuilderTitle, { color: themeColors.text }]}>
                  💊 PRESCRIPTIONS
                </Text>

                {/* Added Prescriptions List */}
                {prescriptions.map((rx, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.rxItemCard,
                      {
                        backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                        borderColor: isDark ? '#334155' : '#E2E8F0',
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rxItemName, { color: '#059669' }]}>
                        {rx.medicine_name || 'Medication'}
                      </Text>
                      <Text style={[styles.rxItemDetails, { color: themeColors.subText }]}>
                        {rx.period} {rx.time_unit} · {rx.advice}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemovePrescriptionItem(idx)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4 }}
                    >
                      <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: 'bold' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* Add New Prescription Inputs */}
                <View style={{ marginTop: 8 }}>
                  <SearchDropdown
                    label="Select Medicine"
                    placeholder="Search Medicine..."
                    items={medicineDropdownItems}
                    selectedId={newRxMedicineId}
                    onSelect={(id) => setNewRxMedicineId(id)}
                    onAddNew={() => setShowMedicineModal(true)}
                    addNewLabel="Add New Medicine"
                    tagColor="emerald"
                  />

                  <View style={styles.rxInputsRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Period</Text>
                      <TextInput
                        style={[
                          styles.textInput,
                          {
                            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                            color: themeColors.text,
                            borderColor: isDark ? '#334155' : '#CBD5E1',
                          },
                        ]}
                        placeholder="e.g. 7"
                        placeholderTextColor={themeColors.subText}
                        value={newRxPeriod}
                        onChangeText={setNewRxPeriod}
                      />
                    </View>

                    <View style={{ flex: 1.2 }}>
                      <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Unit</Text>
                      <View style={styles.unitPillWrap}>
                        {RX_TIME_UNITS.map((unit) => (
                          <TouchableOpacity
                            key={unit}
                            style={[
                              styles.unitPill,
                              newRxTimeUnit === unit && styles.unitPillActive,
                            ]}
                            onPress={() => setNewRxTimeUnit(unit)}
                          >
                            <Text
                              style={[
                                styles.unitPillText,
                                newRxTimeUnit === unit && { color: '#059669', fontWeight: '800' },
                              ]}
                            >
                              {unit}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Advice</Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                          color: themeColors.text,
                          borderColor: isDark ? '#334155' : '#CBD5E1',
                        },
                      ]}
                      placeholder="e.g. After meals"
                      placeholderTextColor={themeColors.subText}
                      value={newRxAdvice}
                      onChangeText={setNewRxAdvice}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.addRxBtn}
                    onPress={handleAddPrescriptionItem}
                  >
                    <Text style={styles.addRxBtnText}>+ Add to List</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 10. FOOTER BUTTONS */}
              <View style={styles.formFooter}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: themeColors.border }]}
                  onPress={() => setFormModalVisible(false)}
                >
                  <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: '#2563EB' }]}
                  onPress={handleSaveConsultation}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          VIEW CONSULTATION DETAILS SHEET / MODAL
         ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={viewModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setViewModalVisible(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.bg }]}>
          <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={() => setViewModalVisible(false)}
            >
              <Text style={{ fontSize: 18, color: themeColors.text }}>✕</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.modalHeaderTitle, { color: themeColors.text }]} numberOfLines={1}>
                Consultation Details
              </Text>
              <Text style={[styles.headerSub, { color: themeColors.subText }]}>
                {selectedConsultation?.patient?.full_name}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.editHeaderBtn, { backgroundColor: '#2563EB' }]}
              onPress={() => {
                setViewModalVisible(false);
                if (selectedConsultation) handleOpenEditModal(selectedConsultation);
              }}
            >
              <Text style={styles.editHeaderBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {selectedConsultation && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
              {/* Quick Actions Card */}
              <View style={[styles.sheetActionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={[styles.sheetActionBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => handleDownloadPDF(selectedConsultation)}
                  disabled={downloadingPdf}
                >
                  {downloadingPdf ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.sheetActionBtnText}>📄 Download PDF Report</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetActionBtn, { backgroundColor: '#059669', marginTop: 8 }]}
                  onPress={async () => {
                    const msg = `SpiritMed Consultation Report\nPatient: ${selectedConsultation.patient?.full_name}\nDoctor: Dr. ${selectedConsultation.doctor?.full_name}\nDiagnosis: ${selectedConsultation.diagnosis || 'N/A'}`;
                    await Share.share({ message: msg });
                  }}
                >
                  <Text style={styles.sheetActionBtnText}>📤 Share Summary</Text>
                </TouchableOpacity>
              </View>

              {/* Patient Info Card */}
              <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Patient Information</Text>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Full Name:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedConsultation.patient?.full_name}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Patient ID:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedConsultation.patient?.patient_number || 'N/A'}</Text>
                </View>
                {(selectedConsultation.patient as any)?.file_number && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: themeColors.subText }]}>File Number:</Text>
                    <Text style={[styles.infoVal, { color: themeColors.text }]}>{(selectedConsultation.patient as any).file_number}</Text>
                  </View>
                )}
              </View>

              {/* Clinical Details Card */}
              <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Clinical Summary</Text>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Doctor:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>Dr. {selectedConsultation.doctor?.full_name || 'N/A'}</Text>
                </View>
                {selectedConsultation.diagnosis && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Diagnosis:</Text>
                    <Text style={[styles.infoVal, { color: '#2563EB', fontWeight: '700' }]}>{cleanHtmlText(selectedConsultation.diagnosis)}</Text>
                  </View>
                )}
                {selectedConsultation.chief_complaint && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Complaints:</Text>
                    <Text style={[styles.infoVal, { color: themeColors.text }]}>{cleanHtmlText(selectedConsultation.chief_complaint)}</Text>
                  </View>
                )}
                {selectedConsultation.investigations && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Investigations:</Text>
                    <Text style={[styles.infoVal, { color: themeColors.text }]}>{cleanHtmlText(selectedConsultation.investigations)}</Text>
                  </View>
                )}
              </View>

              {/* Observations */}
              {selectedConsultation.physical_examination && (
                <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Observations & Findings</Text>
                  <Text style={[styles.sectionBody, { color: themeColors.text }]}>
                    {cleanHtmlText(selectedConsultation.physical_examination)}
                  </Text>
                </View>
              )}

              {/* Treatment Plan */}
              {selectedConsultation.treatment_plan && (
                <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Treatment Plan</Text>
                  <Text style={[styles.sectionBody, { color: themeColors.text }]}>
                    {cleanHtmlText(selectedConsultation.treatment_plan)}
                  </Text>
                </View>
              )}

              {/* Prescriptions */}
              {selectedConsultation.prescriptions && selectedConsultation.prescriptions.length > 0 && (
                <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Medication Prescriptions</Text>
                  {selectedConsultation.prescriptions.map((rx, idx) => (
                    <View key={idx} style={styles.sheetRxItem}>
                      <Text style={[styles.sheetRxName, { color: '#059669' }]}>💊 {rx.medicine_name || 'Medication'}</Text>
                      <Text style={[styles.sheetRxDetails, { color: themeColors.subText }]}>
                        {rx.period} {rx.time_unit} · {rx.advice}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Delete Action */}
              <TouchableOpacity
                style={styles.sheetDeleteBtn}
                onPress={() => handleDeleteConsultation(selectedConsultation)}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetDeleteBtnText}>🗑️ Delete Consultation</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          QUICK CREATION MODALS
         ───────────────────────────────────────────────────────────── */}

      {/* 1. Quick Add Patient Modal */}
      <Modal visible={showPatientModal} transparent animationType="fade" onRequestClose={() => setShowPatientModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>👤 Quick Register Patient</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Full Name *"
              placeholderTextColor={themeColors.subText}
              value={newPatientName}
              onChangeText={setNewPatientName}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {['Male', 'Female'].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.pill,
                    newPatientGender === g
                      ? { backgroundColor: '#2563EB', borderColor: '#2563EB' }
                      : { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border },
                    { flex: 1, alignItems: 'center' },
                  ]}
                  onPress={() => setNewPatientGender(g)}
                >
                  <Text style={{ color: newPatientGender === g ? '#FFF' : themeColors.text, fontWeight: '700' }}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Date of Birth (YYYY-MM-DD)"
              placeholderTextColor={themeColors.subText}
              value={newPatientDOB}
              onChangeText={setNewPatientDOB}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Phone Number (optional)"
              placeholderTextColor={themeColors.subText}
              value={newPatientPhone}
              onChangeText={setNewPatientPhone}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowPatientModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#2563EB' }]} onPress={handleCreatePatient} disabled={creatingPatient}>
                {creatingPatient ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Register Patient</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Quick Add Diagnosis Modal */}
      <Modal visible={showDiagnosisModal} transparent animationType="fade" onRequestClose={() => setShowDiagnosisModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>🩺 Add Diagnosis & ICD 10</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Diagnosis Name *"
              placeholderTextColor={themeColors.subText}
              value={newDiagName}
              onChangeText={setNewDiagName}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="ICD 10 Code (e.g. N40.0)"
              placeholderTextColor={themeColors.subText}
              value={newDiagIcd}
              onChangeText={setNewDiagIcd}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowDiagnosisModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#2563EB' }]} onPress={handleCreateDiagnosis} disabled={creatingDiag}>
                {creatingDiag ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Diagnosis</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. Quick Add Complaint Modal */}
      <Modal visible={showComplaintModal} transparent animationType="fade" onRequestClose={() => setShowComplaintModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>💬 Add Chief Complaint</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Chief Complaint *"
              placeholderTextColor={themeColors.subText}
              value={newCompName}
              onChangeText={setNewCompName}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowComplaintModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#2563EB' }]} onPress={handleCreateComplaint} disabled={creatingComp}>
                {creatingComp ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Complaint</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Quick Add Investigation Modal */}
      <Modal visible={showInvestigationModal} transparent animationType="fade" onRequestClose={() => setShowInvestigationModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>🔬 Add Investigation</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Investigation Name *"
              placeholderTextColor={themeColors.subText}
              value={newInvName}
              onChangeText={setNewInvName}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowInvestigationModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#059669' }]} onPress={handleCreateInvestigation} disabled={creatingInv}>
                {creatingInv ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Investigation</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 5. Quick Add Referral Doctor Modal */}
      <Modal visible={showReferralDocModal} transparent animationType="fade" onRequestClose={() => setShowReferralDocModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>👨‍⚕️ Add Referral Doctor</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Doctor Full Name *"
              placeholderTextColor={themeColors.subText}
              value={newRefDocName}
              onChangeText={setNewRefDocName}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Specialization (optional)"
              placeholderTextColor={themeColors.subText}
              value={newRefDocSpec}
              onChangeText={setNewRefDocSpec}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Hospital / Practice (optional)"
              placeholderTextColor={themeColors.subText}
              value={newRefDocHospital}
              onChangeText={setNewRefDocHospital}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Phone (optional)"
              placeholderTextColor={themeColors.subText}
              value={newRefDocPhone}
              onChangeText={setNewRefDocPhone}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowReferralDocModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#7E22CE' }]} onPress={handleCreateReferralDoc} disabled={creatingRefDoc}>
                {creatingRefDoc ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Doctor</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 6. Quick Add Medicine Modal */}
      <Modal visible={showMedicineModal} transparent animationType="fade" onRequestClose={() => setShowMedicineModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>💊 Add New Medicine</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Medicine Name *"
              placeholderTextColor={themeColors.subText}
              value={newMedName}
              onChangeText={setNewMedName}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Dosage (e.g. 500mg, 10ml, 1g)"
              placeholderTextColor={themeColors.subText}
              value={newMedDosage}
              onChangeText={setNewMedDosage}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Route (e.g. po, iv, im, sc)"
              placeholderTextColor={themeColors.subText}
              value={newMedRoute}
              onChangeText={setNewMedRoute}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowMedicineModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#059669' }]} onPress={handleCreateMedicine} disabled={creatingMedicine}>
                {creatingMedicine ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Medicine</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 13,
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardPatientName: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardPatientSub: {
    fontSize: 11,
    marginTop: 2,
  },
  cardDateBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardDateText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailVal: {
    fontSize: 11,
    flex: 1,
  },
  diagnosisBox: {
    backgroundColor: '#EFF6FF',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  diagnosisTag: {
    color: '#2563EB',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  diagnosisText: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  cardDoctor: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  rxBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  rxBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  modalContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  saveHeaderBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveHeaderBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  editHeaderBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  editHeaderBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  smartPasteBox: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    marginBottom: 16,
  },
  smartPasteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smartPasteTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  smartPasteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  smartPasteBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 11,
  },
  modeToggleWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
    padding: 2,
    gap: 4,
  },
  modeToggleBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeToggleActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  modeToggleText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  smartPasteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    minHeight: 100,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  applyPasteBtn: {
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyPasteBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  vitalsBanner: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  vitalsTitle: {
    color: '#E11D48',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  vitalsText: {
    color: '#881337',
    fontSize: 12,
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subInputLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  textArea: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 85,
  },
  followUpRow: {
    flexDirection: 'row',
    gap: 12,
  },
  unitPillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  unitPill: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  unitPillActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  unitPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  rxBuilderBox: {
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  rxBuilderTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  rxItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  rxItemName: {
    fontSize: 13,
    fontWeight: '700',
  },
  rxItemDetails: {
    fontSize: 11,
    marginTop: 2,
  },
  rxInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addRxBtn: {
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  addRxBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  formFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sheetActionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  sheetActionBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  sheetActionBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sheetSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 19,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  infoVal: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  sheetRxItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  sheetRxName: {
    fontSize: 12,
    fontWeight: '700',
  },
  sheetRxDetails: {
    fontSize: 11,
    marginTop: 1,
  },
  sheetDeleteBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  sheetDeleteBtnText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 13,
  },
  miniModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  miniModalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  miniModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  miniInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 10,
    fontWeight: '600',
  },
  miniModalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  miniBtnCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  miniBtnSave: {
    flex: 1.5,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  miniBtnSaveText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
