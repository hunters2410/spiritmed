import { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ToastProvider } from './contexts/ToastContext';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageLoader } from './components/PageLoader';
import { isSupabaseConfigured } from './lib/supabase';
import { ShieldAlert } from 'lucide-react';

// ---------------------------------------------------------------------------
// Lazy-loaded page components
// Each page is a separate JS chunk — downloaded only when first visited.
// Named exports use the .then(m => ({ default: m.X })) adapter pattern.
// Default exports are imported directly.
// ---------------------------------------------------------------------------

// Auth & public routes
const Login              = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Signup             = lazy(() => import('./pages/Signup').then(m => ({ default: m.Signup })));
const PublicBooking      = lazy(() => import('./pages/PublicBooking').then(m => ({ default: m.PublicBooking })));
const PublicRegistration = lazy(() => import('./pages/PublicRegistration').then(m => ({ default: m.PublicRegistration })));
const SharedResourceViewer = lazy(() => import('./pages/SharedResourceViewer').then(m => ({ default: m.SharedResourceViewer })));
const PatientPortal      = lazy(() => import('./pages/PatientPortal').then(m => ({ default: m.PatientPortal })));

// Dashboard & core
const Dashboard  = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Branches   = lazy(() => import('./pages/Branches').then(m => ({ default: m.Branches })));
const Settings   = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Profile    = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));

// Patient management
const Patients           = lazy(() => import('./pages/Patients').then(m => ({ default: m.Patients })));
const DeceasedPatients   = lazy(() => import('./pages/DeceasedPatients').then(m => ({ default: m.DeceasedPatients })));
const DischargedPatients = lazy(() => import('./pages/DischargedPatients').then(m => ({ default: m.DischargedPatients })));
const PatientFiles       = lazy(() => import('./pages/PatientFiles').then(m => ({ default: m.PatientFiles })));
const FileNumberPool     = lazy(() => import('./pages/FileNumberPool').then(m => ({ default: m.FileNumberPool })));

// Appointments
const Appointments        = lazy(() => import('./pages/Appointments').then(m => ({ default: m.Appointments })));
const AppointmentCalendar = lazy(() => import('./pages/AppointmentCalendar').then(m => ({ default: m.AppointmentCalendar })));
const AppointmentSchedule = lazy(() => import('./pages/AppointmentSchedule').then(m => ({ default: m.AppointmentSchedule })));
const AppointmentReports  = lazy(() => import('./pages/AppointmentReports').then(m => ({ default: m.AppointmentReports })));
const OnlineBookings      = lazy(() => import('./pages/OnlineBookings').then(m => ({ default: m.OnlineBookings })));

// Staff & HR
const Doctors         = lazy(() => import('./pages/Doctors').then(m => ({ default: m.Doctors })));
const Nurses          = lazy(() => import('./pages/Nurses').then(m => ({ default: m.Nurses })));
const Receptionists   = lazy(() => import('./pages/Receptionists').then(m => ({ default: m.Receptionists })));
const Accountants     = lazy(() => import('./pages/Accountants').then(m => ({ default: m.Accountants })));
const Users           = lazy(() => import('./pages/Users').then(m => ({ default: m.Users })));
const Roles           = lazy(() => import('./pages/Roles').then(m => ({ default: m.Roles })));
const Attendance      = lazy(() => import('./pages/Attendance').then(m => ({ default: m.Attendance })));
const LeaveManagement = lazy(() => import('./pages/LeaveManagement').then(m => ({ default: m.LeaveManagement })));
const Payroll         = lazy(() => import('./pages/Payroll').then(m => ({ default: m.Payroll })));
const HumanResources  = lazy(() => import('./pages/HumanResources').then(m => ({ default: m.HumanResources })));

// Clinical workflow
const Consultations = lazy(() => import('./pages/Consultations').then(m => ({ default: m.Consultations })));
const Prescriptions = lazy(() => import('./pages/Prescriptions').then(m => ({ default: m.Prescriptions })));
const Vitals        = lazy(() => import('./pages/Vitals').then(m => ({ default: m.Vitals })));
const Complaints    = lazy(() => import('./pages/Complaints').then(m => ({ default: m.Complaints })));
const Investigations= lazy(() => import('./pages/Investigations').then(m => ({ default: m.Investigations })));
const Diagnoses     = lazy(() => import('./pages/Diagnoses').then(m => ({ default: m.Diagnoses })));
const FollowUps     = lazy(() => import('./pages/FollowUps').then(m => ({ default: m.FollowUps })));
const Histology     = lazy(() => import('./pages/Histology').then(m => ({ default: m.Histology })));

// Clinical reports (default exports)
const MedicalReports     = lazy(() => import('./pages/MedicalReports'));
const DischargeSummaries = lazy(() => import('./pages/DischargeSummaries'));
const ReferralForms      = lazy(() => import('./pages/ReferralForms'));
const MedicalCertificates= lazy(() => import('./pages/MedicalCertificates'));
const OperationReports   = lazy(() => import('./pages/OperationReports'));
const AdmissionForms     = lazy(() => import('./pages/AdmissionForms'));
const LabResults         = lazy(() => import('./pages/LabResults'));

