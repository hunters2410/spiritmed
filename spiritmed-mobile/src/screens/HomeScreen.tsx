import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Image,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

interface Props {
  navigation: HomeScreenNavigationProp;
}

export function HomeScreen({ navigation }: Props) {
  const { profile, user, hasPermission, signOut } = useAuth();
  const [patientCount, setPatientCount] = useState<number>(0);
  const [appointmentCount, setAppointmentCount] = useState<number>(0);
  const [consultationCount, setConsultationCount] = useState<number>(0);
  const [operationCount, setOperationCount] = useState<number>(0);
  const [prescriptionCount, setPrescriptionCount] = useState<number>(0);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const { isDark, toggleTheme, themeColors } = useTheme();

  useEffect(() => {
    fetchStats();
  }, [profile?.id]);

  const fetchStats = async () => {
    try {
      if (hasPermission('patients', 'view')) {
        const { count: pCount } = await supabase
          .from('patients')
          .select('*', { count: 'exact', head: true });
        if (pCount !== null) setPatientCount(pCount);
      }

      if (hasPermission('appointments', 'view')) {
        const { count: aCount } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true });
        if (aCount !== null) setAppointmentCount(aCount);
      }

      if (hasPermission('medical_records', 'view')) {
        const { count: cCount } = await supabase
          .from('consultations')
          .select('*', { count: 'exact', head: true });
        if (cCount !== null) setConsultationCount(cCount);
      }

      if (hasPermission('clinical_reports', 'view')) {
        const { count: oCount } = await supabase
          .from('operation_reports')
          .select('*', { count: 'exact', head: true });
        if (oCount !== null) setOperationCount(oCount);
      }

      if (hasPermission('prescriptions', 'view') || hasPermission('medical_records', 'view')) {
        const { count: rxCount } = await supabase
          .from('prescriptions')
          .select('*', { count: 'exact', head: true });
        if (rxCount !== null) setPrescriptionCount(rxCount);
      }
    } catch (e) {
      console.error('Error loading stats:', e);
    }
  };

  const handleLogout = async () => {
    setUserMenuVisible(false);
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
        },
      },
    ]);
  };

  const userDisplayName = profile?.full_name || user?.email?.split('@')[0] || 'Staff Member';
  const roleLabel = (profile?.role || 'Staff').toUpperCase();
  const specializationLabel = profile?.specialization ? ` • ${profile.specialization}` : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

      {/* Compact Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../assets/favicon.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerRight}>
          {/* Direct 1-Tap Theme Switcher Icon */}
          <TouchableOpacity
            style={[
              styles.themeSwitchBtn,
              { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
            ]}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>

          {/* User Profile Avatar */}
          <TouchableOpacity
            style={[
              styles.userAvatarCircle,
              { backgroundColor: themeColors.accentBg, borderColor: themeColors.accent },
            ]}
            onPress={() => setUserMenuVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.userAvatarIcon}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* User Profile Dropdown Modal */}
      <Modal
        visible={userMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUserMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setUserMenuVisible(false)}>
          <View style={[styles.menuCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={styles.menuHeader}>
              <View style={[styles.menuAvatarCircle, { backgroundColor: themeColors.accentBg, borderColor: themeColors.accent }]}>
                <Text style={styles.menuAvatarIcon}>👤</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.menuUserName, { color: themeColors.text }]}>
                  {userDisplayName}
                </Text>
                <Text style={[styles.menuUserEmail, { color: themeColors.subText }]}>
                  {user?.email || 'staff@spiritmed.com'}
                </Text>
                <Text style={[styles.menuRolePill, { color: themeColors.accent }]}>
                  {roleLabel}{specializationLabel}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

            <TouchableOpacity
              style={styles.menuOption}
              onPress={() => {
                setUserMenuVisible(false);
                toggleTheme();
              }}
            >
              <Text style={styles.menuOptionIcon}>{isDark ? '☀️' : '🌙'}</Text>
              <Text style={[styles.menuOptionText, { color: themeColors.text }]}>
                Switch to {isDark ? 'Light' : 'Dark'} Theme
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuOption}
              onPress={() => {
                setUserMenuVisible(false);
                navigation.navigate('SettingsTab' as any);
              }}
            >
              <Text style={styles.menuOptionIcon}>⚙️</Text>
              <Text style={[styles.menuOptionText, { color: themeColors.text }]}>Permissions & Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuOption} onPress={handleLogout}>
              <Text style={styles.menuOptionIcon}>🚪</Text>
              <Text style={[styles.menuOptionText, { color: '#DC2626' }]}>Sign Out / Logout</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Scrollable Container for Actions */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* Stats Row (Visible if user has permissions for patients or appointments) */}
        {(hasPermission('patients', 'view') || hasPermission('appointments', 'view')) && (
          <View style={styles.statsRow}>
            {hasPermission('patients', 'view') && (
              <View style={[styles.statBoxLarge, { backgroundColor: isDark ? '#15803D' : '#16A34A' }]}>
                <View style={styles.statHeaderRow}>
                  <Text style={styles.statNumLarge}>{patientCount.toLocaleString()}</Text>
                </View>
                <Text style={styles.statLabelLarge}>Patients</Text>
              </View>
            )}

            {hasPermission('appointments', 'view') && (
              <View style={[styles.statBoxLarge, { backgroundColor: isDark ? '#0369A1' : '#0284C7' }]}>
                <View style={styles.statHeaderRow}>
                  <Text style={styles.statNumLarge}>{appointmentCount.toLocaleString()}</Text>
                </View>
                <Text style={styles.statLabelLarge}>Appointments</Text>
              </View>
            )}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: themeColors.subText }]}>PERMITTED ACTIONS</Text>

        {/* 1. Add Patient (Requires patients.add) */}
        {hasPermission('patients', 'add') && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#1E3A8A' : '#2563EB' }]}
            onPress={() => navigation.navigate('AddPatient')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>Add Patient</Text>
              <Text style={styles.blueActionSub}>Register a new patient</Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 2. Upload Patient Files (Requires patients.add or patients.edit) */}
        {(hasPermission('patients', 'add') || hasPermission('patients', 'edit')) && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#1D4ED8' : '#0284C7' }]}
            onPress={() => navigation.navigate('UploadFile')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>Upload Single Patient Files</Text>
              <Text style={styles.blueActionSub}>Attach documents or photos</Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 3. Rapid Bulk Digitization Mode (Requires patients.add) */}
        {hasPermission('patients', 'add') && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#B45309' : '#D97706' }]}
            onPress={() => navigation.navigate('RapidDigitize')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>Upload Bulk Patient Files</Text>
              <Text style={styles.blueActionSub}>High-speed scan mode</Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 4. View Patient Details (Requires patients.view) */}
        {hasPermission('patients', 'view') && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#0369A1' : '#0D9488' }]}
            onPress={() => navigation.navigate('PatientDetails')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>View Patient Details</Text>
              <Text style={styles.blueActionSub}>Search directory & files</Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 5. Book Appointment (Requires appointments.view or appointments.add) */}
        {(hasPermission('appointments', 'view') || hasPermission('appointments', 'add')) && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#1E40AF' : '#3B82F6' }]}
            onPress={() => navigation.navigate('BookAppointment')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>Book Appointment</Text>
              <Text style={styles.blueActionSub}>Schedule patient visit</Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 6. Clinical Consultations (Requires medical_records.view or medical_records.add) */}
        {(hasPermission('medical_records', 'view') || hasPermission('medical_records', 'add')) && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#4338CA' : '#4F46E5' }]}
            onPress={() => navigation.navigate('Consultations')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>🩺 Clinical Consultations</Text>
              <Text style={styles.blueActionSub}>
                {consultationCount > 0 ? `${consultationCount} recorded • ` : ''}Record visits, diagnosis & Rx
              </Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 7. Operation Reports (Requires clinical_reports.view or clinical_reports.add) */}
        {(hasPermission('clinical_reports', 'view') || hasPermission('clinical_reports', 'add')) && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#0E7490' : '#0891B2' }]}
            onPress={() => navigation.navigate('OperationReports')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>📋 Operation Reports</Text>
              <Text style={styles.blueActionSub}>
                {operationCount > 0 ? `${operationCount} reports • ` : ''}Surgical notes & post-op plans
              </Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 8. Prescriptions (Requires prescriptions.view or medical_records.view) */}
        {(hasPermission('prescriptions', 'view') || hasPermission('medical_records', 'view') || hasPermission('prescriptions', 'add')) && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#047857' : '#059669' }]}
            onPress={() => navigation.navigate('Prescriptions')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>💊 Prescriptions</Text>
              <Text style={styles.blueActionSub}>
                {prescriptionCount > 0 ? `${prescriptionCount} issued • ` : ''}Medications, dosages & PDF forms
              </Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* 9. Internal Staff Chat (Always accessible to all authenticated staff) */}
        {hasPermission('communication', 'view') && (
          <TouchableOpacity
            style={[styles.blueActionCard, { backgroundColor: isDark ? '#15803D' : '#10B981' }]}
            onPress={() => navigation.navigate('Chat')}
            activeOpacity={0.85}
          >
            <View style={styles.actionInfo}>
              <Text style={styles.blueActionTitle}>💬 Internal Staff Chat</Text>
              <Text style={styles.blueActionSub}>Direct messaging & voice notes</Text>
            </View>
            <Text style={styles.blueArrow}>›</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 48,
    height: 48,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  welcomeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  roleSubBadge: {
    fontSize: 10,
    fontWeight: '700',
  },
  themeSwitchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarIcon: {
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 40 : 60,
    paddingRight: 16,
  },
  menuCard: {
    width: 250,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  menuAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuAvatarIcon: {
    fontSize: 18,
  },
  menuUserName: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  menuUserEmail: {
    fontSize: 10,
  },
  menuRolePill: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginVertical: 6,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 8,
    gap: 8,
  },
  menuOptionIcon: {
    fontSize: 15,
  },
  menuOptionText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  content: {
    padding: 14,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statBoxLarge: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statNumLarge: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabelLarge: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 2,
  },
  blueActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionInfo: {
    flex: 1,
  },
  blueActionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  blueActionSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    marginTop: 2,
  },
  blueArrow: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});
