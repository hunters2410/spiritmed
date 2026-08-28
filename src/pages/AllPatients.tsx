import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { autoAllocateCredits } from '../utils/creditAllocation';

// ── Module-level cache (survives navigation, cleared after 5 min) ─────────────
const _cache: { patients: any[] | null; ts: number; branchId: string | null; billsLoaded: boolean } = {
  patients: null, ts: 0, branchId: null, billsLoaded: false,
};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
function isCacheValid(branchId: string | null) {
  return _cache.patients !== null
    && _cache.branchId === branchId
    && Date.now() - _cache.ts < CACHE_TTL_MS;
}
export function invalidateAllPatientsCache() { _cache.patients = null; _cache.ts = 0; _cache.billsLoaded = false; }
// ─────────────────────────────────────────────────────────────────────────────
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  Search, Eye, Phone, Mail, Download, Filter, Upload,
  Users, Skull, UserMinus, UserX, UserCheck, Clock,
  FileSpreadsheet, FileJson, ChevronLeft, ChevronRight,
  Stethoscope, HeartPulse, FileText, CreditCard, Edit2, Share2, Trash2, X,
  Plus, CheckCircle2, XCircle, Copy, Check, Link, MessageSquare, Send, UserPlus,
  DollarSign, Receipt, TrendingDown, TrendingUp, History, Video, AlertCircle
} from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { emailService } from '../utils/emailService';
import { smsService } from '../utils/smsService';

import { PatientPrintView } from '../components/PatientPrintView';
import { AppointmentPatientFilesModal } from '../components/AppointmentPatientFilesModal';
import { logActivity } from '../utils/auditLogger';
import { formatFileNumber, formatPatientNumber } from '../utils/patientUtils';
import { SearchDropdown } from '../components/SearchDropdown';
import { SearchableSelect } from '../components/SearchableSelect';

interface Doctor {
  id: string;
  full_name: string;
}

interface MedicalAid {
  id: string;
  name: string;
}

interface ReferralDoctor {
  id: string;
  full_name: string;
}

interface Patient {
  id: string;
  patient_number: string;
  file_number?: string | null;
  national_id?: string | null;
  full_name: string;
  title?: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  email: string;
  status: string;
  address?: string;
  deceased_date?: string;
  deceased_reason?: string;
  discharged_date?: string;
  discharge_status?: string;
  discharge_notes?: string;
  total_due?: number;
  total_shortfall_due?: number;
  credit_balance?: number;
  created_at: string;
}

type FilterStatus = 'all' | 'active' | 'pending' | 'deceased' | 'discharged' | 'old';

const getAge = (dob: string): string => {
  if (!dob) return 'N/A';
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return `${age}`;
};

const normaliseStatus = (raw: string): FilterStatus => {
  if (!raw) return 'active';
  const l = raw.toLowerCase();
  if (['pending_approval', 'pending', 'awaiting_approval'].includes(l)) return 'pending';
  if (l === 'deceased') return 'deceased';
  if (l === 'discharged') return 'discharged';
  if (['inactive', 'old_patient', 'old'].includes(l)) return 'old';
  return 'active';
};

const STATUS_BADGE: Record<FilterStatus, string> = {
  all:        '',
  active:     'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  pending:    'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
  deceased:   'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
  discharged: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
  old:        'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
};

const STATUS_LABEL: Record<FilterStatus, string> = {
  all: 'All', active: 'Active', pending: 'Pending Approval', deceased: 'Deceased', discharged: 'Discharged', old: 'Old Patient',
};

const TABS = [
  { key: 'all' as FilterStatus,        label: 'All Patients',       Icon: Users },
  { key: 'active' as FilterStatus,     label: 'Active',             Icon: UserCheck },
  { key: 'pending' as FilterStatus,    label: 'Pending Approval',   Icon: Clock },
  { key: 'deceased' as FilterStatus,   label: 'Deceased',           Icon: Skull },
  { key: 'discharged' as FilterStatus, label: 'Discharged',         Icon: UserMinus },
  { key: 'old' as FilterStatus,        label: 'Old / Archived',     Icon: UserX },
];

