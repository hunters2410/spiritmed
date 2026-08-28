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
import { RootStackParamList, Prescription, Patient, Doctor, Medicine } from '../types';
import { downloadPrescriptionPDF } from '../utils/pdfGenerator';
import { fetchAllPatients } from '../utils/patientLoader';
import { SearchDropdown, DropdownItem } from '../components/SearchDropdown';

type PrescriptionsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Prescriptions'>;
type PrescriptionsScreenRouteProp = RouteProp<RootStackParamList, 'Prescriptions'>;

interface Props {
  navigation: PrescriptionsScreenNavigationProp;
  route: PrescriptionsScreenRouteProp;
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

const TIME_UNITS = ['Days', 'Weeks', 'Months', 'Years'];

interface FormMedicineItem {
  id?: string;
  medicine_id: string;
  period: string;
  time_unit: string;
  advice: string;
}

const createEmptyItem = (): FormMedicineItem => ({
  medicine_id: '',
  period: '7',
  time_unit: 'Days',
  advice: '',
});

export function PrescriptionsScreen({ navigation, route }: Props) {
  const initialPatientId = route.params?.patientId;
  const { themeColors, isDark } = useTheme();

  // ── List & Search State ──
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  // ── Reference Data ──
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [userBranchId, setUserBranchId] = useState<string>('');

  // ── View Details Modal State ──
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);

