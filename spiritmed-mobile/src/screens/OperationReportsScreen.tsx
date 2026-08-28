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
  Switch,
  Share,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import {
  RootStackParamList,
  OperationReport,
  Patient,
  Doctor,
  Procedure,
  Hospital,
} from '../types';
import { downloadOperationReportPDF } from '../utils/pdfGenerator';
import { fetchAllPatients } from '../utils/patientLoader';
import { SearchDropdown, DropdownItem } from '../components/SearchDropdown';

type OperationReportsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'OperationReports'>;
type OperationReportsScreenRouteProp = RouteProp<RootStackParamList, 'OperationReports'>;

interface Props {
  navigation: OperationReportsScreenNavigationProp;
  route: OperationReportsScreenRouteProp;
}

const ANAESTHESIA_TYPES = [
  'General',
  'Spinal',
  'Local',
  'Sedation',
  'Regional Block',
  'Epidural',
  'Topical',
  'None',
];

// Helper to strip HTML tags and decode entities
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

export function OperationReportsScreen({ navigation, route }: Props) {
  const initialPatientId = route.params?.patientId;
  const { themeColors, isDark } = useTheme();

  // ── List & Search State ──
  const [reports, setReports] = useState<OperationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  // ── Reference Data ──
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [anaesthetists, setAnaesthetists] = useState<any[]>([]);
  const [assistants, setAssistants] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [userBranchId, setUserBranchId] = useState<string>('');

  // ── View Report Modal State ──
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState<OperationReport | null>(null);

  // ── Add / Edit Modal State ──
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Form Fields
  const [formPatientId, setFormPatientId] = useState('');
  const [formDoctorId, setFormDoctorId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formHospitalId, setFormHospitalId] = useState('');
  const [formAnaesthetistIds, setFormAnaesthetistIds] = useState<string[]>([]);
  const [formAssistantIds, setFormAssistantIds] = useState<string[]>([]);
  const [formAnaesthesiaType, setFormAnaesthesiaType] = useState('General');
  const [formProcedureId, setFormProcedureId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPostOpPlan, setFormPostOpPlan] = useState('');
  const [formFollowUpDate, setFormFollowUpDate] = useState('');
  const [formFollowUpTime, setFormFollowUpTime] = useState('');
  const [formRemarks, setFormRemarks] = useState('');
  const [sendSmsOnSave, setSendSmsOnSave] = useState(false);
  const [sendEmailOnSave, setSendEmailOnSave] = useState(false);

  // ── Add New Quick Modals ──
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientGender, setNewPatientGender] = useState('Male');
  const [newPatientDOB, setNewPatientDOB] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [creatingPatient, setCreatingPatient] = useState(false);

  const [showHospitalModal, setShowHospitalModal] = useState(false);
  const [newHospitalName, setNewHospitalName] = useState('');
  const [newHospitalAddress, setNewHospitalAddress] = useState('');
  const [creatingHospital, setCreatingHospital] = useState(false);

  const [showAnaesthetistModal, setShowAnaesthetistModal] = useState(false);
  const [newAnaesthetistName, setNewAnaesthetistName] = useState('');
  const [newAnaesthetistSpec, setNewAnaesthetistSpec] = useState('');
  const [creatingAnaesthetist, setCreatingAnaesthetist] = useState(false);

  const [showAssistantModal, setShowAssistantModal] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState('');
  const [newAssistantRole, setNewAssistantRole] = useState('');
  const [creatingAssistant, setCreatingAssistant] = useState(false);

  const [showProcedureModal, setShowProcedureModal] = useState(false);
  const [newProcedureName, setNewProcedureName] = useState('');
  const [newProcedureDesc, setNewProcedureDesc] = useState('');
  const [creatingProcedure, setCreatingProcedure] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (initialPatientId && patients.length > 0) {
      handleOpenAddModal(initialPatientId);
    }
  }, [initialPatientId, patients]);

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
        loadProcedures(),
        loadHospitals(),
        loadAnaesthetists(),
        loadAssistants(),
        loadReports(),
      ]);
    } catch (e) {
      console.error('Error loading initial data:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    try {
      // ONLY load active users with role = 'doctor' (Doctor Meki)
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
      console.error('Error loading surgeons/doctors:', e);
    }
  };

  const loadProcedures = async () => {
    try {
      const { data } = await supabase
        .from('surgical_procedures')
        .select('id, name, description')
        .order('name', { ascending: true });
      setProcedures(data || []);
    } catch (e) {
      console.error('Error loading surgical procedures:', e);
    }
  };

  const loadHospitals = async () => {
    try {
      const { data } = await supabase
        .from('hospitals')
        .select('id, name, address')
        .order('name', { ascending: true });
      setHospitals(data || []);
    } catch (e) {
      console.error('Error loading hospitals:', e);
    }
  };

  const loadAnaesthetists = async () => {
    try {
      const { data } = await supabase
        .from('anaesthetists')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      setAnaesthetists(data || []);
    } catch (e) {
      console.error('Error loading anaesthetists:', e);
    }
  };

  const loadAssistants = async () => {
    try {
      const { data } = await supabase
        .from('assistants')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      setAssistants(data || []);
    } catch (e) {
      console.error('Error loading assistants:', e);
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

  const loadReports = async () => {
    try {
      const { data, error } = await supabase
        .from('operation_reports')
        .select(`
          *,
          patient:patients(id, full_name, patient_number, gender, date_of_birth, phone, email, file_number),
          doctor:users!surgeon_id(id, full_name, specialization),
          procedure:surgical_procedures(id, name),
          hospital:hospitals(id, name)
        `)
        .order('operation_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const formatted: OperationReport[] = (data || []).map((r: any) => ({
        id: r.id,
        patient_id: r.patient_id,
        doctor_id: r.surgeon_id,
        surgeon_id: r.surgeon_id,
        hospital_id: r.hospital_id,
        procedure_id: r.procedure_id,
        operation_name: r.procedure?.name || r.procedure_text || r.operation_name || 'Surgical Procedure',
        procedure_text: r.procedure?.name || r.procedure_text || r.operation_name,
        operation_date: r.operation_date,
        anaesthesia_type: r.anaesthesia_type || 'General',
        anaesthetist_ids: r.anaesthetist_ids || [],
        assistant_ids: r.assistant_ids || [],
        procedure_description: r.procedure_description || '',
        description: r.procedure_description || '',
        post_op_plan: r.post_op_plan || '',
        follow_up_date: r.follow_up_date || '',
        follow_up_time: r.follow_up_time || '',
        findings: r.findings || '',
        remarks: r.findings || '',
        created_at: r.created_at,
        patient: r.patient,
        doctor: r.doctor,
        procedure: r.procedure,
        hospital: r.hospital,
      }));

      setReports(formatted);
    } catch (e: any) {
      console.error('Error loading reports:', e);
      Alert.alert('Error', e.message || 'Failed to load operation reports.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadReports(),
      loadPatients(true),
      loadDoctors(),
      loadProcedures(),
      loadHospitals(),
      loadAnaesthetists(),
      loadAssistants(),
    ]);
    setRefreshing(false);
  };

  // ── Open Add Modal ──
  const handleOpenAddModal = (preselectedPatientId?: string) => {
    setIsEditing(false);
    setEditingId(null);
    setFormPatientId(preselectedPatientId || '');
    const defaultDoctorId = doctors[0]?.id || '';
    setFormDoctorId(defaultDoctorId);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormHospitalId('');
    setFormAnaesthetistIds([]);
    setFormAssistantIds([]);
    setFormAnaesthesiaType('General');
    setFormProcedureId('');
    setFormDescription('');
    setFormPostOpPlan('');
    setFormFollowUpDate('');
    setFormFollowUpTime('');
    setFormRemarks('');
    setSendSmsOnSave(false);
    setSendEmailOnSave(false);
    setFormModalVisible(true);
  };

  // ── Open Edit Modal ──
  const handleOpenEditModal = (report: OperationReport) => {
    setIsEditing(true);
    setEditingId(report.id);
    setFormPatientId(report.patient_id || '');
    setFormDoctorId(report.surgeon_id || report.doctor_id || doctors[0]?.id || '');
    setFormDate(report.operation_date || new Date().toISOString().split('T')[0]);
    setFormHospitalId(report.hospital_id || '');
    setFormAnaesthetistIds(report.anaesthetist_ids || []);
    setFormAssistantIds(report.assistant_ids || []);
    setFormAnaesthesiaType(report.anaesthesia_type || 'General');
    setFormProcedureId(report.procedure_id || '');
    setFormDescription(cleanHtmlText(report.procedure_description || report.description));
    setFormPostOpPlan(cleanHtmlText(report.post_op_plan));
    setFormFollowUpDate(report.follow_up_date || '');
    setFormFollowUpTime(report.follow_up_time || '');
    setFormRemarks(cleanHtmlText(report.findings || report.remarks));
    setSendSmsOnSave(false);
    setSendEmailOnSave(false);
    setFormModalVisible(true);
  };

  // ── Quick Creation Handlers ──
  const handleCreateHospital = async () => {
    if (!newHospitalName.trim()) {
      Alert.alert('Required', 'Please enter hospital name.');
      return;
    }
    setCreatingHospital(true);
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .insert([{ name: newHospitalName.trim(), address: newHospitalAddress.trim() || null, branch_id: userBranchId || null }])
        .select()
        .single();
      if (error) throw error;
      setHospitals((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setFormHospitalId(data.id);
      setShowHospitalModal(false);
      setNewHospitalName('');
      setNewHospitalAddress('');
      Alert.alert('Hospital Added', `${data.name} created and selected.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add hospital.');
    } finally {
      setCreatingHospital(false);
    }
  };

  const handleCreateAnaesthetist = async () => {
    if (!newAnaesthetistName.trim()) {
      Alert.alert('Required', 'Please enter anaesthetist name.');
      return;
    }
    setCreatingAnaesthetist(true);
    try {
      const { data, error } = await supabase
        .from('anaesthetists')
        .insert([{ full_name: newAnaesthetistName.trim(), specialization: newAnaesthetistSpec.trim() || null, branch_id: userBranchId || null }])
        .select()
        .single();
      if (error) throw error;
      setAnaesthetists((prev) => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setFormAnaesthetistIds((prev) => [...prev, data.id]);
      setShowAnaesthetistModal(false);
      setNewAnaesthetistName('');
      setNewAnaesthetistSpec('');
      Alert.alert('Anaesthetist Added', `${data.full_name} added to selected list.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add anaesthetist.');
    } finally {
      setCreatingAnaesthetist(false);
    }
  };

  const handleCreateAssistant = async () => {
    if (!newAssistantName.trim()) {
      Alert.alert('Required', 'Please enter assistant name.');
      return;
    }
    setCreatingAssistant(true);
    try {
      const { data, error } = await supabase
        .from('assistants')
        .insert([{ full_name: newAssistantName.trim(), role: newAssistantRole.trim() || null, branch_id: userBranchId || null }])
        .select()
        .single();
      if (error) throw error;
      setAssistants((prev) => [...prev, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setFormAssistantIds((prev) => [...prev, data.id]);
      setShowAssistantModal(false);
      setNewAssistantName('');
      setNewAssistantRole('');
      Alert.alert('Assistant Added', `${data.full_name} added to selected list.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add assistant.');
    } finally {
      setCreatingAssistant(false);
    }
  };

  const handleCreateProcedure = async () => {
    if (!newProcedureName.trim()) {
      Alert.alert('Required', 'Please enter procedure name.');
      return;
    }
    setCreatingProcedure(true);
    try {
      const { data, error } = await supabase
        .from('surgical_procedures')
        .insert([{ name: newProcedureName.trim(), description: newProcedureDesc.trim() || null, branch_id: userBranchId || null }])
        .select()
        .single();
      if (error) throw error;
      setProcedures((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setFormProcedureId(data.id);
      setShowProcedureModal(false);
      setNewProcedureName('');
      setNewProcedureDesc('');
      Alert.alert('Procedure Added', `${data.name} created and selected.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add procedure.');
    } finally {
      setCreatingProcedure(false);
    }
  };

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

  // ── Save Report (Insert or Update) ──
  const handleSaveReport = async () => {
    if (!formPatientId) {
      Alert.alert('Required Field', 'Please select a patient.');
      return;
    }

    const matchedProc = procedures.find((p) => p.id === formProcedureId);
    const procName = matchedProc?.name || 'Surgical Operation';

    setSaving(true);
    try {
      const dbPayload: any = {
        branch_id: userBranchId || null,
        patient_id: formPatientId,
        surgeon_id: formDoctorId || doctors[0]?.id || null,
        operation_date: formDate,
        hospital_id: formHospitalId || null,
        anaesthetist_ids: formAnaesthetistIds || [],
        assistant_ids: formAssistantIds || [],
        anaesthesia_type: formAnaesthesiaType,
        procedure_id: formProcedureId || null,
        procedure_description: formDescription.trim() || null,
        post_op_plan: formPostOpPlan.trim() || null,
        follow_up_date: formFollowUpDate.trim() || null,
        follow_up_time: formFollowUpTime.trim() || null,
        findings: formRemarks.trim() || null,
        operation_name: procName,
        procedure_text: procName,
      };

      if (isEditing && editingId) {
        const { error } = await supabase
          .from('operation_reports')
          .update(dbPayload)
          .eq('id', editingId);
        if (error) throw error;

        Alert.alert('Updated', 'Operation report updated successfully.');
      } else {
        dbPayload.created_at = new Date().toISOString();
        const { error } = await supabase.from('operation_reports').insert([dbPayload]);
        if (error) throw error;

        Alert.alert('Saved', 'Operation report recorded successfully.');
      }

      setFormModalVisible(false);
      await loadReports();
    } catch (e: any) {
      console.error('Error saving operation report:', e);
      Alert.alert('Save Failed', e.message || 'Unable to save operation report.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Report ──
  const handleDeleteReport = (report: OperationReport) => {
    Alert.alert(
      'Delete Report',
      `Are you sure you want to delete this operation report for ${report.patient?.full_name || 'this patient'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('operation_reports')
                .delete()
                .eq('id', report.id);
              if (error) throw error;
              setViewModalVisible(false);
              setSelectedReport(null);
              await loadReports();
              Alert.alert('Deleted', 'Operation report deleted.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete report.');
            }
          },
        },
      ]
    );
  };

  // ── View Details Modal ──
  const handleOpenViewModal = (report: OperationReport) => {
    setSelectedReport(report);
    setViewModalVisible(true);
  };

  // ── Download PDF ──
  const handleDownloadPDF = async (report: OperationReport) => {
    setDownloadingPdf(true);
    try {
      await downloadOperationReportPDF(report);
    } catch (e: any) {
      Alert.alert('PDF Error', e.message || 'Failed to generate PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ── Filtered & Paginated List ──
  const filteredReports = reports.filter((r) => {
    const q = search.toLowerCase();
    const patName = r.patient?.full_name?.toLowerCase() || '';
    const patNum = r.patient?.patient_number?.toLowerCase() || '';
    const fileNum = (r.patient as any)?.file_number?.toLowerCase() || '';
    const docName = r.doctor?.full_name?.toLowerCase() || '';
    const procName = r.operation_name?.toLowerCase() || '';
    return (
      patName.includes(q) ||
      patNum.includes(q) ||
      fileNum.includes(q) ||
      docName.includes(q) ||
      procName.includes(q)
    );
  });

  const totalPages = Math.ceil(filteredReports.length / ITEMS_PER_PAGE) || 1;
  const paginatedReports = filteredReports.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  // Dropdown Items mappings
  const patientDropdownItems: DropdownItem[] = patients.map((p) => ({
    id: p.id,
    label: p.full_name,
    subLabel: `ID: ${p.patient_number || 'N/A'}${p.file_number ? ` · File: ${p.file_number}` : ''}${p.phone ? ` · 📞 ${p.phone}` : ''}`,
  }));

  const doctorDropdownItems: DropdownItem[] = doctors.map((d) => ({
    id: d.id,
    label: d.full_name,
    subLabel: d.specialization || 'Specialist Urologist',
  }));

  const hospitalDropdownItems: DropdownItem[] = hospitals.map((h) => ({
    id: h.id,
    label: h.name,
    subLabel: (h as any).address || undefined,
  }));

  const anaesthetistDropdownItems: DropdownItem[] = anaesthetists.map((a) => ({
    id: a.id,
    label: a.full_name,
  }));

  const assistantDropdownItems: DropdownItem[] = assistants.map((ast) => ({
    id: ast.id,
    label: ast.full_name,
  }));

  const procedureDropdownItems: DropdownItem[] = procedures.map((p) => ({
    id: p.id,
    label: p.name,
    subLabel: p.description || undefined,
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

      {/* ── Top Header ── */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Operation Reports</Text>
          <Text style={[styles.headerSub, { color: themeColors.subText }]}>
            {reports.length} total surgical records
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#4F46E5' }]}
          onPress={() => handleOpenAddModal()}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>+ New Report</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ── */}
      <View style={[styles.searchContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search by patient, doctor, procedure, file #..."
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

      {/* ── Main List ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={[styles.loadingText, { color: themeColors.subText }]}>
            Loading operation reports...
          </Text>
        </View>
      ) : (
        <FlatList
          data={paginatedReports}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4F46E5"
              colors={['#4F46E5']}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                {search ? 'No Matching Reports' : 'No Operation Reports Yet'}
              </Text>
              <Text style={[styles.emptySub, { color: themeColors.subText }]}>
                {search
                  ? 'Try searching with different keywords.'
                  : 'Tap "+ New Report" above to create your first operation record.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const opDate = item.operation_date
              ? new Date(item.operation_date).toLocaleDateString(undefined, {
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
                    <Text style={styles.cardDateText}>{opDate}</Text>
                  </View>
                </View>

                {/* Procedure Name */}
                <View style={styles.procedureBadgeBox}>
                  <Text style={styles.procedureText} numberOfLines={1}>
                    {item.operation_name || item.procedure?.name || 'Surgical Procedure'}
                  </Text>
                </View>

                {/* Description snippet */}
                {item.procedure_description || item.description ? (
                  <Text style={[styles.cardDesc, { color: themeColors.subText }]} numberOfLines={2}>
                    {cleanHtmlText(item.procedure_description || item.description)}
                  </Text>
                ) : null}

                {/* Footer */}
                <View style={[styles.cardFooter, { borderTopColor: isDark ? '#334155' : '#F1F5F9' }]}>
                  <Text style={[styles.cardDoctor, { color: themeColors.subText }]}>
                    👨‍⚕️ {item.doctor?.full_name || 'Doctor Meki'}
                  </Text>
                  {item.hospital?.name && (
                    <Text style={[styles.cardHospital, { color: themeColors.subText }]} numberOfLines={1}>
                      🏥 {item.hospital.name}
                    </Text>
                  )}
                  <View style={styles.anaesthesiaBadge}>
                    <Text style={styles.anaesthesiaText}>{item.anaesthesia_type || 'General'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          ADD / EDIT OPERATION REPORT MODAL (Exact Web App Form)
         ───────────────────────────────────────────────────────────── */}
      <Modal
        visible={formModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setFormModalVisible(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.bg }]}>
          <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={() => setFormModalVisible(false)}
            >
              <Text style={{ fontSize: 18, color: themeColors.text }}>✕</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.modalHeaderTitle, { color: themeColors.text }]}>
                📋 {isEditing ? 'Edit' : 'Add'} Operation Report
              </Text>
              <Text style={[styles.headerSub, { color: themeColors.subText }]}>
                Complete surgical documentation
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveHeaderBtn, { backgroundColor: '#4F46E5' }]}
              onPress={handleSaveReport}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveHeaderBtnText}>Save</Text>
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

              {/* 2. DOCTOR * */}
              <SearchDropdown
                label="Doctor"
                placeholder="Select Doctor..."
                items={doctorDropdownItems}
                selectedId={formDoctorId}
                onSelect={(id) => setFormDoctorId(id)}
                required={true}
                tagColor="blue"
              />

              {/* 3. DATE OF OPERATION * */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>
                  DATE OF OPERATION <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      color: themeColors.text,
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    },
                  ]}
                  value={formDate}
                  onChangeText={setFormDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={themeColors.subText}
                />
              </View>

              {/* 4. HOSPITAL & ANAESTHETIST */}
              <SearchDropdown
                label="Hospital"
                placeholder="Select Hospital..."
                items={hospitalDropdownItems}
                selectedId={formHospitalId}
                onSelect={(id) => setFormHospitalId(id)}
                onAddNew={() => setShowHospitalModal(true)}
                addNewLabel="Add New Hospital"
                tagColor="purple"
              />

              <SearchDropdown
                label="Anaesthetist"
                placeholder="Search Anaesthetists..."
                items={anaesthetistDropdownItems}
                multiSelect={true}
                selectedIds={formAnaesthetistIds}
                onSelectMultiple={(ids) => setFormAnaesthetistIds(ids)}
                onAddNew={() => setShowAnaesthetistModal(true)}
                addNewLabel="Add New Anaesthetist"
                tagColor="blue"
              />

              {/* 5. ASSISTANT & TYPE OF ANAESTHESIA */}
              <SearchDropdown
                label="Assistant"
                placeholder="Search Assistants..."
                items={assistantDropdownItems}
                multiSelect={true}
                selectedIds={formAssistantIds}
                onSelectMultiple={(ids) => setFormAssistantIds(ids)}
                onAddNew={() => setShowAssistantModal(true)}
                addNewLabel="Add New Assistant"
                tagColor="emerald"
              />

              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>
                  TYPE OF ANAESTHESIA
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                  {ANAESTHESIA_TYPES.map((type) => {
                    const isSelected = formAnaesthesiaType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.pill,
                          isSelected
                            ? { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }
                            : { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: isDark ? '#334155' : '#CBD5E1' },
                        ]}
                        onPress={() => setFormAnaesthesiaType(type)}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            { color: isSelected ? '#FFFFFF' : themeColors.text },
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* 6. OPERATION PROCEDURE (S) */}
              <SearchDropdown
                label="Operation Procedure (s)"
                placeholder="Search Surgical Procedure..."
                items={procedureDropdownItems}
                selectedId={formProcedureId}
                onSelect={(id) => setFormProcedureId(id)}
                onAddNew={() => setShowProcedureModal(true)}
                addNewLabel="Add New Procedure"
                tagColor="emerald"
              />

              {/* 7. DESCRIPTION */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>DESCRIPTION</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      color: themeColors.text,
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    },
                  ]}
                  placeholder="Enter detailed operative procedure notes..."
                  placeholderTextColor={themeColors.subText}
                  multiline={true}
                  numberOfLines={4}
                  textAlignVertical="top"
                  value={formDescription}
                  onChangeText={setFormDescription}
                />
              </View>

              {/* 8. POST OP PLAN */}
              <View style={styles.formGroup}>
                <Text style={[styles.inputLabel, { color: themeColors.text }]}>POST OP PLAN</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      color: themeColors.text,
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    },
                  ]}
                  placeholder="Post-operative instructions, fluids, analgesia..."
                  placeholderTextColor={themeColors.subText}
                  multiline={true}
                  numberOfLines={3}
                  textAlignVertical="top"
                  value={formPostOpPlan}
                  onChangeText={setFormPostOpPlan}
                />
              </View>

              {/* 9. FOLLOW UP DATE & TIME */}
              <View style={styles.followUpRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: themeColors.text }]}>FOLLOW UP DATE</Text>
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
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: themeColors.text }]}>FOLLOW UP TIME</Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                        color: themeColors.text,
                        borderColor: isDark ? '#334155' : '#CBD5E1',
                      },
                    ]}
                    placeholder="HH:MM (e.g. 10:00 AM)"
                    placeholderTextColor={themeColors.subText}
                    value={formFollowUpTime}
                    onChangeText={setFormFollowUpTime}
                  />
                </View>
              </View>

              {/* 10. REMARKS */}
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
                  placeholder="Additional observations, specimen sent to lab, etc..."
                  placeholderTextColor={themeColors.subText}
                  multiline={true}
                  numberOfLines={3}
                  textAlignVertical="top"
                  value={formRemarks}
                  onChangeText={setFormRemarks}
                />
              </View>

              {/* FOOTER BUTTONS */}
              <View style={styles.formFooter}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: themeColors.border }]}
                  onPress={() => setFormModalVisible(false)}
                >
                  <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: '#4F46E5' }]}
                  onPress={handleSaveReport}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Save Report</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          QUICK CREATION MODALS
         ───────────────────────────────────────────────────────────── */}

      {/* 1. Quick Add Hospital Modal */}
      <Modal visible={showHospitalModal} transparent animationType="fade" onRequestClose={() => setShowHospitalModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>🏥 Add New Hospital</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Hospital Name *"
              placeholderTextColor={themeColors.subText}
              value={newHospitalName}
              onChangeText={setNewHospitalName}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Address / Location (optional)"
              placeholderTextColor={themeColors.subText}
              value={newHospitalAddress}
              onChangeText={setNewHospitalAddress}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowHospitalModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#4F46E5' }]} onPress={handleCreateHospital} disabled={creatingHospital}>
                {creatingHospital ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Hospital</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Quick Add Anaesthetist Modal */}
      <Modal visible={showAnaesthetistModal} transparent animationType="fade" onRequestClose={() => setShowAnaesthetistModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>👨‍⚕️ Add New Anaesthetist</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Full Name *"
              placeholderTextColor={themeColors.subText}
              value={newAnaesthetistName}
              onChangeText={setNewAnaesthetistName}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Specialization (e.g. Consultant Anaesthesiologist)"
              placeholderTextColor={themeColors.subText}
              value={newAnaesthetistSpec}
              onChangeText={setNewAnaesthetistSpec}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowAnaesthetistModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#4F46E5' }]} onPress={handleCreateAnaesthetist} disabled={creatingAnaesthetist}>
                {creatingAnaesthetist ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Anaesthetist</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. Quick Add Assistant Modal */}
      <Modal visible={showAssistantModal} transparent animationType="fade" onRequestClose={() => setShowAssistantModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>🤝 Add New Assistant</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Full Name *"
              placeholderTextColor={themeColors.subText}
              value={newAssistantName}
              onChangeText={setNewAssistantName}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Role (e.g. Scrub Nurse / Surgical Assistant)"
              placeholderTextColor={themeColors.subText}
              value={newAssistantRole}
              onChangeText={setNewAssistantRole}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowAssistantModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#4F46E5' }]} onPress={handleCreateAssistant} disabled={creatingAssistant}>
                {creatingAssistant ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Assistant</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 4. Quick Add Procedure Modal */}
      <Modal visible={showProcedureModal} transparent animationType="fade" onRequestClose={() => setShowProcedureModal(false)}>
        <View style={styles.miniModalOverlay}>
          <View style={[styles.miniModalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.miniModalTitle, { color: themeColors.text }]}>📋 Add Surgical Procedure</Text>
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Procedure Name *"
              placeholderTextColor={themeColors.subText}
              value={newProcedureName}
              onChangeText={setNewProcedureName}
            />
            <TextInput
              style={[styles.miniInput, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', color: themeColors.text, borderColor: themeColors.border }]}
              placeholder="Description (optional)"
              placeholderTextColor={themeColors.subText}
              value={newProcedureDesc}
              onChangeText={setNewProcedureDesc}
            />
            <View style={styles.miniModalBtns}>
              <TouchableOpacity style={[styles.miniBtnCancel, { borderColor: themeColors.border }]} onPress={() => setShowProcedureModal(false)}>
                <Text style={{ color: themeColors.text, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#4F46E5' }]} onPress={handleCreateProcedure} disabled={creatingProcedure}>
                {creatingProcedure ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Add Procedure</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 5. Quick Add Patient Modal */}
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
                      ? { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }
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
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#4F46E5' }]} onPress={handleCreatePatient} disabled={creatingPatient}>
                {creatingPatient ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.miniBtnSaveText}>Register Patient</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          VIEW REPORT DETAILS MODAL
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
                {selectedReport?.operation_name || 'Operation Report'}
              </Text>
              <Text style={[styles.headerSub, { color: themeColors.subText }]}>
                {selectedReport?.patient?.full_name} · {selectedReport?.operation_date}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.editHeaderBtn, { backgroundColor: '#4F46E5' }]}
              onPress={() => {
                setViewModalVisible(false);
                if (selectedReport) handleOpenEditModal(selectedReport);
              }}
            >
              <Text style={styles.editHeaderBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {selectedReport && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
              {/* Quick Actions Card */}
              <View style={[styles.sheetActionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={[styles.sheetActionBtn, { backgroundColor: '#4F46E5' }]}
                  onPress={() => handleDownloadPDF(selectedReport)}
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
                    const msg = `SpiritMed Operation Report\nPatient: ${selectedReport.patient?.full_name}\nProcedure: ${selectedReport.operation_name}\nSurgeon: ${selectedReport.doctor?.full_name || 'Doctor Meki'}\nDate: ${selectedReport.operation_date}`;
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
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedReport.patient?.full_name}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Patient ID:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedReport.patient?.patient_number || 'N/A'}</Text>
                </View>
                {(selectedReport.patient as any)?.file_number && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: themeColors.subText }]}>File Number:</Text>
                    <Text style={[styles.infoVal, { color: themeColors.text }]}>{(selectedReport.patient as any).file_number}</Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Gender:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedReport.patient?.gender || 'N/A'}</Text>
                </View>
              </View>

              {/* Surgical Specs */}
              <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Surgical Specs</Text>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Surgeon:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedReport.doctor?.full_name || 'Doctor Meki'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Hospital:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedReport.hospital?.name || 'N/A'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Anaesthesia:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedReport.anaesthesia_type || 'General'}</Text>
                </View>
              </View>

              {/* Procedure Details */}
              <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Procedure & Description</Text>
                <Text style={[styles.procedureHeading, { color: themeColors.text }]}>
                  {selectedReport.operation_name || 'Surgical Procedure'}
                </Text>
                <Text style={[styles.sectionBody, { color: themeColors.text, marginTop: 6 }]}>
                  {cleanHtmlText(selectedReport.procedure_description || selectedReport.description) || 'No description recorded.'}
                </Text>
              </View>

              {/* Post-Op Plan */}
              <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Post Operation Plan</Text>
                <Text style={[styles.sectionBody, { color: themeColors.text }]}>
                  {cleanHtmlText(selectedReport.post_op_plan) || 'Routine post-operative care.'}
                </Text>
              </View>

              {/* Remarks / Findings */}
              {(selectedReport.findings || selectedReport.remarks) ? (
                <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Findings & Remarks</Text>
                  <Text style={[styles.sectionBody, { color: themeColors.text }]}>
                    {cleanHtmlText(selectedReport.findings || selectedReport.remarks)}
                  </Text>
                </View>
              ) : null}

              {/* Delete Action */}
              <TouchableOpacity
                style={styles.sheetDeleteBtn}
                onPress={() => handleDeleteReport(selectedReport)}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetDeleteBtnText}>🗑️ Delete Operation Report</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
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
    shadowColor: '#4F46E5',
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
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardDateText: {
    color: '#4F46E5',
    fontSize: 11,
    fontWeight: '700',
  },
  procedureBadgeBox: {
    marginTop: 6,
  },
  procedureText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  cardDesc: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
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
  },
  cardHospital: {
    fontSize: 11,
    flex: 1,
  },
  anaesthesiaBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  anaesthesiaText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7E22CE',
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
  formGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
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
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    marginRight: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  followUpRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
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
    shadowColor: '#4F46E5',
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
  procedureHeading: {
    fontSize: 14,
    fontWeight: '800',
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
