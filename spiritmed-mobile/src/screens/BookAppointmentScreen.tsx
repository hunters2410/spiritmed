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
  Keyboard,
  Modal,
} from 'react-native';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, Patient, Doctor } from '../types';
import { triggerAppointmentNotifications } from '../lib/notifications';
import { fetchAllPatients, filterPatients } from '../utils/patientLoader';

type BookAppointmentScreenNavigationProp = StackNavigationProp<RootStackParamList, 'BookAppointment'>;
type BookAppointmentScreenRouteProp = RouteProp<RootStackParamList, 'BookAppointment'>;

interface Props {
  navigation: BookAppointmentScreenNavigationProp;
  route: BookAppointmentScreenRouteProp;
}

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30',
  '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30',
];

export function BookAppointmentScreen({ navigation, route }: Props) {
  const initialPatientId = route.params?.patientId;
  const { themeColors, isDark } = useTheme();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedSlot, setSelectedSlot] = useState<string>('09:00');
  const [appointmentType, setAppointmentType] = useState<string>('consultation');
  const [appointmentStatus, setAppointmentStatus] = useState<string>('pending_confirmation');
  const [notes, setNotes] = useState<string>('');
  const [patientSearch, setPatientSearch] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Add New Patient modal ──────────────────────────────────────────────────
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientTitle, setNewPatientTitle] = useState('');
  const [newPatientFileNo, setNewPatientFileNo] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [savingNewPatient, setSavingNewPatient] = useState(false);
  // ── File number uniqueness check ───────────────────────────────────────────
  const [fileNoTaken, setFileNoTaken] = useState(false);
  const [fileNoTakenBy, setFileNoTakenBy] = useState('');
  const [checkingFileNo, setCheckingFileNo] = useState(false);

  // Booked Slots State
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [checkingSlots, setCheckingSlots] = useState<boolean>(false);

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    const q = patientSearch.trim();
    if (!q) {
      setPatients([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      fetchPatients(q);
    }, 250);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  useEffect(() => {
    if (selectedDoctorId && appointmentDate) {
      fetchBookedSlots(selectedDoctorId, appointmentDate);
    } else {
      setBookedSlots([]);
    }
  }, [selectedDoctorId, appointmentDate]);

  // ─── File number uniqueness check — debounced 500 ms ─────────────────────
  useEffect(() => {
    const val = newPatientFileNo.trim();
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
  }, [newPatientFileNo]);

  const fetchDoctors = async () => {
    try {
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

      // Query ONLY active users with role = 'doctor'
      let query = supabase
        .from('users')
        .select('id, full_name, specialization, role, branch_id')
        .eq('role', 'doctor')
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data: dData } = await query;

      if (dData && dData.length > 0) {
        setDoctors(dData);
        if (!selectedDoctorId) {
          setSelectedDoctorId(dData[0].id);
        }
      } else {
        // Fallback: If branch has no specific doctor profile, query doctors
        const { data: fallbackDocs } = await supabase
          .from('users')
          .select('id, full_name, specialization, role')
          .eq('role', 'doctor')
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (fallbackDocs) {
          setDoctors(fallbackDocs);
          if (fallbackDocs.length > 0 && !selectedDoctorId) {
            setSelectedDoctorId(fallbackDocs[0].id);
          }
        }
      }
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

  // ─── Generate next sequential patient number from DB ──────────────────────
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

  const handleAddNewPatient = async () => {
    if (!newPatientName.trim()) {
      Alert.alert('Required', 'Patient full name is required.');
      return;
    }
    try {
      setSavingNewPatient(true);
      const patientNumber = await generateNextPatientNumber();
      const { data, error } = await supabaseAdmin
        .from('patients')
        .insert([{
          full_name: newPatientName.trim(),
          title: newPatientTitle.trim() || null,
          file_number: newPatientFileNo.trim() || null,
          phone: newPatientPhone.trim() || null,
          patient_number: patientNumber,
          status: 'active',
        }])
        .select('id, full_name, patient_number, file_number, phone, email, title')
        .single();
      if (error) throw error;
      setPatients((prev) => [data, ...prev]);
      setSelectedPatientId(data.id);
      setShowAddPatient(false);
      setNewPatientName('');
      setNewPatientTitle('');
      setNewPatientFileNo('');
      setNewPatientPhone('');
      setFileNoTaken(false);
      setFileNoTakenBy('');
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not add patient.');
    } finally {
      setSavingNewPatient(false);
    }
  };

  const fetchBookedSlots = async (doctorId: string, dateStr: string) => {
    try {
      setCheckingSlots(true);
      const startOfDay = `${dateStr}T00:00:00`;
      const endOfDay = `${dateStr}T23:59:59`;

      const { data, error } = await supabase
        .from('appointments')
        .select('appointment_date, status')
        .eq('doctor_id', doctorId)
        .gte('appointment_date', startOfDay)
        .lte('appointment_date', endOfDay)
        .neq('status', 'cancelled');

      if (error) throw error;

      const takenTimes = (data || []).map((appt) => {
        const rawDate = appt.appointment_date;
        if (rawDate.includes('T')) {
          return rawDate.split('T')[1].substring(0, 5);
        } else if (rawDate.includes(' ')) {
          return rawDate.split(' ')[1].substring(0, 5);
        }
        return '';
      }).filter(Boolean);

      setBookedSlots(takenTimes);

      if (takenTimes.includes(selectedSlot)) {
        const available = TIME_SLOTS.find((s) => !takenTimes.includes(s));
        if (available) setSelectedSlot(available);
      }
    } catch (e) {
      console.error('Error fetching booked slots:', e);
    } finally {
      setCheckingSlots(false);
    }
  };

  const handleBookAppointment = async () => {
    Keyboard.dismiss();
    if (!selectedPatientId) {
      Alert.alert('Required', 'Please select a patient first.');
      return;
    }
    if (!selectedDoctorId) {
      Alert.alert('Required', 'Please select a doctor.');
      return;
    }
    if (bookedSlots.includes(selectedSlot)) {
      Alert.alert('Slot Unavailable', `The time slot ${selectedSlot} is already booked on ${appointmentDate}.`);
      return;
    }

    try {
      setSubmitting(true);
      const finalDateTime = `${appointmentDate}T${selectedSlot}:00`;
      const startOfDay = `${appointmentDate}T00:00:00`;
      const endOfDay = `${appointmentDate}T23:59:59`;

      // Check double booking for patient on same date
      const { data: existingPatientAppt } = await supabase
        .from('appointments')
        .select('id, appointment_date')
        .eq('patient_id', selectedPatientId)
        .gte('appointment_date', startOfDay)
        .lte('appointment_date', endOfDay)
        .neq('status', 'cancelled');

      if (existingPatientAppt && existingPatientAppt.length > 0) {
        const patient = patients.find((p) => p.id === selectedPatientId);
        Alert.alert(
          'Duplicate Booking Blocked',
          `Patient "${patient?.full_name || 'Selected patient'}" already has an active appointment booked on ${appointmentDate}.`
        );
        setSubmitting(false);
        return;
      }

      const { error: apptError } = await supabaseAdmin
        .from('appointments')
        .insert([
          {
            patient_id: selectedPatientId,
            doctor_id: selectedDoctorId,
            appointment_date: finalDateTime,
            appointment_type: appointmentType,
            status: appointmentStatus,
            notes: notes.trim() || null,
            duration_minutes: 30,
          },
        ]);

      if (apptError) throw apptError;

      const patient = patients.find((p) => p.id === selectedPatientId);
      const doctor = doctors.find((d) => d.id === selectedDoctorId);

      // Trigger SMS & Email Notifications automatically
      let notifStr = '';
      try {
        const notifRes = await triggerAppointmentNotifications({
          patientId: selectedPatientId,
          patientName: patient?.full_name || 'Patient',
          patientPhone: patient?.phone,
          patientEmail: patient?.email,
          doctorName: doctor?.full_name || 'Doctor',
          appointmentDate: appointmentDate,
          appointmentTime: selectedSlot,
          appointmentStatus: appointmentStatus,
          branchId: (patient as any)?.branch_id || null,
        });

        const notifSummary = [];
        if (notifRes.smsSent) notifSummary.push('SMS Dispatched');
        if (notifRes.emailSent) notifSummary.push('Email Sent');
        if (notifSummary.length > 0) {
          notifStr = `\n\nNotifications: ${notifSummary.join(' • ')}`;
        }
      } catch (notifErr) {
        console.error('Notification dispatch error:', notifErr);
      }

      Alert.alert(
        'Appointment Booked',
        `Booked for ${patient?.full_name || 'Patient'} on ${appointmentDate} at ${selectedSlot}.\nStatus: ${appointmentStatus.toUpperCase()}${notifStr}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Booking Error', err.message || 'Failed to book appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const setDatePreset = (daysAhead: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    setAppointmentDate(d.toISOString().split('T')[0]);
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);
  const availableSlotsCount = TIME_SLOTS.filter((s) => !bookedSlots.includes(s)).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: themeColors.accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Book Appointment</Text>
        <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.dismissBtn}>
          <Text style={[styles.dismissText, { color: themeColors.subText }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          {/* Section 1: Patient Selection */}
          <Text style={[styles.sectionTitle, { color: themeColors.accent }]}>1. Patient *</Text>
          {selectedPatient ? (
            <View style={[styles.selectedBox, { backgroundColor: themeColors.accentBg, borderColor: themeColors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedName, { color: themeColors.text }]}>{selectedPatient.full_name}</Text>
                <Text style={[styles.selectedSub, { color: themeColors.accent }]}>
                  ID: {selectedPatient.patient_number || 'N/A'} • File: {selectedPatient.file_number ? selectedPatient.file_number.split('-')[0] : 'NO FILE'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedPatientId('')}
                style={[styles.changeBtn, { backgroundColor: themeColors.bg, borderColor: themeColors.accent }]}
              >
                <Text style={[styles.changeBtnText, { color: themeColors.accent }]}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.searchBox, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
              <TextInput
                style={[
                  styles.searchInput,
                  {
                    backgroundColor: themeColors.inputBg,
                    borderColor: themeColors.inputBorder,
                    color: themeColors.text,
                  },
                ]}
                placeholder="Search patient name, ID, or file..."
                placeholderTextColor={themeColors.subText}
                value={patientSearch}
                onChangeText={setPatientSearch}
              />

              {patientSearch.trim().length === 0 ? (
                <Text style={[styles.helperText, { color: themeColors.subText }]}>
                  Type to search patients...
                </Text>
              ) : loading ? (
                <ActivityIndicator color={themeColors.accent} size="small" style={{ marginVertical: 8 }} />
              ) : patients.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={[styles.helperText, { color: themeColors.subText }]}>
                    No matching patients found.
                  </Text>
                  <TouchableOpacity
                    style={[styles.addPatientBtn, { backgroundColor: '#16A34A' }]}
                    onPress={() => { setNewPatientName(patientSearch); setShowAddPatient(true); }}
                  >
                    <Text style={styles.addPatientBtnText}>+ Add New Patient</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                patients.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.patientRow, { borderBottomColor: themeColors.border }]}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSelectedPatientId(p.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.patientName, { color: themeColors.text }]}>{p.full_name}</Text>
                      <Text style={[styles.patientSub, { color: themeColors.subText }]}>
                        ID: {p.patient_number || 'N/A'}
                      </Text>
                    </View>
                    <Text style={[styles.patientBadge, { color: p.file_number ? themeColors.accent : themeColors.subText }]}>
                      {p.file_number ? `File: ${p.file_number.split('-')[0]}` : 'NO FILE'}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Section 2: Doctor Selection */}
          <Text style={[styles.sectionTitle, { color: themeColors.accent, marginTop: 14 }]}>2. Doctor *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
            {doctors.map((d) => {
              const isSelected = d.id === selectedDoctorId;
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? themeColors.accentBg : themeColors.cardBg,
                      borderColor: isSelected ? themeColors.accent : themeColors.border,
                    },
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSelectedDoctorId(d.id);
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? themeColors.accent : themeColors.text, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {d.full_name.toLowerCase().startsWith('dr.') || d.full_name.toLowerCase().startsWith('dr ')
                      ? d.full_name
                      : d.full_name.toLowerCase().startsWith('doctor ')
                      ? `Dr. ${d.full_name.slice(7)}`
                      : `Dr. ${d.full_name}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Section 3: Date Selection */}
          <Text style={[styles.sectionTitle, { color: themeColors.accent, marginTop: 14 }]}>3. Date (YYYY-MM-DD) *</Text>
          <View style={styles.presetRow}>
            {[
              { label: 'Today', days: 0 },
              { label: 'Tomorrow', days: 1 },
              { label: '+2 Days', days: 2 },
              { label: '+3 Days', days: 3 },
            ].map((dp) => (
              <TouchableOpacity
                key={dp.label}
                style={[styles.presetBtn, { borderColor: themeColors.border }]}
                onPress={() => setDatePreset(dp.days)}
              >
                <Text style={[styles.presetBtnText, { color: themeColors.text }]}>{dp.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: themeColors.inputBg,
                borderColor: themeColors.inputBorder,
                color: themeColors.text,
                marginTop: 6,
              },
            ]}
            value={appointmentDate}
            onChangeText={setAppointmentDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={themeColors.subText}
          />

          {/* Section 4: Available Time Slots */}
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionTitle, { color: themeColors.accent, marginTop: 14 }]}>
              4. Time Slot *
            </Text>
            {checkingSlots && <ActivityIndicator size="small" color={themeColors.accent} style={{ marginTop: 14 }} />}
          </View>

          {/* Availability Status Banner */}
          <View style={[
            styles.banner,
            {
              backgroundColor: availableSlotsCount > 0 ? (isDark ? '#064E3B' : '#ECFDF5') : (isDark ? '#7F1D1D' : '#FEF2F2'),
              borderColor: availableSlotsCount > 0 ? '#10B981' : '#EF4444',
            }
          ]}>
            <Text style={[
              styles.bannerText,
              { color: availableSlotsCount > 0 ? (isDark ? '#A7F3D0' : '#065F46') : (isDark ? '#FCA5A5' : '#991B1B') }
            ]}>
              {availableSlotsCount > 0
                ? `✅ ${availableSlotsCount} Available Slots, ${bookedSlots.length} Booked`
                : `⚠️ All slots booked on ${appointmentDate}`}
            </Text>
          </View>

          {/* Time Slots Grid */}
          <View style={styles.grid}>
            {TIME_SLOTS.map((slot) => {
              const isBooked = bookedSlots.includes(slot);
              const isSelected = selectedSlot === slot;

              return (
                <TouchableOpacity
                  key={slot}
                  disabled={isBooked}
                  style={[
                    styles.slotItem,
                    {
                      backgroundColor: isBooked
                        ? (isDark ? '#374151' : '#F3F4F6')
                        : isSelected
                        ? themeColors.accent
                        : themeColors.cardBg,
                      borderColor: isBooked
                        ? (isDark ? '#4B5563' : '#E5E7EB')
                        : isSelected
                        ? themeColors.accent
                        : themeColors.border,
                      opacity: isBooked ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => setSelectedSlot(slot)}
                >
                  <Text
                    style={[
                      styles.slotTimeText,
                      {
                        color: isBooked
                          ? '#9CA3AF'
                          : isSelected
                          ? '#FFFFFF'
                          : themeColors.text,
                        fontWeight: isSelected ? '700' : '600',
                      },
                    ]}
                  >
                    {slot}
                  </Text>
                  <Text
                    style={[
                      styles.slotSubText,
                      {
                        color: isBooked
                          ? '#EF4444'
                          : isSelected
                          ? '#DCFCE7'
                          : '#16A34A',
                      },
                    ]}
                  >
                    {isBooked ? 'Booked' : 'Available'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Section 5: Status */}
          <Text style={[styles.sectionTitle, { color: themeColors.accent, marginTop: 14 }]}>5. Status</Text>
          <View style={styles.pillRow}>
            {[
              { id: 'pending_confirmation', label: 'Pending Confirmation', color: '#D97706' },
              { id: 'confirmed', label: 'Confirmed', color: '#16A34A' },
              { id: 'treated', label: 'Treated', color: '#7C3AED' },
              { id: 'completed', label: 'Completed', color: '#0284C7' },
              { id: 'cancelled', label: 'Cancelled', color: '#DC2626' },
            ].map((st) => {
              const isSelected = appointmentStatus === st.id;
              return (
                <TouchableOpacity
                  key={st.id}
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isSelected ? st.color : themeColors.cardBg,
                      borderColor: isSelected ? st.color : themeColors.border,
                    },
                  ]}
                  onPress={() => setAppointmentStatus(st.id)}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isSelected ? '#FFFFFF' : themeColors.text, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Section 6: Type */}
          <Text style={[styles.sectionTitle, { color: themeColors.accent, marginTop: 14 }]}>6. Visit Type</Text>
          <View style={styles.pillRow}>
            {[
              { id: 'consultation', name: 'New Consultation' },
              { id: 'initial_new_old', name: 'Initial - New Old Patient' },
              { id: 'review', name: 'Review' },
              { id: 'emergency', name: 'Emergency' },
              { id: 'procedure', name: 'Procedure' },
            ].map((t) => {
              const isSelected = appointmentType === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.typePill,
                    {
                      backgroundColor: isSelected ? themeColors.accentBg : themeColors.cardBg,
                      borderColor: isSelected ? themeColors.accent : themeColors.border,
                    },
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setAppointmentType(t.id);
                  }}
                >
                  <Text
                    style={[
                      styles.typePillText,
                      { color: isSelected ? themeColors.accent : themeColors.subText, fontWeight: isSelected ? '700' : '500' },
                    ]}
                  >
                    {t.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Section 7: Notes */}
          <Text style={[styles.sectionTitle, { color: themeColors.accent, marginTop: 14 }]}>7. Remarks / Notes</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: themeColors.inputBg,
                borderColor: themeColors.inputBorder,
                color: themeColors.text,
                height: 56,
                textAlignVertical: 'top',
                paddingTop: 8,
              },
            ]}
            placeholder="Additional notes..."
            placeholderTextColor={themeColors.subText}
            multiline
            value={notes}
            onChangeText={setNotes}
          />

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              {
                backgroundColor: availableSlotsCount === 0 || bookedSlots.includes(selectedSlot)
                  ? '#9CA3AF'
                  : themeColors.accent,
              },
            ]}
            onPress={handleBookAppointment}
            disabled={submitting || availableSlotsCount === 0 || bookedSlots.includes(selectedSlot)}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>
                Confirm Booking ({selectedSlot})
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Add New Patient Modal ── */}
      <Modal
        visible={showAddPatient}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddPatient(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.modalTitle, { color: themeColors.text }]}>Add New Patient</Text>
            <Text style={[styles.modalSub, { color: themeColors.subText }]}>Quick registration — fill in available details</Text>

            <Text style={[styles.modalLabel, { color: themeColors.subText }]}>TITLE</Text>
            <View style={styles.titleRow}>
              {['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.titleChip,
                    { borderColor: newPatientTitle === t ? themeColors.accent : themeColors.border },
                    newPatientTitle === t && { backgroundColor: themeColors.accentBg },
                  ]}
                  onPress={() => setNewPatientTitle(newPatientTitle === t ? '' : t)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: newPatientTitle === t ? themeColors.accent : themeColors.subText }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalLabel, { color: themeColors.subText }]}>FULL NAME *</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              value={newPatientName}
              onChangeText={setNewPatientName}
              placeholder="e.g. John Doe"
              placeholderTextColor={themeColors.subText}
            />

            <Text style={[styles.modalLabel, { color: themeColors.subText }]}>FILE NUMBER</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: themeColors.inputBg, borderColor: fileNoTaken ? '#EF4444' : themeColors.inputBorder, borderWidth: fileNoTaken ? 2 : 1, color: themeColors.text, marginBottom: fileNoTaken ? 2 : undefined }]}
              value={newPatientFileNo}
              onChangeText={setNewPatientFileNo}
              placeholder="e.g. 5511"
              placeholderTextColor={themeColors.subText}
              keyboardType="default"
            />
            {checkingFileNo && newPatientFileNo.trim().length > 0 && (
              <ActivityIndicator size="small" color={themeColors.accent} style={{ alignSelf: 'flex-start', marginBottom: 8 }} />
            )}
            {fileNoTaken && (
              <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '600', marginBottom: 10, marginTop: 2 }}>
                ⚠️ Already in use by {fileNoTakenBy}
              </Text>
            )}

            <Text style={[styles.modalLabel, { color: themeColors.subText }]}>PHONE</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              value={newPatientPhone}
              onChangeText={setNewPatientPhone}
              placeholder="e.g. +263 77 123 4567"
              placeholderTextColor={themeColors.subText}
              keyboardType="phone-pad"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={() => setShowAddPatient(false)}
                style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: themeColors.subText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddNewPatient}
                disabled={savingNewPatient || fileNoTaken || checkingFileNo}
                style={[styles.modalSaveBtn, { backgroundColor: (savingNewPatient || fileNoTaken || checkingFileNo) ? '#9CA3AF' : themeColors.accent }]}
              >
                {savingNewPatient
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>Add Patient</Text>
                }
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
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  dismissBtn: {
    paddingVertical: 4,
    paddingLeft: 8,
  },
  dismissText: {
    fontSize: 13,
  },
  form: {
    padding: 14,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  searchInput: {
    height: 38,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  searchBox: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
  },
  helperText: {
    fontSize: 11,
    textAlign: 'center',
    marginVertical: 8,
  },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  patientName: {
    fontSize: 13,
    fontWeight: '700',
  },
  patientSub: {
    fontSize: 11,
    marginTop: 1,
  },
  patientBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  selectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  selectedName: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectedSub: {
    fontSize: 11,
    marginTop: 1,
  },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  horizontalScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  presetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderRadius: 12,
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '500',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginVertical: 6,
  },
  bannerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 4,
  },
  slotItem: {
    width: '23%',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotTimeText: {
    fontSize: 12,
  },
  slotSubText: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 11,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  typePillText: {
    fontSize: 11,
  },
  submitBtn: {
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 16,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  addPatientBtn: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addPatientBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  modalSub: {
    fontSize: 12,
    marginBottom: 14,
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  titleChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 2,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
