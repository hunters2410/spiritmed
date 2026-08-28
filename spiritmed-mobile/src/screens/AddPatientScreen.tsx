import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Keyboard,
  Modal,
  FlatList,
} from 'react-native';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';

type AddPatientScreenNavigationProp = StackNavigationProp<RootStackParamList, 'AddPatient'>;

interface Props {
  navigation: AddPatientScreenNavigationProp;
}

interface MedicalAid {
  id: string;
  name: string;
}

interface Doctor {
  id: string;
  full_name: string;
  role?: string;
}

export function AddPatientScreen({ navigation }: Props) {
  const { themeColors } = useTheme();

  // Section 1: Personal Details
  const [title, setTitle] = useState('Mr');
  const [fullName, setFullName] = useState('');
  const [fileNumber, setFileNumber] = useState('');
  const [fileNoTaken, setFileNoTaken] = useState(false);
  const [fileNoTakenBy, setFileNoTakenBy] = useState('');
  const [checkingFileNo, setCheckingFileNo] = useState(false);
  const [previewPatientId, setPreviewPatientId] = useState<string>('Loading...');
  const [gender, setGender] = useState('male');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [occupation, setOccupation] = useState('');

  // Section 2: Contact & Address
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  // Section 3: Payment & Medical Aid
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [medicalAidId, setMedicalAidId] = useState('');
  const [medicalAidNumber, setMedicalAidNumber] = useState('');
  const [medicalAidSuffix, setMedicalAidSuffix] = useState('');
  const [medicalAidMainMember, setMedicalAidMainMember] = useState('');

  // Section 4: Medical Details
  const [doctorId, setDoctorId] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');
  const [chronicMedications, setChronicMedications] = useState('');
  const [clinicalHistory, setClinicalHistory] = useState('');
  const [smoke, setSmoke] = useState('never');
  const [alcohol, setAlcohol] = useState('never');
  const [flags, setFlags] = useState('');

  // Section 5: Emergency Contact & Next of Kin
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [nextOfKinRelation, setNextOfKinRelation] = useState('');
  const [nextOfKinEmail, setNextOfKinEmail] = useState('');
  const [nextOfKinAddress, setNextOfKinAddress] = useState('');

  // Section 6: Responsible Person (Guarantor)
  const [responsiblePersonName, setResponsiblePersonName] = useState('');
  const [responsiblePersonPhone, setResponsiblePersonPhone] = useState('');
  const [responsiblePersonEmail, setResponsiblePersonEmail] = useState('');
  const [responsiblePersonIdNumber, setResponsiblePersonIdNumber] = useState('');
  const [responsiblePersonAddress, setResponsiblePersonAddress] = useState('');

  // Dropdown Modal States
  const [medicalAids, setMedicalAids] = useState<MedicalAid[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(false);

  const [showMedicalAidModal, setShowMedicalAidModal] = useState(false);
  const [medicalAidSearch, setMedicalAidSearch] = useState('');

  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState('');

  useEffect(() => {
    fetchOptions();
    generateNextPatientNumber().then((id) => setPreviewPatientId(id));
  }, []);

  // ─── File number uniqueness check — debounced 500 ms ─────────────────────
  useEffect(() => {
    const val = fileNumber.trim();
    if (!val) { setFileNoTaken(false); setFileNoTakenBy(''); return; }
    setCheckingFileNo(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('patients')
          .select('id, full_name')
          .eq('file_number', val)
          .limit(1);
        if (data && data.length > 0) {
          setFileNoTaken(true);
          setFileNoTakenBy(data[0].full_name);
        } else {
          setFileNoTaken(false);
          setFileNoTakenBy('');
        }
      } catch { /* ignore */ } finally {
        setCheckingFileNo(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [fileNumber]);

  const fetchOptions = async () => {
    try {
      const { data: maData } = await supabase.from('medical_aids').select('id, name').order('name');
      if (maData) setMedicalAids(maData);

      // Fetch logged in user branch_id
      const { data: { user } } = await supabase.auth.getUser();
      let branchId: string | null = null;
      if (user) {
        const { data: prof } = await supabase
          .from('users')
          .select('branch_id')
          .eq('id', user.id)
          .maybeSingle();
        if (prof?.branch_id) branchId = prof.branch_id;
      }

      // Strictly fetch users with role 'doctor' for current branch
      let query = supabase
        .from('users')
        .select('id, full_name, role, branch_id')
        .eq('role', 'doctor')
        .eq('is_active', true)
        .order('full_name');

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data: docData } = await query;
      if (docData && docData.length > 0) {
        setDoctors(docData);
      } else {
        // Fallback: Query doctors across system if specific branch has no doctor record
        const { data: fallbackDocs } = await supabase
          .from('users')
          .select('id, full_name, role')
          .eq('role', 'doctor')
          .eq('is_active', true)
          .order('full_name');
        if (fallbackDocs) setDoctors(fallbackDocs);
      }
    } catch (e) {
      console.error('Error fetching options:', e);
    }
  };

  const generateNextPatientNumber = async (): Promise<string> => {
    try {
      const { data } = await supabaseAdmin
        .from('patients')
        .select('patient_number')
        .order('patient_number', { ascending: false })
        .limit(100);

      let maxNum = 0;
      for (const row of (data || [])) {
        const str = row.patient_number || '';
        const digits = str.replace(/\D/g, '');
        const n = parseInt(digits || '0', 10);
        if (!isNaN(n) && n < 90000000 && n > maxNum) {
          maxNum = n;
        }
      }

      let candidateNum = maxNum > 0 ? maxNum + 1 : 1;
      let candidate = String(candidateNum).padStart(8, '0');

      let isDuplicate = true;
      let attempts = 0;
      while (isDuplicate && attempts < 15) {
        const { data: existing } = await supabaseAdmin
          .from('patients')
          .select('id')
          .eq('patient_number', candidate)
          .maybeSingle();

        if (!existing) {
          isDuplicate = false;
        } else {
          candidateNum++;
          candidate = String(candidateNum).padStart(8, '0');
          attempts++;
        }
      }

      return candidate;
    } catch {
      return String(Date.now()).slice(-8).padStart(8, '0');
    }
  };

  const handleSavePatient = async () => {
    Keyboard.dismiss();
    if (!fullName.trim()) {
      Alert.alert('Required Field', 'Please enter the patient full name.');
      return;
    }
    if (fileNoTaken) {
      Alert.alert('Duplicate File Number', `File number ${fileNumber} is already in use by ${fileNoTakenBy}.`);
      return;
    }

    try {
      setLoading(true);
      const patientNumber = await generateNextPatientNumber();

      const payload = {
        title: title,
        full_name: fullName.trim(),
        patient_number: patientNumber,
        file_number: fileNumber.trim() ? fileNumber.trim() : null,
        gender: gender,
        date_of_birth: dateOfBirth.trim() || null,
        national_id: nationalId.trim() || null,
        occupation: occupation.trim() || null,

        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,

        payment_method: paymentMethod,
        medical_aid_id: medicalAidId || null,
        medical_aid_number: medicalAidNumber.trim() || null,
        medical_aid_suffix: medicalAidSuffix.trim() || null,
        medical_aid_main_member: medicalAidMainMember.trim() || null,

        doctor_id: doctorId || null,
        allergies: allergies.trim() || null,
        chronic_conditions: chronicConditions.trim() || null,
        chronic_medications: chronicMedications.trim() || null,
        clinical_history: clinicalHistory.trim() || null,
        smoke: smoke,
        alcohol: alcohol,
        flags: flags.trim() || null,

        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,
        next_of_kin_relation: nextOfKinRelation.trim() || null,
        next_of_kin_email: nextOfKinEmail.trim() || null,
        next_of_kin_address: nextOfKinAddress.trim() || null,

        responsible_person_name: responsiblePersonName.trim() || null,
        responsible_person_phone: responsiblePersonPhone.trim() || null,
        responsible_person_email: responsiblePersonEmail.trim() || null,
        responsible_person_id_number: responsiblePersonIdNumber.trim() || null,
        responsible_person_address: responsiblePersonAddress.trim() || null,

        status: 'active',
      };

      const { error } = await supabaseAdmin.from('patients').insert([payload]);

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert(
          'Patient Added',
          `Patient "${fullName}" added successfully!\nPatient ID: ${patientNumber}\nFile No: ${fileNumber || 'NO FILE'}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add patient.');
    } finally {
      setLoading(false);
    }
  };

  const renderSectionHeader = (title: string) => (
    <View style={[styles.sectionHeader, { borderBottomColor: themeColors.border }]}>
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{title}</Text>
    </View>
  );

  const selectedMedicalAid = medicalAids.find((m) => m.id === medicalAidId);
  const filteredMedicalAids = medicalAids.filter((m) =>
    m.name.toLowerCase().includes(medicalAidSearch.toLowerCase())
  );

  const selectedDoctor = doctors.find((d) => d.id === doctorId);
  const filteredDoctors = doctors.filter((d) =>
    d.full_name.toLowerCase().includes(doctorSearch.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: themeColors.accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Add Patient Profile</Text>
        <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.dismissBtn}>
          <Text style={[styles.dismissText, { color: themeColors.subText }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          {/* Section 1: Personal Details */}
          {renderSectionHeader('1. Personal Details')}

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.subText }]}>PATIENT ID (AUTO-GENERATED)</Text>
            <View style={[styles.input, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border, justifyContent: 'center' }]}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: themeColors.accent }}>
                🆔 {previewPatientId}
              </Text>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>TITLE</Text>
            <View style={styles.pillRow}>
              {['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Rev'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.pill,
                    { borderColor: themeColors.border },
                    title === t && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
                  ]}
                  onPress={() => setTitle(t)}
                >
                  <Text style={[styles.pillText, { color: title === t ? '#fff' : themeColors.text }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>FULL NAME *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. Johnathan Moyo"
              placeholderTextColor={themeColors.subText}
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>FILE NUMBER (OPTIONAL)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: fileNoTaken ? '#EF4444' : themeColors.inputBorder, borderWidth: fileNoTaken ? 2 : 1, color: themeColors.text }]}
              placeholder="e.g. 0658"
              placeholderTextColor={themeColors.subText}
              value={fileNumber}
              onChangeText={setFileNumber}
            />
            {checkingFileNo && fileNumber.trim().length > 0 && (
              <ActivityIndicator size="small" color={themeColors.accent} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            )}
            {fileNoTaken && (
              <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '600', marginTop: 4 }}>
                ⚠️ Already in use by {fileNoTakenBy}
              </Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>GENDER</Text>
            <View style={styles.pillRow}>
              {['male', 'female', 'other'].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.pill,
                    { borderColor: themeColors.border },
                    gender === g && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
                  ]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.pillText, { color: gender === g ? '#fff' : themeColors.text }]}>
                    {g.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>DATE OF BIRTH (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. 1988-04-12"
              placeholderTextColor={themeColors.subText}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>NATIONAL ID / PASSPORT</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. 63-1234567A00"
              placeholderTextColor={themeColors.subText}
              value={nationalId}
              onChangeText={setNationalId}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>OCCUPATION</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. Accountant, Teacher, Engineer"
              placeholderTextColor={themeColors.subText}
              value={occupation}
              onChangeText={setOccupation}
            />
          </View>

          {/* Section 2: Contact & Address */}
          {renderSectionHeader('2. Contact & Address')}

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>PHONE NUMBER</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. +263 77 123 4567"
              placeholderTextColor={themeColors.subText}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>EMAIL ADDRESS</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. johnathan@example.com"
              placeholderTextColor={themeColors.subText}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>PHYSICAL ADDRESS</Text>
            <TextInput
              style={[styles.input, styles.multiline, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. 14 Medical Way, Harare"
              placeholderTextColor={themeColors.subText}
              multiline
              numberOfLines={2}
              value={address}
              onChangeText={setAddress}
            />
          </View>

          {/* Section 3: Payment & Medical Aid */}
          {renderSectionHeader('3. Payment & Medical Aid')}

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>PAYMENT METHOD</Text>
            <View style={styles.pillRow}>
              {[
                { id: 'cash', label: 'Cash' },
                { id: 'medical_aid', label: 'Medical Aid' },
                { id: 'card', label: 'Card' },
                { id: 'bank_transfer', label: 'Bank' },
              ].map((pm) => (
                <TouchableOpacity
                  key={pm.id}
                  style={[
                    styles.pill,
                    { borderColor: themeColors.border },
                    paymentMethod === pm.id && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
                  ]}
                  onPress={() => setPaymentMethod(pm.id)}
                >
                  <Text style={[styles.pillText, { color: paymentMethod === pm.id ? '#fff' : themeColors.text }]}>
                    {pm.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {paymentMethod === 'medical_aid' && (
            <>
              <View style={styles.field}>
                <Text style={[styles.label, { color: themeColors.accent }]}>SELECT MEDICAL AID PROVIDER</Text>
                <TouchableOpacity
                  style={[styles.dropdownTrigger, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}
                  onPress={() => setShowMedicalAidModal(true)}
                >
                  <Text style={[styles.dropdownTriggerText, { color: selectedMedicalAid ? themeColors.text : themeColors.subText }]}>
                    {selectedMedicalAid ? selectedMedicalAid.name : '🔍 Search & Select Medical Aid...'}
                  </Text>
                  <Text style={[styles.dropdownArrow, { color: themeColors.subText }]}>▼</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: themeColors.accent }]}>MEDICAL AID NUMBER</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="e.g. MA-998877"
                  placeholderTextColor={themeColors.subText}
                  value={medicalAidNumber}
                  onChangeText={setMedicalAidNumber}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: themeColors.accent }]}>DEPENDANT SUFFIX</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="e.g. 00 (Main), 01 (Spouse), 02 (Child)"
                  placeholderTextColor={themeColors.subText}
                  value={medicalAidSuffix}
                  onChangeText={setMedicalAidSuffix}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: themeColors.accent }]}>MAIN MEMBER NAME</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                  placeholder="e.g. Johnathan Moyo Snr"
                  placeholderTextColor={themeColors.subText}
                  value={medicalAidMainMember}
                  onChangeText={setMedicalAidMainMember}
                />
              </View>
            </>
          )}

          {/* Section 4: Medical Details */}
          {renderSectionHeader('4. Medical Profile & History')}

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>ATTENDING DOCTOR</Text>
            <TouchableOpacity
              style={[styles.dropdownTrigger, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}
              onPress={() => setShowDoctorModal(true)}
            >
              <Text style={[styles.dropdownTriggerText, { color: selectedDoctor ? themeColors.text : themeColors.subText }]}>
                {selectedDoctor ? selectedDoctor.full_name : '🔍 Search & Select Doctor...'}
              </Text>
              <Text style={[styles.dropdownArrow, { color: themeColors.subText }]}>▼</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>KNOWN ALLERGIES</Text>
            <TextInput
              style={[styles.input, styles.multiline, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. Penicillin, Peanuts, Latex"
              placeholderTextColor={themeColors.subText}
              multiline
              numberOfLines={2}
              value={allergies}
              onChangeText={setAllergies}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>CHRONIC CONDITIONS</Text>
            <TextInput
              style={[styles.input, styles.multiline, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. Hypertension, Asthma, Diabetes"
              placeholderTextColor={themeColors.subText}
              multiline
              numberOfLines={2}
              value={chronicConditions}
              onChangeText={setChronicConditions}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>CHRONIC MEDICATIONS</Text>
            <TextInput
              style={[styles.input, styles.multiline, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. Amlodipine 5mg, Salbutamol Inhaler"
              placeholderTextColor={themeColors.subText}
              multiline
              numberOfLines={2}
              value={chronicMedications}
              onChangeText={setChronicMedications}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>CLINICAL HISTORY / NOTES</Text>
            <TextInput
              style={[styles.input, styles.multiline, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="Additional medical history..."
              placeholderTextColor={themeColors.subText}
              multiline
              numberOfLines={3}
              value={clinicalHistory}
              onChangeText={setClinicalHistory}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>SMOKING HABITS</Text>
            <View style={styles.pillRow}>
              {['never', 'former', 'active', 'occasional'].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.pill,
                    { borderColor: themeColors.border },
                    smoke === s && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
                  ]}
                  onPress={() => setSmoke(s)}
                >
                  <Text style={[styles.pillText, { color: smoke === s ? '#fff' : themeColors.text }]}>
                    {s.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>ALCOHOL CONSUMPTION</Text>
            <View style={styles.pillRow}>
              {['never', 'former', 'moderate', 'heavy', 'social'].map((a) => (
                <TouchableOpacity
                  key={a}
                  style={[
                    styles.pill,
                    { borderColor: themeColors.border },
                    alcohol === a && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
                  ]}
                  onPress={() => setAlcohol(a)}
                >
                  <Text style={[styles.pillText, { color: alcohol === a ? '#fff' : themeColors.text }]}>
                    {a.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>ALERT FLAGS / WARNINGS</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. High Risk, Fall Danger, Special Care"
              placeholderTextColor={themeColors.subText}
              value={flags}
              onChangeText={setFlags}
            />
          </View>

          {/* Section 5: Emergency Contact & Next of Kin */}
          {renderSectionHeader('5. Emergency Contact & Next of Kin')}

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>EMERGENCY CONTACT NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. Sarah Moyo"
              placeholderTextColor={themeColors.subText}
              value={emergencyContactName}
              onChangeText={setEmergencyContactName}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>EMERGENCY CONTACT PHONE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. +263 77 999 8888"
              placeholderTextColor={themeColors.subText}
              keyboardType="phone-pad"
              value={emergencyContactPhone}
              onChangeText={setEmergencyContactPhone}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>NEXT OF KIN RELATIONSHIP</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. Spouse, Parent, Child, Brother"
              placeholderTextColor={themeColors.subText}
              value={nextOfKinRelation}
              onChangeText={setNextOfKinRelation}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>NEXT OF KIN EMAIL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. sarah@example.com"
              placeholderTextColor={themeColors.subText}
              keyboardType="email-address"
              autoCapitalize="none"
              value={nextOfKinEmail}
              onChangeText={setNextOfKinEmail}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>NEXT OF KIN ADDRESS</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. 14 Medical Way, Harare"
              placeholderTextColor={themeColors.subText}
              value={nextOfKinAddress}
              onChangeText={setNextOfKinAddress}
            />
          </View>

          {/* Section 6: Responsible Person (Guarantor) */}
          {renderSectionHeader('6. Responsible Person (Guarantor)')}

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>RESPONSIBLE PERSON NAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. Robert Moyo"
              placeholderTextColor={themeColors.subText}
              value={responsiblePersonName}
              onChangeText={setResponsiblePersonName}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>RESPONSIBLE PERSON PHONE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. +263 71 222 3333"
              placeholderTextColor={themeColors.subText}
              keyboardType="phone-pad"
              value={responsiblePersonPhone}
              onChangeText={setResponsiblePersonPhone}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>RESPONSIBLE PERSON EMAIL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. robert@example.com"
              placeholderTextColor={themeColors.subText}
              keyboardType="email-address"
              autoCapitalize="none"
              value={responsiblePersonEmail}
              onChangeText={setResponsiblePersonEmail}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>RESPONSIBLE PERSON ID / PASSPORT</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. 63-9876543B00"
              placeholderTextColor={themeColors.subText}
              value={responsiblePersonIdNumber}
              onChangeText={setResponsiblePersonIdNumber}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: themeColors.accent }]}>RESPONSIBLE PERSON ADDRESS</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              placeholder="e.g. 20 Enterprise Rd, Harare"
              placeholderTextColor={themeColors.subText}
              value={responsiblePersonAddress}
              onChangeText={setResponsiblePersonAddress}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: (loading || fileNoTaken || checkingFileNo) ? '#9CA3AF' : themeColors.accent }]}
            onPress={handleSavePatient}
            disabled={loading || fileNoTaken || checkingFileNo}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Save Patient Profile</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Searchable Medical Aid Dropdown Modal */}
      <Modal
        visible={showMedicalAidModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMedicalAidModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.dropdownModalContent, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalHeaderTitle, { color: themeColors.text }]}>Select Medical Aid Provider</Text>
              <TouchableOpacity onPress={() => setShowMedicalAidModal(false)}>
                <Text style={[styles.modalCloseText, { color: themeColors.accent }]}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <TextInput
                style={[styles.modalSearchInput, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                placeholder="🔍 Type medical aid name to search..."
                placeholderTextColor={themeColors.subText}
                value={medicalAidSearch}
                onChangeText={setMedicalAidSearch}
              />
            </View>

            <FlatList
              data={[{ id: '', name: 'None / Direct Payment' }, ...filteredMedicalAids]}
              keyExtractor={(item) => item.id || 'none'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownOptionRow,
                    { borderBottomColor: themeColors.border },
                    medicalAidId === item.id && { backgroundColor: themeColors.accentBg },
                  ]}
                  onPress={() => {
                    setMedicalAidId(item.id);
                    setShowMedicalAidModal(false);
                    setMedicalAidSearch('');
                  }}
                >
                  <Text style={[styles.dropdownOptionText, { color: medicalAidId === item.id ? themeColors.accent : themeColors.text }]}>
                    {item.name}
                  </Text>
                  {medicalAidId === item.id && <Text style={{ color: themeColors.accent, fontWeight: 'bold' }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Searchable Doctor Dropdown Modal */}
      <Modal
        visible={showDoctorModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDoctorModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.dropdownModalContent, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.border }]}>
              <Text style={[styles.modalHeaderTitle, { color: themeColors.text }]}>Select Attending Doctor</Text>
              <TouchableOpacity onPress={() => setShowDoctorModal(false)}>
                <Text style={[styles.modalCloseText, { color: themeColors.accent }]}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <TextInput
                style={[styles.modalSearchInput, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
                placeholder="🔍 Type doctor name to search..."
                placeholderTextColor={themeColors.subText}
                value={doctorSearch}
                onChangeText={setDoctorSearch}
              />
            </View>

            <FlatList
              data={[{ id: '', full_name: 'Unassigned Doctor' }, ...filteredDoctors]}
              keyExtractor={(item) => item.id || 'unassigned'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownOptionRow,
                    { borderBottomColor: themeColors.border },
                    doctorId === item.id && { backgroundColor: themeColors.accentBg },
                  ]}
                  onPress={() => {
                    setDoctorId(item.id);
                    setShowDoctorModal(false);
                    setDoctorSearch('');
                  }}
                >
                  <Text style={[styles.dropdownOptionText, { color: doctorId === item.id ? themeColors.accent : themeColors.text }]}>
                    👨‍⚕️ {item.full_name}
                  </Text>
                  {doctorId === item.id && <Text style={{ color: themeColors.accent, fontWeight: 'bold' }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
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
  dismissBtn: {
    paddingVertical: 6,
    paddingLeft: 12,
  },
  dismissText: {
    fontSize: 14,
  },
  form: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    marginTop: 16,
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  dropdownTrigger: {
    height: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownTriggerText: {
    fontSize: 14,
    flex: 1,
  },
  dropdownArrow: {
    fontSize: 12,
    marginLeft: 8,
  },
  multiline: {
    height: 64,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  submitBtn: {
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dropdownModalContent: {
    height: '70%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalSearchBox: {
    marginVertical: 12,
  },
  modalSearchInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  dropdownOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
