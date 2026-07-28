import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import {
  Heart, Calendar, DollarSign, LogOut,
  Moon, Sun, User, Activity, Clock, Home,
  FileHeart, Printer, RefreshCw, TrendingUp,
  Share2, Video, Link, ExternalLink, X
} from 'lucide-react';

interface Appointment {
  id: string;
  appointment_date: string;
  status: string;
  doctor_id: string;
  doctor?: { full_name: string };
  branch?: { name: string };
}

interface Consultation {
  id: string;
  consultation_date: string;
  chief_complaint: string;
  history: string;
  examination: string;
  diagnosis: string;
  treatment_plan: string;
  notes: string;
  doctor?: { full_name: string };
}

interface Prescription {
  id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  created_at: string;
  doctor?: { full_name: string };
}

interface VitalSign {
  id: string;
  recorded_at: string;
  temperature: number;
  blood_pressure_systolic: number;
  blood_pressure_diastolic: number;
  heart_rate: number;
  respiratory_rate: number;
  oxygen_saturation: number;
  weight: number;
  height: number;
  notes: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  status: string;
  notes: string;
}

interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string;
}

interface Doctor {
  id: string;
  full_name: string;
}

export function PatientPortal() {
  const { profile, signOut } = useAuth();
  const { showToast } = useToast();
  
  // Tabs & Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'appointments' | 'medical' | 'vitals' | 'billing' | 'profile' | 'resources'>('dashboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  // Data States
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [vitals, setVitals] = useState<VitalSign[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patientResources, setPatientResources] = useState<any[]>([]);
  const [selectedPortalResource, setSelectedPortalResource] = useState<any>(null);
  const [portalResourceTimeLeft, setPortalResourceTimeLeft] = useState<string>('');
  
  // Loading & Action States
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  
  // Booking Form State
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTime, setBookingTime] = useState('');
  const [bookingDoctor, setBookingDoctor] = useState('');
  
  // Profile Settings Form State
  const [profileForm, setProfileForm] = useState({
    phone: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    next_of_kin_address: '',
    next_of_kin_relation: '',
    next_of_kin_email: '',
    password: ''
  });

  // Load Profile from profile.patient_data on mount
  useEffect(() => {
    if (profile?.patient_data) {
      const pd = profile.patient_data;
      setProfileForm({
        phone: pd.phone || '',
        address: pd.address || '',
        emergency_contact_name: pd.emergency_contact_name || '',
        emergency_contact_phone: pd.emergency_contact_phone || '',
        next_of_kin_address: pd.next_of_kin_address || '',
        next_of_kin_relation: pd.next_of_kin_relation || '',
        next_of_kin_email: pd.next_of_kin_email || '',
        password: pd.password || ''
      });
    }

    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' || 'light';
    setTheme(savedTheme);
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');

    loadPatientData();
  }, [profile]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const loadPatientData = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      // 1. Fetch appointments
      const { data: appts, error: apptsError } = await supabase
        .from('appointments')
        .select('*, doctor:users(full_name), branch:branches(name)')
        .eq('patient_id', profile.id)
        .order('appointment_date', { ascending: false });
      if (apptsError) throw apptsError;
      setAppointments(appts || []);

      // 2. Fetch consultations
      const { data: consults, error: consultsError } = await supabase
        .from('consultations')
        .select('*, doctor:users(full_name)')
        .eq('patient_id', profile.id)
        .order('consultation_date', { ascending: false });
      if (consultsError) throw consultsError;
      setConsultations(consults || []);

      // 3. Fetch prescriptions
      const { data: rx, error: rxError } = await supabase
        .from('prescriptions')
        .select('*, doctor:users(full_name)')
        .eq('patient_id', profile.id)
        .order('created_at', { ascending: false });
      if (rxError) throw rxError;
      setPrescriptions(rx || []);

      // 4. Fetch vitals
      const { data: vt, error: vtError } = await supabase
        .from('vital_signs')
        .select('*')
        .eq('patient_id', profile.id)
        .order('recorded_at', { ascending: false });
      if (vtError) throw vtError;
      setVitals(vt || []);

      // 5. Fetch billing & invoices
      const { data: invs, error: invsError } = await supabase
        .from('invoices')
        .select('*')
        .eq('patient_id', profile.id)
        .order('invoice_date', { ascending: false });
      if (invsError) throw invsError;
      setInvoices(invs || []);

      // 6. Fetch payments
      const { data: pmts, error: pmtsError } = await supabase
        .from('payments')
        .select('*')
        .eq('patient_id', profile.id)
        .order('payment_date', { ascending: false });
      if (pmtsError) throw pmtsError;
      setPayments(pmts || []);

      // 7. Load active doctors
      const { data: docs, error: docsError } = await supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'doctor')
        .eq('is_active', true);
      if (docsError) throw docsError;
      setDoctors(docs || []);

      // 8. Fetch shared clinical resources
      try {
        const { data: resData, error: resError } = await supabase
          .from('patient_resources')
          .select('*')
          .eq('patient_id', profile.id)
          .order('created_at', { ascending: false });

        if (resError) {
          if (resError.code === '42P01') {
            const localData = localStorage.getItem('mock_patient_resources');
            if (localData) {
              const parsed = JSON.parse(localData);
              const filtered = parsed.filter((r: any) => r.patient_id === profile.id);
              setPatientResources(filtered.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            } else {
              setPatientResources([]);
            }
          } else {
            throw resError;
          }
        } else {
          setPatientResources(resData || []);
        }
      } catch (resErr) {
        console.warn('Error loading patient resources:', resErr);
      }

    } catch (err: any) {
      console.error('Error loading patient portal dataset:', err);
      showToast('Failed to load portal records.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Appointment Booking Action
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingDate || !bookingTime || !bookingDoctor) {
      showToast('Please fill in all booking fields.', 'error');
      return;
    }

    setBookingLoading(true);
    try {
      const combinedDateTime = new Date(`${bookingDate}T${bookingTime}`).toISOString();
      const payload = {
        branch_id: profile?.branch_id,
        patient_id: profile?.id,
        doctor_id: bookingDoctor,
        appointment_date: combinedDateTime,
        status: 'pending_confirmation',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('appointments')
        .insert([payload]);

      if (error) throw error;

      showToast('Appointment requested successfully! Pending staff confirmation.', 'success');
      setBookingDate('');
      setBookingTime('');
      setBookingDoctor('');
      
      // Reload appointment table
      loadPatientData();
    } catch (err: any) {
      console.error('Error booking appointment:', err);
      showToast(err.message || 'Failed to request appointment.', 'error');
    } finally {
      setBookingLoading(false);
    }
  };

  // Profile Update Action
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      const { error } = await supabase
        .from('patients')
        .update({
          phone: profileForm.phone || null,
          address: profileForm.address || null,
          emergency_contact_name: profileForm.emergency_contact_name || null,
          emergency_contact_phone: profileForm.emergency_contact_phone || null,
          next_of_kin_address: profileForm.next_of_kin_address || null,
          next_of_kin_relation: profileForm.next_of_kin_relation || null,
          next_of_kin_email: profileForm.next_of_kin_email || null,
          password: profileForm.password || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile?.id);

      if (error) throw error;

      showToast('Profile demographics & portal settings updated successfully!', 'success');
      
      // Update our stored auth context copy
      const savedPatientSession = localStorage.getItem('spiritmed_patient_session');
      if (savedPatientSession) {
        const sessionObj = JSON.parse(savedPatientSession);
        sessionObj.profile.patient_data = {
          ...sessionObj.profile.patient_data,
          ...profileForm
        };
        localStorage.setItem('spiritmed_patient_session', JSON.stringify(sessionObj));
      }

    } catch (err: any) {
      console.error('Error updating patient profile:', err);
      showToast(err.message || 'Failed to update settings.', 'error');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const printPrescription = (rx: Prescription) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Prescription Summary - ${profile?.full_name}</title>
          <style>
            body { font-family: system-ui, sans-serif; color: #1f2937; padding: 40px; }
            .header { border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #059669; }
            .title { font-size: 20px; margin-top: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
            .section { margin-bottom: 25px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .label { font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: bold; }
            .val { font-size: 15px; font-weight: bold; margin-top: 2px; }
            .med-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; background-color: #f9fafb; margin-top: 15px; }
            .med-name { font-size: 18px; color: #047857; font-weight: 800; }
            .footer { border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 50px; font-size: 11px; color: #9ca3af; text-align: center; }
          </style>
        </head>
        <body onload="window.print();">
          <div class="header">
            <div class="logo">SPIRITMED MEDICAL PORTAL</div>
            <div class="title">Official Patient Prescription</div>
          </div>
          <div class="section grid">
            <div>
              <div class="label">Patient Full Name</div>
              <div class="val">${profile?.full_name}</div>
            </div>
            <div>
              <div class="label">Date of Birth</div>
              <div class="val">${profile?.patient_data?.date_of_birth || 'N/A'}</div>
            </div>
          </div>
          <div class="section grid">
            <div>
              <div class="label">Patient File Number</div>
              <div class="val">${profile?.patient_data?.file_number || 'N/A'}</div>
            </div>
            <div>
              <div class="label">Prescribing Physician</div>
              <div class="val">${rx.doctor?.full_name || 'Clinic Medical Practitioner'}</div>
            </div>
          </div>
          
          <div class="section">
            <div class="label">Medication Details</div>
            <div class="med-box">
              <div class="med-name">${rx.medication_name}</div>
              <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                <div>
                  <div class="label">Dosage</div>
                  <div class="val" style="font-size: 13px;">${rx.dosage || '—'}</div>
                </div>
                <div>
                  <div class="label">Frequency</div>
                  <div class="val" style="font-size: 13px;">${rx.frequency || '—'}</div>
                </div>
                <div>
                  <div class="label">Duration</div>
                  <div class="val" style="font-size: 13px;">${rx.duration || '—'}</div>
                </div>
              </div>
              <div style="margin-top: 15px; border-t: 1px solid #eee; padding-top: 10px;">
                <div class="label">Patient Instructions</div>
                <div class="val" style="font-size: 13px; font-weight: normal; margin-top: 3px; color: #374151;">${rx.instructions || 'Take as directed by doctor.'}</div>
              </div>
            </div>
          </div>

          <div class="footer">
            Generated via Spiritmed Hospital Portal. Authorized electronic medical record copy. Date: ${new Date(rx.created_at).toLocaleDateString()}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getUpcomingAppointment = () => {
    const now = new Date();
    const sorted = [...appointments]
      .filter(a => new Date(a.appointment_date) > now && a.status !== 'cancelled')
      .sort((a,b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime());
    return sorted[0] || null;
  };

  const copyDirectShareLink = (resId: string) => {
    const link = `${window.location.origin}/shared-resource/${resId}`;
    navigator.clipboard.writeText(link);
    showToast('Secure direct login-free resource link copied!', 'success');
  };

  // Dynamic countdown in portal resource viewer overlay
  useEffect(() => {
    if (!selectedPortalResource) return;
    
    const updateCountdown = () => {
      const exp = new Date(selectedPortalResource.expires_at).getTime();
      const now = new Date().getTime();
      const diff = exp - now;
      
      if (diff <= 0) {
        setPortalResourceTimeLeft('Expired');
        setSelectedPortalResource(null);
        showToast('This temporary shared resource has expired.', 'warning');
      } else {
        const hrs = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setPortalResourceTimeLeft(`${hrs.toString().padStart(2, '0')}h : ${mins.toString().padStart(2, '0')}m : ${secs.toString().padStart(2, '0')}s`);
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [selectedPortalResource]);

  const upcomingAppt = getUpcomingAppointment();
  const latestVitals = vitals[0] || null;

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors">
      
      {/* 1. PORTAL SIDEBAR */}
      <aside className="w-64 bg-white dark:bg-gray-850 border-r border-gray-200 dark:border-gray-800 flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo & Header */}
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 text-center">
            <img src="/favicon.png" alt="Logo" className="w-16 h-16 mx-auto object-contain mb-3" />
            <h2 className="text-sm font-black text-green-600 dark:text-green-400 uppercase tracking-wider">Patient Portal</h2>
            <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">Spiritmed EHR Connect</p>
          </div>

          {/* Nav Items */}
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'dashboard' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Home className="w-4 h-4" />
              <span>Overview</span>
            </button>
            <button
              onClick={() => setActiveTab('appointments')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'appointments' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Calendar className="w-4 h-4" />
              <span>Appointments</span>
            </button>
            <button
              onClick={() => setActiveTab('medical')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'medical' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <FileHeart className="w-4 h-4" />
              <span>Medical History</span>
            </button>
            <button
              onClick={() => setActiveTab('vitals')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'vitals' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Activity className="w-4 h-4" />
              <span>Vitals Track</span>
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'billing' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <DollarSign className="w-4 h-4" />
              <span>Financials</span>
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'profile' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <User className="w-4 h-4" />
              <span>My Profile</span>
            </button>
            <button
              onClick={() => setActiveTab('resources')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${activeTab === 'resources' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            >
              <Share2 className="w-4 h-4" />
              <span>Shared Resources</span>
            </button>
          </nav>
        </div>

        {/* Footer info & Logout */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={toggleTheme} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              {theme === 'light' ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5 text-amber-500" />}
            </button>
            <button onClick={loadPatientData} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" title="Reload Data">
              <RefreshCw className="w-4.5 h-4.5" />
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 rounded-xl text-xs font-black uppercase tracking-wider transition border border-red-100 dark:border-red-900/30"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER BUTTONS */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-850 border-t border-gray-200 dark:border-gray-800 py-2.5 px-4 flex justify-between items-center z-40 shadow-xl">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 text-[9px] font-black uppercase ${activeTab === 'dashboard' ? 'text-green-500' : 'text-gray-400'}`}>
          <Home className="w-4.5 h-4.5" />
          <span>Home</span>
        </button>
        <button onClick={() => setActiveTab('appointments')} className={`flex flex-col items-center gap-1 text-[9px] font-black uppercase ${activeTab === 'appointments' ? 'text-green-500' : 'text-gray-400'}`}>
          <Calendar className="w-4.5 h-4.5" />
          <span>Appts</span>
        </button>
        <button onClick={() => setActiveTab('medical')} className={`flex flex-col items-center gap-1 text-[9px] font-black uppercase ${activeTab === 'medical' ? 'text-green-500' : 'text-gray-400'}`}>
          <FileHeart className="w-4.5 h-4.5" />
          <span>Medical</span>
        </button>
        <button onClick={() => setActiveTab('billing')} className={`flex flex-col items-center gap-1 text-[9px] font-black uppercase ${activeTab === 'billing' ? 'text-green-500' : 'text-gray-400'}`}>
          <DollarSign className="w-4.5 h-4.5" />
          <span>Bills</span>
        </button>
        <button onClick={() => setActiveTab('resources')} className={`flex flex-col items-center gap-1 text-[9px] font-black uppercase ${activeTab === 'resources' ? 'text-green-500' : 'text-gray-400'}`}>
          <Share2 className="w-4.5 h-4.5" />
          <span>Docs</span>
        </button>
        <button onClick={handleLogout} className="flex flex-col items-center gap-1 text-[9px] font-black uppercase text-red-500">
          <LogOut className="w-4.5 h-4.5" />
          <span>Exit</span>
        </button>
      </div>

      {/* 2. PORTAL MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto pb-20 md:pb-6">
        
        {/* Navigation Top Header */}
        <header className="bg-white dark:bg-gray-850 border-b border-gray-200 dark:border-gray-800 p-6 flex justify-between items-center sticky top-0 z-30 bg-opacity-95 dark:bg-opacity-95 backdrop-blur">
          <div>
            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest bg-green-50 dark:bg-green-950/30 px-3 py-1 rounded-full border border-green-100 dark:border-green-900/40">Secure Patient Access</span>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-1.5">Welcome Back, {profile?.full_name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs font-bold text-gray-400">File #: <strong className="text-gray-700 dark:text-gray-200 font-mono">{profile?.patient_data?.file_number || 'N/A'}</strong></span>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-green-500 to-emerald-500 flex items-center justify-center text-white font-black text-sm border-2 border-white dark:border-gray-800 shadow shadow-green-500/20">
              {profile?.full_name?.charAt(0)}
            </div>
          </div>
        </header>

        {/* Dynamic Pages Rendering */}
        <div className="p-6 flex-1">
          {loading ? (
            <div className="h-full flex items-center justify-center p-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW/DASHBOARD */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  
                  {/* Glass welcome alert */}
                  <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="z-10">
                      <h2 className="text-lg font-black uppercase tracking-wide">Dynamic EHR Connect</h2>
                      <p className="text-xs text-green-100 font-semibold mt-1 max-w-lg">Access your clinical details, prescriptions, vital summaries, and download invoices easily. Update emergency and kin settings directly from your secure panel.</p>
                    </div>
                    <button onClick={() => setActiveTab('profile')} className="z-10 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-black uppercase tracking-wider px-5 py-2.5 transition backdrop-blur border border-white/10">
                      View Profile Settings
                    </button>
                    {/* decorative background element */}
                    <div className="absolute right-0 top-0 w-64 h-64 bg-white/10 rounded-full translate-x-20 -translate-y-20 blur-2xl" />
                  </div>

                  {/* Health Cards Row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-gray-850 p-4 border border-gray-150 dark:border-gray-800 rounded-2xl flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center text-red-500"><Heart className="w-5 h-5 animate-pulse" /></div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Heart Rate</div>
                        <div className="text-sm font-black">{latestVitals?.heart_rate ? `${latestVitals.heart_rate} bpm` : '—'}</div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-850 p-4 border border-gray-150 dark:border-gray-800 rounded-2xl flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center text-blue-500"><Activity className="w-5 h-5" /></div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Blood Pressure</div>
                        <div className="text-sm font-black">{latestVitals?.blood_pressure_systolic ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}` : '—'}</div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-850 p-4 border border-gray-150 dark:border-gray-800 rounded-2xl flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center text-orange-500"><TrendingUp className="w-5 h-5" /></div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Body Temp</div>
                        <div className="text-sm font-black">{latestVitals?.temperature ? `${latestVitals.temperature}°C` : '—'}</div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-850 p-4 border border-gray-150 dark:border-gray-800 rounded-2xl flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center text-indigo-500"><User className="w-5 h-5" /></div>
                      <div>
                        <div className="text-[10px] text-gray-400 font-bold uppercase">Weight</div>
                        <div className="text-sm font-black">{latestVitals?.weight ? `${latestVitals.weight} kg` : '—'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Dual Grid: Upcoming Appointment & Vitals Alert */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Appointment Box */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b dark:border-gray-800 pb-3">
                          <span className="text-xs font-black uppercase text-gray-400">Next Scheduled Visit</span>
                          <Calendar className="w-4 h-4 text-green-500" />
                        </div>
                        {upcomingAppt ? (
                          <div className="mt-4 space-y-3">
                            <div className="text-lg font-bold text-gray-800 dark:text-white">
                              {new Date(upcomingAppt.appointment_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
                              <Clock className="w-4 h-4 text-gray-400" />
                              <span>Time: {new Date(upcomingAppt.appointment_date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-xs font-semibold text-gray-500">
                              Doctor: <strong className="text-gray-800 dark:text-gray-200">{upcomingAppt.doctor?.full_name || 'Clinic Consultant'}</strong>
                            </div>
                            <div className="text-xs font-semibold text-gray-500">
                              Branch: <strong className="text-gray-800 dark:text-gray-200">{upcomingAppt.branch?.name || 'Main Branch'}</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-6 py-6 text-center text-xs font-bold text-gray-400 italic">
                            No upcoming appointments scheduled.
                          </div>
                        )}
                      </div>
                      <button onClick={() => setActiveTab('appointments')} className="w-full mt-6 py-2.5 bg-green-50 hover:bg-green-100 dark:bg-green-950/20 dark:hover:bg-green-950/40 text-green-600 rounded-xl text-xs font-black uppercase tracking-wider transition border border-green-150 dark:border-green-900/30">
                        Book / Request Visit
                      </button>
                    </div>

                    {/* Vitals Summary Alert Panel */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6">
                      <div className="flex items-center justify-between border-b dark:border-gray-800 pb-3 mb-4">
                        <span className="text-xs font-black uppercase text-gray-400">Vital Health Indicators</span>
                        <Activity className="w-4 h-4 text-green-500 animate-pulse" />
                      </div>
                      {latestVitals ? (
                        <div className="space-y-3.5 text-xs font-semibold text-gray-500">
                          <div className="flex justify-between border-b dark:border-gray-800 pb-1.5">
                            <span>Oxygen Saturation</span>
                            <span className="text-gray-800 dark:text-gray-200 font-bold">{latestVitals.oxygen_saturation ? `${latestVitals.oxygen_saturation}%` : '—'}</span>
                          </div>
                          <div className="flex justify-between border-b dark:border-gray-800 pb-1.5">
                            <span>Respiratory Rate</span>
                            <span className="text-gray-800 dark:text-gray-200 font-bold">{latestVitals.respiratory_rate ? `${latestVitals.respiratory_rate}/min` : '—'}</span>
                          </div>
                          <div className="flex justify-between border-b dark:border-gray-800 pb-1.5">
                            <span>Patient Height</span>
                            <span className="text-gray-800 dark:text-gray-200 font-bold">{latestVitals.height ? `${latestVitals.height} cm` : '—'}</span>
                          </div>
                          <div className="flex justify-between border-b dark:border-gray-800 pb-1.5">
                            <span>Recorded Date</span>
                            <span className="text-gray-800 dark:text-gray-200 font-bold">{new Date(latestVitals.recorded_at).toLocaleDateString()}</span>
                          </div>
                          {latestVitals.notes && (
                            <div className="bg-gray-50 dark:bg-gray-900/30 p-2.5 rounded-lg italic text-[11px] text-gray-400 mt-2">
                              Notes: "{latestVitals.notes}"
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-xs font-bold text-gray-400 italic">
                          No vitals have been recorded yet.
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              )}

              {/* TAB 2: APPOINTMENTS BOOKING & LIST */}
              {activeTab === 'appointments' && (
                <div className="space-y-6">
                  
                  {/* Grid for booking form & list */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Booking Request Form */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                      <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-4">Request New Visit</h2>
                      <form onSubmit={handleBookAppointment} className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Consultant Doctor</label>
                          <select
                            value={bookingDoctor}
                            onChange={(e) => setBookingDoctor(e.target.value)}
                            className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                            required
                          >
                            <option value="">Select Doctor</option>
                            {doctors.map(d => (
                              <option key={d.id} value={d.id}>{d.full_name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Appointment Date</label>
                          <input
                            type="date"
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                            required
                            min={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Preferred Time Slot</label>
                          <input
                            type="time"
                            value={bookingTime}
                            onChange={(e) => setBookingTime(e.target.value)}
                            className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={bookingLoading}
                          className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-green-500/20 transition hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        >
                          {bookingLoading ? 'Requesting Appointment...' : 'Submit Booking Request'}
                        </button>
                      </form>
                    </div>

                    {/* Booking List Table */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6 lg:col-span-2 overflow-hidden flex flex-col">
                      <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-4">My Appointments Directory</h2>
                      <div className="flex-1 overflow-x-auto">
                        {appointments.length === 0 ? (
                          <div className="py-12 text-center text-xs font-bold text-gray-400 italic">No appointments registered.</div>
                        ) : (
                          <table className="w-full text-left border-collapse text-xs font-semibold text-gray-500 dark:text-gray-400">
                            <thead>
                              <tr className="text-[10px] font-black uppercase text-gray-400 border-b dark:border-gray-800">
                                <th className="pb-3">Doctor</th>
                                <th className="pb-3">Date & Time</th>
                                <th className="pb-3">Branch</th>
                                <th className="pb-3 text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-gray-800">
                              {appointments.map(a => (
                                <tr key={a.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/10">
                                  <td className="py-3 font-bold text-gray-800 dark:text-gray-200">{a.doctor?.full_name || 'Clinic Specialist'}</td>
                                  <td className="py-3 font-mono">
                                    {new Date(a.appointment_date).toLocaleDateString()} {new Date(a.appointment_date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="py-3">{a.branch?.name || 'Main Branch'}</td>
                                  <td className="py-3 text-right">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${a.status === 'confirmed' ? 'bg-green-50 border-green-200 text-green-600 dark:bg-green-950/20 dark:border-green-900/30' : a.status === 'pending_confirmation' ? 'bg-yellow-50 border-yellow-250 text-yellow-600 dark:bg-yellow-950/20 dark:border-yellow-900/30' : 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-900/20 dark:border-gray-800'}`}>
                                      {a.status?.replace(/_/g, ' ')}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* TAB 3: MEDICAL HISTORY FEED */}
              {activeTab === 'medical' && (
                <div className="space-y-6">
                  
                  {/* Consultations and Prescriptions feed */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Clinical History & Consultations */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6">
                      <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-4">Doctor Consultation Logs</h2>
                      <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
                        {consultations.length === 0 ? (
                          <div className="py-12 text-center text-xs font-bold text-gray-400 italic">No consultations on file.</div>
                        ) : (
                          consultations.map((c) => (
                            <div key={c.id} className="relative pl-6 border-l-2 border-green-500 pb-4">
                              <div className="absolute left-[-6px] top-0 w-2.5 h-2.5 rounded-full bg-green-500" />
                              <div className="flex items-center justify-between text-xs text-gray-400">
                                <span className="font-mono font-bold">{new Date(c.consultation_date).toLocaleDateString()}</span>
                                <span className="font-bold text-gray-600 dark:text-gray-300">Dr. {c.doctor?.full_name || 'Clinic Consultant'}</span>
                              </div>
                              <h3 className="text-xs font-black uppercase tracking-tight text-gray-800 dark:text-gray-200 mt-1">Chief Complaint: "{c.chief_complaint}"</h3>
                              <div className="text-xs font-semibold text-gray-500 space-y-1.5 mt-2">
                                <div><strong className="text-gray-700 dark:text-gray-300 uppercase text-[9px] tracking-wider block">Clinical History:</strong> {c.history || '—'}</div>
                                <div><strong className="text-gray-700 dark:text-gray-300 uppercase text-[9px] tracking-wider block">Physical Examination:</strong> {c.examination || '—'}</div>
                                <div className="bg-green-50/50 dark:bg-green-950/20 p-2.5 rounded-xl border border-green-100 dark:border-green-900/30">
                                  <strong className="text-green-600 dark:text-green-400 uppercase text-[9px] tracking-wider block">Diagnosis:</strong>
                                  <span className="font-bold text-gray-800 dark:text-gray-150">{c.diagnosis || 'Diagnosis pending'}</span>
                                </div>
                                <div className="bg-blue-50/30 dark:bg-blue-950/10 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/20">
                                  <strong className="text-blue-600 dark:text-blue-400 uppercase text-[9px] tracking-wider block">Treatment Plan:</strong>
                                  <span>{c.treatment_plan || '—'}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Active Prescriptions list */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6">
                      <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-4">My Clinical Prescriptions</h2>
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                        {prescriptions.length === 0 ? (
                          <div className="py-12 text-center text-xs font-bold text-gray-400 italic">No prescriptions issued.</div>
                        ) : (
                          prescriptions.map(p => (
                            <div key={p.id} className="p-4 border border-gray-100 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/20 hover:border-green-200 dark:hover:border-green-900/40 transition">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h3 className="text-sm font-black text-green-600 dark:text-green-400 uppercase tracking-tight">{p.medication_name}</h3>
                                  <span className="text-[9px] font-bold text-gray-400 uppercase block mt-0.5">Date: {new Date(p.created_at).toLocaleDateString()}</span>
                                </div>
                                <button
                                  onClick={() => printPrescription(p)}
                                  className="p-2 bg-white dark:bg-gray-850 text-gray-500 hover:text-green-500 rounded-xl border dark:border-gray-800 transition"
                                  title="Print Official PDF Copy"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs font-bold text-gray-500 mt-3 border-t dark:border-gray-800 pt-2.5">
                                <div>
                                  <span className="text-[9px] font-black uppercase text-gray-400 block">Dosage</span>
                                  <span className="text-gray-700 dark:text-gray-200 mt-0.5 block">{p.dosage || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase text-gray-400 block">Frequency</span>
                                  <span className="text-gray-700 dark:text-gray-200 mt-0.5 block">{p.frequency || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase text-gray-400 block">Duration</span>
                                  <span className="text-gray-700 dark:text-gray-200 mt-0.5 block">{p.duration || '—'}</span>
                                </div>
                              </div>
                              <div className="text-xs font-semibold text-gray-500 mt-2.5 bg-white dark:bg-gray-850 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                                <span className="text-[9px] font-black uppercase text-gray-400 block mb-0.5">Instructions</span>
                                {p.instructions || 'Take exactly as prescribed.'}
                              </div>
                              <div className="text-[10px] text-gray-400 font-bold mt-2 text-right">
                                By: {p.doctor?.full_name || 'Clinic Doctor'}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* TAB 4: VITALS TIMELINE */}
              {activeTab === 'vitals' && (
                <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6">
                  <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-6">Patient Vitals History Timeline</h2>
                  {vitals.length === 0 ? (
                    <div className="py-12 text-center text-xs font-bold text-gray-400 italic">No clinical vital readings registered.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs font-semibold text-gray-500">
                        <thead>
                          <tr className="text-[10px] font-black uppercase text-gray-400 border-b dark:border-gray-800">
                            <th className="pb-3.5">Recorded Date</th>
                            <th className="pb-3.5">BP (mmHg)</th>
                            <th className="pb-3.5">Pulse (bpm)</th>
                            <th className="pb-3.5">Temp (°C)</th>
                            <th className="pb-3.5">Resp Rate (/min)</th>
                            <th className="pb-3.5">SpO2 (%)</th>
                            <th className="pb-3.5">Weight (kg)</th>
                            <th className="pb-3.5">Height (cm)</th>
                            <th className="pb-3.5">Clinical Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-gray-800">
                          {vitals.map(v => (
                            <tr key={v.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/10">
                              <td className="py-3.5 font-bold text-gray-900 dark:text-white">{new Date(v.recorded_at).toLocaleDateString()}</td>
                              <td className="py-3.5 font-mono text-gray-700 dark:text-gray-200">
                                {v.blood_pressure_systolic ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}` : '—'}
                              </td>
                              <td className="py-3.5 font-mono text-gray-700 dark:text-gray-200">{v.heart_rate || '—'}</td>
                              <td className="py-3.5 font-mono text-gray-700 dark:text-gray-200">{v.temperature || '—'}</td>
                              <td className="py-3.5 font-mono text-gray-700 dark:text-gray-200">{v.respiratory_rate || '—'}</td>
                              <td className="py-3.5 font-mono text-gray-700 dark:text-gray-200">{v.oxygen_saturation || '—'}</td>
                              <td className="py-3.5 font-mono text-gray-700 dark:text-gray-200">{v.weight || '—'}</td>
                              <td className="py-3.5 font-mono text-gray-700 dark:text-gray-200">{v.height || '—'}</td>
                              <td className="py-3.5 italic text-gray-400 font-normal">{v.notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: BILLING LEDGER */}
              {activeTab === 'billing' && (
                <div className="space-y-6">
                  
                  {/* Grid for invoices and payments split */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Invoices List */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6">
                      <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-4">Patient Statements & Invoices</h2>
                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {invoices.length === 0 ? (
                          <div className="py-12 text-center text-xs font-bold text-gray-400 italic">No statement invoices registered.</div>
                        ) : (
                          invoices.map(inv => (
                            <div key={inv.id} className="p-4 border border-gray-100 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/20">
                              <div className="flex justify-between items-start">
                                <div>
                                  <strong className="text-xs text-gray-800 dark:text-white uppercase font-bold tracking-tight">Invoice: #{inv.invoice_number}</strong>
                                  <span className="text-[9px] font-bold text-gray-400 uppercase block mt-0.5">Date: {new Date(inv.invoice_date).toLocaleDateString()}</span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${inv.status === 'paid' ? 'bg-green-50 border-green-200 text-green-600 dark:bg-green-950/20' : inv.status === 'unpaid' ? 'bg-red-50 border-red-200 text-red-500 dark:bg-red-950/20' : 'bg-yellow-50 border-yellow-250 text-yellow-600 dark:bg-yellow-950/20'}`}>
                                  {inv.status}
                                </span>
                              </div>
                              <div className="flex justify-between items-center mt-3 pt-2.5 border-t dark:border-gray-800">
                                <div>
                                  <span className="text-[9px] font-black uppercase text-gray-400 block">Statement Total</span>
                                  <strong className="text-sm font-black text-gray-800 dark:text-white">${Number(inv.total_amount || 0).toFixed(2)}</strong>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase text-gray-400 block">Due Date</span>
                                  <span className="text-xs font-mono font-bold text-gray-500">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'Immediate'}</span>
                                </div>
                              </div>
                              {inv.notes && (
                                <div className="text-[10px] text-gray-400 font-semibold mt-2.5 bg-white dark:bg-gray-850 p-2.5 rounded-xl border dark:border-gray-800">
                                  Notes: "{inv.notes}"
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Payments List */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6">
                      <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-4">Payment Transaction Logs</h2>
                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {payments.length === 0 ? (
                          <div className="py-12 text-center text-xs font-bold text-gray-400 italic">No payments logged.</div>
                        ) : (
                          payments.map(p => (
                            <div key={p.id} className="p-4 border border-gray-100 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/20">
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-[10px] font-black uppercase text-green-600 dark:text-green-400 tracking-wider">Payment Transaction</span>
                                  <span className="text-[9px] font-bold text-gray-400 uppercase block mt-0.5">Date: {new Date(p.payment_date).toLocaleDateString()}</span>
                                </div>
                                <strong className="text-sm font-black text-green-600 dark:text-green-400">+${Number(p.amount || 0).toFixed(2)}</strong>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-xs font-bold text-gray-500 mt-3 pt-2.5 border-t dark:border-gray-800">
                                <div>
                                  <span className="text-[9px] font-black uppercase text-gray-400 block">Method</span>
                                  <span className="text-gray-700 dark:text-gray-200 mt-0.5 block uppercase">{p.payment_method?.replace(/_/g, ' ')}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase text-gray-400 block">Reference</span>
                                  <span className="text-gray-700 dark:text-gray-200 mt-0.5 block font-mono">{p.reference_number || 'Cash Receipt'}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* TAB 6: PROFILE DEMOGRAPHICS & PASS */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  
                  {/* Grid for details & settings change */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Demographics View */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6">
                      <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-4">Patient Demographic Card</h2>
                      <div className="space-y-4 text-xs font-semibold text-gray-500">
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 block">Full Name</span>
                          <span className="text-gray-800 dark:text-gray-200 font-bold block">{profile?.full_name}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 block">Gender</span>
                          <span className="text-gray-800 dark:text-gray-200 block uppercase">{profile?.patient_data?.gender || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 block">Date of Birth</span>
                          <span className="text-gray-800 dark:text-gray-200 font-mono block">{profile?.patient_data?.date_of_birth || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 block">Email Address</span>
                          <span className="text-gray-800 dark:text-gray-200 block">{profile?.email || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 block">Medical Aid Number</span>
                          <span className="text-gray-800 dark:text-gray-200 font-mono block">{profile?.patient_data?.medical_aid_number || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 block">Medical Aid Main Member</span>
                          <span className="text-gray-800 dark:text-gray-200 block">{profile?.patient_data?.medical_aid_main_member || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-gray-400 block">Allergies & Conditions</span>
                          <span className="text-red-500 font-bold block">{profile?.patient_data?.allergies || 'None declared'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Portal Demographics Editor Form */}
                    <div className="bg-white dark:bg-gray-850 border border-gray-150 dark:border-gray-800 rounded-2xl p-6 lg:col-span-2 shadow-sm">
                      <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300 border-b dark:border-gray-800 pb-3 mb-4">Edit Demographics & Security</h2>
                      <form onSubmit={handleUpdateProfile} className="space-y-4">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Contact Phone</label>
                            <input
                              type="text"
                              value={profileForm.phone}
                              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Portal Access Password</label>
                            <input
                              type="text"
                              value={profileForm.password}
                              onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                              placeholder="Update your portal password"
                              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Home Address</label>
                          <input
                            type="text"
                            value={profileForm.address}
                            onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                            className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t dark:border-gray-800 pt-4 mt-2">
                          <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Emergency Contact Name</label>
                            <input
                              type="text"
                              value={profileForm.emergency_contact_name}
                              onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_name: e.target.value })}
                              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Emergency Contact Phone</label>
                            <input
                              type="text"
                              value={profileForm.emergency_contact_phone}
                              onChange={(e) => setProfileForm({ ...profileForm, emergency_contact_phone: e.target.value })}
                              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t dark:border-gray-800 pt-4 mt-2">
                          <div className="md:col-span-2">
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Next of Kin Home Address</label>
                            <input
                              type="text"
                              value={profileForm.next_of_kin_address}
                              onChange={(e) => setProfileForm({ ...profileForm, next_of_kin_address: e.target.value })}
                              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5">Kin Relation</label>
                            <input
                              type="text"
                              value={profileForm.next_of_kin_relation}
                              onChange={(e) => setProfileForm({ ...profileForm, next_of_kin_relation: e.target.value })}
                              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-850 text-xs font-bold text-gray-700 dark:text-gray-300"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={updatingProfile}
                          className="w-full mt-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-green-500/20 transition hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        >
                          {updatingProfile ? 'Saving Changes...' : 'Save Portal & Demographic Settings'}
                        </button>

                      </form>
                    </div>

                  </div>

                </div>
              )}

              {/* TAB 7: PATIENT SHARED CLINICAL RESOURCES */}
              {activeTab === 'resources' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-850 p-6 border border-gray-150 dark:border-gray-800 rounded-2xl">
                    <div className="flex items-center justify-between border-b dark:border-gray-800 pb-3 mb-6">
                      <div>
                        <h2 className="text-sm font-black uppercase text-gray-700 dark:text-gray-300">My Shared Educational & Clinical Resources</h2>
                        <p className="text-[11px] text-gray-400 font-bold mt-1 uppercase">Temporary secure assets shared by your clinical providers</p>
                      </div>
                      <Share2 className="w-5 h-5 text-green-500" />
                    </div>

                    {patientResources.length === 0 ? (
                      <div className="py-20 text-center flex flex-col items-center justify-center">
                        <Share2 className="w-12 h-12 text-gray-300 mb-3" />
                        <span className="text-sm text-gray-400 font-extrabold">No clinical files shared with you yet</span>
                        <p className="text-xs text-gray-400 mt-1 max-w-sm">When your doctor shares video materials or files, they will automatically appear here with a secure temporary viewing duration.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {patientResources.map((res) => {
                          const expired = new Date(res.expires_at) < new Date();
                          return (
                            <div 
                              key={res.id} 
                              className={`p-5 rounded-2xl border transition-all ${
                                expired 
                                  ? 'bg-gray-50/50 dark:bg-gray-900/10 border-gray-100 dark:border-gray-800/80 opacity-60' 
                                  : 'bg-white dark:bg-gray-800 border-gray-150 dark:border-gray-700 hover:shadow-lg hover:border-green-200 dark:hover:border-green-900/30'
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                                    expired 
                                      ? 'bg-gray-100 dark:bg-gray-900 text-gray-400 border-gray-200/50' 
                                      : 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-100/50 dark:border-green-900/30'
                                  }`}>
                                    {res.resource_type === 'video_link' ? (
                                      <Video className="w-5 h-5" />
                                    ) : res.resource_type === 'pdf_file' ? (
                                      <FileHeart className="w-5 h-5 text-red-500" />
                                    ) : (
                                      <Link className="w-5 h-5 text-indigo-500" />
                                    )}
                                  </div>
                                  <div>
                                    <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">{res.title}</h3>
                                    <span className="text-[9px] text-gray-400 font-bold block mt-0.5 uppercase">Type: {res.resource_type?.replace(/_/g, ' ')}</span>
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                  expired 
                                    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 text-red-500' 
                                    : 'bg-green-50 dark:bg-green-950/20 border-green-200 text-green-600'
                                }`}>
                                  {expired ? 'EXPIRED' : 'ACTIVE'}
                                </span>
                              </div>

                              {res.description && (
                                <p className="text-xs text-gray-500 font-medium mt-3 bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-100 dark:border-gray-800 line-clamp-3">
                                  {res.description}
                                </p>
                              )}

                              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-[10px] font-bold">
                                <span className={expired ? 'text-red-500' : 'text-green-600 dark:text-green-400'}>
                                  {expired ? `Expired on ${new Date(res.expires_at).toLocaleString()}` : `Expires: ${new Date(res.expires_at).toLocaleString()}`}
                                </span>
                                
                                {!expired && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => copyDirectShareLink(res.id)}
                                      className="px-3 py-2 bg-gray-105 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95 flex items-center gap-1 border dark:border-gray-750"
                                      title="Copy secure direct link to watch without logging in"
                                    >
                                      <Link className="w-3 h-3" />
                                      <span>Copy Link</span>
                                    </button>
                                    <button
                                      onClick={() => setSelectedPortalResource(res)}
                                      className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95 shadow-md shadow-green-500/10 flex items-center gap-1.5"
                                    >
                                      <span>Launch Viewer</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Secure Media Viewer Overlay Modal */}
              {selectedPortalResource && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
                  <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-gray-150 dark:border-gray-800 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                    {/* Timer banner */}
                    <div className="bg-red-500 text-white text-xs font-black uppercase tracking-widest text-center py-2 px-4 rounded-xl mb-4 flex items-center justify-center gap-2 animate-pulse">
                      <span>🔒 SECURE TEMPORARY VIEWING ACTIVE</span>
                      <span>•</span>
                      <span>TIME REMAINING: {portalResourceTimeLeft}</span>
                    </div>

                    {/* Header */}
                    <div className="flex justify-between items-start border-b border-gray-100 dark:border-gray-850 pb-4 mb-4">
                      <div>
                        <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                          {selectedPortalResource.resource_type === 'video_link' ? <Video className="w-5 h-5 text-green-500" /> : <FileHeart className="w-5 h-5 text-red-500" />}
                          {selectedPortalResource.title}
                        </h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Shared Clinical Education Material</p>
                      </div>
                      <button 
                        onClick={() => setSelectedPortalResource(null)}
                        className="p-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"
                      >
                        <X className="w-5 h-5 text-gray-500" />
                      </button>
                    </div>

                    {/* Content Frame */}
                    <div className="flex-1 min-h-[40vh] bg-black rounded-2xl overflow-hidden flex items-center justify-center relative mb-4">
                      {selectedPortalResource.resource_type === 'video_link' && (
                        (() => {
                          const url = selectedPortalResource.url;
                          let embedUrl = '';
                          if (url.includes('youtube.com/watch')) {
                            const v = new URLSearchParams(new URL(url).search).get('v');
                            if (v) embedUrl = `https://www.youtube.com/embed/${v}`;
                          } else if (url.includes('youtu.be/')) {
                            const parts = url.split('/');
                            const v = parts[parts.length - 1]?.split('?')[0];
                            if (v) embedUrl = `https://www.youtube.com/embed/${v}`;
                          } else if (url.includes('vimeo.com/')) {
                            const parts = url.split('/');
                            const v = parts[parts.length - 1];
                            if (v) embedUrl = `https://player.vimeo.com/video/${v}`;
                          }

                          if (embedUrl) {
                            return (
                              <iframe
                                src={embedUrl}
                                className="w-full h-full absolute inset-0 border-0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            );
                          } else {
                            return (
                              <div className="text-center p-6 text-white space-y-4">
                                <Video className="w-12 h-12 text-green-500 mx-auto mb-2" />
                                <h3 className="text-sm font-bold uppercase">Direct Video Resource</h3>
                                <p className="text-xs text-gray-400 max-w-sm">This video URL cannot be embedded inline. Click below to launch in a secure browser tab.</p>
                                <a 
                                  href={selectedPortalResource.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-block py-2.5 px-6 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition"
                                >
                                  Open Video Link
                                </a>
                              </div>
                            );
                          }
                        })()
                      )}

                      {selectedPortalResource.resource_type === 'pdf_file' && (
                        <iframe 
                          src={`${selectedPortalResource.url}#toolbar=0`}
                          className="w-full h-full absolute inset-0 border-0 bg-white"
                          title="PDF Viewer"
                        />
                      )}

                      {selectedPortalResource.resource_type === 'other' && (() => {
                        const isImage = selectedPortalResource.url?.startsWith('data:image/') || 
                                        selectedPortalResource.url?.match(/\.(jpeg|jpg|gif|png|webp|svg)/i) !== null;
                        if (isImage) {
                          return (
                            <img
                              src={selectedPortalResource.url}
                              alt={selectedPortalResource.title}
                              className="max-w-full max-h-[50vh] object-contain rounded-xl shadow-2xl border border-gray-800"
                            />
                          );
                        }
                        return (
                          <div className="text-center p-6 text-white space-y-4">
                            <Link className="w-12 h-12 text-indigo-500 mx-auto mb-2" />
                            <h3 className="text-sm font-bold uppercase">Clinical Reference Asset</h3>
                            <p className="text-xs text-gray-400 max-w-sm">This document resource resides on an external secure host. Launch the reference below.</p>
                            <a 
                              href={selectedPortalResource.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-block py-2.5 px-6 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition"
                            >
                              Open Reference Asset
                            </a>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Footer instructions */}
                    {selectedPortalResource.description && (
                      <div className="bg-gray-50 dark:bg-gray-850 p-4 rounded-2xl border border-gray-150 dark:border-gray-800 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        <strong className="text-[10px] uppercase font-black text-gray-400 block mb-1">Clinical Instructions & Advisory:</strong>
                        {selectedPortalResource.description}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

    </div>
  );
}