// Clinical setup
const Anaesthetists      = lazy(() => import('./pages/Anaesthetists').then(m => ({ default: m.Anaesthetists })));
const Assistants         = lazy(() => import('./pages/Assistants').then(m => ({ default: m.Assistants })));
const Hospitals          = lazy(() => import('./pages/Hospitals').then(m => ({ default: m.Hospitals })));
const SurgicalProcedures = lazy(() => import('./pages/SurgicalProcedures').then(m => ({ default: m.SurgicalProcedures })));
const Medicines          = lazy(() => import('./pages/Medicines').then(m => ({ default: m.Medicines })));
const MedicineFrequencies= lazy(() => import('./pages/MedicineFrequencies').then(m => ({ default: m.MedicineFrequencies })));

// Financial
const Bills              = lazy(() => import('./pages/ActualBills').then(m => ({ default: m.ActualBills })));
const EstimateBills      = lazy(() => import('./pages/EstimateBills').then(m => ({ default: m.EstimateBills })));
const PaymentProcedures  = lazy(() => import('./pages/PaymentProcedures').then(m => ({ default: m.PaymentProcedures })));
const Payments           = lazy(() => import('./pages/Payments').then(m => ({ default: m.Payments })));
const Expenses           = lazy(() => import('./pages/Expenses').then(m => ({ default: m.Expenses })));
const ExpenseCategories  = lazy(() => import('./pages/ExpenseCategories').then(m => ({ default: m.ExpenseCategories })));
const Accounting         = lazy(() => import('./pages/Accounting').then(m => ({ default: m.Accounting })));
const MedicalAids        = lazy(() => import('./pages/MedicalAids').then(m => ({ default: m.MedicalAids })));

// Inventory & pharmacy
const Inventory           = lazy(() => import('./pages/Inventory').then(m => ({ default: m.Inventory })));
const Pharmacy            = lazy(() => import('./pages/Pharmacy').then(m => ({ default: m.Pharmacy })));
const Suppliers           = lazy(() => import('./pages/Suppliers').then(m => ({ default: m.Suppliers })));
const InventoryCategories = lazy(() => import('./pages/InventoryCategories').then(m => ({ default: m.InventoryCategories })));
const InventoryUnits      = lazy(() => import('./pages/InventoryUnits').then(m => ({ default: m.InventoryUnits })));
const HospitalFiles       = lazy(() => import('./pages/HospitalFiles').then(m => ({ default: m.HospitalFiles })));

// Administration & communication
const ReferralDoctors = lazy(() => import('./pages/ReferralDoctors').then(m => ({ default: m.ReferralDoctors })));
const Statistics      = lazy(() => import('./pages/Statistics').then(m => ({ default: m.Statistics })));
const Emails          = lazy(() => import('./pages/Emails').then(m => ({ default: m.Emails })));
const SmsManagement   = lazy(() => import('./pages/SmsManagement').then(m => ({ default: m.SmsManagement })));
const Chats           = lazy(() => import('./pages/Chats').then(m => ({ default: m.Chats })));
const Notifications   = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })));
const AuditLogs       = lazy(() => import('./pages/AuditLogs').then(m => ({ default: m.AuditLogs })));