  // ── Add / Edit Modal State ──
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Form Fields (matching Web App exactly)
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPatientId, setFormPatientId] = useState('');
  const [formDoctorId, setFormDoctorId] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [items, setItems] = useState<FormMedicineItem[]>([createEmptyItem()]);

  // Quick Add Patient Modal
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientGender, setNewPatientGender] = useState('Male');
  const [newPatientDOB, setNewPatientDOB] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [creatingPatient, setCreatingPatient] = useState(false);

  // Quick Add Medicine Modal
  const [showMedicineModal, setShowMedicineModal] = useState(false);
  const [newMedForIdx, setNewMedForIdx] = useState<number | null>(null);
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');
  const [newMedRoute, setNewMedRoute] = useState('po');
  const [newMedFrequency, setNewMedFrequency] = useState('OD');
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
      if (newMedForIdx !== null) {
        handleUpdateItem(newMedForIdx, 'medicine_id', data.id);
      }
      setShowMedicineModal(false);
      setNewMedName('');
      setNewMedDosage('');
      setNewMedRoute('po');
      setNewMedFrequency('OD');
      setNewMedForIdx(null);
      Alert.alert('Medicine Added', `${data.name} added to medicine list.`);
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
        loadMedicines(),
        loadPrescriptions(),
      ]);
    } catch (e) {
      console.error('Error loading initial prescription data:', e);
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

  const loadMedicines = async () => {
    try {
      const { data } = await supabase
        .from('medicines')
        .select('id, name, dosage, route, frequency:medicine_frequencies(name)')
        .order('name', { ascending: true });
      setMedicines(data || []);
    } catch (e) {
      console.error('Error loading medicines:', e);
    }
  };

  const loadPrescriptions = async () => {
    try {
      const { data, error } = await supabase
        .from('prescriptions')
        .select(`
          *,
          patient:patients(id, full_name, patient_number, gender, date_of_birth, phone, email, file_number),
          doctor:users!doctor_id(id, full_name, specialization, qualifications, signature_url),
          prescription_items(
            id, medicine_id, period, time_unit, advice,
            medicine:medicines(id, name, dosage, route, frequency:medicine_frequencies(name))
          )
        `)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw error;
      setPrescriptions(data || []);
    } catch (e: any) {
      console.error('Error loading prescriptions:', e);
      Alert.alert('Error', e.message || 'Failed to load prescriptions.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadPrescriptions(),
      loadPatients(true),
      loadDoctors(),
      loadMedicines(),
    ]);
    setRefreshing(false);
  };

  // ── Open Add Modal ──
  const handleOpenAddModal = (preselectedPatientId?: string) => {
    setIsEditing(false);
    setEditingId(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormPatientId(preselectedPatientId || '');
    const userIsDoctor = doctors.find((d) => d.id === currentUserId);
    const defaultDoctorId = userIsDoctor ? currentUserId : (doctors[0]?.id || '');
    setFormDoctorId(defaultDoctorId);
    setFormNotes('');
    setFormStatus('active');
    setItems([createEmptyItem()]);
    setFormModalVisible(true);
  };

  // ── Open Edit Modal ──
  const handleOpenEditModal = (rx: Prescription) => {
    setIsEditing(true);
    setEditingId(rx.id);
    setFormDate(rx.prescription_date || new Date().toISOString().split('T')[0]);
    setFormPatientId(rx.patient_id || '');
    setFormDoctorId(rx.doctor_id || currentUserId || (doctors[0]?.id || ''));
    setFormNotes(cleanHtmlText(rx.notes));
    setFormStatus(rx.status || 'active');

    const existingItems: FormMedicineItem[] = (rx.prescription_items || []).map((item) => ({
      id: item.id,
      medicine_id: item.medicine_id || (item.medicine as any)?.id || '',
      period: item.period || '7',
      time_unit: item.time_unit || 'Days',
      advice: cleanHtmlText(item.advice),
    }));

    setItems(existingItems.length > 0 ? existingItems : [createEmptyItem()]);
    setFormModalVisible(true);
  };

  // ── Add / Remove Medicine Item Section ──
  const handleAddMedicineSection = () => {
    setItems((prev) => [...prev, createEmptyItem()]);
  };

  const handleRemoveMedicineSection = (index: number) => {
    if (items.length <= 1) {
      Alert.alert('Notice', 'A prescription must have at least one medication section.');
      return;
    }
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateItem = (index: number, field: keyof FormMedicineItem, value: string) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  // ── Save Prescription (Insert or Update) ──
  const handleSavePrescription = async () => {
    if (!formPatientId) {
      Alert.alert('Required Field', 'Please select a patient.');
      return;
    }
    if (items.some((i) => !i.medicine_id)) {
      Alert.alert('Missing Medication', 'Please select a medicine for each section.');
      return;
    }

    setSaving(true);
    try {
      let rxId = editingId;

      const headerPayload: any = {
        prescription_date: formDate,
        patient_id: formPatientId,
        doctor_id: formDoctorId || currentUserId || null,
        notes: formNotes.trim() || null,
        status: formStatus || 'active',
        branch_id: userBranchId || null,
      };

      if (isEditing && editingId) {
        const { error: updateErr } = await supabase
          .from('prescriptions')
          .update(headerPayload)
          .eq('id', editingId);
        if (updateErr) throw updateErr;

        // Delete existing items and re-insert
        await supabase.from('prescription_items').delete().eq('prescription_id', editingId);
      } else {
        headerPayload.created_at = new Date().toISOString();
        const { data: newRx, error: insertErr } = await supabase
          .from('prescriptions')
          .insert([headerPayload])
          .select()
          .single();
        if (insertErr) throw insertErr;
        rxId = newRx.id;
      }

      if (rxId) {
        const itemsPayload = items.map((i) => ({
          prescription_id: rxId,
          medicine_id: i.medicine_id,
          period: i.period.trim() || '7',
          time_unit: i.time_unit || 'Days',
          advice: i.advice.trim() || '',
        }));

        const { error: itemsErr } = await supabase
          .from('prescription_items')
          .insert(itemsPayload);
        if (itemsErr) throw itemsErr;
      }

      Alert.alert('Success', `Prescription ${isEditing ? 'updated' : 'saved'} successfully!`);
      setFormModalVisible(false);
      await loadPrescriptions();
    } catch (e: any) {
      console.error('Error saving prescription:', e);
      Alert.alert('Save Failed', e.message || 'Unable to save prescription.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete Prescription ──
  const handleDeletePrescription = (rx: Prescription) => {
    Alert.alert(
      'Delete Prescription',
      `Are you sure you want to delete this prescription for ${rx.patient?.full_name || 'this patient'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('prescriptions')
                .delete()
                .eq('id', rx.id);
              if (error) throw error;
              setViewModalVisible(false);
              setSelectedPrescription(null);
              await loadPrescriptions();
              Alert.alert('Deleted', 'Prescription deleted.');
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete prescription.');
            }
          },
        },
      ]
    );
  };

  // ── View Details Modal ──
  const handleOpenViewModal = (rx: Prescription) => {
    setSelectedPrescription(rx);
    setViewModalVisible(true);
  };

  // ── Download PDF ──
  const handleDownloadPDF = async (rx: Prescription) => {
    setDownloadingPdf(true);
    try {
      await downloadPrescriptionPDF(rx);
    } catch (e: any) {
      Alert.alert('PDF Error', e.message || 'Failed to generate PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // ── Filtered & Paginated List ──
  const filteredPrescriptions = prescriptions.filter((rx) => {
    const q = search.toLowerCase();
    const patName = rx.patient?.full_name?.toLowerCase() || '';
    const patNum = rx.patient?.patient_number?.toLowerCase() || '';
    const fileNum = (rx.patient as any)?.file_number?.toLowerCase() || '';
    const docName = rx.doctor?.full_name?.toLowerCase() || '';
    const dateStr = rx.prescription_date?.toLowerCase() || '';
    const hasMed = (rx.prescription_items || []).some((item) =>
      item.medicine?.name?.toLowerCase().includes(q)
    );

    return (
      patName.includes(q) ||
      patNum.includes(q) ||
      fileNum.includes(q) ||
      docName.includes(q) ||
      dateStr.includes(q) ||
      hasMed
    );
  });

  const totalPages = Math.ceil(filteredPrescriptions.length / ITEMS_PER_PAGE) || 1;
  const paginatedPrescriptions = filteredPrescriptions.slice(
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

  const medicineDropdownItems: DropdownItem[] = medicines.map((m) => {
    const freq = typeof m.frequency === 'object' ? m.frequency?.name : m.frequency || '-';
    return {
      id: m.id,
      label: `Name : ${m.name || '-'} | Dosage : ${m.dosage || '-'} | Route : ${m.route || '-'} | Frequency : ${freq}`,
      subLabel: m.name,
    };
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

      {/* ── Top Header ── */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Prescriptions</Text>
          <Text style={[styles.headerSub, { color: themeColors.subText }]}>
            {prescriptions.length} patient prescriptions issued
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: '#2563EB' }]}
          onPress={() => handleOpenAddModal()}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>+ Add Prescription</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search Bar ── */}
      <View style={[styles.searchContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search by patient, doctor, medicine, date..."
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
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={[styles.loadingText, { color: themeColors.subText }]}>
            Loading prescriptions...
          </Text>
        </View>
      ) : (
        <FlatList
          data={paginatedPrescriptions}
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
              <Text style={styles.emptyIcon}>💊</Text>
              <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                {search ? 'No Matching Prescriptions' : 'No Prescriptions Issued Yet'}
              </Text>
              <Text style={[styles.emptySub, { color: themeColors.subText }]}>
                {search
                  ? 'Try searching with different keywords.'
                  : 'Tap "+ Add Prescription" above to issue your first prescription.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const rxDate = item.prescription_date
              ? new Date(item.prescription_date).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })
              : 'Unknown Date';

            const medCount = item.prescription_items?.length || 0;

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
                    <Text style={styles.cardDateText}>{rxDate}</Text>
                  </View>
                </View>

                {/* Medications preview */}
                <View style={styles.medsPreviewBox}>
                  {(item.prescription_items || []).slice(0, 3).map((pi, idx) => (
                    <Text key={idx} style={[styles.medPreviewText, { color: themeColors.text }]} numberOfLines={1}>
                      • <Text style={{ fontWeight: '700', color: '#059669' }}>{pi.medicine?.name || 'Medication'}</Text>
                      {pi.medicine?.dosage ? ` (${pi.medicine.dosage})` : ''} · {pi.period} {pi.time_unit}
                    </Text>
                  ))}
                  {medCount > 3 && (
                    <Text style={[styles.moreMedsText, { color: themeColors.subText }]}>
                      +{medCount - 3} more medications...
                    </Text>
                  )}
                </View>

                {/* Footer */}
                <View style={[styles.cardFooter, { borderTopColor: isDark ? '#334155' : '#F1F5F9' }]}>
                  <Text style={[styles.cardDoctor, { color: themeColors.subText }]}>
                    👨‍⚕️ Dr. {item.doctor?.full_name || 'Medical Staff'}
                  </Text>
                  <View style={styles.medsBadge}>
                    <Text style={styles.medsBadgeText}>💊 {medCount} {medCount === 1 ? 'med' : 'meds'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? '#DCFCE7' : '#FEF3C7' }]}>
                    <Text style={[styles.statusText, { color: item.status === 'active' ? '#166534' : '#92400E' }]}>
                      {item.status || 'ACTIVE'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          ADD / EDIT PRESCRIPTION MODAL (Exact Web App Form)
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
                📋 {isEditing ? 'Edit' : 'Add'} Prescription
              </Text>
              <Text style={[styles.headerSub, { color: themeColors.subText }]}>
                Issue and manage patient medications
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveHeaderBtn, { backgroundColor: '#2563EB' }]}
              onPress={handleSavePrescription}
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
              contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Row 1: DATE */}
              <View style={styles.formGroupCompact}>
                <Text style={[styles.inputLabelCompact, { color: themeColors.text }]}>
                  DATE <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <TextInput
                  style={[
                    styles.textInputCompact,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      color: themeColors.text,
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                  ]}
                  value={formDate}
                  onChangeText={setFormDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={themeColors.subText}
                />
              </View>

              {/* Row 2: PATIENT */}
              <View style={{ marginBottom: 6 }}>
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
              </View>

              {/* Row 3: DOCTOR */}
              <View style={{ marginBottom: 10 }}>
                <SearchDropdown
                  label="Doctor"
                  placeholder="Search Doctor Name..."
                  items={doctorDropdownItems}
                  selectedId={formDoctorId}
                  onSelect={(id) => setFormDoctorId(id)}
                  required={true}
                  tagColor="blue"
                />
              </View>

              {/* ── Medicine Sections ── */}
              <View style={styles.medsSectionHeader}>
                <Text style={[styles.sectionMainTitle, { color: themeColors.text }]}>
                  PRESCRIBED MEDICINES ({items.length})
                </Text>
              </View>

              {items.map((item, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.medicineSectionBox,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                  ]}
                >
                  {/* Section Top Mini Header */}
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.medIndexBadge}>
                      <Text style={styles.medIndexText}>#{idx + 1}</Text>
                    </View>
                    <Text style={[styles.sectionHeaderTitle, { color: themeColors.text, flex: 1, marginLeft: 6 }]}>
                      Drug {idx + 1}
                    </Text>
                    {items.length > 1 && (
                      <TouchableOpacity
                        onPress={() => handleRemoveMedicineSection(idx)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.removeSectionText}>✕ Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* MEDICINE & DOSAGE */}
                  <SearchDropdown
                    label="Medicine & Dosage"
                    placeholder="Select Medicine..."
                    items={medicineDropdownItems}
                    selectedId={item.medicine_id}
                    onSelect={(id) => handleUpdateItem(idx, 'medicine_id', id)}
                    onAddNew={() => {
                      setNewMedForIdx(idx);
                      setShowMedicineModal(true);
                    }}
                    addNewLabel="Add New Medicine"
                    required={true}
                    tagColor="emerald"
                  />

                  {/* DURATION ROW (Period + Compact Unit Tabs) */}
                  <View style={styles.periodTimeRow}>
                    <View style={{ width: 70 }}>
                      <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Period</Text>
                      <TextInput
                        style={[
                          styles.textInputCompact,
                          {
                            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                            color: themeColors.text,
                            borderColor: isDark ? '#334155' : '#CBD5E1',
                            textAlign: 'center',
                          },
                        ]}
                        placeholder="7"
                        placeholderTextColor={themeColors.subText}
                        keyboardType="numeric"
                        value={item.period}
                        onChangeText={(t) => handleUpdateItem(idx, 'period', t)}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Unit</Text>
                      <View style={styles.unitPillWrap}>
                        {TIME_UNITS.map((unit) => (
                          <TouchableOpacity
                            key={unit}
                            style={[
                              styles.unitPill,
                              item.time_unit === unit && styles.unitPillActive,
                            ]}
                            onPress={() => handleUpdateItem(idx, 'time_unit', unit)}
                          >
                            <Text
                              style={[
                                styles.unitPillText,
                                item.time_unit === unit && { color: '#2563EB', fontWeight: '800' },
                              ]}
                            >
                              {unit}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* ADVICE */}
                  <View style={{ marginTop: 6 }}>
                    <Text style={[styles.subInputLabel, { color: themeColors.subText }]}>Instructions / Advice</Text>
                    <TextInput
                      style={[
                        styles.textInputCompact,
                        {
                          backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                          color: themeColors.text,
                          borderColor: isDark ? '#334155' : '#CBD5E1',
                          height: 38,
                        },
                      ]}
                      placeholder="e.g. 1 tab after meals, 3x daily"
                      placeholderTextColor={themeColors.subText}
                      value={item.advice}
                      onChangeText={(t) => handleUpdateItem(idx, 'advice', t)}
                    />
                  </View>
                </View>
              ))}

              {/* + Add Another Medicine Button */}
              <TouchableOpacity
                style={[
                  styles.addAnotherBtn,
                  { borderColor: isDark ? '#3B82F6' : '#2563EB' },
                ]}
                onPress={handleAddMedicineSection}
                activeOpacity={0.7}
              >
                <Text style={styles.addAnotherBtnText}>+ Add Another Medication</Text>
              </TouchableOpacity>

              {/* GENERAL NOTES */}
              <View style={styles.formGroupCompact}>
                <Text style={[styles.inputLabelCompact, { color: themeColors.text }]}>GENERAL NOTES (OPTIONAL)</Text>
                <TextInput
                  style={[
                    styles.textAreaCompact,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                      color: themeColors.text,
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                  ]}
                  placeholder="Additional instructions, warnings..."
                  placeholderTextColor={themeColors.subText}
                  multiline={true}
                  numberOfLines={2}
                  textAlignVertical="top"
                  value={formNotes}
                  onChangeText={setFormNotes}
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
                  style={[styles.submitBtn, { backgroundColor: '#2563EB' }]}
                  onPress={handleSavePrescription}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Save Prescription</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          VIEW PRESCRIPTION DETAILS MODAL
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
                Prescription Details
              </Text>
              <Text style={[styles.headerSub, { color: themeColors.subText }]}>
                {selectedPrescription?.patient?.full_name} · {selectedPrescription?.prescription_date}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.editHeaderBtn, { backgroundColor: '#2563EB' }]}
              onPress={() => {
                setViewModalVisible(false);
                if (selectedPrescription) handleOpenEditModal(selectedPrescription);
              }}
            >
              <Text style={styles.editHeaderBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {selectedPrescription && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
              {/* Quick Actions Card */}
              <View style={[styles.sheetActionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <TouchableOpacity
                  style={[styles.sheetActionBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => handleDownloadPDF(selectedPrescription)}
                  disabled={downloadingPdf}
                >
                  {downloadingPdf ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.sheetActionBtnText}>📄 Download PDF Prescription</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.sheetActionBtn, { backgroundColor: '#059669', marginTop: 8 }]}
                  onPress={async () => {
                    const msg = `SpiritMed Prescription\nPatient: ${selectedPrescription.patient?.full_name}\nDoctor: Dr. ${selectedPrescription.doctor?.full_name}\nDate: ${selectedPrescription.prescription_date}\nMeds: ${selectedPrescription.prescription_items?.length || 0} prescribed`;
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
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedPrescription.patient?.full_name}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Patient ID:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedPrescription.patient?.patient_number || 'N/A'}</Text>
                </View>
                {(selectedPrescription.patient as any)?.file_number && (
                  <View style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { color: themeColors.subText }]}>File Number:</Text>
                    <Text style={[styles.infoVal, { color: themeColors.text }]}>{(selectedPrescription.patient as any).file_number}</Text>
                  </View>
                )}
              </View>

              {/* Prescribing Doctor */}
              <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Prescriber Details</Text>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Doctor:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>Dr. {selectedPrescription.doctor?.full_name || 'Medical Staff'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Specialization:</Text>
                  <Text style={[styles.infoVal, { color: themeColors.text }]}>{selectedPrescription.doctor?.specialization || 'Consultant Specialist'}</Text>
                </View>
              </View>

              {/* Prescribed Medications */}
              <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Drugs Prescribed</Text>
                {(selectedPrescription.prescription_items || []).map((item, idx) => (
                  <View key={idx} style={styles.sheetRxItem}>
                    <Text style={[styles.sheetRxName, { color: '#059669' }]}>
                      {idx + 1}. {item.medicine?.name || 'Medication'} {item.medicine?.dosage ? `(${item.medicine.dosage})` : ''}
                    </Text>
                    <Text style={[styles.sheetRxDetails, { color: themeColors.subText }]}>
                      Duration: {item.period} {item.time_unit} · Route: {item.medicine?.route || 'po'}
                    </Text>
                    {item.advice ? (
                      <Text style={[styles.sheetRxAdvice, { color: themeColors.text }]}>
                        Advice: {cleanHtmlText(item.advice)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>

              {/* Notes if any */}
              {selectedPrescription.notes && (
                <View style={[styles.sheetSection, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                  <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Clinical Notes</Text>
                  <Text style={[styles.sectionBody, { color: themeColors.text }]}>
                    {cleanHtmlText(selectedPrescription.notes)}
                  </Text>
                </View>
              )}

              {/* Delete Action */}
              <TouchableOpacity
                style={styles.sheetDeleteBtn}
                onPress={() => handleDeletePrescription(selectedPrescription)}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetDeleteBtnText}>🗑️ Delete Prescription</Text>
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

      {/* 2. Quick Add Medicine Modal */}
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
              <TouchableOpacity style={[styles.miniBtnSave, { backgroundColor: '#2563EB' }]} onPress={handleCreateMedicine} disabled={creatingMedicine}>
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    paddingVertical: 0,
  },
  listContent: {
    padding: 12,
    paddingTop: 2,
    paddingBottom: 40,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 12,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  emptySub: {
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardPatientName: {
    fontSize: 14,
    fontWeight: '800',
  },
  cardPatientSub: {
    fontSize: 10.5,
    marginTop: 1,
  },
  cardDateBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardDateText: {
    color: '#2563EB',
    fontSize: 10.5,
    fontWeight: '700',
  },
  medsPreviewBox: {
    marginTop: 6,
    gap: 2,
  },
  medPreviewText: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  moreMedsText: {
    fontSize: 10.5,
    fontStyle: 'italic',
    marginTop: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    gap: 6,
  },
  cardDoctor: {
    fontSize: 10.5,
    fontWeight: '500',
    flex: 1,
  },
  medsBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  medsBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
  },
  statusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  modalContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 6 : 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  saveHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveHeaderBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 11.5,
  },
  editHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editHeaderBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 11.5,
  },
  formGroupCompact: {
    marginBottom: 8,
  },
  inputLabelCompact: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  subInputLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  textInputCompact: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12.5,
    fontWeight: '600',
    height: 36,
  },
  textAreaCompact: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12.5,
    minHeight: 48,
  },
  medsSectionHeader: {
    marginVertical: 4,
  },
  sectionMainTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  medicineSectionBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  medIndexBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  medIndexText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  sectionHeaderTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  removeSectionText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
  },
  periodTimeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  unitPillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  unitPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  unitPillActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  unitPillText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#475569',
  },
  addAnotherBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    marginVertical: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.04)',
  },
  addAnotherBtnText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },
  formFooter: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  sheetActionCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
  },
  sheetActionBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  sheetActionBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  sheetSection: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  infoVal: {
    fontSize: 11,
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
    fontSize: 10.5,
    marginTop: 1,
  },
  sheetRxAdvice: {
    fontSize: 10.5,
    marginTop: 1,
    fontStyle: 'italic',
  },
  sheetDeleteBtn: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  sheetDeleteBtnText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 12,
  },
  miniModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  miniModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  miniModalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    marginBottom: 10,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  miniInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  miniModalBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  miniBtnCancel: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  miniBtnSave: {
    flex: 1.5,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  miniBtnSaveText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
});
