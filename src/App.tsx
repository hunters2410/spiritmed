import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { Branches } from './pages/Branches';
import { Patients } from './pages/Patients';
import { DeceasedPatients } from './pages/DeceasedPatients';
import { DischargedPatients } from './pages/DischargedPatients';
import { PatientFiles } from './pages/PatientFiles';
import { Appointments } from './pages/Appointments';
import { AppointmentCalendar } from './pages/AppointmentCalendar';
import { AppointmentSchedule } from './pages/AppointmentSchedule';
import { Settings } from './pages/Settings';
import { Profile } from './pages/Profile';
import { Users } from './pages/Users';
import { Doctors } from './pages/Doctors';
import { Nurses } from './pages/Nurses';
import { Receptionists } from './pages/Receptionists';
import { Accountants } from './pages/Accountants';
import { Attendance } from './pages/Attendance';
import { LeaveManagement } from './pages/LeaveManagement';
import { Roles } from './pages/Roles';
import { Payroll } from './pages/Payroll';
import { HumanResources } from './pages/HumanResources';
import { MedicalAids } from './pages/MedicalAids';
import { ReferralDoctors } from './pages/ReferralDoctors';
import { Consultations } from './pages/Consultations';
import { Prescriptions } from './pages/Prescriptions';
import { Complaints } from './pages/Complaints';
import { Investigations } from './pages/Investigations';
import { Diagnoses } from './pages/Diagnoses';
import { Vitals } from './pages/Vitals';
import { Invoices } from './pages/Invoices';
import { Payments } from './pages/Payments';
import { Inventory } from './pages/Inventory';
import { Pharmacy } from './pages/Pharmacy';
import { AppointmentReports } from './pages/AppointmentReports';
import { PublicBooking } from './pages/PublicBooking';
import { OnlineBookings } from './pages/OnlineBookings';
import { Medicines } from './pages/Medicines';
import { MedicineFrequencies } from './pages/MedicineFrequencies';
import MedicalReports from './pages/MedicalReports';
import DischargeSummaries from './pages/DischargeSummaries';
import ReferralForms from './pages/ReferralForms';
import MedicalCertificates from './pages/MedicalCertificates';
import OperationReports from './pages/OperationReports';
import AdmissionForms from './pages/AdmissionForms';
import { Anaesthetists } from './pages/Anaesthetists';
import { Assistants } from './pages/Assistants';
import { Hospitals } from './pages/Hospitals';
import LabResults from './pages/LabResults';
import { Histology } from './pages/Histology';
import { Layout } from './components/Layout';
import { isSupabaseConfigured } from './lib/supabase';
import { ShieldAlert } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  useEffect(() => {
    const handleLocationChange = () => {
      const newPath = window.location.pathname;
      const newPage = newPath.substring(1).split('?')[0].split('#')[0] || 'dashboard';
      setCurrentPage(newPage.replace(/\/$/, ''));
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

  if (!user || !profile) {
    if (currentPage === 'signup') {
      return <Signup />;
    }
    if (currentPage === 'book') {
      return <PublicBooking />;
    }
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'branches':
        return <Branches />;
      case 'patients':
        return <Patients />;
      case 'patients/deceased':
        return <DeceasedPatients />;
      case 'patients/discharged':
        return <DischargedPatients />;
      case 'patient-files':
        return <PatientFiles />;
      case 'appointments':
        return <Appointments />;
      case 'appointments/calendar':
        return <AppointmentCalendar />;
      case 'appointments/schedule':
        return <AppointmentSchedule />;
      case 'doctors':
        return <Doctors />;
      case 'nurses':
        return <Nurses />;
      case 'receptionists':
        return <Receptionists />;
      case 'accountants':
        return <Accountants />;
      case 'attendance':
        return <Attendance />;
      case 'leave-management':
        return <LeaveManagement />;
      case 'roles':
        return <Roles />;
      case 'payroll':
        return <Payroll />;
      case 'human-resources':
        return <HumanResources />;
      case 'medical-aids':
        return <MedicalAids />;
      case 'referral-doctors':
        return <ReferralDoctors />;
      case 'consultations':
        return <Consultations />;
      case 'prescriptions':
        return <Prescriptions />;
      case 'medical-reports':
        return <MedicalReports />;
      case 'discharge-summaries':
        return <DischargeSummaries />;
      case 'referral-forms':
        return <ReferralForms />;
      case 'medical-certificates':
        return <MedicalCertificates />;
      case 'operation-reports':
        return <OperationReports />;
      case 'admission-letters':
        return <AdmissionForms />;
      case 'anaesthetists':
        return <Anaesthetists />;
      case 'assistants':
        return <Assistants />;
      case 'hospitals':
        return <Hospitals />;
      case 'complaints':
        return <Complaints />;
      case 'investigations':
        return <Investigations />;
      case 'diagnoses':
        return <Diagnoses />;
      case 'vital-signs':
        return <Vitals />;
      case 'invoices':
        return <Invoices />;
      case 'payments':
        return <Payments />;
      case 'inventory':
        return <Inventory />;
      case 'pharmacy':
        return <Pharmacy />;
      case 'medicines':
        return <Medicines />;
      case 'medicine-frequencies':
        return <MedicineFrequencies />;
      case 'appointments/reports':
        return <AppointmentReports />;
      case 'appointments/online-booking':
        return <OnlineBookings />;
      case 'settings':
        return <Settings />;
      case 'profile':
        return <Profile />;
      case 'users':
        return <Users />;
      case 'lab-results':
        return <LabResults />;
      case 'histology':
        return <Histology />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout>
      {renderPage()}
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
      <AppContent />
    </AuthProvider>
  );
}

export default App;