export function AllPatients() {
  const { profile, hasPermission } = useAuth();
  const { showToast } = useToast();
  const canFinance = hasPermission('billing', 'view') || hasPermission('payments', 'view');
  const [allPatients, setAllPatients]   = useState<Patient[]>([]);
  const [loading, setLoading]           = useState(true);
  const [isFetching, setIsFetching]     = useState(false);
  const [totalDbCount, setTotalDbCount] = useState<number>(0);
  const [grandTotalDue, setGrandTotalDue] = useState<number>(0);
  const [grandTotalCredit, setGrandTotalCredit] = useState<number>(0);
  const [counts, setCounts]             = useState<Record<FilterStatus, number>>({ all: 0, active: 0, pending: 0, deceased: 0, discharged: 0, old: 0 });
  const [searchQuery, setSearchQuery]   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedOnce = useRef(false);
  const [activeStatus, setActiveStatus] = useState<FilterStatus>('all');
  const [showFilters, setShowFilters]   = useState(false);
  const [filters, setFilters]           = useState({ gender: 'all', hasBalance: 'all' });
  const [currentPage, setCurrentPage]   = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300);
  }, []);

  // Bulk Delete State
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting]             = useState(false);

  // Add Patient Modal State
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [submittingPatient, setSubmittingPatient]     = useState(false);
  const [currentTab, setCurrentTab]                   = useState<'personal' | 'medical' | 'nextofkin' | 'financial'>('personal');
  const [doctors, setDoctors]                         = useState<Doctor[]>([]);
  const [medicalAids, setMedicalAids]                 = useState<MedicalAid[]>([]);
  const [referralDoctors, setReferralDoctors]         = useState<ReferralDoctor[]>([]);
  const [fileNumberPool, setFileNumberPool]           = useState<any[]>([]);
  const [showFileDropdown, setShowFileDropdown]       = useState(false);

  const initialNewPatientForm = {
    title: '',
    full_name: '',
    gender: 'male',
    email: '',
    password: '',
    address: '',
    phone: '',
    date_of_birth: '',
    doctor_id: '',
    clinical_history: '',
    chronic_medications: '',
    smoke: 'never',
    alcohol: 'never',
    flags: '',
    allergies: '',
    chronic_conditions: '',
    occupation: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    next_of_kin_address: '',
    next_of_kin_relation: '',
    next_of_kin_email: '',
    responsible_person_name: '',
    responsible_person_address: '',
    responsible_person_phone: '',
    responsible_person_id_number: '',
    responsible_person_email: '',
    payment_method: 'cash',
    medical_aid_id: '',
    medical_aid_number: '',
    medical_aid_suffix: '',
    medical_aid_main_member: '',
    referral_doctor_id: '',
    file_number: '',
    status: 'active',
    send_sms: false
  };

  const [newPatientForm, setNewPatientForm] = useState(initialNewPatientForm);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [fileNumberError, setFileNumberError] = useState<string | null>(null);

  const validateEmail = async (emailVal: string) => {
    if (!emailVal || !emailVal.trim()) {
      setEmailError(null);
      return true;
    }
    try {
      const trimmed = emailVal.trim();
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, patient_number')
        .ilike('email', trimmed);

      if (data && data.length > 0) {
        const p = data[0];
        setEmailError(`Email "${trimmed}" is already registered to ${p.full_name} (${p.patient_number})`);
        return false;
      } else {
        setEmailError(null);
        return true;
      }
    } catch (err) {
      console.error('Error checking email uniqueness:', err);
      return true;
    }
  };

  const validateFileNumber = async (fileVal: string) => {
    if (!fileVal || !fileVal.trim()) {
      setFileNumberError(null);
      return true;
    }
    try {
      const trimmed = fileVal.trim();
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, patient_number, status, file_number')
        .eq('file_number', trimmed);

      if (data && data.length > 0) {
        const activeOccupant = data.find(p => p.status === 'active' || (p.status !== 'old_patient' && p.status !== 'inactive'));
        if (activeOccupant) {
          setFileNumberError(`File Number "${trimmed}" is already occupied by active patient ${activeOccupant.full_name} (${activeOccupant.patient_number})`);
          return false;
        }
      }
      setFileNumberError(null);
      return true;
    } catch (err) {
      console.error('Error checking file number occupancy:', err);
      return true;
    }
  };

  const resetNewPatientForm = () => {
    setNewPatientForm(initialNewPatientForm);
    setCurrentTab('personal');
    setShowFileDropdown(false);
    setEmailError(null);
    setFileNumberError(null);
  };

  // Share Registration Link Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedLink, setCopiedLink]         = useState(false);

  // View Patient Print Sheet State
  const [showViewSheet, setShowViewSheet]                   = useState(false);
  const [selectedPatientForView, setSelectedPatientForView] = useState<any>(null);
  const [branch, setBranch]                                 = useState<any>(null);

  // Patient Files Modal State
  const [showFilesModal, setShowFilesModal]                 = useState(false);
  const [selectedPatientForFiles, setSelectedPatientForFiles] = useState<Patient | null>(null);

  // Patient Payment History Modal State
  const [showHistoryModal, setShowHistoryModal]             = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<Patient | null>(null);
  const [paymentHistory, setPaymentHistory]                 = useState<any[]>([]);
  const [patientBills, setPatientBills]                     = useState<any[]>([]);
  const [historyLoading, setHistoryLoading]                 = useState(false);
  const [historySearch, setHistorySearch]                   = useState('');
  const [billSummary, setBillSummary]                       = useState<{ totalBilled: number; totalPaid: number; balance: number; medicalAidBilled: number; medicalAidBalance: number }>({ totalBilled: 0, totalPaid: 0, balance: 0, medicalAidBilled: 0, medicalAidBalance: 0 });

  // Edit Patient Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    title: '', full_name: '', gender: 'male', email: '', password: '', address: '', phone: '', date_of_birth: '', doctor_id: '', clinical_history: '', chronic_medications: '', smoke: 'never', alcohol: 'never', flags: '', allergies: '', chronic_conditions: '', occupation: '', emergency_contact_name: '', emergency_contact_phone: '', next_of_kin_address: '', next_of_kin_relation: '', next_of_kin_email: '', responsible_person_name: '', responsible_person_address: '', responsible_person_phone: '', responsible_person_id_number: '', responsible_person_email: '', payment_method: 'cash', medical_aid_id: '', medical_aid_number: '', medical_aid_suffix: '', medical_aid_main_member: '', referral_doctor_id: '', file_number: '', status: 'active', send_sms: false
  });
  const [editTab, setEditTab] = useState<'personal' | 'medical' | 'nextofkin' | 'financial'>('personal');

  // Patient Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [parsedPatients, setParsedPatients] = useState<any[] | null>(null);

  // Status Modals State (Deceased / Discharged / Old Patient)
  const [showDeceasedModal, setShowDeceasedModal] = useState(false);
  const [showDischargedModal, setShowDischargedModal] = useState(false);
  const [showOldPatientModal, setShowOldPatientModal] = useState(false);
  const [selectedPatientForStatus, setSelectedPatientForStatus] = useState<Patient | null>(null);
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [statusFormData, setStatusFormData] = useState({
    date: new Date().toISOString().split('T')[0], reason: '', notes: '', recipient: '',
    diagnosis_ids: [] as string[], diagnosis_text: '', medical_history: '', treatment_done: '', follow_up_plan: '', createSummary: true
  });

  // Patient Resources State
  const [showResourcesModal, setShowResourcesModal] = useState(false);
  const [selectedPatientForResources, setSelectedPatientForResources] = useState<any>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [patientResourcesList, setPatientResourcesList] = useState<any[]>([]);
  const [resourceModalTab, setResourceModalTab] = useState<'list' | 'share'>('list');
  const [newResourceForm, setNewResourceForm] = useState({ title: '', description: '', resource_type: 'video_link', url: '', expiry_hours: '24', custom_expiry_date: '', custom_expiry_time: '' });
  const [resourceSourceType, setResourceSourceType] = useState<'link' | 'upload'>('link');
  const [resourceUploadFile, setResourceUploadFile] = useState<File | null>(null);
  const [uploadingResourceFile, setUploadingResourceFile] = useState(false);

  // Patient File Upload State
  const [patientFiles, setPatientFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [fileForm, setFileForm] = useState({ title: '', notes: '', date: new Date().toISOString().split('T')[0] });

  // Navigate to bills page using the project's native pushState routing
  const navigateToBills = (state: Record<string, any>) => {
    sessionStorage.setItem('billsNavState', JSON.stringify(state));
    window.history.pushState({}, '', '/bills');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  useEffect(() => {
    if (profile) {
      loadDoctors();
      loadMedicalAids();
      loadReferralDoctors();
      loadFileNumberPool();
      loadBranch();
      loadDiagnoses();
      fetchStatusCounts();
      fetchGrandTotalDue();
    }
  }, [profile]);

  // Re-fetch page whenever page, search, status tab, or filters change
  useEffect(() => {
    if (profile) fetchPage(currentPage, debouncedSearch);
  }, [currentPage, debouncedSearch, activeStatus, filters, profile]);

  const loadDoctors = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      let query = supabase
        .from('users')
        .select('id, full_name')
        .eq('role', 'doctor')
        .eq('is_active', true);

      if (profile.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDoctors(data || []);
    } catch (error) {
      console.error('Error loading doctors:', error);
    }
  };

  const loadMedicalAids = async () => {
    try {
      const { data, error } = await supabase
        .from('medical_aids')
        .select('id, name')
        .eq('is_active', true);

      if (error) throw error;
      setMedicalAids(data || []);
    } catch (error) {
      console.error('Error loading medical aids:', error);
    }
  };

  const loadFileNumberPool = async () => {
    try {
      const { data: manualPool } = await supabase
        .from('file_number_pool')
        .select('file_number, is_occupied')
        .order('file_number', { ascending: true });

      const { data: inactivePatients } = await supabase
        .from('patients')
        .select('file_number, full_name, patient_number, status')
        .in('status', ['discharged', 'deceased', 'inactive', 'old_patient']);

      const poolMap = new Map<string, any>();

      (manualPool || []).forEach(m => {
        if (m.file_number) {
          const fn = m.file_number.split('-')[0].trim();
          poolMap.set(fn, {
            file_number: fn,
            is_occupied: m.is_occupied,
            label: `${fn} (Manual Pool)`
          });
        }
      });

      (inactivePatients || []).forEach(p => {
        if (p.file_number) {
          const fn = p.file_number.split('-')[0].trim();
          const tag = p.status === 'discharged' ? 'Discharged' : p.status === 'deceased' ? 'Deceased' : 'Old Patient';
          poolMap.set(fn, {
            file_number: fn,
            is_occupied: false,
            label: `${fn} (${tag}: ${p.full_name})`
          });
        }
      });

      const list = Array.from(poolMap.values()).sort((a, b) => a.file_number.localeCompare(b.file_number, undefined, { numeric: true }));
      setFileNumberPool(list);
    } catch (error) {
      console.error('Error loading file number pool:', error);
    }
  };

  const loadReferralDoctors = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      let query = supabase
        .from('referral_doctors')
        .select('id, full_name')
        .eq('is_active', true);

      if (profile.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReferralDoctors(data || []);
    } catch (error) {
      console.error('Error loading referral doctors:', error);
    }
  };

  const loadBranch = async () => {
    if (!profile?.branch_id) return;
    try {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('id', profile.branch_id)
        .single();
      if (data) setBranch(data);
    } catch (err) {
      console.error('Error loading branch:', err);
    }
  };

  /**
   * Server-side paginated fetch — loads only the current 25 rows WITH bills.
   * Much faster than loading all patients upfront.
   */
  const fetchPage = useCallback(async (page: number, search: string) => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;
    // First load → full skeleton; subsequent fetches → keep table visible
    if (!hasLoadedOnce.current) { setLoading(true); } else { setIsFetching(true); }
    try {
      let query = supabase
        .from('patients')
        .select(
          `id, patient_number, file_number, national_id, full_name, title,
           date_of_birth, gender, phone, email, status, address,
           deceased_date, deceased_reason, discharged_date, discharge_status, discharge_notes,
           created_at, branch_id, medical_aid_id,
           medical_aid:medical_aids(name),
           bills(balance, total_amount, paid_amount, discount_amount, medical_aid_balance, shortfall_balance)`,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range((page - 1) * itemsPerPage, page * itemsPerPage - 1);

      if (profile!.role !== 'super_admin') query = query.eq('branch_id', profile!.branch_id);
      if (activeStatus !== 'all') {
        if (activeStatus === 'old') {
          query = query.in('status', ['inactive', 'old_patient', 'old']);
        } else if (activeStatus === 'pending') {
          query = query.in('status', ['pending', 'pending_approval', 'awaiting_approval']);
        } else {
          query = query.eq('status', activeStatus);
        }
      }
      if (search.trim()) {
        query = query.or(
          `full_name.ilike.%${search.trim()}%,` +
          `patient_number.ilike.%${search.trim()}%,` +
          `phone.ilike.%${search.trim()}%,` +
          `file_number.ilike.%${search.trim()}%,` +
          `national_id.ilike.%${search.trim()}%`
        );
      }
      if (filters.gender !== 'all') query = query.eq('gender', filters.gender);

      const { data, count, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map((p: any) => {
        const billed = (p.bills || []).reduce((s: number, b: any) => s + (b.total_amount || 0), 0);
        const paid = (p.bills || []).reduce((s: number, b: any) => s + (b.paid_amount || 0), 0);
        const shortfall = (p.bills || []).reduce((s: number, b: any) => s + (b.shortfall_balance || 0), 0);
        const net = billed - paid;
        return {
          ...p,
          total_due: Math.max(0, net),
          total_shortfall_due: Math.max(0, shortfall),
          credit_balance: net < 0 ? Math.abs(net) : 0,
        };
      });

      setAllPatients(mapped);
      setTotalDbCount(count || 0);
      hasLoadedOnce.current = true;
    } catch (err) {
      console.error('Error fetching patients:', err);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [profile, activeStatus, filters, itemsPerPage]);

  // Fetch per-status counts for the tab badges (fast HEAD requests)
  const fetchStatusCounts = useCallback(async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;
    const statusGroups: { key: FilterStatus; statuses: string[] }[] = [
      { key: 'active', statuses: ['active'] },
      { key: 'pending', statuses: ['pending', 'pending_approval', 'awaiting_approval'] },
      { key: 'deceased', statuses: ['deceased'] },
      { key: 'discharged', statuses: ['discharged'] },
      { key: 'old', statuses: ['inactive', 'old_patient', 'old'] },
    ];
    const results: Partial<Record<FilterStatus, number>> = {};
    await Promise.all(statusGroups.map(async ({ key, statuses }) => {
      let q = supabase.from('patients').select('*', { count: 'exact', head: true }).in('status', statuses);
      if (profile!.role !== 'super_admin') q = q.eq('branch_id', profile!.branch_id);
      const { count } = await q;
      results[key] = count || 0;
    }));
    const all = Object.values(results).reduce((a: number, b) => a + (b || 0), 0);
    setCounts({ all, active: 0, pending: 0, deceased: 0, discharged: 0, old: 0, ...results } as Record<FilterStatus, number>);
  }, [profile]);

  // Thin wrapper kept for backward-compat call sites (approve, delete, status change, etc.)
  const loadAllPatients = useCallback((force = false) => {
    setCurrentPage(1);
    fetchPage(1, debouncedSearch);
    fetchStatusCounts();
    fetchGrandTotalDue();
  }, [fetchPage, fetchStatusCounts, debouncedSearch]);

  /**
   * Fetch the grand total dues across ALL patients in the database.
   * Runs once on mount and on every refresh — independent of pagination.
   */
  const fetchGrandTotalDue = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;
    try {
      const CHUNK = 1000;
      let from = 0;
      let hasMore = true;
      const patientBalances: Record<string, { billed: number; paid: number }> = {};

      while (hasMore) {
        let query = supabase
          .from('bills')
          .select('patient_id, total_amount, paid_amount')
          .order('id', { ascending: true })
          .range(from, from + CHUNK - 1);

        if (profile!.role !== 'super_admin') {
          query = query.eq('branch_id', profile!.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          for (const b of data) {
            const pid = b.patient_id || 'unknown';
            if (!patientBalances[pid]) patientBalances[pid] = { billed: 0, paid: 0 };
            patientBalances[pid].billed += Number(b.total_amount) || 0;
            patientBalances[pid].paid += Number(b.paid_amount) || 0;
          }
          from += data.length;
          if (data.length < CHUNK) hasMore = false;
        } else {
          hasMore = false;
        }
      }

      let grossDue = 0;
      let grossCredit = 0;
      for (const pid in patientBalances) {
        const diff = patientBalances[pid].billed - patientBalances[pid].paid;
        if (diff > 0.009) {
          grossDue += diff;
        } else if (diff < -0.009) {
          grossCredit += Math.abs(diff);
        }
      }

      setGrandTotalDue(grossDue);
      setGrandTotalCredit(grossCredit);
    } catch (err) {
      console.error('Error fetching grand total dues:', err);
    }
  };


  const handleViewPatient = (patient: any) => {
    setSelectedPatientForView(patient);
    setShowViewSheet(true);
  };

  const handleOpenFiles = (patient: Patient) => {
    setSelectedPatientForFiles(patient);
    setShowFilesModal(true);
  };

  const handleOpenHistory = (patient: Patient) => {
    setSelectedPatientForHistory(patient);
    setPaymentHistory([]);
    setShowHistoryModal(true);
    loadPatientHistory(patient.id);
  };

  const loadPatientHistory = async (patientId: string) => {
    try {
      setHistoryLoading(true);
      setHistorySearch('');
      setBillSummary({ totalBilled: 0, totalPaid: 0, balance: 0, medicalAidBilled: 0, medicalAidBalance: 0 });

      const fetchBills = () => supabase
        .from('bills')
        .select('id, bill_number, bill_date, due_date, total_amount, paid_amount, discount_amount, balance, medical_aid_amount, medical_aid_balance, shortfall_amount, shortfall_balance, payment_method, status')
        .eq('patient_id', patientId)
        .order('bill_date', { ascending: true });

      let { data: bills } = await fetchBills();

      // Auto-fix existing overpayments: if totalPaid > totalBilled and unpaid bills exist, allocate credit now
      if (bills && bills.length > 0) {
        const totalPaidCheck = bills.reduce((s, b) => s + (b.paid_amount || 0), 0);
        const totalOwedCheck = bills.reduce((s, b) => s + Math.max(0, (b.total_amount || 0) - (b.discount_amount || 0)), 0);
        const hasUnpaid = bills.some(b => b.status !== 'paid');
        if (totalPaidCheck > totalOwedCheck && hasUnpaid) {
          await autoAllocateCredits(patientId, profile?.branch_id ?? null);
          // Re-fetch with corrected data
          const { data: refreshed } = await fetchBills();
          bills = refreshed;
        }
      }

      setPatientBills(bills || []);
      const bIds = (bills || []).map(b => b.id);

      const totalBilled = (bills || []).reduce((s, b) => s + (b.total_amount || 0), 0);
      const totalPaid   = (bills || []).reduce((s, b) => s + (b.paid_amount || 0), 0);
      // Outstanding = Total Billed − Total Paid (avoids stale DB balance column)
      const balance     = Math.max(0, totalBilled - totalPaid);
      const medicalAidBilled  = (bills || []).reduce((s, b) => s + (b.medical_aid_amount || 0), 0);
      const medicalAidBalance = (bills || []).reduce((s, b) => s + (b.medical_aid_balance || 0), 0);
      setBillSummary({ totalBilled, totalPaid, balance, medicalAidBilled, medicalAidBalance });

      if (bIds.length === 0) { setPaymentHistory([]); return; }

      const { data: pmts, error } = await supabase
        .from('payments')
        .select('id, amount, payment_method, payment_date, created_at, target_portion, notes, bill_id, discount_amount')
        .in('bill_id', bIds)
        .order('payment_date', { ascending: true });

      if (error) throw error;

      setPaymentHistory((pmts || []).map(p => {
        const b = (bills || []).find(x => x.id === p.bill_id);
        return { ...p, bill_number: b?.bill_number, bill_date: b?.bill_date };
      }));
    } catch (err) {
      console.error('Error loading patient history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExportHistory = (format: 'pdf' | 'excel') => {
    if (!selectedPatientForHistory) return;
    const patient = selectedPatientForHistory;
    const fname = `${patient.full_name.replace(/\s+/g, '_')}_Statement`;
    const allEventsBase = [
      ...patientBills.map(b => ({ _type: 'bill', _date: new Date(b.bill_date), ...b })),
      ...paymentHistory.map(p => ({ _type: 'payment', _date: new Date(p.payment_date), ...p }))
    ].sort((a, b) => a._date.getTime() - b._date.getTime());

    if (format === 'excel') {
      let running = 0;
      const rows = allEventsBase.map(e => {
        let debit = '', credit = '';
        if (e._type === 'bill') { running += (e.total_amount || 0); debit = `$${(e.total_amount || 0).toFixed(2)}`; }
        else { running -= (e.amount || 0); credit = `$${(e.amount || 0).toFixed(2)}`; }
        const bal = running < 0 ? `-$${Math.abs(running).toFixed(2)} CR` : `$${running.toFixed(2)}`;
        return {
          'Date': e._type === 'bill' ? new Date(e.bill_date).toLocaleDateString() : new Date(e.payment_date).toLocaleDateString(),
          'Reference': e.bill_number || '',
          'Type': e._type === 'bill' ? 'Invoice' : 'Payment',
          'Details': e._type === 'payment' ? (e.payment_method || 'cash').replace(/_/g, ' ') : (e.status || 'unpaid').replace(/_/g, ' '),
          'Debit (+)': debit,
          'Credit (-)': credit,
          'Balance': bal,
        };
      });
      const summaryRows = [
        { 'Date': 'SUMMARY', 'Reference': '', 'Type': 'Total Billed', 'Details': '', 'Debit (+)': `$${billSummary.totalBilled.toFixed(2)}`, 'Credit (-)': '', 'Balance': '' },
        { 'Date': '', 'Reference': '', 'Type': 'Total Paid', 'Details': '', 'Debit (+)': '', 'Credit (-)': `$${billSummary.totalPaid.toFixed(2)}`, 'Balance': '' },
        { 'Date': '', 'Reference': '', 'Type': billSummary.balance < 0 ? 'Credit Balance' : 'Outstanding', 'Details': '', 'Debit (+)': '', 'Credit (-)': '', 'Balance': billSummary.balance < 0 ? `-$${Math.abs(billSummary.balance).toFixed(2)} CR` : `$${billSummary.balance.toFixed(2)}` },
        { 'Date': '', 'Reference': '', 'Type': '', 'Details': '', 'Debit (+)': '', 'Credit (-)': '', 'Balance': '' },
      ];
      exportToExcel([...summaryRows, ...rows], fname);
    } else {
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      doc.setFontSize(18); doc.setTextColor(30, 30, 30);
      doc.text('Patient Statement', 14, 18);
      doc.setFontSize(11); doc.setTextColor(80, 80, 80);
      doc.text(patient.full_name, 14, 26);
      doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      const subParts = [`Patient #: ${formatPatientNumber(patient.patient_number) || 'N/A'}`, patient.file_number ? `File #: ${formatFileNumber(patient.file_number)}` : ''].filter(Boolean);
      doc.text(subParts.join('   ·   '), 14, 32);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
      // Compute real final ledger running balance for Credit Balance card
      let pdfRunning = 0;
      for (const e of allEventsBase) {
        if (e._type === 'bill') pdfRunning += (e.total_amount || 0);
        else pdfRunning -= (e.amount || 0);
      }
      const finalLedgerBalance = pdfRunning; // negative = credit

      const cards = [
        { label: 'Total Billed', value: `$${billSummary.totalBilled.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: [219, 234, 254] as [number,number,number], textColor: [29, 78, 216] as [number,number,number] },
        { label: 'Total Paid', value: `$${billSummary.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: [209, 250, 229] as [number,number,number], textColor: [4, 120, 87] as [number,number,number] },
        ...(finalLedgerBalance < 0 ? [{ label: 'Credit Balance', value: `-$${Math.abs(finalLedgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: [237, 233, 254] as [number,number,number], textColor: [109, 40, 217] as [number,number,number] }] : []),
        { label: 'Outstanding', value: `$${billSummary.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: billSummary.balance > 0 ? [254, 243, 199] as [number,number,number] : [243, 244, 246] as [number,number,number], textColor: billSummary.balance > 0 ? [146, 64, 14] as [number,number,number] : [75, 85, 99] as [number,number,number] },
        { label: 'Med Aid Bal', value: `$${billSummary.medicalAidBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, color: [224, 231, 255] as [number,number,number], textColor: [67, 56, 202] as [number,number,number] },
        { label: 'Bills / Pmts', value: `${patientBills.length} / ${paymentHistory.length}`, color: [243, 244, 246] as [number,number,number], textColor: [55, 65, 81] as [number,number,number] },
      ];
      const cardW = (pageW - 28 - (cards.length - 1) * 3) / cards.length;
      const cardY = 44; const cardH = 18;
      cards.forEach((card, i) => {
        const x = 14 + i * (cardW + 3);
        doc.setFillColor(...card.color);
        doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'F');
        doc.setFontSize(6); doc.setTextColor(100, 100, 100);
        doc.text(card.label.toUpperCase(), x + 3, cardY + 5);
        doc.setFontSize(9); doc.setTextColor(...card.textColor);
        doc.setFont(undefined, 'bold'); doc.text(card.value, x + 3, cardY + 13);
        doc.setFont(undefined, 'normal');
      });
      let running = 0;
      const tableBody = allEventsBase.map(e => {
        let debit = '', credit = '', typeStr = '', details = '';
        if (e._type === 'bill') { running += (e.total_amount||0); debit = `$${(e.total_amount||0).toFixed(2)}`; typeStr = 'Invoice'; details = (e.status||'unpaid').replace(/_/g,' ').toUpperCase(); }
        else { running -= (e.amount||0); credit = `$${(e.amount||0).toFixed(2)}`; typeStr = 'Payment'; details = (e.payment_method||'cash').replace(/_/g,' '); }
        const bal = running < 0 ? `-$${Math.abs(running).toFixed(2)}` : `$${running.toFixed(2)}`;
        const dateStr = e._type === 'bill' ? new Date(e.bill_date).toLocaleDateString() : new Date(e.payment_date).toLocaleDateString();
        return [dateStr, e.bill_number||'', typeStr, details, debit, credit, bal];
      });
      const finalBal = finalLedgerBalance < 0 ? `-$${Math.abs(finalLedgerBalance).toFixed(2)} CR` : `$${finalLedgerBalance.toFixed(2)}`;
      tableBody.push(['', '', 'TOTALS', '', `$${billSummary.totalBilled.toFixed(2)}`, `$${billSummary.totalPaid.toFixed(2)}`, finalBal]);
      autoTable(doc, {
        head: [['Date', 'Reference', 'Type', 'Details', 'Debit (+)', 'Credit (-)', 'Balance']],
        body: tableBody,
        startY: cardY + cardH + 6,
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
        columnStyles: { 0:{cellWidth:22}, 1:{cellWidth:24}, 2:{cellWidth:20}, 3:{cellWidth:34}, 4:{cellWidth:26,halign:'right'}, 5:{cellWidth:26,halign:'right'}, 6:{cellWidth:26,halign:'right'} },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (data) => {
          if (data.row.index === tableBody.length - 1) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [243, 244, 246]; }
          if (data.column.index === 6 && data.section === 'body') {
            const val = String(data.cell.raw || '');
            if (val.includes('CR') || val.startsWith('-')) data.cell.styles.textColor = [109, 40, 217];
            else if (val.startsWith('$0')) data.cell.styles.textColor = [4, 120, 87];
            else data.cell.styles.textColor = [146, 64, 14];
          }
        }
      });
      doc.save(`${fname}_${new Date().toISOString().split('T')[0]}.pdf`);
    }
  };

  const handleStatusChange = async (patient: any, newStatus: string) => {
    if (newStatus === patient.status) return;
    if (newStatus === 'discharged') { setSelectedPatientForStatus(patient); setShowDischargedModal(true); return; }
    if (newStatus === 'deceased') { setSelectedPatientForStatus(patient); setShowDeceasedModal(true); return; }
    if (newStatus === 'old_patient') { setSelectedPatientForStatus(patient); setShowOldPatientModal(true); return; }
    if (newStatus === 'active') {
      try {
        const { error } = await supabase.from('patients').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', patient.id);
        if (error) throw error;
        if (profile?.id && profile?.branch_id) await logActivity(supabase, { userId: profile.id, branchId: profile.branch_id, action: 'UPDATE', tableName: 'patients', recordId: patient.id, details: `Changed patient status to Active for ${patient.full_name}`, newValues: { status: 'active' } });
        showToast(`Patient ${patient.full_name} status updated to Active.`);
        invalidateAllPatientsCache(); fetchPage(currentPage, debouncedSearch); fetchStatusCounts();
      } catch (err: any) { console.error('Error setting active status:', err); showToast('Failed to update patient status', 'error'); }
    }
  };

  const handleUpdateStatus = async (status: 'deceased' | 'discharged') => {
    if (!selectedPatientForStatus) return;
    try {
      setLoading(true);
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === 'deceased') { updateData.deceased_date = statusFormData.date; updateData.deceased_reason = statusFormData.reason; }
      else { updateData.discharged_date = statusFormData.date; updateData.discharge_status = statusFormData.reason; updateData.discharge_notes = statusFormData.notes; }
      const { error } = await supabase.from('patients').update(updateData).eq('id', selectedPatientForStatus.id);
      if (error) throw error;
      if (status === 'discharged' && (statusFormData.diagnosis_ids.length > 0 || statusFormData.treatment_done || statusFormData.medical_history) && profile) {
        await supabase.from('discharge_summaries').insert([{ branch_id: profile.branch_id, patient_id: selectedPatientForStatus.id, doctor_id: profile.id, report_date: statusFormData.date, recipient: statusFormData.recipient, diagnosis_ids: statusFormData.diagnosis_ids, diagnosis_text: statusFormData.diagnosis_text, medical_history: statusFormData.medical_history, treatment_done: statusFormData.treatment_done, follow_up_plan: statusFormData.follow_up_plan }]);
      }
      if (profile?.id && profile?.branch_id) await logActivity(supabase, { userId: profile.id, branchId: profile.branch_id, action: 'STATUS_CHANGE', tableName: 'patients', recordId: selectedPatientForStatus.id, details: `Changed patient status to ${status.toUpperCase()} (Reason: ${statusFormData.reason})`, newValues: updateData });
      showToast(`Patient marked as ${status} successfully`);
      setShowDeceasedModal(false); setShowDischargedModal(false);
      setStatusFormData({ date: new Date().toISOString().split('T')[0], reason: '', notes: '', recipient: '', diagnosis_ids: [], diagnosis_text: '', medical_history: '', treatment_done: '', follow_up_plan: '', createSummary: true });
      setSelectedPatientForStatus(null);
      invalidateAllPatientsCache(); fetchPage(currentPage, debouncedSearch); fetchStatusCounts(); loadFileNumberPool();
    } catch (err: any) { console.error(`Error updating status to ${status}:`, err); showToast(`Failed to mark patient as ${status}`, 'error'); } finally { setLoading(false); }
  };

  const handleMarkOldPatient = async () => {
    if (!selectedPatientForStatus) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('patients').update({ status: 'inactive', file_number: null, updated_at: new Date().toISOString() }).eq('id', selectedPatientForStatus.id);
      if (error) throw error;
      if (profile?.id && profile?.branch_id) await logActivity(supabase, { userId: profile.id, branchId: profile.branch_id, action: 'UPDATE', tableName: 'patients', recordId: selectedPatientForStatus.id, details: `Marked patient as Old Patient & released File Number (${selectedPatientForStatus.file_number || 'N/A'})`, newValues: { status: 'inactive', file_number: null } });
      setShowOldPatientModal(false); setSelectedPatientForStatus(null);
      invalidateAllPatientsCache(); fetchPage(currentPage, debouncedSearch); fetchStatusCounts(); loadFileNumberPool();
      showToast(`Patient ${selectedPatientForStatus.full_name} set as Old Patient and file number released.`);
    } catch (err: any) { console.error('Error marking old patient:', err); showToast('Failed to update patient status', 'error'); } finally { setLoading(false); }
  };

  const loadDiagnoses = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;
    try {
      let query = supabase.from('diagnoses').select('id, name, icd10_code').eq('is_active', true);
      if (profile?.role !== 'super_admin') query = query.eq('branch_id', profile?.branch_id);
      const { data } = await query;
      setDiagnoses(data || []);
    } catch (err) { console.error('Error loading diagnoses:', err); }
  };

  // Edit Patient
  const handleEdit = (patient: any) => {
    setEditingPatient(patient);
    setEditFormData({
      title: patient.title || '', full_name: patient.full_name || '', gender: patient.gender || 'male', email: patient.email || '', password: '', address: patient.address || '', phone: patient.phone || '', date_of_birth: patient.date_of_birth || '', doctor_id: patient.doctor_id || '', clinical_history: patient.clinical_history || '', chronic_medications: patient.chronic_medications || '', smoke: patient.smoke || 'never', alcohol: patient.alcohol || 'never', flags: patient.flags || '', allergies: patient.allergies || '', chronic_conditions: patient.chronic_conditions || '', occupation: patient.occupation || '', emergency_contact_name: patient.emergency_contact_name || '', emergency_contact_phone: patient.emergency_contact_phone || '', next_of_kin_address: patient.next_of_kin_address || '', next_of_kin_relation: patient.next_of_kin_relation || '', next_of_kin_email: patient.next_of_kin_email || '', responsible_person_name: patient.responsible_person_name || '', responsible_person_address: patient.responsible_person_address || '', responsible_person_phone: patient.responsible_person_phone || '', responsible_person_id_number: patient.responsible_person_id_number || '', responsible_person_email: patient.responsible_person_email || '', payment_method: patient.payment_method || 'cash', medical_aid_id: patient.medical_aid_id || '', medical_aid_number: patient.medical_aid_number || '', medical_aid_suffix: patient.medical_aid_suffix || '', medical_aid_main_member: patient.medical_aid_main_member || '', referral_doctor_id: patient.referral_doctor_id || '', file_number: patient.file_number || '', status: patient.status || 'active', send_sms: false
    });
    setEditTab('personal');
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPatient) return;
    try {
      const { send_sms, password, ...dbData } = editFormData;
      const sanitized = Object.fromEntries(Object.entries(dbData).map(([k, v]) => [k, v === '' ? null : v]));
      const updatePayload: any = { ...sanitized, updated_at: new Date().toISOString() };
      if (password) updatePayload.password = password;
      const { error } = await supabase.from('patients').update(updatePayload).eq('id', editingPatient.id);
      if (error) throw error;
      if (profile?.id && profile?.branch_id) await logActivity(supabase, { userId: profile.id, branchId: profile.branch_id, action: 'UPDATE', tableName: 'patients', recordId: editingPatient.id, details: `Updated patient profile: ${editFormData.full_name}`, newValues: updatePayload });
      showToast('Patient updated successfully!');
      setShowEditModal(false); setEditingPatient(null);
      invalidateAllPatientsCache(); fetchPage(currentPage, debouncedSearch);
    } catch (err: any) { console.error('Error updating patient:', err); showToast('Failed to update patient: ' + (err?.message || 'Unknown error'), 'error'); }
  };

  // Import Patients
  const downloadSampleExcel = () => {
    const headers = ['Title','Full Name','Gender','Date of Birth','Phone','Email','Address','File Number','Payment Method','Medical Aid Name','Medical Aid Number','Medical Aid Main Member','Allergies','Chronic Conditions'];
    const sampleData = [['Mr.','Collen Hunters','Male','1990-05-15','+263771234567','collenhunters@example.com','123 Medical Way, Harare','FILE-99450','Cash','','','','Peanuts','Hypertension'],['Mrs.','Jane Hunters','Female','1985-08-22','+263772345678','janehunters@example.com','456 Clinic Avenue, Bulawayo','FILE-88320','Medical Aid','CIMAS','MA-442110','Jane Hunters','Penicillin','Asthma']];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    ws['!cols'] = [{wch:10},{wch:25},{wch:12},{wch:15},{wch:18},{wch:30},{wch:35},{wch:15},{wch:16},{wch:25},{wch:20},{wch:25},{wch:18},{wch:22}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Patients Import Template');
    XLSX.writeFile(wb, 'spiritmed_patients_import_template.xlsx');
    showToast('Sample import template downloaded successfully!');
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]; setImportFile(file); setImportLogs([]); setParsedPatients(null);
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          if (rawData.length < 2) { setImportLogs(['Error: The file is empty or missing data rows.']); return; }
          const headers = rawData[0].map(h => String(h || '').trim().toLowerCase());
          const fullNameIdx = headers.indexOf('full name'), genderIdx = headers.indexOf('gender'), dobIdx = headers.indexOf('date of birth');
          if (fullNameIdx === -1) { setImportLogs(['Error: Missing required column "Full Name".']); return; }
          if (genderIdx === -1) { setImportLogs(['Error: Missing required column "Gender".']); return; }
          if (dobIdx === -1) { setImportLogs(['Error: Missing required column "Date of Birth".']); return; }
          const titleIdx = headers.indexOf('title'), phoneIdx = headers.indexOf('phone'), emailIdx = headers.indexOf('email'), addressIdx = headers.indexOf('address'), fileNumberIdx = headers.indexOf('file number'), paymentMethodIdx = headers.indexOf('payment method'), maNameIdx = headers.indexOf('medical aid name'), maNumIdx = headers.indexOf('medical aid number'), maMainIdx = headers.indexOf('medical aid main member'), allergiesIdx = headers.indexOf('allergies'), chronicIdx = headers.indexOf('chronic conditions');
          const parsedList: any[] = [], logs: string[] = [];
          for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i]; if (!row || !row[fullNameIdx]) continue;
            const fullName = String(row[fullNameIdx] || '').trim(), gender = String(row[genderIdx] || '').trim().toLowerCase(), dobString = String(row[dobIdx] || '').trim();
            let dob = dobString;
            if (!isNaN(Number(dobString)) && Number(dobString) > 20000) { const date = new Date((Number(dobString) - 25569) * 86400 * 1000); dob = date.toISOString().split('T')[0]; }
            else { if (!dobString.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) { logs.push(`Row ${i + 1} ("${fullName}"): Invalid date format.`); continue; } }
            if (!['male','female','other'].includes(gender)) { logs.push(`Row ${i + 1} ("${fullName}"): Invalid gender.`); continue; }
            let paymentMethod = paymentMethodIdx !== -1 ? String(row[paymentMethodIdx] || '').trim().toLowerCase() : 'cash';
            if (paymentMethod === 'medical aid') paymentMethod = 'medical_aid';
            const medicalAidName = maNameIdx !== -1 ? String(row[maNameIdx] || '').trim() : '';
            let resolvedMedicalAidId = null;
            if (paymentMethod === 'medical_aid' && medicalAidName) { const m = medicalAids.find(a => a.name.toLowerCase() === medicalAidName.toLowerCase()); if (m) resolvedMedicalAidId = m.id; else logs.push(`Row ${i+1} ("${fullName}"): Medical Aid "${medicalAidName}" not found.`); }
            parsedList.push({ title: titleIdx !== -1 ? String(row[titleIdx]||'').trim() || null : null, full_name: fullName, gender, date_of_birth: dob, phone: phoneIdx !== -1 ? String(row[phoneIdx]||'').trim() || null : null, email: emailIdx !== -1 ? String(row[emailIdx]||'').trim() || null : null, address: addressIdx !== -1 ? String(row[addressIdx]||'').trim() || null : null, file_number: fileNumberIdx !== -1 ? String(row[fileNumberIdx]||'').trim() || null : null, payment_method: paymentMethod || 'cash', medical_aid_id: resolvedMedicalAidId, medical_aid_number: maNumIdx !== -1 ? String(row[maNumIdx]||'').trim() || null : null, medical_aid_main_member: maMainIdx !== -1 ? String(row[maMainIdx]||'').trim() || null : null, allergies: allergiesIdx !== -1 ? String(row[allergiesIdx]||'').trim() || null : null, chronic_conditions: chronicIdx !== -1 ? String(row[chronicIdx]||'').trim() || null : null });
          }
          setParsedPatients(parsedList); setImportLogs([`Successfully parsed ${parsedList.length} patient record(s) from Excel file.`, ...logs]);
        } catch (error: any) { console.error('Error parsing excel:', error); setImportLogs([`Error reading Excel file: ${error.message}`]); }
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedPatients || parsedPatients.length === 0) return;
    setImporting(true);
    try {
      const logs: string[] = [...importLogs]; logs.push('Starting upload to database...'); setImportLogs([...logs]);
      let successCount = 0;
      for (let i = 0; i < parsedPatients.length; i += 50) {
        const chunk = parsedPatients.slice(i, i + 50);
        const payload = chunk.map((p, idx) => { const pn = generatePatientNumber(i + idx); return { ...p, email: p.email || `patient.${pn.toLowerCase()}@spiritmed.com`, password: 'patient123456', branch_id: profile?.branch_id, patient_number: pn, status: 'active', created_at: new Date().toISOString() }; });
        const { error } = await supabase.from('patients').insert(payload);
        if (error) { logs.push(`Error block ${i + 1}: ${error.message}`); } else { successCount += chunk.length; logs.push(`Saved records ${i + 1} to ${Math.min(i + chunk.length, parsedPatients.length)}...`); }
        setImportLogs([...logs]);
      }
      logs.push(`🎉 Import completed! Successfully imported ${successCount} patient(s).`); setImportLogs([...logs]);
      showToast(`Imported ${successCount} patients successfully!`);
      invalidateAllPatientsCache(); fetchPage(currentPage, debouncedSearch); fetchStatusCounts();
      setParsedPatients(null); setImportFile(null);
    } catch (err: any) { console.error('Import failed:', err); showToast('Patient import process failed', 'error'); } finally { setImporting(false); }
  };

  // Patient Resources
  const handleOpenResources = (patient: any) => {
    setSelectedPatientForResources(patient); setResourceModalTab('list'); setResourceSourceType('link'); setResourceUploadFile(null); setUploadingResourceFile(false);
    setNewResourceForm({ title: '', description: '', resource_type: 'video_link', url: '', expiry_hours: '24', custom_expiry_date: '', custom_expiry_time: '' });
    setShowResourcesModal(true); fetchPatientResources(patient.id);
  };

  const fetchPatientResources = async (patientId: string) => {
    setResourcesLoading(true);
    try {
      const { data, error } = await supabase.from('patient_resources').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
      if (error) { if (error.code === '42P01') { setPatientResourcesList([]); } else throw error; }
      else setPatientResourcesList(data || []);
    } catch (e: any) { console.error(e); showToast(e.message || 'Error fetching resources', 'error'); } finally { setResourcesLoading(false); }
  };

  const handleShareResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resourceSourceType === 'upload' && !resourceUploadFile) { showToast('Please select a file to upload', 'error'); return; }
    if (resourceSourceType === 'link' && (!newResourceForm.title || !newResourceForm.url)) { showToast('Title and URL are required', 'error'); return; }
    setResourcesLoading(true);
    try {
      let expiresAt = new Date();
      if (newResourceForm.expiry_hours === 'custom') { if (!newResourceForm.custom_expiry_date || !newResourceForm.custom_expiry_time) { showToast('Custom expiry date and time must be set', 'error'); setResourcesLoading(false); return; } expiresAt = new Date(`${newResourceForm.custom_expiry_date}T${newResourceForm.custom_expiry_time}`); }
      else { expiresAt.setHours(expiresAt.getHours() + parseInt(newResourceForm.expiry_hours, 10)); }
      let resourceUrl = newResourceForm.url;
      if (resourceSourceType === 'upload' && resourceUploadFile) {
        setUploadingResourceFile(true);
        try {
          const fileName = `${Date.now()}_res_${Math.random().toString(36).substring(7)}.${resourceUploadFile.name.split('.').pop()}`;
          const { error: uploadError } = await supabase.storage.from('patient-files').upload(`patient-files/${fileName}`, resourceUploadFile);
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from('patient-files').getPublicUrl(`patient-files/${fileName}`);
          resourceUrl = publicUrl;
        } catch (err: any) { console.warn('Storage upload failed', err); resourceUrl = ''; }
        finally { setUploadingResourceFile(false); }
      }
      const payload = { patient_id: selectedPatientForResources.id, branch_id: profile?.branch_id, title: newResourceForm.title || 'Clinical Shared File', description: newResourceForm.description, resource_type: newResourceForm.resource_type, url: resourceUrl, expires_at: expiresAt.toISOString(), shared_by: profile?.id };
      let insertedId = `res-${Date.now()}`;
      const { data, error } = await supabase.from('patient_resources').insert([payload]).select().single();
      if (error) { if (error.code !== '42P01') throw error; } else if (data) insertedId = data.id;
      const secureLink = `${window.location.origin}/shared-resource/${insertedId}`;
      const emailRes = await emailService.sendEmail({ recipientEmail: selectedPatientForResources.email || '', recipientName: selectedPatientForResources.full_name, subject: `🔒 Secure Shared Clinical Resource: ${newResourceForm.title}`, body: `Dear ${selectedPatientForResources.full_name},<br/><br/>A clinical resource "${newResourceForm.title}" has been shared with you.<br/><a href="${secureLink}">${secureLink}</a><br/><br/>This link expires on ${expiresAt.toLocaleString()}.`, branchId: profile?.branch_id || '' });
      if (emailRes.success) showToast('Resource shared successfully!', 'success'); else showToast('Resource saved but email failed', 'warning');
      fetchPatientResources(selectedPatientForResources.id);
      setNewResourceForm({ title: '', description: '', resource_type: 'video_link', url: '', expiry_hours: '24', custom_expiry_date: '', custom_expiry_time: '' }); setResourceModalTab('list');
    } catch (err: any) { console.error(err); showToast(err.message || 'Error sharing resource', 'error'); } finally { setResourcesLoading(false); }
  };

  const handleRevokeResource = async (resourceId: string) => {
    if (!confirm('Are you sure you want to revoke access to this resource?')) return;
    setResourcesLoading(true);
    try {
      const { error } = await supabase.from('patient_resources').delete().eq('id', resourceId);
      if (error && error.code !== '42P01') throw error;
      showToast('Access revoked successfully!', 'success');
      fetchPatientResources(selectedPatientForResources.id);
    } catch (err: any) { console.error(err); showToast(err.message || 'Error revoking access', 'error'); } finally { setResourcesLoading(false); }
  };

  // Patient File Upload/Download/Delete
  const loadPatientFiles = async (patientId: string) => {
    try { setLoadingFiles(true); const { data, error } = await supabase.from('patient_files').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }); if (error) throw error; setPatientFiles(data || []); }
    catch (err) { console.error('Error loading patient files:', err); showToast('Failed to load patient files', 'error'); } finally { setLoadingFiles(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { setSelectedUploadFile(file); if (!fileForm.title) setFileForm(prev => ({ ...prev, title: file.name.split('.')[0] })); } };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selectedUploadFile || !selectedPatientForFiles) return;
    setUploadingFile(true);
    try {
      const fileExt = selectedUploadFile.name.split('.').pop(); const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('patient-files').upload(`patient-files/${fileName}`, selectedUploadFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('patient-files').getPublicUrl(`patient-files/${fileName}`);
      const { error: dbError } = await supabase.from('patient_files').insert([{ patient_id: selectedPatientForFiles.id, branch_id: profile?.branch_id, title: fileForm.title || selectedUploadFile.name, notes: fileForm.notes, file_url: publicUrl, file_type: fileExt, file_size: selectedUploadFile.size, uploaded_by: profile?.id, upload_date: fileForm.date }]);
      if (dbError) throw dbError;
      showToast('File uploaded successfully!'); setSelectedUploadFile(null); setFileForm({ title: '', notes: '', date: new Date().toISOString().split('T')[0] });
      loadPatientFiles(selectedPatientForFiles.id);
    } catch (err: any) { console.error('Error uploading file:', err); showToast('Failed to upload file: ' + (err?.message || 'Unknown error'), 'error'); } finally { setUploadingFile(false); }
  };

  const handleDeleteFile = async (file: any) => {
    if (!confirm(`Delete file "${file.title || file.file_url}"?`)) return;
    try { const { error } = await supabase.from('patient_files').delete().eq('id', file.id); if (error) throw error; showToast('File deleted'); if (selectedPatientForFiles) loadPatientFiles(selectedPatientForFiles.id); }
    catch (err: any) { console.error('Error deleting file:', err); showToast('Failed to delete file', 'error'); }
  };

  const handleDownloadFile = async (file: any) => { if (file.file_url) window.open(file.file_url, '_blank'); };

  const handleApprovePatient = async (patient: Patient) => {
    if (!confirm(`Approve patient registration for "${patient.full_name}"?`)) return;
    try {
      const { error } = await supabase.from('patients').update({
        status: 'active',
        updated_at: new Date().toISOString()
      }).eq('id', patient.id);
      if (error) throw error;
      setAllPatients(prev => prev.map(p => p.id === patient.id ? { ...p, status: 'active' } : p));
      invalidateAllPatientsCache();
      alert(`Patient "${patient.full_name}" has been approved and activated!`);
    } catch (err) {
      console.error('Error approving patient:', err);
      alert('Failed to approve patient registration.');
    }
  };

  const generatePatientNumber = (indexOffset = 0) => {
    const timestamp = (Date.now() + indexOffset).toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${timestamp}${random}`;
  };

  const handleAddPatientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientForm.full_name.trim()) {
      alert('Please enter patient full name');
      return;
    }
    setSubmittingPatient(true);
    try {
      const { send_sms, ...dbData } = newPatientForm;

      const sanitizedData = Object.fromEntries(
        Object.entries(dbData).map(([key, value]) => [
          key,
          value === "" ? null : value
        ])
      );

      const isEmailValid = await validateEmail(newPatientForm.email);
      const isFileNumberValid = await validateFileNumber(newPatientForm.file_number);

      if (!isEmailValid || !isFileNumberValid) {
        setCurrentTab('personal');
        setSubmittingPatient(false);
        return;
      }

      const patientNumber = generatePatientNumber();
      const finalEmail = sanitizedData.email ? String(sanitizedData.email).trim() : null;
      const generatedPassword = sanitizedData.password || 'patient123456';

      const { data, error } = await supabase
        .from('patients')
        .insert([{
          ...sanitizedData,
          email: finalEmail,
          password: generatedPassword,
          branch_id: profile?.branch_id,
          patient_number: patientNumber,
          status: 'active'
        }])
        .select()
        .single();

      if (error) throw error;

      if (profile?.id && profile?.branch_id && data) {
        const isFromPool = fileNumberPool.some(f => f.file_number === newPatientForm.file_number);
        const fileSource = isFromPool ? 'managed pool' : 'manual entry';
        const fileDetails = newPatientForm.file_number ? ` [File: ${newPatientForm.file_number} selected from ${fileSource}]` : '';

        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id,
          action: 'CREATE',
          tableName: 'patients',
          recordId: data.id,
          details: `Registered new patient: ${newPatientForm.full_name} (${patientNumber})${fileDetails}`,
          newValues: newPatientForm
        });
      }

      invalidateAllPatientsCache();
      await loadAllPatients(true);
      setShowAddPatientModal(false);
      resetNewPatientForm();
      alert(`Patient "${newPatientForm.full_name}" registered successfully with ID: ${patientNumber}`);
    } catch (err: any) {
      console.error('Error creating patient:', err);
      alert('Failed to register patient: ' + (err?.message || 'Unknown error'));
    } finally {
      setSubmittingPatient(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete patient "${name}"?\n\nThis will also delete all related records (files, consultations, prescriptions, bills, appointments, admissions, operations, vitals, lab results, certificates, reports, referrals, etc.).\n\nThis cannot be undone.`)) return;
    try {
      // 1. Patient files
      await supabase.from('patient_files').delete().eq('patient_id', id);

      // 2. Estimate bills → estimate bill items
      const { data: estimateBills } = await supabase.from('estimate_bills').select('id').eq('patient_id', id);
      const estimateIds = (estimateBills || []).map((e: any) => e.id);
      if (estimateIds.length > 0) {
        await supabase.from('estimate_bill_items').delete().in('estimate_bill_id', estimateIds);
      }
      await supabase.from('estimate_bills').delete().eq('patient_id', id);

      // 3. Bills → payments (by bill_id) → bill items
      const { data: bills } = await supabase.from('bills').select('id').eq('patient_id', id);
      const billIds = (bills || []).map((b: any) => b.id);
      if (billIds.length > 0) {
        await supabase.from('payments').delete().in('bill_id', billIds);
        await supabase.from('bill_items').delete().in('bill_id', billIds);
      }
      // Also delete any payments linked directly by patient_id
      await supabase.from('payments').delete().eq('patient_id', id);
      await supabase.from('bills').delete().eq('patient_id', id);

      // 4. Prescriptions → prescription items (via consultation AND direct patient_id)
      const { data: consults } = await supabase.from('consultations').select('id').eq('patient_id', id);
      const consultIds = (consults || []).map((c: any) => c.id);

      // Get ALL prescriptions for this patient (both via consultation and direct patient_id)
      const { data: prescByPatient } = await supabase.from('prescriptions').select('id').eq('patient_id', id);
      const prescByConsult = consultIds.length > 0
        ? (await supabase.from('prescriptions').select('id').in('consultation_id', consultIds)).data || []
        : [];
      const allPrescIds = [...new Set([
        ...(prescByPatient || []).map((p: any) => p.id),
        ...prescByConsult.map((p: any) => p.id)
      ])];
      if (allPrescIds.length > 0) {
        await supabase.from('prescription_items').delete().in('prescription_id', allPrescIds);
      }
      await supabase.from('prescriptions').delete().eq('patient_id', id);
      if (consultIds.length > 0) {
        await supabase.from('prescriptions').delete().in('consultation_id', consultIds);
      }

      // 5. Consultations
      await supabase.from('consultations').delete().eq('patient_id', id);

      // 6. Appointments (release slots first)
      const { data: appts } = await supabase.from('appointments').select('id').eq('patient_id', id);
      const apptIds = (appts || []).map((a: any) => a.id);
      if (apptIds.length > 0) {
        await supabase.from('appointment_slots').update({ is_booked: false, appointment_id: null }).in('appointment_id', apptIds);
      }
      await supabase.from('appointments').delete().eq('patient_id', id);

      // 7. Clinical records
      await supabase.from('vital_signs').delete().eq('patient_id', id);
      await supabase.from('lab_results').delete().eq('patient_id', id);
      await supabase.from('medical_certificates').delete().eq('patient_id', id);
      await supabase.from('medical_reports').delete().eq('patient_id', id);
      await supabase.from('referral_forms').delete().eq('patient_id', id);
      await supabase.from('operation_reports').delete().eq('patient_id', id);
      await supabase.from('discharge_summaries').delete().eq('patient_id', id);
      await supabase.from('admission_forms').delete().eq('patient_id', id);

      // 8. Finally delete the patient
      const { error } = await supabase.from('patients').delete().eq('id', id);
      if (error) throw error;

      setAllPatients(prev => prev.filter(p => p.id !== id));
      setSelectedPatientIds(prev => prev.filter(pId => pId !== id));
      invalidateAllPatientsCache();
    } catch (err: any) {
      console.error('Error deleting patient:', err);
      const msg = err?.message || err?.details || 'Unknown error';
      alert(`Failed to delete patient.\n\nReason: ${msg}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPatientIds.length === 0) return;
    if (!confirm(`PERMANENT BULK DELETE CONFIRMATION:\n\nAre you sure you want to PERMANENTLY delete ${selectedPatientIds.length} selected patients?\n\nThis will also delete all associated files, consultations, prescriptions, bills, payments, appointments, admissions, operations, vitals, lab results, certificates, reports, referrals, etc.\n\nThis action CANNOT be undone.`)) return;

    setBulkDeleting(true);
    try {
      const ids = selectedPatientIds;

      // 1. Patient files
      await supabase.from('patient_files').delete().in('patient_id', ids);

      // 2. Estimate bills → estimate bill items
      const { data: estimateBills } = await supabase.from('estimate_bills').select('id').in('patient_id', ids);
      const estimateIds = (estimateBills || []).map((e: any) => e.id);
      if (estimateIds.length > 0) {
        await supabase.from('estimate_bill_items').delete().in('estimate_bill_id', estimateIds);
      }
      await supabase.from('estimate_bills').delete().in('patient_id', ids);

      // 3. Bills → payments (by bill_id) → bill items
      const { data: bills } = await supabase.from('bills').select('id').in('patient_id', ids);
      const billIds = (bills || []).map((b: any) => b.id);
      if (billIds.length > 0) {
        await supabase.from('payments').delete().in('bill_id', billIds);
        await supabase.from('bill_items').delete().in('bill_id', billIds);
      }
      // Also delete any payments linked directly by patient_id
      await supabase.from('payments').delete().in('patient_id', ids);
      await supabase.from('bills').delete().in('patient_id', ids);

      // 4. Prescriptions → prescription items (via consultation AND direct patient_id)
      const { data: consults } = await supabase.from('consultations').select('id').in('patient_id', ids);
      const consultIds = (consults || []).map((c: any) => c.id);

      const { data: prescByPatient } = await supabase.from('prescriptions').select('id').in('patient_id', ids);
      const prescByConsult = consultIds.length > 0
        ? (await supabase.from('prescriptions').select('id').in('consultation_id', consultIds)).data || []
        : [];
      const allPrescIds = [...new Set([
        ...(prescByPatient || []).map((p: any) => p.id),
        ...prescByConsult.map((p: any) => p.id)
      ])];
      if (allPrescIds.length > 0) {
        await supabase.from('prescription_items').delete().in('prescription_id', allPrescIds);
      }
      await supabase.from('prescriptions').delete().in('patient_id', ids);
      if (consultIds.length > 0) {
        await supabase.from('prescriptions').delete().in('consultation_id', consultIds);
      }

      // 5. Consultations
      await supabase.from('consultations').delete().in('patient_id', ids);

      // 6. Appointments (release slots first)
      const { data: appts } = await supabase.from('appointments').select('id').in('patient_id', ids);
      const apptIds = (appts || []).map((a: any) => a.id);
      if (apptIds.length > 0) {
        await supabase.from('appointment_slots').update({ is_booked: false, appointment_id: null }).in('appointment_id', apptIds);
      }
      await supabase.from('appointments').delete().in('patient_id', ids);

      // 7. Clinical records
      await supabase.from('vital_signs').delete().in('patient_id', ids);
      await supabase.from('lab_results').delete().in('patient_id', ids);
      await supabase.from('medical_certificates').delete().in('patient_id', ids);
      await supabase.from('medical_reports').delete().in('patient_id', ids);
      await supabase.from('referral_forms').delete().in('patient_id', ids);
      await supabase.from('operation_reports').delete().in('patient_id', ids);
      await supabase.from('discharge_summaries').delete().in('patient_id', ids);
      await supabase.from('admission_forms').delete().in('patient_id', ids);

      // 8. Finally delete the patients
      const { error } = await supabase.from('patients').delete().in('id', ids);
      if (error) throw error;

      setSelectedPatientIds([]);
      invalidateAllPatientsCache();
      await loadAllPatients(true);
      alert(`Successfully deleted ${ids.length} selected patients.`);
    } catch (err: any) {
      console.error('Error bulk deleting patients:', err);
      alert('Failed to bulk delete patients: ' + (err?.message || 'Unknown error'));
    } finally {
      setBulkDeleting(false);
    }
  };

  // Server already returned the filtered current page — apply only balance filter locally
  const filteredPatients = filters.hasBalance === 'all' ? allPatients
    : filters.hasBalance === 'credit'
    ? allPatients.filter(p => (p.credit_balance || 0) > 0)
    : allPatients.filter(p => filters.hasBalance === 'due' ? (p.total_due || 0) > 0 : (p.total_due || 0) <= 0);

  // Pagination is server-side — allPatients already IS the current page
  const totalPages = Math.max(1, Math.ceil(totalDbCount / itemsPerPage));
  const paginated  = filteredPatients;
  const totalDue   = filteredPatients.reduce((s, p) => s + (p.total_due || 0), 0);
  const totalCredit = filteredPatients.reduce((s, p) => s + (p.credit_balance || 0), 0);

  const isAllPaginatedSelected = paginated.length > 0 && paginated.every(p => selectedPatientIds.includes(p.id));

  const toggleSelectAllPaginated = () => {
    if (isAllPaginatedSelected) {
      const pageIds = paginated.map(p => p.id);
      setSelectedPatientIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      const pageIds = paginated.map(p => p.id);
      setSelectedPatientIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleSelectPatient = (id: string) => {
    setSelectedPatientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  useEffect(() => { setCurrentPage(1); }, [activeStatus, debouncedSearch, filters]);

  const registrationLink = `${window.location.origin}/register-patient?branch=${profile?.branch_id || ''}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(registrationLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const exportToCSV = () => {
    const h = ['Patient #','Name','Status','Gender','Age','Phone','Email','File No','National ID','Total Due'];
    const r = filteredPatients.map(p => [p.patient_number, p.full_name, normaliseStatus(p.status), p.gender, getAge(p.date_of_birth), p.phone||'', p.email||'', p.file_number||'', p.national_id||'', p.total_due||0]);
    const csv = [h.join(','), ...r.map(row => row.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `all_patients_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => exportToExcel(filteredPatients.map(p => ({'Patient #':p.patient_number,'Full Name':p.full_name,'Status':normaliseStatus(p.status),'Gender':p.gender,'Age':getAge(p.date_of_birth),'Phone':p.phone||'','Email':p.email||'','File No':p.file_number||'','National ID':p.national_id||'','Total Due ($)':p.total_due||0})), 'spiritmed_all_patients');
  const handleExportPDF  = () => exportToPDF(['#','Name','Status','Patient ID','Phone','Gender','Total Due'], filteredPatients.map((p,i)=>[i+1,p.full_name,normaliseStatus(p.status),p.patient_number,p.phone||'N/A',p.gender,`$${(p.total_due||0).toLocaleString()}`]), 'Spiritmed - All Patients', 'spiritmed_all_patients');

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" /></div>;

  if (showViewSheet && selectedPatientForView) {
    return (
      <PatientPrintView
        patient={selectedPatientForView}
        branch={branch}
        onBack={() => setShowViewSheet(false)}
      />
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">All Patients</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-0.5">Manage patient records, self-registrations, and status workflow</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('patients', 'add') && (
            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-black hover:bg-blue-100 transition shadow-xs"
            >
              <Share2 className="w-4 h-4 text-blue-600" />
              <span>Share Registration Link</span>
            </button>
          )}
          {hasPermission('patients', 'add') && (
            <button
              onClick={() => { setShowImportModal(true); setImportFile(null); setImportLogs([]); setParsedPatients(null); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl text-xs font-black hover:bg-amber-100 transition shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>Import Patients</span>
            </button>
          )}
          {hasPermission('patients', 'add') && (
            <button
              onClick={() => setShowAddPatientModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-xs font-black hover:from-green-700 hover:to-emerald-700 transition shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ New Patient</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveStatus(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeStatus === key ? 'bg-white dark:bg-gray-700 text-green-600 shadow-sm' : 'text-gray-500 hover:bg-white/50'}`}>
            <Icon className="w-4 h-4" />
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${activeStatus === key ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>{counts[key]}</span>
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-xs text-gray-500 uppercase font-bold mb-1">
            {searchQuery || activeStatus !== 'all' || filters.gender !== 'all' || filters.hasBalance !== 'all'
              ? 'Matching Patients'
              : 'Total Patients'}
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {searchQuery || activeStatus !== 'all' || filters.gender !== 'all' || filters.hasBalance !== 'all'
              ? filteredPatients.length.toLocaleString()
              : (totalDbCount > 0 ? totalDbCount : allPatients.length).toLocaleString()}
          </div>
          {(searchQuery || activeStatus !== 'all' || filters.gender !== 'all' || filters.hasBalance !== 'all') && (
            <div className="text-[10px] text-gray-400 font-bold mt-0.5">
              of {(totalDbCount > 0 ? totalDbCount : allPatients.length).toLocaleString()} total
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-xs text-purple-500 uppercase font-bold mb-1">Pending Approval</div>
          <div className="text-2xl font-bold text-purple-600">{counts.pending}</div>
        </div>
        {canFinance && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="text-xs text-amber-500 uppercase font-bold mb-1">Total Dues</div>
            <div className="text-2xl font-bold text-amber-600">${grandTotalDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        )}
        {canFinance && grandTotalCredit > 0 && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-violet-200 dark:border-violet-800">
            <div className="text-xs text-violet-500 uppercase font-bold mb-1">Total Credit Balance</div>
            <div className="text-2xl font-bold text-violet-600">${grandTotalCredit.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Search / Filter */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-3 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            {isFetching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            )}
            <input type="text" placeholder="ID, Name, or Phone..." value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold transition">
              <Filter className="w-3.5 h-3.5" /><span>{showFilters ? 'Hide' : 'Show'} Filters</span>
            </button>
            <div className="flex bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
              <button onClick={handleExportExcel} className="p-2 text-green-600 hover:bg-white rounded-md transition" title="Export Excel"><FileSpreadsheet className="w-4 h-4" /></button>
              <button onClick={handleExportPDF}   className="p-2 text-red-600   hover:bg-white rounded-md transition" title="Export PDF"><FileJson className="w-4 h-4" /></button>
              <button onClick={exportToCSV}        className="p-2 text-blue-600  hover:bg-white rounded-md transition" title="Export CSV"><Download className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Gender</label>
              <select value={filters.gender} onChange={e => { setFilters({ ...filters, gender: e.target.value }); setCurrentPage(1); }}
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold outline-none bg-transparent dark:text-white">
                <option value="all">All Genders</option>
                <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </select>
            </div>
            {canFinance && (
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Financial State</label>
                <select value={filters.hasBalance} onChange={e => { setFilters({ ...filters, hasBalance: e.target.value }); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold outline-none bg-transparent dark:text-white">
                  <option value="all">All Patients</option>
                  <option value="due">With Outstanding Dues</option><option value="none">No Dues</option>
                </select>
              </div>
            )}
            <div className="flex items-end">
              <button onClick={() => { setFilters({ gender: 'all', hasBalance: 'all' }); setCurrentPage(1); }}
                className="w-full py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[10px] font-black uppercase rounded-lg hover:bg-gray-100 transition tracking-widest">
                Reset All Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedPatientIds.length > 0 && (
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3">
            <span className="bg-white text-red-700 text-xs font-black px-2.5 py-1 rounded-lg">
              {selectedPatientIds.length} Selected
            </span>
            <span className="text-xs font-extrabold hidden sm:inline">Bulk actions available for selected patients</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedPatientIds([])}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl transition"
            >
              Clear
            </button>
            {hasPermission('patients', 'delete') && (
              <button
                disabled={bulkDeleting}
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-white text-red-700 hover:bg-red-50 text-xs font-black rounded-xl transition shadow-sm disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedPatientIds.length})`}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-900 border-b-2 border-gray-200 dark:border-gray-700">
              <tr className="divide-x dark:divide-gray-700">
                <th className="px-3 py-3 text-center text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    checked={isAllPaginatedSelected}
                    onChange={toggleSelectAllPaginated}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Patient ID</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">National ID</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">File No</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Age / Gender</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Status</th>
                {canFinance && <th className="px-4 py-3 text-left text-xs font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Balance</th>}
                <th className="px-5 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginated.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-12 text-center text-sm font-bold text-gray-500 dark:text-gray-400">No patients found</td></tr>
              ) : paginated.map((patient, idx) => {
                const norm = normaliseStatus(patient.status);
                const isSelected = selectedPatientIds.includes(patient.id);
                return (
                  <tr key={patient.id} className={`hover:bg-gray-100/70 dark:hover:bg-gray-900/60 transition divide-x dark:divide-gray-700 ${isSelected ? 'bg-green-50/50 dark:bg-green-950/20' : ''}`}>
                    <td className="px-3 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectPatient(patient.id)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-extrabold text-gray-400 dark:text-gray-500 font-mono">{(currentPage-1)*itemsPerPage+idx+1}</div>
                        <div className="text-sm font-extrabold text-gray-900 dark:text-white uppercase tracking-tight">{patient.title ? `${patient.title} ` : ''}{patient.full_name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-extrabold text-blue-600 dark:text-blue-400 font-mono">{patient.patient_number ? formatPatientNumber(patient.patient_number) : ''}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-extrabold font-mono text-gray-800 dark:text-gray-100">{patient.national_id || <span className="text-gray-400 font-bold">N/A</span>}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-extrabold text-green-600 dark:text-green-400 font-mono">{patient.file_number ? formatFileNumber(patient.file_number) : <span className="text-gray-400">NO FILE</span>}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-extrabold text-gray-800 dark:text-gray-100">{patient.date_of_birth ? `${getAge(patient.date_of_birth)} YRS` : 'N/A'}</div>
                      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase mt-0.5">{patient.gender}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-sm font-extrabold text-gray-800 dark:text-gray-100"><Phone className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />{patient.phone || 'N/A'}</div>
                      {patient.email && <div className="flex items-center gap-1.5 text-xs font-extrabold text-gray-500 dark:text-gray-400 mt-0.5"><Mail className="w-3.5 h-3.5 text-gray-400" />{patient.email}</div>}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {norm === 'pending' ? (
                        <div className="flex items-center gap-1">
                          <span className="px-2.5 py-1 text-xs font-black rounded-lg border bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-purple-600" /> Pending
                          </span>
                          {hasPermission('patients', 'edit') && (
                            <button
                              onClick={() => handleApprovePatient(patient)}
                              className="p-1 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition"
                              title="Approve Patient Registration"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ) : hasPermission('patients', 'edit') ? (
                        <select
                          value={(patient.status === 'inactive' || patient.status === 'old_patient' || patient.status === 'old') ? 'old_patient' : patient.status || 'active'}
                          onChange={(e) => handleStatusChange(patient, e.target.value)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg outline-none cursor-pointer border transition-colors ${
                            patient.status === 'discharged'
                              ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800'
                              : patient.status === 'deceased'
                              ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800'
                              : (patient.status === 'inactive' || patient.status === 'old_patient' || patient.status === 'old')
                              ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          <option value="active" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Active</option>
                          <option value="discharged" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Discharged</option>
                          <option value="deceased" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Deceased</option>
                          <option value="old_patient" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Old Patient (Release File #)</option>
                        </select>
                      ) : (
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                          patient.status === 'discharged'
                            ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800'
                            : patient.status === 'deceased'
                            ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800'
                            : (patient.status === 'inactive' || patient.status === 'old_patient' || patient.status === 'old')
                            ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                        }`}>
                          {patient.status ? patient.status.toUpperCase() : 'ACTIVE'}
                        </span>
                      )}
                    </td>
                    {canFinance && (
                      <td className="px-4 py-3.5 bg-amber-50/20 dark:bg-amber-950/5">
                        {(patient.credit_balance || 0) > 0 ? (
                          <div className="text-right">
                            <span className="text-sm font-black text-violet-600 dark:text-violet-400">
                              -${(patient.credit_balance || 0).toLocaleString()}
                            </span>
                            <span className="ml-1 px-1 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 text-[9px] font-black rounded">CR</span>
                          </div>
                        ) : patient.medical_aid_id || (patient as any).medical_aid ? (
                          <div className="space-y-1">
                            <div className="flex justify-between items-center gap-4"><span className="text-[10px] font-extrabold text-rose-500 dark:text-rose-400 uppercase tracking-wider">Shortfall</span><span className={`text-sm font-black ${ (patient.total_shortfall_due || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-300 dark:text-gray-600'}`}>${(patient.total_shortfall_due || 0).toLocaleString()}</span></div>
                            <div className="flex justify-between items-center gap-4"><span className="text-[10px] font-extrabold text-amber-500 dark:text-amber-400 uppercase tracking-wider">Total</span><span className={`text-sm font-black ${ (patient.total_due || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}>${(patient.total_due || 0).toLocaleString()}</span></div>
                          </div>
                        ) : (
                          <div className={`text-sm font-black text-right ${(patient.total_due||0)>0?'text-amber-600 dark:text-amber-400':'text-gray-400 dark:text-gray-600'}`}>${(patient.total_due||0).toLocaleString()}</div>
                        )}
                      </td>
                    )}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleViewPatient(patient)}
                          className="p-1.5 hover:bg-green-50 dark:hover:bg-green-950/20 text-green-600 dark:text-green-400 hover:text-green-900 rounded-lg transition-colors"
                          title="View Records (Patient Information Sheet)"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        {(hasPermission('patient_history', 'view') || hasPermission('patients', 'view')) && (
                          <button
                            onClick={() => window.location.href = `/patient-history?patientId=${patient.id}`}
                            className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-950/20 text-purple-600 dark:text-purple-400 hover:text-purple-900 rounded-lg transition-colors"
                            title="Patient History"
                          >
                            <History className="w-5 h-5" />
                          </button>
                        )}
                        {(hasPermission('consultations', 'view') || hasPermission('consultations', 'add') || hasPermission('medical_records', 'view')) && (
                          <button
                            onClick={() => window.location.href = `/consultations?patientId=${patient.id}`}
                            className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-600 dark:text-blue-400 hover:text-blue-900 rounded-lg transition-colors"
                            title="Start Consultation"
                          >
                            <Stethoscope className="w-5 h-5" />
                          </button>
                        )}
                        {(hasPermission('vital_signs', 'view') || hasPermission('vital_signs', 'add') || hasPermission('medical_records', 'view')) && (
                          <button
                            onClick={() => window.location.href = `/vital-signs?patientId=${patient.id}`}
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:text-rose-900 rounded-lg transition-colors"
                            title="Record Vitals"
                          >
                            <HeartPulse className="w-5 h-5" />
                          </button>
                        )}
                        {(hasPermission('patient_files', 'view') || hasPermission('patients', 'view')) && (
                          <button
                            onClick={() => handleOpenFiles(patient)}
                            className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 rounded-lg transition-colors"
                            title="Patient Files & Clinical Uploads"
                          >
                            <FileText className="w-5 h-5" />
                          </button>
                        )}
                        {(hasPermission('billing', 'view') || hasPermission('payments', 'view')) && (
                          <button
                            onClick={() => handleOpenHistory(patient)}
                            className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-amber-600 dark:text-amber-400 hover:text-amber-900 rounded-lg transition-colors"
                            title="Payment History & Ledger"
                          >
                            <CreditCard className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenResources(patient)}
                          className="p-1.5 hover:bg-teal-50 dark:hover:bg-teal-950/20 text-teal-600 dark:text-teal-400 hover:text-teal-900 rounded-lg transition-colors"
                          title="Share Resources"
                        >
                          <Share2 className="w-5 h-5" />
                        </button>
                        {hasPermission('patients', 'edit') && (
                          <button
                            onClick={() => handleEdit(patient)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 rounded-lg transition-colors"
                            title="Edit Patient"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                        )}
                        {hasPermission('patients', 'delete') && (
                          <button
                            onClick={() => handleDelete(patient.id, patient.full_name)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 hover:text-red-900 rounded-lg transition-colors"
                            title="Delete Patient"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredPatients.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <p className="text-xs text-gray-500">Showing {(currentPage-1)*itemsPerPage+1}-{Math.min(currentPage*itemsPerPage,filteredPatients.length)} of {filteredPatients.length}</p>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                <select value={itemsPerPage===filteredPatients.length?'all':itemsPerPage}
                  onChange={e => { const v=e.target.value; setItemsPerPage(v==='all'?filteredPatients.length||1:Number(v)); setCurrentPage(1); }}
                  className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none">
                  <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option><option value="all">ALL</option>
                </select>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"><ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button>
                {[...Array(Math.min(totalPages,7))].map((_,i) => (
                  <button key={i+1} onClick={() => setCurrentPage(i+1)} className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage===i+1?'bg-green-600 text-white':'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}>{i+1}</button>
                ))}
                {totalPages>7 && <span className="text-xs text-gray-400 px-1">... {totalPages}</span>}
                <button disabled={currentPage===totalPages} onClick={() => setCurrentPage(p=>p+1)} className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"><ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add New Patient Modal */}
      {showAddPatientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-5xl w-full my-8 max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Add New Patient
              </h2>
              <button
                onClick={() => { setShowAddPatientModal(false); resetNewPatientForm(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setCurrentTab('personal')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'personal'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Personal Info
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('medical')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'medical'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Medical Info
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('nextofkin')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'nextofkin'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Next of Kin
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('financial')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'financial'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Financial Info
                </button>
              </div>
            </div>

            <form onSubmit={handleAddPatientSubmit} className="flex-1 overflow-y-auto p-6">
              {currentTab === 'personal' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Personal Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                      <select
                        value={newPatientForm.title}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Select</option>
                        <option value="Mr">Mr</option>
                        <option value="Mrs">Mrs</option>
                        <option value="Ms">Ms</option>
                        <option value="Dr">Dr</option>
                        <option value="Prof">Prof</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Patient Status</label>
                      <select
                        value={newPatientForm.status}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, status: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
                      >
                        <option value="active">Active</option>
                        <option value="discharged">Discharged</option>
                        <option value="deceased">Deceased</option>
                        <option value="old_patient">Old Patient (Release File #)</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={newPatientForm.full_name}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, full_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File Number</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={newPatientForm.file_number}
                          onFocus={() => setShowFileDropdown(true)}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewPatientForm({ ...newPatientForm, file_number: val });
                            setShowFileDropdown(true);
                            validateFileNumber(val);
                          }}
                          onBlur={(e) => validateFileNumber(e.target.value)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm ${
                            fileNumberError
                              ? 'border-red-500 focus:ring-red-500 text-red-900 dark:text-red-200'
                              : 'border-gray-300 dark:border-gray-600 focus:ring-green-500'
                          }`}
                          placeholder="Type or select file..."
                        />
                        
                        {showFileDropdown && (
                          <>
                            <div className="fixed inset-0 z-[60]" onClick={() => setShowFileDropdown(false)}></div>
                            <div className="absolute z-[70] left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {fileNumberPool
                                .filter(f => !f.is_occupied && (f.file_number.toLowerCase().includes(newPatientForm.file_number.toLowerCase()) || (f.label && f.label.toLowerCase().includes(newPatientForm.file_number.toLowerCase()))))
                                .length > 0 ? (
                                  fileNumberPool
                                    .filter(f => !f.is_occupied && (f.file_number.toLowerCase().includes(newPatientForm.file_number.toLowerCase()) || (f.label && f.label.toLowerCase().includes(newPatientForm.file_number.toLowerCase()))))
                                    .map(f => (
                                      <button
                                        key={f.file_number}
                                        type="button"
                                        onClick={() => {
                                          setNewPatientForm({ ...newPatientForm, file_number: f.file_number });
                                          setShowFileDropdown(false);
                                          validateFileNumber(f.file_number);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-green-50 dark:hover:bg-green-900/20 text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700/50 last:border-0 font-mono flex items-center justify-between gap-2"
                                      >
                                        <span className="font-extrabold text-green-700 dark:text-green-400">{f.file_number}</span>
                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 truncate max-w-[220px]">{f.label ? f.label.replace(f.file_number, '').trim() : ''}</span>
                                      </button>
                                    ))
                                ) : (
                                  <div className="px-4 py-2 text-xs text-gray-500 italic">No matching files in pool</div>
                                )
                              }
                            </div>
                          </>
                        )}

                        {fileNumberPool.length > 0 && (
                          <div className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-tight">
                            Available in Pool: {fileNumberPool.filter(f => !f.is_occupied).length} free files
                          </div>
                        )}

                        {fileNumberError && (
                          <div className="mt-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md p-2 flex items-center gap-1.5 shadow-xs">
                            <span className="shrink-0 text-sm">⚠️</span>
                            <span>{fileNumberError}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                      <select
                        value={newPatientForm.gender}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, gender: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Birth Date</label>
                      <input
                        type="date"
                        value={newPatientForm.date_of_birth}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, date_of_birth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                      <input
                        type="text"
                        inputMode="email"
                        name="patient_email_no_autofill_all"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={newPatientForm.email}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewPatientForm({ ...newPatientForm, email: val });
                          validateEmail(val);
                        }}
                        onBlur={(e) => validateEmail(e.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                          emailError
                            ? 'border-red-500 focus:ring-red-500 text-red-900 dark:text-red-200'
                            : 'border-gray-300 dark:border-gray-600 focus:ring-green-500'
                        }`}
                        placeholder="patient@example.com"
                      />
                      {emailError && (
                        <div className="mt-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-md p-2 flex items-center gap-1.5 shadow-xs">
                          <span className="shrink-0 text-sm">⚠️</span>
                          <span>{emailError}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                      <input
                        type="password"
                        name="patient_password_no_autofill_all"
                        autoComplete="new-password"
                        value={newPatientForm.password}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="For patient portal access"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact *</label>
                      <input
                        type="tel"
                        value={newPatientForm.phone}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Occupation</label>
                      <input
                        type="text"
                        value={newPatientForm.occupation}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, occupation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Home Address</label>
                    <textarea
                      value={newPatientForm.address}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="send_sms_all"
                      checked={newPatientForm.send_sms}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, send_sms: e.target.checked })}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <label htmlFor="send_sms_all" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Send SMS notifications
                    </label>
                  </div>
                </div>
              )}

              {currentTab === 'medical' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Medical Information</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Doctor</label>
                      <SearchableSelect
                        options={doctors.map(doctor => ({ value: doctor.id, label: doctor.full_name }))}
                        value={newPatientForm.doctor_id}
                        onChange={(val) => setNewPatientForm({ ...newPatientForm, doctor_id: val })}
                        placeholder="Search or select doctor..."
                        searchPlaceholder="Search doctor by name..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clinical History</label>
                    <textarea
                      value={newPatientForm.clinical_history}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, clinical_history: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chronic Medications</label>
                    <textarea
                      value={newPatientForm.chronic_medications}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, chronic_medications: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Smoke</label>
                      <select
                        value={newPatientForm.smoke}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, smoke: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="never">Never</option>
                        <option value="former">Former</option>
                        <option value="current">Current</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alcohol</label>
                      <select
                        value={newPatientForm.alcohol}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, alcohol: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="never">Never</option>
                        <option value="occasional">Occasional</option>
                        <option value="regular">Regular</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Flags</label>
                    <input
                      type="text"
                      value={newPatientForm.flags}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, flags: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Special alerts or warnings"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Allergies</label>
                    <textarea
                      value={newPatientForm.allergies}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, allergies: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Referral Doctor</label>
                    <SearchableSelect
                      options={referralDoctors.map(doctor => ({ value: doctor.id, label: doctor.full_name }))}
                      value={newPatientForm.referral_doctor_id}
                      onChange={(val) => setNewPatientForm({ ...newPatientForm, referral_doctor_id: val })}
                      placeholder="Search or select referral doctor..."
                      searchPlaceholder="Search referral doctor by name or center..."
                    />
                  </div>
                </div>
              )}

              {currentTab === 'nextofkin' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Next of Kin Details</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Name</label>
                      <input
                        type="text"
                        value={newPatientForm.emergency_contact_name}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, emergency_contact_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Contact</label>
                      <input
                        type="tel"
                        value={newPatientForm.emergency_contact_phone}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, emergency_contact_phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Relation</label>
                      <input
                        type="text"
                        value={newPatientForm.next_of_kin_relation}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, next_of_kin_relation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="e.g., Spouse, Parent, Sibling"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Email</label>
                      <input
                        type="email"
                        value={newPatientForm.next_of_kin_email}
                        onChange={(e) => setNewPatientForm({ ...newPatientForm, next_of_kin_email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Address</label>
                    <textarea
                      value={newPatientForm.next_of_kin_address}
                      onChange={(e) => setNewPatientForm({ ...newPatientForm, next_of_kin_address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {currentTab === 'financial' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Person Responsible for Fees</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                        <input
                          type="text"
                          value={newPatientForm.responsible_person_name}
                          onChange={(e) => setNewPatientForm({ ...newPatientForm, responsible_person_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                          <input
                            type="tel"
                            value={newPatientForm.responsible_person_phone}
                            onChange={(e) => setNewPatientForm({ ...newPatientForm, responsible_person_phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID Number</label>
                          <input
                            type="text"
                            value={newPatientForm.responsible_person_id_number}
                            onChange={(e) => setNewPatientForm({ ...newPatientForm, responsible_person_id_number: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input
                          type="email"
                          value={newPatientForm.responsible_person_email}
                          onChange={(e) => setNewPatientForm({ ...newPatientForm, responsible_person_email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                        <textarea
                          value={newPatientForm.responsible_person_address}
                          onChange={(e) => setNewPatientForm({ ...newPatientForm, responsible_person_address: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Payment Information</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Form of Payment</label>
                        <select
                          value={newPatientForm.payment_method}
                          onChange={(e) => setNewPatientForm({ ...newPatientForm, payment_method: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="cash">Cash</option>
                          <option value="medical_aid">Medical Aid</option>
                        </select>
                      </div>

                      {newPatientForm.payment_method === 'medical_aid' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Medical Aid</label>
                            <SearchDropdown
                              placeholder="Select Medical Aid"
                              items={medicalAids}
                              selectedId={newPatientForm.medical_aid_id}
                              onSelect={(id) => setNewPatientForm({ ...newPatientForm, medical_aid_id: id })}
                              displayFn={(aid) => aid.name}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Number</label>
                              <input
                                type="text"
                                value={newPatientForm.medical_aid_number}
                                onChange={(e) => setNewPatientForm({ ...newPatientForm, medical_aid_number: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Suffix</label>
                              <input
                                type="text"
                                value={newPatientForm.medical_aid_suffix}
                                onChange={(e) => setNewPatientForm({ ...newPatientForm, medical_aid_suffix: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Main Member</label>
                            <input
                              type="text"
                              value={newPatientForm.medical_aid_main_member}
                              onChange={(e) => setNewPatientForm({ ...newPatientForm, medical_aid_main_member: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => { setShowAddPatientModal(false); resetNewPatientForm(); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPatient}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md disabled:opacity-60"
                >
                  {submittingPatient ? 'Adding Patient...' : 'Add Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Registration Link Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-4 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">Share Self-Registration Link</h2>
                  <p className="text-xs text-gray-500 font-bold">Allow patients to register themselves prior to arrival</p>
                </div>
              </div>
              <button onClick={() => setShowShareModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase">Registration URL</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={registrationLink}
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-mono font-bold text-gray-800 dark:text-gray-200 outline-none"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Please register your details with Spiritmed before your consultation: ${registrationLink}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-black hover:bg-emerald-100 transition"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span>Share on WhatsApp</span>
                </a>
                <a
                  href={`mailto:?subject=Spiritmed Patient Registration&body=${encodeURIComponent(`Please complete your patient registration online before your visit: ${registrationLink}`)}`}
                  className="flex items-center justify-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-black hover:bg-indigo-100 transition"
                >
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <span>Share via Email</span>
                </a>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 font-medium">
                Patients who complete self-registration will appear in the <span className="font-bold">Pending Approval</span> tab for staff review before activation.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patient Files & Uploads Modal */}
      {showFilesModal && selectedPatientForFiles && (
        <AppointmentPatientFilesModal
          isOpen={showFilesModal}
          onClose={() => { setShowFilesModal(false); setSelectedPatientForFiles(null); }}
          patientId={selectedPatientForFiles.id}
          patientName={selectedPatientForFiles.full_name}
          patientNumber={selectedPatientForFiles.patient_number}
        />
      )}

      {/* Patient Payment History Ledger Modal */}
      {showHistoryModal && selectedPatientForHistory && (() => {
        const searchQ = historySearch.toLowerCase();
        const allEvents: any[] = [
          ...patientBills.map(b => ({ ...b, _type: 'bill', _date: new Date(b.bill_date) })),
          ...paymentHistory.map(p => ({ ...p, _type: 'payment', _date: new Date(p.payment_date) }))
        ].sort((a, b) => a._date.getTime() - b._date.getTime())
         .filter(e => {
           if (!searchQ) return true;
           if (e._type === 'bill') return (e.bill_number||'').toLowerCase().includes(searchQ)||(e.status||'').toLowerCase().includes(searchQ);
           return (e.bill_number||'').toLowerCase().includes(searchQ)||(e.payment_method||'').toLowerCase().includes(searchQ)||(e.notes||'').toLowerCase().includes(searchQ);
         });
        let running = 0;
        const eventsWithRunning = allEvents.map(e => {
          if (e._type === 'bill') { running += (e.total_amount||0); }
          else { running -= (e.amount||0); }
          return { ...e, _running: running };
        });
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="flex justify-between items-start px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-2xl flex-shrink-0">
                <div>
                  <h2 className="text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-500" /> Patient Statement
                  </h2>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">
                    <span className="text-amber-600 font-black uppercase">{selectedPatientForHistory.full_name}</span> · {formatPatientNumber(selectedPatientForHistory.patient_number)}
                    {selectedPatientForHistory.file_number && <span className="ml-2 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded text-[9px] font-black uppercase">File: {formatFileNumber(selectedPatientForHistory.file_number)}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); navigateToBills({ preselectedPatient: selectedPatientForHistory }); }} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase transition shadow-sm">
                    <FileText className="w-3.5 h-3.5" /> New Bill
                  </button>
                  <button onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); navigateToBills({ preselectedPatient: selectedPatientForHistory, openPayment: true }); }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black uppercase transition shadow-sm">
                    <DollarSign className="w-3.5 h-3.5" /> Record Payment
                  </button>
                  <button onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); }} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition ml-1">
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 px-6 py-4 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800/40 rounded-xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-blue-400 mb-0.5">Total Billed</p><p className="text-base font-black text-blue-700 dark:text-blue-300">${billSummary.totalBilled.toLocaleString(undefined,{minimumFractionDigits:2})}</p></div>
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-800/40 rounded-xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-green-400 mb-0.5">Total Paid</p><p className="text-base font-black text-green-700 dark:text-green-300">${billSummary.totalPaid.toLocaleString(undefined,{minimumFractionDigits:2})}</p></div>
                {/* Credit Balance card — uses final ledger running balance (accounts for invoices after overpayment) */}
                {(() => { const finalRunning = eventsWithRunning.length > 0 ? eventsWithRunning[eventsWithRunning.length - 1]._running : 0; return finalRunning < 0 ? (
                  <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/40 rounded-xl p-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-violet-500 mb-0.5">Credit Balance</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-black text-violet-700 dark:text-violet-300">-${Math.abs(finalRunning).toLocaleString(undefined,{minimumFractionDigits:2})}</p>
                      <span className="px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[8px] font-black uppercase rounded-full tracking-widest">CR</span>
                    </div>
                  </div>
                ) : <div className="hidden md:block" />; })()}
                <div className={`rounded-xl p-3 border ${billSummary.balance>0?'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-800/40':'bg-gray-50 dark:bg-gray-900/20 border-gray-100 dark:border-gray-700'}`}><p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${billSummary.balance>0?'text-amber-400':'text-gray-400'}`}>Outstanding</p><p className={`text-base font-black ${billSummary.balance>0?'text-amber-700 dark:text-amber-300':'text-gray-500'}`}>${billSummary.balance.toLocaleString(undefined,{minimumFractionDigits:2})}</p></div>
                <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-800/40 rounded-xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-0.5">Med Aid Bal</p><p className="text-base font-black text-indigo-700 dark:text-indigo-300">${billSummary.medicalAidBalance.toLocaleString(undefined,{minimumFractionDigits:2})}</p></div>
                <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-100 dark:border-gray-700 rounded-xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Bills / Pmts</p><p className="text-base font-black text-gray-700 dark:text-gray-300">{patientBills.length} / {paymentHistory.length}</p></div>
              </div>
              {/* Toolbar with Export */}
              <div className="px-6 py-3 flex gap-3 items-center justify-between flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                <p className="text-[10px] text-gray-400 font-medium">{patientBills.length} invoice{patientBills.length !== 1 ? 's' : ''} · {paymentHistory.length} payment{paymentHistory.length !== 1 ? 's' : ''}</p>
                <div className="flex gap-2">
                  <button onClick={() => handleExportHistory('excel')} disabled={patientBills.length === 0 && paymentHistory.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-100 transition border border-green-200 dark:border-green-800/50 disabled:opacity-40">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                  </button>
                  <button onClick={() => handleExportHistory('pdf')} disabled={patientBills.length === 0 && paymentHistory.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition border border-red-200 dark:border-red-800/50 disabled:opacity-40">
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {historyLoading ? (
                  <div className="py-20 flex flex-col items-center gap-3"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" /><p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading statement...</p></div>
                ) : eventsWithRunning.length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center gap-3">
                    <CreditCard className="w-10 h-10 text-gray-200" />
                    <p className="text-xs font-bold text-gray-400">No transactions found</p>
                    <button onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); navigateToBills({ preselectedPatient: selectedPatientForHistory }); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase transition">
                      <FileText className="w-4 h-4" /> Create First Bill
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 border-b dark:border-gray-700">
                      <tr className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                        <th className="px-4 py-3 w-28">Date</th><th className="px-4 py-3 w-32">Reference</th><th className="px-4 py-3">Type / Details</th>
                        <th className="px-4 py-3 text-right w-28">Debit (+)</th><th className="px-4 py-3 text-right w-28">Credit (−)</th>
                        <th className="px-4 py-3 text-right w-28">Balance</th><th className="px-4 py-3 text-center w-20">Act.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {eventsWithRunning.map(e => e._type === 'bill' ? (
                        <tr key={`b-${e.id}`} className="bg-blue-50/30 dark:bg-blue-950/10 hover:bg-blue-50/60 transition">
                          <td className="px-4 py-3 text-gray-500 font-medium">{new Date(e.bill_date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 font-mono font-bold text-gray-800 dark:text-gray-200 text-[11px]">{e.bill_number}</td>
                          <td className="px-4 py-3"><div className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" /><span className="font-bold text-blue-700 dark:text-blue-300">Invoice</span>{e.payment_method==='medical_aid'&&<span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black uppercase">Medical Aid</span>}<span className={`ml-auto px-2 py-0.5 rounded text-[9px] font-black uppercase ${e.status==='paid'?'bg-green-100 text-green-700':e.status==='partially_paid'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'}`}>{(e.status||'unpaid').replace('_',' ')}</span></div></td>
                          <td className="px-4 py-3 text-right font-black text-blue-700">${(e.total_amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                          <td className="px-4 py-3 text-right text-gray-300">—</td>
                          <td className="px-4 py-3 text-right"><span className={`font-black ${e._running>0?'text-amber-600':e._running<0?'text-violet-600':'text-green-600'}`}>{e._running<0?`-$${Math.abs(e._running).toLocaleString(undefined,{minimumFractionDigits:2})}`:`$${e._running.toLocaleString(undefined,{minimumFractionDigits:2})}`}</span>{e._running<0&&<span className="ml-1 px-1 py-0.5 bg-violet-100 text-violet-600 text-[8px] font-black uppercase rounded tracking-widest">CR</span>}</td>
                          <td className="px-4 py-3"><div className="flex justify-center">{e.status!=='paid'&&<button onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); navigateToBills({preselectedPatient:selectedPatientForHistory,openPayment:true,preselectedBillId:e.id}); }} title="Record Payment" className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition"><DollarSign className="w-3.5 h-3.5" /></button>}</div></td>
                        </tr>
                      ) : (
                        <tr key={`p-${e.id}`} className="bg-green-50/30 dark:bg-green-950/10 hover:bg-green-50/60 transition">
                          <td className="px-4 py-3 text-gray-500 font-medium">{new Date(e.payment_date).toLocaleDateString()}</td>
                          <td className="px-4 py-3 font-mono font-bold text-gray-600 dark:text-gray-400 text-[11px]">{e.bill_number}</td>
                          <td className="px-4 py-3"><div className="flex items-center gap-2"><TrendingDown className="w-3.5 h-3.5 text-green-500 flex-shrink-0" /><span className="font-bold text-green-700 dark:text-green-300">Payment</span><span className="ml-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 rounded text-[9px] font-black uppercase">{(e.payment_method||'cash').replace(/_/g,' ')}</span>{e.target_portion==='medical_aid'&&<span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[9px] font-black uppercase">Med Aid</span>}{e.notes&&<span className="ml-2 text-gray-400 italic text-[10px]">{e.notes}</span>}</div></td>
                          <td className="px-4 py-3 text-right text-gray-300">—</td>
                          <td className="px-4 py-3 text-right font-black text-green-700">${(e.amount||0).toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                          <td className="px-4 py-3 text-right"><span className={`font-black ${e._running>0?'text-amber-600':e._running<0?'text-violet-600':'text-green-600'}`}>{e._running<0?`-$${Math.abs(e._running).toLocaleString(undefined,{minimumFractionDigits:2})}`:`$${e._running.toLocaleString(undefined,{minimumFractionDigits:2})}`}</span>{e._running<0&&<span className="ml-1 px-1 py-0.5 bg-violet-100 text-violet-600 text-[8px] font-black uppercase rounded tracking-widest">CR</span>}</td>
                          <td className="px-4 py-3"><div className="flex justify-center"><button onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); navigateToBills({viewReceiptPaymentId:e.id}); }} title="View Receipt" className="p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 text-gray-600 transition"><Receipt className="w-3.5 h-3.5" /></button></div></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-600 sticky bottom-0">
                      <tr className="text-xs font-black">
                        <td colSpan={3} className="px-4 py-3 uppercase tracking-widest text-gray-500">Totals</td>
                        <td className="px-4 py-3 text-right text-blue-700">${billSummary.totalBilled.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                        <td className="px-4 py-3 text-right text-green-700">${billSummary.totalPaid.toLocaleString(undefined,{minimumFractionDigits:2})}</td>
                        <td className="px-4 py-3 text-right"><span className={billSummary.balance>0?'text-amber-600':billSummary.balance<0?'text-violet-600':'text-green-600'}>{billSummary.balance<0?`-$${Math.abs(billSummary.balance).toLocaleString(undefined,{minimumFractionDigits:2})}`:`$${billSummary.balance.toLocaleString(undefined,{minimumFractionDigits:2})}`}</span>{billSummary.balance<0&&<span className="ml-1 px-1 py-0.5 bg-violet-100 text-violet-600 text-[8px] font-black uppercase rounded tracking-widest">CR</span>}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
                <p className="text-[10px] text-gray-400">{eventsWithRunning.length} transaction{eventsWithRunning.length!==1?'s':''} · {new Date().toLocaleString()}</p>
                <button onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); }} className="px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-xs font-black uppercase hover:scale-105 transition shadow-lg">Close</button>
              </div>
            </div>
          </div>
        );
      })()}


      {/* Edit Patient Modal */}
      {showEditModal && editingPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">Edit Patient — {editingPatient.full_name}</h2>
              <button onClick={() => { setShowEditModal(false); setEditingPatient(null); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="flex gap-2 mb-4">
                {(['personal','medical','nextofkin','financial'] as const).map(tab => (
                  <button key={tab} type="button" onClick={() => setEditTab(tab)} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${editTab === tab ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{tab === 'nextofkin' ? 'Next of Kin' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
                ))}
              </div>
              {editTab === 'personal' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Title</label><input value={editFormData.title} onChange={e => setEditFormData(p => ({...p, title: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Full Name *</label><input required value={editFormData.full_name} onChange={e => setEditFormData(p => ({...p, full_name: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Gender</label><select value={editFormData.gender} onChange={e => setEditFormData(p => ({...p, gender: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Date of Birth</label><input type="date" value={editFormData.date_of_birth} onChange={e => setEditFormData(p => ({...p, date_of_birth: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Phone</label><input value={editFormData.phone} onChange={e => setEditFormData(p => ({...p, phone: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Email</label><input value={editFormData.email} onChange={e => setEditFormData(p => ({...p, email: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Address</label><input value={editFormData.address} onChange={e => setEditFormData(p => ({...p, address: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">File Number</label><input value={editFormData.file_number} onChange={e => setEditFormData(p => ({...p, file_number: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Occupation</label><input value={editFormData.occupation} onChange={e => setEditFormData(p => ({...p, occupation: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                </div>
              )}
              {editTab === 'medical' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Clinical History</label><textarea rows={3} value={editFormData.clinical_history} onChange={e => setEditFormData(p => ({...p, clinical_history: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Allergies</label><input value={editFormData.allergies} onChange={e => setEditFormData(p => ({...p, allergies: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Chronic Conditions</label><input value={editFormData.chronic_conditions} onChange={e => setEditFormData(p => ({...p, chronic_conditions: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Chronic Medications</label><input value={editFormData.chronic_medications} onChange={e => setEditFormData(p => ({...p, chronic_medications: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Flags</label><input value={editFormData.flags} onChange={e => setEditFormData(p => ({...p, flags: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Smoke</label><select value={editFormData.smoke} onChange={e => setEditFormData(p => ({...p, smoke: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="never">Never</option><option value="occasionally">Occasionally</option><option value="regularly">Regularly</option><option value="quit">Quit</option></select></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Alcohol</label><select value={editFormData.alcohol} onChange={e => setEditFormData(p => ({...p, alcohol: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="never">Never</option><option value="occasionally">Occasionally</option><option value="regularly">Regularly</option><option value="quit">Quit</option></select></div>
                </div>
              )}
              {editTab === 'nextofkin' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Emergency Contact Name</label><input value={editFormData.emergency_contact_name} onChange={e => setEditFormData(p => ({...p, emergency_contact_name: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Emergency Contact Phone</label><input value={editFormData.emergency_contact_phone} onChange={e => setEditFormData(p => ({...p, emergency_contact_phone: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Next of Kin Relation</label><input value={editFormData.next_of_kin_relation} onChange={e => setEditFormData(p => ({...p, next_of_kin_relation: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Next of Kin Email</label><input value={editFormData.next_of_kin_email} onChange={e => setEditFormData(p => ({...p, next_of_kin_email: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div className="col-span-2"><label className="block text-xs font-bold text-gray-500 mb-1">Next of Kin Address</label><input value={editFormData.next_of_kin_address} onChange={e => setEditFormData(p => ({...p, next_of_kin_address: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                </div>
              )}
              {editTab === 'financial' && (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Payment Method</label><select value={editFormData.payment_method} onChange={e => setEditFormData(p => ({...p, payment_method: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="cash">Cash</option><option value="medical_aid">Medical Aid</option><option value="credit_card">Credit Card</option></select></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Doctor</label><select value={editFormData.doctor_id} onChange={e => setEditFormData(p => ({...p, doctor_id: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="">None</option>{doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></div>
                  {editFormData.payment_method === 'medical_aid' && (<>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Medical Aid</label><select value={editFormData.medical_aid_id} onChange={e => setEditFormData(p => ({...p, medical_aid_id: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="">Select</option>{medicalAids.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Medical Aid Number</label><input value={editFormData.medical_aid_number} onChange={e => setEditFormData(p => ({...p, medical_aid_number: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Main Member</label><input value={editFormData.medical_aid_main_member} onChange={e => setEditFormData(p => ({...p, medical_aid_main_member: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 mb-1">Suffix</label><input value={editFormData.medical_aid_suffix} onChange={e => setEditFormData(p => ({...p, medical_aid_suffix: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  </>)}
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Referral Doctor</label><select value={editFormData.referral_doctor_id} onChange={e => setEditFormData(p => ({...p, referral_doctor_id: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="">None</option>{referralDoctors.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}</select></div>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={() => { setShowEditModal(false); setEditingPatient(null); }} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">Cancel</button><button type="submit" className="px-6 py-2 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition">Save Changes</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Import Patients Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">Import Patients Directory (Excel / CSV)</h2>
              <button onClick={() => setShowImportModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <button onClick={downloadSampleExcel} className="w-full px-4 py-3 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 rounded-xl text-sm font-bold border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition flex items-center gap-2"><Download className="w-4 h-4" />Download Sample Excel Template</button>
              <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
                <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFileChange} className="w-full text-sm" />
                {importFile && <p className="text-xs text-green-600 font-bold mt-2">Selected: {importFile.name}</p>}
              </div>
              {importLogs.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 max-h-40 overflow-y-auto"><div className="space-y-1">{importLogs.map((log, i) => <p key={i} className={`text-xs font-mono ${log.startsWith('Error') || log.includes('Error') ? 'text-red-600' : log.includes('Warning') ? 'text-amber-600' : log.includes('🎉') ? 'text-green-600 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{log}</p>)}</div></div>
              )}
              {parsedPatients && parsedPatients.length > 0 && (
                <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-4 border border-green-200 dark:border-green-800">
                  <p className="text-sm font-bold text-green-700 dark:text-green-300">Ready to import {parsedPatients.length} patient(s)</p>
                  <button onClick={handleExecuteImport} disabled={importing} className="mt-3 w-full px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition disabled:opacity-50">{importing ? 'Importing...' : `Import ${parsedPatients.length} Patients`}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deceased Modal */}
      {showDeceasedModal && selectedPatientForStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-black text-red-600">Mark as Deceased</h2>
              <button onClick={() => setShowDeceasedModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">Mark <strong>{selectedPatientForStatus.full_name}</strong> as deceased.</p>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Date of Death</label><input type="date" value={statusFormData.date} onChange={e => setStatusFormData(p => ({...p, date: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Cause / Reason</label><textarea rows={3} value={statusFormData.reason} onChange={e => setStatusFormData(p => ({...p, reason: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Enter cause of death..." /></div>
              <div className="flex justify-end gap-3"><button onClick={() => setShowDeceasedModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button><button onClick={() => handleUpdateStatus('deceased')} className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700">Confirm Deceased</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Discharged Modal */}
      {showDischargedModal && selectedPatientForStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-black text-orange-600">Discharge Patient</h2>
              <button onClick={() => setShowDischargedModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">Discharge <strong>{selectedPatientForStatus.full_name}</strong>.</p>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Discharge Date</label><input type="date" value={statusFormData.date} onChange={e => setStatusFormData(p => ({...p, date: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Discharge Status</label><select value={statusFormData.reason} onChange={e => setStatusFormData(p => ({...p, reason: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="">Select</option><option value="recovered">Recovered</option><option value="improved">Improved</option><option value="referred">Referred</option><option value="against_advice">Against Medical Advice</option><option value="other">Other</option></select></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Discharge Notes</label><textarea rows={3} value={statusFormData.notes} onChange={e => setStatusFormData(p => ({...p, notes: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
              {statusFormData.createSummary && (<>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Recipient</label><input value={statusFormData.recipient} onChange={e => setStatusFormData(p => ({...p, recipient: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g. Dr. Smith" /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Medical History</label><textarea rows={2} value={statusFormData.medical_history} onChange={e => setStatusFormData(p => ({...p, medical_history: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Treatment Done</label><textarea rows={2} value={statusFormData.treatment_done} onChange={e => setStatusFormData(p => ({...p, treatment_done: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Follow-up Plan</label><textarea rows={2} value={statusFormData.follow_up_plan} onChange={e => setStatusFormData(p => ({...p, follow_up_plan: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
              </>)}
              <div className="flex justify-end gap-3"><button onClick={() => setShowDischargedModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button><button onClick={() => handleUpdateStatus('discharged')} className="px-4 py-2 text-sm font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700">Confirm Discharge</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Mark Old Patient Modal */}
      {showOldPatientModal && selectedPatientForStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700"><h2 className="text-lg font-black text-amber-600">Mark as Old Patient</h2></div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200 font-bold">⚠️ This action will:</p>
                <ul className="text-xs text-amber-700 dark:text-amber-300 mt-2 list-disc list-inside space-y-1"><li>Change <strong>{selectedPatientForStatus.full_name}</strong> status to Old Patient</li>{selectedPatientForStatus.file_number && <li>Release File Number <strong>{selectedPatientForStatus.file_number}</strong> back to the pool</li>}<li>Patient records will be preserved and archived</li></ul>
              </div>
              <div className="flex justify-end gap-3"><button onClick={() => setShowOldPatientModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button><button onClick={handleMarkOldPatient} className="px-4 py-2 text-sm font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700">Confirm</button></div>
            </div>
          </div>
        </div>
      )}

      {/* Patient Resources Modal */}
      {showResourcesModal && selectedPatientForResources && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">Patient Resources — {selectedPatientForResources.full_name}</h2>
              <button onClick={() => setShowResourcesModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <div className="flex gap-2 mb-4">
                <button onClick={() => setResourceModalTab('list')} className={`px-3 py-1.5 text-xs font-bold rounded-lg ${resourceModalTab === 'list' ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600'}`}>Shared Resources</button>
                <button onClick={() => setResourceModalTab('share')} className={`px-3 py-1.5 text-xs font-bold rounded-lg ${resourceModalTab === 'share' ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600'}`}>Share New</button>
              </div>
              {resourceModalTab === 'list' ? (
                <div className="space-y-3">
                  {resourcesLoading ? <p className="text-center text-gray-400 py-8">Loading...</p> : patientResourcesList.length === 0 ? <p className="text-center text-gray-400 py-8 text-sm">No resources shared yet.</p> : patientResourcesList.map(r => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      <div className="flex items-center gap-3"><Video className="w-5 h-5 text-blue-500" /><div><p className="text-sm font-bold text-gray-800 dark:text-gray-100">{r.title}</p><p className="text-[10px] text-gray-400">Expires: {new Date(r.expires_at).toLocaleString()}</p></div></div>
                      <div className="flex gap-1"><a href={r.url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-xs"><Link className="w-4 h-4" /></a><button onClick={() => handleRevokeResource(r.id)} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-xs"><Trash2 className="w-4 h-4" /></button></div>
                    </div>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleShareResource} className="space-y-4">
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Title *</label><input required value={newResourceForm.title} onChange={e => setNewResourceForm(p => ({...p, title: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Description</label><textarea rows={2} value={newResourceForm.description} onChange={e => setNewResourceForm(p => ({...p, description: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setResourceSourceType('link')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${resourceSourceType === 'link' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100 text-gray-500'} border`}>Link / URL</button>
                    <button type="button" onClick={() => setResourceSourceType('upload')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${resourceSourceType === 'upload' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100 text-gray-500'} border`}>Upload File</button>
                  </div>
                  {resourceSourceType === 'link' ? <div><label className="block text-xs font-bold text-gray-500 mb-1">URL *</label><input required value={newResourceForm.url} onChange={e => setNewResourceForm(p => ({...p, url: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="https://..." /></div> : <div><input type="file" onChange={e => setResourceUploadFile(e.target.files?.[0] || null)} className="w-full text-sm" /></div>}
                  <div><label className="block text-xs font-bold text-gray-500 mb-1">Expiry</label><select value={newResourceForm.expiry_hours} onChange={e => setNewResourceForm(p => ({...p, expiry_hours: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"><option value="1">1 hour</option><option value="6">6 hours</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option><option value="custom">Custom</option></select></div>
                  {newResourceForm.expiry_hours === 'custom' && <div className="grid grid-cols-2 gap-2"><input type="date" value={newResourceForm.custom_expiry_date} onChange={e => setNewResourceForm(p => ({...p, custom_expiry_date: e.target.value}))} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /><input type="time" value={newResourceForm.custom_expiry_time} onChange={e => setNewResourceForm(p => ({...p, custom_expiry_time: e.target.value}))} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" /></div>}
                  <button type="submit" disabled={resourcesLoading} className="w-full px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition disabled:opacity-50">{resourcesLoading ? 'Sharing...' : 'Share Resource'}</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
