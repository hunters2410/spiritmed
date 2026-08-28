import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, View, Text } from 'react-native';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ChatProvider, useChatUnread } from './src/context/ChatContext';
import { RootStackParamList } from './src/types';

import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AddPatientScreen } from './src/screens/AddPatientScreen';
import { UploadFileScreen } from './src/screens/UploadFileScreen';
import { PatientDetailsScreen } from './src/screens/PatientDetailsScreen';
import { BookAppointmentScreen } from './src/screens/BookAppointmentScreen';
import { SmartScanScreen } from './src/screens/SmartScanScreen';
import { RapidDigitizationScreen } from './src/screens/RapidDigitizationScreen';
import { ConsultationsScreen } from './src/screens/ConsultationsScreen';
import { OperationReportsScreen } from './src/screens/OperationReportsScreen';
import { PrescriptionsScreen } from './src/screens/PrescriptionsScreen';
import { ChatScreen } from './src/screens/ChatScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const { themeColors } = useTheme();
  const { unreadCount } = useChatUnread();
  const bottomPadding = insets.bottom > 0 ? insets.bottom + 6 : 26;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: themeColors.accent,
        tabBarInactiveTintColor: themeColors.subText,
        tabBarStyle: {
          backgroundColor: themeColors.bg,
          borderTopWidth: 1,
          borderTopColor: themeColors.border,
          height: 56 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          elevation: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="ChatTab"
        component={ChatScreen}
        options={{
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color }) => (
            <View style={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
              <Text style={{ fontSize: 20, color }}>💬</Text>
              {unreadCount > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -3,
                    right: -10,
                    backgroundColor: '#EF4444',
                    borderRadius: 10,
                    minWidth: 18,
                    height: 18,
                    paddingHorizontal: 4,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: themeColors.bg,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>⚙️</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

function MainAppContent() {
  const { user, loading: authLoading } = useAuth();
  const { themeColors } = useTheme();

  if (authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.bg }}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={user ? 'MainTabs' : 'Login'}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themeColors.bg },
        }}
      >
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabNavigator} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="AddPatient" component={AddPatientScreen} />
            <Stack.Screen name="UploadFile" component={UploadFileScreen} />
            <Stack.Screen name="PatientDetails" component={PatientDetailsScreen} />
            <Stack.Screen name="BookAppointment" component={BookAppointmentScreen} />
            <Stack.Screen name="SmartScan" component={SmartScanScreen} />
            <Stack.Screen name="RapidDigitize" component={RapidDigitizationScreen} />
            <Stack.Screen name="Consultations" component={ConsultationsScreen} />
            <Stack.Screen name="OperationReports" component={OperationReportsScreen} />
            <Stack.Screen name="Prescriptions" component={PrescriptionsScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <ChatProvider>
            <MainAppContent />
          </ChatProvider>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
