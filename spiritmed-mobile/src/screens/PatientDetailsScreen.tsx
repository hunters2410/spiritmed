import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Linking,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, Patient, PatientFile } from '../types';
import { fetchAllPatients, filterPatients } from '../utils/patientLoader';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

type PatientDetailsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'PatientDetails'>;
type PatientDetailsScreenRouteProp = RouteProp<RootStackParamList, 'PatientDetails'>;

interface Props {
  navigation: PatientDetailsScreenNavigationProp;
  route: PatientDetailsScreenRouteProp;
}

export function PatientDetailsScreen({ navigation, route }: Props) {
  const { themeColors } = useTheme();
  const { hasPermission } = useAuth();
  const initialPatientId = route.params?.patientId;

  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [patientFiles, setPatientFiles] = useState<PatientFile[]>([]);

  // ── Financial Summary State ──
  const [financialSummary, setFinancialSummary] = useState<{
    totalBilled: number;
    totalPaid: number;
    balanceDue: number;
    loading: boolean;
  }>({ totalBilled: 0, totalPaid: 0, balanceDue: 0, loading: false });

  // ── Status Badge Config Helper ──
  const getStatusBadgeConfig = (status?: string | null) => {
    const s = (status || 'active').toLowerCase().trim();
    if (s === 'active') {
      return { label: 'Active', bg: '#DCFCE7', text: '#15803D', border: '#86EFAC', dot: '#22C55E' };
    }
    if (s === 'discharged') {
      return { label: 'Discharged', bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD', dot: '#3B82F6' };
    }
    if (s === 'deceased') {
      return { label: 'Deceased', bg: '#F3F4F6', text: '#374151', border: '#D1D5DB', dot: '#6B7280' };
    }
    if (s.includes('pending')) {
      return { label: 'Pending Approval', bg: '#FEF3C7', text: '#B45309', border: '#FDE68A', dot: '#F59E0B' };
    }
    return { label: s.toUpperCase(), bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB', dot: '#9CA3AF' };
  };

  // ── Edit Profile Modal State ──
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [editTitle, setEditTitle] = useState('Mr');
  const [editFullName, setEditFullName] = useState('');
  const [editFileNumber, setEditFileNumber] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editGender, setEditGender] = useState('male');
  const [editDateOfBirth, setEditDateOfBirth] = useState('');
  const [editNationalId, setEditNationalId] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editAllergies, setEditAllergies] = useState('');
  const [editChronicConditions, setEditChronicConditions] = useState('');
  const [editEmergencyContactName, setEditEmergencyContactName] = useState('');
  const [editEmergencyContactPhone, setEditEmergencyContactPhone] = useState('');

  const handleOpenEditModal = () => {
    if (!selectedPatient) return;
    setEditTitle(selectedPatient.title || 'Mr');
    setEditFullName(selectedPatient.full_name || '');
    setEditFileNumber(selectedPatient.file_number ? selectedPatient.file_number.split('-')[0] : '');
    setEditPhone(selectedPatient.phone || '');
    setEditEmail(selectedPatient.email || '');
    setEditAddress(selectedPatient.address || '');
    setEditGender(selectedPatient.gender || 'male');
    setEditDateOfBirth(selectedPatient.date_of_birth || '');
    setEditNationalId(selectedPatient.national_id || '');
    setEditOccupation(selectedPatient.occupation || '');
    setEditAllergies(selectedPatient.allergies || '');
    setEditChronicConditions(selectedPatient.chronic_conditions || '');
    setEditEmergencyContactName(selectedPatient.emergency_contact_name || '');
    setEditEmergencyContactPhone(selectedPatient.emergency_contact_phone || '');
    setEditModalVisible(true);
  };

  const handleSaveEditProfile = async () => {
    if (!selectedPatient) return;
    if (!editFullName.trim()) {
      Alert.alert('Required', 'Full Name is required.');
      return;
    }
    try {
      setSavingEdit(true);
      const cleanName = editFullName.trim();
      const cleanFileNo = editFileNumber.trim() ? editFileNumber.trim() : null;

      const payload = {
        title: editTitle,
        full_name: cleanName,
        file_number: cleanFileNo,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        address: editAddress.trim() || null,
        gender: editGender,
        date_of_birth: editDateOfBirth.trim() || null,
        national_id: editNationalId.trim() || null,
        occupation: editOccupation.trim() || null,
        allergies: editAllergies.trim() || null,
        chronic_conditions: editChronicConditions.trim() || null,
        emergency_contact_name: editEmergencyContactName.trim() || null,
        emergency_contact_phone: editEmergencyContactPhone.trim() || null,
      };

      const { error } = await supabase
        .from('patients')
        .update(payload)
        .eq('id', selectedPatient.id);

      if (error) throw error;

      const updatedPatient: Patient = {
        ...selectedPatient,
        title: editTitle,
        full_name: cleanName,
        file_number: cleanFileNo || undefined,
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
        address: editAddress.trim() || undefined,
        gender: editGender,
        date_of_birth: editDateOfBirth.trim() || undefined,
        national_id: editNationalId.trim() || undefined,
        occupation: editOccupation.trim() || undefined,
        allergies: editAllergies.trim() || undefined,
        chronic_conditions: editChronicConditions.trim() || undefined,
        emergency_contact_name: editEmergencyContactName.trim() || undefined,
        emergency_contact_phone: editEmergencyContactPhone.trim() || undefined,
      };

      setSelectedPatient(updatedPatient);
      setPatients((prev) => prev.map((p) => (p.id === updatedPatient.id ? updatedPatient : p)));
      setEditModalVisible(false);
      Alert.alert('Profile Updated', 'Patient details updated successfully.');
    } catch (e: any) {
      Alert.alert('Update Failed', e.message || 'Error updating patient profile.');
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => {
    const q = search.trim();
    if (q.length === 0) {
      setPatients([]);
      return;
    }

    const timer = setTimeout(() => {
      fetchPatients(q);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (initialPatientId) {
      fetchSinglePatient(initialPatientId);
    }
  }, [initialPatientId]);

  const fetchSinglePatient = async (id: string) => {
    try {
      const { data } = await supabase
        .from('patients')
        .select('*, medical_aid:medical_aids(name)')
        .eq('id', id)
        .single();
      if (data) selectPatient(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAllPatients().catch(() => {});
  }, []);

  const fetchPatients = async (query: string) => {
    try {
      setLoading(true);
      const all = await fetchAllPatients();
      const filtered = filterPatients(all, query);
      setPatients(filtered);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const selectPatient = async (patient: Patient) => {
    setSelectedPatient(patient);
    fetchPatientFiles(patient.id);
    fetchPatientFinancials(patient.id);
  };

  const fetchPatientFinancials = async (patientId: string) => {
    try {
      setFinancialSummary(prev => ({ ...prev, loading: true }));
      const { data, error } = await supabase
        .from('bills')
        .select('total_amount, paid_amount, balance, discount_amount, shortfall_balance, medical_aid_balance, status')
        .eq('patient_id', patientId);

      if (error) throw error;
      const bills = data || [];
      const totalBilled = bills.reduce((acc, b) => acc + (Number(b.total_amount) || 0), 0);
      const totalPaid = bills.reduce((acc, b) => acc + (Number(b.paid_amount) || 0), 0);
      const balanceDue = bills.reduce((acc, b) => {
        if (b.balance !== null && b.balance !== undefined) {
          return acc + Number(b.balance);
        }
        const effectiveBal = Math.max(0, (Number(b.total_amount) || 0) - (Number(b.discount_amount) || 0) - (Number(b.paid_amount) || 0));
        return acc + effectiveBal;
      }, 0);

      setFinancialSummary({
        totalBilled,
        totalPaid,
        balanceDue,
        loading: false,
      });
    } catch (err) {
      console.error('Error fetching patient financials:', err);
      setFinancialSummary(prev => ({ ...prev, loading: false }));
    }
  };

  const fetchPatientFiles = async (patientId: string) => {
    try {
      setFilesLoading(true);
      const { data, error } = await supabase
        .from('patient_files')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPatientFiles(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setFilesLoading(false);
    }
  };

  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const openFileUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open file link.');
    });
  };

  const downloadFile = async (fileUrl: string, fileName: string, fileId: string) => {
    try {
      setDownloadingFileId(fileId);
      const cleanFileName = (fileName || 'document').replace(/[^a-zA-Z0-9_.-]/g, '_');
      const targetUri = `${FileSystem.documentDirectory}${cleanFileName}`;

      const downloadRes = await FileSystem.downloadAsync(fileUrl, targetUri);

      if (downloadRes.status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadRes.uri);
        } else {
          Alert.alert('Downloaded! 📥', `File saved to device at:\n${downloadRes.uri}`);
        }
      } else {
        Alert.alert('Download Failed', 'Unable to download file from server.');
      }
    } catch (err: any) {
      console.error('Error downloading file:', err);
      Alert.alert('Download Error', err.message || 'Failed to download file.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const renderInfoRow = (label: string, value?: string | null, highlight: boolean = false) => {
    if (!value && value !== '0') return null;
    return (
      <View style={[styles.infoRow, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.infoLabel, { color: themeColors.subText }]}>{label}:</Text>
        <Text style={[styles.infoVal, { color: highlight ? themeColors.accent : themeColors.text }, highlight && { fontWeight: 'bold' }]}>
          {value}
        </Text>
      </View>
    );
  };

  const renderCard = (title: string, children: React.ReactNode) => (
    <View style={[styles.detailsCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
      <View style={[styles.cardTitleBox, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.cardTitleText, { color: themeColors.text }]}>{title}</Text>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: themeColors.accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>
          {selectedPatient ? 'Patient Profile' : 'Search Patients'}
        </Text>
        {selectedPatient ? (
          <TouchableOpacity onPress={() => setSelectedPatient(null)} style={styles.listBtn}>
            <Text style={[styles.listBtnText, { color: themeColors.accent }]}>Search</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {!selectedPatient ? (
        <View style={{ flex: 1 }}>
          <View style={[styles.searchBox, { borderBottomColor: themeColors.border }]}>
            <TextInput
              style={[
                styles.searchInput,
                {
                  backgroundColor: themeColors.inputBg,
                  borderColor: themeColors.inputBorder,
                  color: themeColors.text,
                },
              ]}
              placeholder="Search patient name, ID, or file no..."
              placeholderTextColor={themeColors.subText}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {search.trim().length === 0 ? (
            <Text style={[styles.noPatientsText, { color: themeColors.subText }]}>
              Type patient name, ID, or file number to search...
            </Text>
          ) : loading ? (
            <ActivityIndicator color={themeColors.accent} style={{ marginTop: 40 }} />
          ) : patients.length === 0 ? (
            <Text style={[styles.noPatientsText, { color: themeColors.subText }]}>
              No matching patients found.
            </Text>
          ) : (
            <FlatList
              data={patients}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.patientCard,
                    { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
                  ]}
                  onPress={() => selectPatient(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.patientName, { color: themeColors.text }]}>
                      {item.title ? `${item.title} ` : ''}{item.full_name}
                    </Text>
                    <Text
                      style={[
                        styles.fileBadgeText,
                        { color: item.file_number ? themeColors.accent : themeColors.subText },
                      ]}
                    >
                      {item.file_number ? `File: ${item.file_number.split('-')[0]}` : 'NO FILE'}
                    </Text>
                  </View>

                  <Text style={[styles.patientSub, { color: themeColors.subText }]}>
                    ID: {item.patient_number || 'N/A'} • {item.phone || 'No Phone'}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={true}>
          {/* Main Profile Header Card */}
          <View style={[styles.profileHeaderCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={[styles.avatarBox, { backgroundColor: themeColors.accent }]}>
              <Text style={styles.avatarText}>
                {selectedPatient.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.profileName, { color: themeColors.text }]}>
              {selectedPatient.title ? `${selectedPatient.title} ` : ''}{selectedPatient.full_name}
            </Text>

            {/* Badges: Status, File No, System ID */}
            <View style={styles.badgesContainer}>
              {/* Status Pill */}
              {(() => {
                const cfg = getStatusBadgeConfig(selectedPatient.status);
                return (
                  <View style={[styles.statusBadgePill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                    <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
                    <Text style={[styles.statusBadgeText, { color: cfg.text }]}>{cfg.label}</Text>
                  </View>
                );
              })()}

              {/* File No Pill */}
              <View style={[styles.badgePill, { backgroundColor: themeColors.accentBg, borderColor: themeColors.border }]}>
                <Text style={[styles.badgePillText, { color: themeColors.accent }]}>
                  📁 File: {selectedPatient.file_number ? selectedPatient.file_number.split('-')[0] : 'No File'}
                </Text>
              </View>

              {/* Patient ID Pill */}
              <View style={[styles.badgePill, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}>
                <Text style={[styles.badgePillText, { color: themeColors.subText }]}>
                  ID: {selectedPatient.patient_number || 'N/A'}
                </Text>
              </View>
            </View>
          </View>

          {/* 💰 Financial / Account Balance Summary Card */}
          <View style={[styles.financialCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={styles.financialHeader}>
              <View>
                <Text style={[styles.financialTitle, { color: themeColors.subText }]}>ACCOUNT BALANCE</Text>
                <Text style={[
                  styles.financialMainAmount,
                  { color: financialSummary.balanceDue > 0 ? '#DC2626' : financialSummary.balanceDue < 0 ? '#9333EA' : '#16A34A' }
                ]}>
                  {financialSummary.balanceDue < 0 
                    ? `CR $${Math.abs(financialSummary.balanceDue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                    : `$${financialSummary.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </Text>
              </View>
              <View style={[
                styles.balanceStatusTag,
                { backgroundColor: financialSummary.balanceDue > 0 ? '#FEE2E2' : financialSummary.balanceDue < 0 ? '#F3E8FF' : '#DCFCE7' }
              ]}>
                <Text style={[
                  styles.balanceStatusText,
                  { color: financialSummary.balanceDue > 0 ? '#B91C1C' : financialSummary.balanceDue < 0 ? '#7E22CE' : '#15803D' }
                ]}>
                  {financialSummary.balanceDue > 0 ? '● Due' : financialSummary.balanceDue < 0 ? '● In Credit' : '✓ Settled'}
                </Text>
              </View>
            </View>

            <View style={[styles.financialDivider, { backgroundColor: themeColors.border }]} />

            <View style={styles.financialSubRow}>
              <View style={styles.financialSubItem}>
                <Text style={[styles.financialSubLabel, { color: themeColors.subText }]}>Total Invoiced</Text>
                <Text style={[styles.financialSubVal, { color: themeColors.text }]}>
                  ${financialSummary.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={[styles.financialVerticalLine, { backgroundColor: themeColors.border }]} />
              <View style={styles.financialSubItem}>
                <Text style={[styles.financialSubLabel, { color: themeColors.subText }]}>Total Paid</Text>
                <Text style={[styles.financialSubVal, { color: '#16A34A' }]}>
                  ${financialSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </View>

          {/* ⚡ Quick Actions Grid */}
          <View style={[styles.quickActionsContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.quickActionsTitle, { color: themeColors.subText }]}>QUICK ACTIONS</Text>
            <View style={styles.actionGrid}>
              {hasPermission('patients', 'edit') && (
                <TouchableOpacity
                  style={[styles.actionGridBtn, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
                  onPress={handleOpenEditModal}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionGridIcon}>✏️</Text>
                  <Text style={[styles.actionGridText, { color: themeColors.text }]}>Edit Profile</Text>
                </TouchableOpacity>
              )}
              {hasPermission('consultations', 'add') && (
                <TouchableOpacity
                  style={[styles.actionGridBtn, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
                  onPress={() => navigation.navigate('Consultations', { patientId: selectedPatient.id })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionGridIcon}>🩺</Text>
                  <Text style={[styles.actionGridText, { color: themeColors.text }]}>Consult</Text>
                </TouchableOpacity>
              )}
              {hasPermission('operation_reports', 'add') && (
                <TouchableOpacity
                  style={[styles.actionGridBtn, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
                  onPress={() => navigation.navigate('OperationReports', { patientId: selectedPatient.id })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionGridIcon}>📋</Text>
                  <Text style={[styles.actionGridText, { color: themeColors.text }]}>Op Report</Text>
                </TouchableOpacity>
              )}
              {hasPermission('patient_files', 'add') && (
                <TouchableOpacity
                  style={[styles.actionGridBtn, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
                  onPress={() => navigation.navigate('UploadFile', { patientId: selectedPatient.id })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionGridIcon}>📁</Text>
                  <Text style={[styles.actionGridText, { color: themeColors.text }]}>Upload File</Text>
                </TouchableOpacity>
              )}
              {hasPermission('appointments', 'add') && (
                <TouchableOpacity
                  style={[styles.actionGridBtn, { backgroundColor: themeColors.inputBg, borderColor: themeColors.border }]}
                  onPress={() => navigation.navigate('BookAppointment', { patientId: selectedPatient.id })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.actionGridIcon}>📅</Text>
                  <Text style={[styles.actionGridText, { color: themeColors.text }]}>Appointment</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 1. Personal Information */}
          {renderCard('Personal Details', (
            <>
              {/* Patient Status */}
              <View style={[styles.infoRow, { borderBottomColor: themeColors.border, alignItems: 'center' }]}>
                <Text style={[styles.infoLabel, { color: themeColors.subText }]}>Patient Status:</Text>
                {(() => {
                  const cfg = getStatusBadgeConfig(selectedPatient.status);
                  return (
                    <View style={[styles.statusBadgePill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                      <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
                      <Text style={[styles.statusBadgeText, { color: cfg.text, fontSize: 11 }]}>{cfg.label}</Text>
                    </View>
                  );
                })()}
              </View>
              {renderInfoRow('Title', selectedPatient.title)}
              {renderInfoRow('Full Name', selectedPatient.full_name)}
              {renderInfoRow('Gender', selectedPatient.gender ? selectedPatient.gender.toUpperCase() : null)}
              {renderInfoRow('Date of Birth', selectedPatient.date_of_birth)}
              {renderInfoRow('National ID / Passport', selectedPatient.national_id)}
              {renderInfoRow('Occupation', selectedPatient.occupation)}
              {renderInfoRow('Hospital File Number', selectedPatient.file_number ? selectedPatient.file_number.split('-')[0] : 'No File', true)}
              {renderInfoRow('System Patient ID', selectedPatient.patient_number, true)}
            </>
          ))}

          {/* 2. Contact & Address */}
          {renderCard('Contact & Address', (
            <>
              {renderInfoRow('Phone Number', selectedPatient.phone)}
              {renderInfoRow('Email Address', selectedPatient.email)}
              {renderInfoRow('Physical Address', selectedPatient.address)}
            </>
          ))}

          {/* 3. Medical Aid & Payment */}
          {renderCard('Payment & Medical Aid', (
            <>
              {renderInfoRow('Outstanding Balance Due', financialSummary.balanceDue < 0 ? `CR $${Math.abs(financialSummary.balanceDue).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `$${financialSummary.balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, true)}
              {renderInfoRow('Total Invoiced', `$${financialSummary.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}
              {renderInfoRow('Total Paid', `$${financialSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)}
              {renderInfoRow('Payment Method', selectedPatient.payment_method ? selectedPatient.payment_method.toUpperCase() : 'CASH')}
              {renderInfoRow('Medical Aid Provider', selectedPatient.medical_aid?.name || selectedPatient.medical_aid_id)}
              {renderInfoRow('Medical Aid Member No', selectedPatient.medical_aid_number)}
              {renderInfoRow('Dependant Suffix', selectedPatient.medical_aid_suffix)}
              {renderInfoRow('Main Member Name', selectedPatient.medical_aid_main_member)}
            </>
          ))}

          {/* 4. Medical Profile & History */}
          {renderCard('Medical Profile & History', (
            <>
              {renderInfoRow('Known Allergies', selectedPatient.allergies, true)}
              {renderInfoRow('Chronic Conditions', selectedPatient.chronic_conditions)}
              {renderInfoRow('Chronic Medications', selectedPatient.chronic_medications)}
              {renderInfoRow('Clinical History', selectedPatient.clinical_history)}
              {renderInfoRow('Smoking Habit', selectedPatient.smoke ? selectedPatient.smoke.toUpperCase() : null)}
              {renderInfoRow('Alcohol Consumption', selectedPatient.alcohol ? selectedPatient.alcohol.toUpperCase() : null)}
              {renderInfoRow('Alert Flags', selectedPatient.flags, true)}
            </>
          ))}

          {/* 5. Emergency Contact & Next of Kin */}
          {renderCard('Emergency Contact & Next of Kin', (
            <>
              {renderInfoRow('Emergency Contact Name', selectedPatient.emergency_contact_name)}
              {renderInfoRow('Emergency Contact Phone', selectedPatient.emergency_contact_phone)}
              {renderInfoRow('Next of Kin Relationship', selectedPatient.next_of_kin_relation)}
              {renderInfoRow('Next of Kin Email', selectedPatient.next_of_kin_email)}
              {renderInfoRow('Next of Kin Address', selectedPatient.next_of_kin_address)}
            </>
          ))}

          {/* 6. Responsible Person (Guarantor) */}
          {renderCard('Responsible Person (Guarantor)', (
            <>
              {renderInfoRow('Responsible Person Name', selectedPatient.responsible_person_name)}
              {renderInfoRow('Responsible Person Phone', selectedPatient.responsible_person_phone)}
              {renderInfoRow('Responsible Person Email', selectedPatient.responsible_person_email)}
              {renderInfoRow('Responsible Person ID', selectedPatient.responsible_person_id_number)}
              {renderInfoRow('Responsible Person Address', selectedPatient.responsible_person_address)}
            </>
          ))}

          {/* Patient Files Section */}
          <View style={[styles.detailsCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={[styles.cardTitleBox, { borderBottomColor: themeColors.border }]}>
              <Text style={styles.cardTitleIcon}>📁</Text>
              <Text style={[styles.cardTitleText, { color: themeColors.text }]}>Patient Files & Documents ({patientFiles.length})</Text>
            </View>

            <View style={{ padding: 12 }}>
              {filesLoading ? (
                <ActivityIndicator color={themeColors.accent} style={{ padding: 12 }} />
              ) : patientFiles.length === 0 ? (
                <Text style={[styles.noFilesText, { color: themeColors.subText }]}>
                  No uploaded files found for this patient.
                </Text>
              ) : (
                patientFiles.map((file) => (
                  <View
                    key={file.id}
                    style={[styles.fileItem, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
                  >
                    <Text style={{ fontSize: 22, marginRight: 10 }}>
                      {file.file_name?.toLowerCase().endsWith('.pdf') ? '📄' : file.file_type?.includes('image') ? '🖼️' : '📁'}
                    </Text>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.fileName, { color: themeColors.text }]} numberOfLines={1}>
                        {file.title || file.file_name}
                      </Text>
                      <Text style={[styles.fileDate, { color: themeColors.subText }]}>
                        {file.upload_date
                          ? new Date(file.upload_date).toLocaleDateString()
                          : file.created_at
                          ? new Date(file.created_at).toLocaleDateString()
                          : 'Recent File'}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        style={[styles.fileActionBtn, { backgroundColor: themeColors.accentBg }]}
                        onPress={() => openFileUrl(file.file_url)}
                      >
                        <Text style={[styles.fileActionText, { color: themeColors.accent }]}>👁️ View</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.fileActionBtn, { backgroundColor: '#0284C7' }]}
                        onPress={() => downloadFile(file.file_url, file.title || file.file_name, file.id)}
                        disabled={downloadingFileId === file.id}
                      >
                        {downloadingFileId === file.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={[styles.fileActionText, { color: '#ffffff' }]}>📥 Save</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Edit Patient Profile Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: themeColors.cardBg, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: themeColors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 4 }}>
              Edit Patient Profile
            </Text>
            <Text style={{ fontSize: 11, color: themeColors.subText, marginBottom: 12 }}>
              Update details for {selectedPatient?.full_name}
            </Text>

            <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled" style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>Full Name *</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editFullName}
                onChangeText={setEditFullName}
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>File Number</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editFileNumber}
                onChangeText={setEditFileNumber}
                placeholder="e.g. 5511"
                placeholderTextColor={themeColors.subText}
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>Phone Number</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>Email Address</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editEmail}
                onChangeText={setEditEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>National ID / Passport</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editNationalId}
                onChangeText={setEditNationalId}
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editDateOfBirth}
                onChangeText={setEditDateOfBirth}
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>Physical Address</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editAddress}
                onChangeText={setEditAddress}
                multiline
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>Known Allergies</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editAllergies}
                onChangeText={setEditAllergies}
                placeholder="e.g. Penicillin, Nuts"
                placeholderTextColor={themeColors.subText}
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>Emergency Contact Name</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editEmergencyContactName}
                onChangeText={setEditEmergencyContactName}
              />

              <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>Emergency Contact Phone</Text>
              <TextInput
                style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, color: themeColors.text, fontSize: 13, marginBottom: 10 }}
                value={editEmergencyContactPhone}
                onChangeText={setEditEmergencyContactPhone}
                keyboardType="phone-pad"
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setEditModalVisible(false)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 6, borderWidth: 1, borderColor: themeColors.border, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.subText }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveEditProfile}
                disabled={savingEdit}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 6, backgroundColor: themeColors.accent, alignItems: 'center' }}
              >
                {savingEdit ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Save Changes</Text>
                )}
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 0,
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  listBtn: {
    paddingVertical: 6,
    paddingLeft: 12,
  },
  listBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchBox: {
    padding: 12,
    borderBottomWidth: 1,
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  noPatientsText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  patientCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  patientName: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  fileBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  patientSub: {
    fontSize: 13,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHeaderCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  avatarBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  badgesContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badgePill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  financialCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  financialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  financialTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  financialMainAmount: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  balanceStatusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  balanceStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  financialDivider: {
    height: 1,
    marginVertical: 12,
  },
  financialSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  financialSubItem: {
    flex: 1,
  },
  financialSubLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  financialSubVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  financialVerticalLine: {
    width: 1,
    height: 24,
    marginHorizontal: 12,
  },
  quickActionsContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  quickActionsTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionGridBtn: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  actionGridIcon: {
    fontSize: 15,
  },
  actionGridText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailsCard: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  cardTitleIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  cardTitleText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 12,
    flex: 1,
  },
  infoVal: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  noFilesText: {
    textAlign: 'center',
    paddingVertical: 12,
    fontSize: 13,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  fileName: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  fileDate: {
    fontSize: 11,
    marginTop: 2,
  },
  fileActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileActionText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