// ---------------------------------------------------------------------------

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  useEffect(() => {
    const handleLocationChange = () => {
      const newPath = window.location.pathname;
      if (newPath.startsWith('/shared-resource')) {
        setCurrentPage('shared-resource');
      } else {
        const newPage = newPath.substring(1).split('?')[0].split('#')[0] || 'dashboard';
        setCurrentPage(newPage.replace(/\/$/, ''));
      }
    };

    // Initialize on mount
    handleLocationChange();

    window.addEventListener('popstate', handleLocationChange);

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href^="/"]');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href') || '/';
        window.history.pushState({}, '', href);
        handleLocationChange();
      }
    };

    document.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  // Bypasses login authentication for standalone secure patient resources
  if (currentPage === 'shared-resource' || window.location.pathname.startsWith('/shared-resource')) {
    const pathParts = window.location.pathname.split('/');
    const resourceId = pathParts[pathParts.length - 1];
    return (
      <Suspense fallback={<PageLoader />}>
        <SharedResourceViewer resourceId={resourceId} />
      </Suspense>
    );
  }

  if (!user || !profile) {
    if (currentPage === 'signup') {
      return <Suspense fallback={<PageLoader />}><Signup /></Suspense>;
    }
    if (currentPage === 'book') {
      return <Suspense fallback={<PageLoader />}><PublicBooking /></Suspense>;
    }
    if (currentPage.startsWith('register')) {
      return <Suspense fallback={<PageLoader />}><PublicRegistration /></Suspense>;
    }
    return <Suspense fallback={<PageLoader />}><Login /></Suspense>;
  }

  // Intercept patient role to completely isolate and sandbox them in the Patient Portal
  if (profile.role === 'patient') {
    return (
      <Suspense fallback={<PageLoader />}>
        <PatientPortal />
      </Suspense>
    );
  }

  const renderPage = () => {
    if (currentPage.startsWith('register')) {
      return <PublicRegistration />;
    }

    switch (currentPage) {
      case 'dashboard':           return <Dashboard />;
      case 'branches':            return <Branches />;
      case 'patients':            return <Patients />;
      case 'patients/deceased':   return <DeceasedPatients />;
      case 'patients/discharged': return <DischargedPatients />;
      case 'patient-files':       return <PatientFiles />;
      case 'patient-file-pool':   return <FileNumberPool />;
      case 'appointments':             return <Appointments />;
      case 'appointments/calendar':    return <AppointmentCalendar />;
      case 'appointments/schedule':    return <AppointmentSchedule />;
      case 'appointments/reports':     return <AppointmentReports />;
      case 'appointments/online-booking': return <OnlineBookings />;
      case 'doctors':             return <Doctors />;
      case 'nurses':              return <Nurses />;
      case 'receptionists':       return <Receptionists />;
      case 'accountants':         return <Accountants />;
      case 'users':               return <Users />;
      case 'roles':               return <Roles />;
      case 'attendance':          return <Attendance />;
      case 'leave-management':    return <LeaveManagement />;
      case 'payroll':             return <Payroll />;
      case 'human-resources':     return <HumanResources />;
      case 'consultations':       return <Consultations />;
      case 'prescriptions':       return <Prescriptions />;
      case 'vital-signs':         return <Vitals />;
      case 'complaints':          return <Complaints />;
      case 'investigations':      return <Investigations />;
      case 'diagnoses':           return <Diagnoses />;
      case 'follow-ups':          return <FollowUps />;
      case 'histology':           return <Histology />;
      case 'medical-reports':     return <MedicalReports />;
      case 'discharge-summaries': return <DischargeSummaries />;
      case 'referral-forms':      return <ReferralForms />;
      case 'medical-certificates':return <MedicalCertificates />;
      case 'operation-reports':   return <OperationReports />;
      case 'admission-letters':   return <AdmissionForms />;
      case 'lab-results':         return <LabResults />;
      case 'anaesthetists':       return <Anaesthetists />;
      case 'assistants':          return <Assistants />;
      case 'hospitals':           return <Hospitals />;
      case 'surgical-procedures': return <SurgicalProcedures />;
      case 'medicines':           return <Medicines />;
      case 'medicine-frequencies':return <MedicineFrequencies />;
      case 'bills':               return <Bills />;
      case 'estimates':           return <EstimateBills />;
      case 'payment-procedures':  return <PaymentProcedures />;
      case 'payments':            return <Payments />;
      case 'expenses':            return <Expenses />;
      case 'expense-categories':  return <ExpenseCategories />;
      case 'accounting':          return <Accounting />;
      case 'medical-aids':        return <MedicalAids />;
      case 'inventory':           return <Inventory />;
      case 'pharmacy':            return <Pharmacy />;
      case 'suppliers':           return <Suppliers />;
      case 'inventory/categories':return <InventoryCategories />;
      case 'inventory/units':     return <InventoryUnits />;
      case 'hospital-files':      return <HospitalFiles />;
      case 'referral-doctors':    return <ReferralDoctors />;
      case 'statistics':          return <Statistics />;
      case 'emails':              return <Emails />;
      case 'sms':                 return <SmsManagement />;
      case 'chats':               return <Chats />;
      case 'notifications':       return <Notifications />;
      case 'audit-logs':          return <AuditLogs />;
      case 'settings':            return <Settings />;
      case 'profile':             return <Profile />;
      default:                    return <Dashboard />;
    }
  };

  const isPublicRoute = currentPage.startsWith('register') || currentPage === 'book' || currentPage === 'signup';

  if (isPublicRoute) {
    return (
      <Suspense fallback={<PageLoader />}>
        {renderPage()}
      </Suspense>
    );
  }

  return (
    <Layout>
      {/* ErrorBoundary wraps the page area — a crash in one page won't take down the whole app */}
      <ErrorBoundary>
        {/* Suspense handles the async chunk load for each lazy page */}
        <Suspense fallback={<PageLoader />}>
          {renderPage()}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-red-200 p-8 max-w-md w-full text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Configuration Required</h1>
          <p className="text-gray-600 mb-6">
            The application is missing necessary connection details for the database.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg text-left text-sm text-gray-700 border border-gray-200">
            <p className="font-semibold mb-2">Please ensure the following environment variables are set:</p>
            <ul className="list-disc list-inside space-y-1 font-mono text-xs">
              <li>VITE_SUPABASE_URL</li>
              <li>VITE_SUPABASE_ANON_KEY</li>
            </ul>
          </div>
          <p className="text-xs text-gray-500 mt-6">
            If you are the administrator, please check your deployment settings (e.g., Netlify Environment Variables).
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <NotificationProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
