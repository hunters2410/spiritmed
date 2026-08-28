import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  StatusBar,
  Platform,
  Switch,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';

type SettingsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Settings'>;

interface Props {
  navigation: SettingsScreenNavigationProp;
}

export function SettingsScreen({ navigation }: Props) {
  const { profile, user, hasPermission, signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const { isDark, toggleTheme, themeColors } = useTheme();

  const handleLogout = async () => {
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

  const permissionsList = [
    { label: '👥 Patients Management', granted: hasPermission('patients', 'view') },
    { label: '➕ Add & Register Patients', granted: hasPermission('patients', 'add') },
    { label: '📅 Appointments & Scheduling', granted: hasPermission('appointments', 'view') },
    { label: '🩺 Clinical Consultations', granted: hasPermission('consultations', 'view') || hasPermission('medical_records', 'view') },
    { label: '💊 Prescriptions & Drugs', granted: hasPermission('prescriptions', 'view') || hasPermission('medical_records', 'view') },
    { label: '📋 Operation Reports', granted: hasPermission('operation_reports', 'view') || hasPermission('clinical_reports', 'view') },
    { label: '💬 Internal Staff Chat', granted: hasPermission('communication', 'view') || hasPermission('chats', 'view') },
    { label: '📄 File Digitization', granted: hasPermission('patient_files', 'view') || hasPermission('patients', 'view') },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Settings & Role Access</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User Profile Card */}
        <View style={[styles.userCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <View style={[styles.avatar, { backgroundColor: themeColors.accentBg, borderColor: themeColors.accent }]}>
            <Text style={{ fontSize: 22 }}>👤</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: themeColors.text }]}>
              {userDisplayName}
            </Text>
            <Text style={[styles.userEmail, { color: themeColors.subText }]}>
              {user?.email || 'staff@spiritmed.com'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <View style={[styles.roleBadge, { backgroundColor: themeColors.accentBg }]}>
                <Text style={[styles.roleBadgeText, { color: themeColors.accent }]}>
                  {roleLabel}{specializationLabel}
                </Text>
              </View>
            </View>
          </View>
          <View style={[styles.activePill, { backgroundColor: themeColors.accentBg }]}>
            <Text style={[styles.activePillText, { color: themeColors.accent }]}>Active</Text>
          </View>
        </View>

        {/* Role & Permissions Overview Card */}
        <Text style={[styles.sectionHeading, { color: themeColors.subText }]}>ROLE & PERMITTED ACCESS</Text>
        <View style={[styles.cardGroup, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border, marginBottom: 18 }]}>
          {permissionsList.map((item, idx) => (
            <View key={idx}>
              <View style={styles.permRow}>
                <Text style={[styles.permLabel, { color: themeColors.text }]}>{item.label}</Text>
                <View
                  style={[
                    styles.permStatusBadge,
                    item.granted
                      ? { backgroundColor: isDark ? '#14532D' : '#DCFCE7' }
                      : { backgroundColor: isDark ? '#3B1219' : '#FEE2E2' },
                  ]}
                >
                  <Text
                    style={[
                      styles.permStatusText,
                      item.granted ? { color: '#16A34A' } : { color: '#DC2626' },
                    ]}
                  >
                    {item.granted ? '✓ Allowed' : '✕ Restricted'}
                  </Text>
                </View>
              </View>
              {idx < permissionsList.length - 1 && (
                <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
              )}
            </View>
          ))}
        </View>

        {/* System Settings Group */}
        <Text style={[styles.sectionHeading, { color: themeColors.subText }]}>PREFERENCES</Text>
        <View style={[styles.cardGroup, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          {/* Theme Switcher Row */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: themeColors.text }]}>🎨 Dark Mode</Text>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: '#E5E7EB', true: '#059669' }}
              thumbColor={isDark ? '#10B981' : '#9CA3AF'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          {/* Notifications Toggle */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: themeColors.text }]}>🔔 Sound & Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#E5E7EB', true: '#059669' }}
              thumbColor={notificationsEnabled ? '#10B981' : '#9CA3AF'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

          {/* Cloud Status */}
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: themeColors.text }]}>☁️ Supabase Cloud</Text>
            <Text style={[styles.valueText, { color: themeColors.accent }]}>Connected</Text>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Text style={styles.logoutBtnText}>Sign Out / Logout</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, { color: themeColors.subText }]}>
          SpiritMed Mobile v1.0 • {isDark ? 'Dark Mode' : 'Light Mode'}
        </Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  userEmail: {
    fontSize: 11,
    marginTop: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  activePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },
  cardGroup: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  permLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  permStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  permStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  settingLabel: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  valueText: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
  },
  logoutBtn: {
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  versionText: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
});
