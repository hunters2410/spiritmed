import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Edit2, Eye, FileText, Phone, Mail, Calendar, Download, Filter, X, Trash2, HeartPulse, Stethoscope, Skull, LogOut, ChevronLeft, ChevronRight, FileSpreadsheet, FileJson, Users, Clock, User, AlertCircle, CreditCard, Upload, Share2, Video, Link } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { PatientPrintView } from '../components/PatientPrintView';
import { SearchDropdown } from '../components/SearchDropdown';
import { SearchableSelect } from '../components/SearchableSelect';
import { useToast } from '../contexts/ToastContext';
import * as XLSX from 'xlsx';
import { emailService } from '../utils/emailService';
import { smsService } from '../utils/smsService';

interface Patient {
  id: string;
  title?: string;
  patient_number: string;
  file_number?: string;
  national_id?: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  email: string;
  status: string;
  total_due?: number;
  total_shortfall_due?: number;
  total_medical_aid_due?: number;
  medical_aid_id?: string;
  medical_aid?: { name: string };
  created_at: string;
}

interface PendingPatient extends Omit<Patient, 'patient_number' | 'status' | 'total_due'> {
  branch_id: string;
  submitted_at: string;
  [key: string]: any;
}

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

export function Patients() {
  const { profile, hasPermission } = useAuth();
  const { showToast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [medicalAids, setMedicalAids] = useState<MedicalAid[]>([]);
  const [fileNumberPool, setFileNumberPool] = useState<any[]>([]);
  const [referralDoctors, setReferralDoctors] = useState<ReferralDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPatientCount, setTotalPatientCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [showModal, setShowModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentTab, setCurrentTab] = useState('personal');
  const [filters, setFilters] = useState({
    gender: 'all',
    hasBalance: 'all'
  });
  const [showDeceasedModal, setShowDeceasedModal] = useState(false);
  const [showDischargedModal, setShowDischargedModal] = useState(false);
  const [selectedPatientForStatus, setSelectedPatientForStatus] = useState<Patient | null>(null);
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [statusFormData, setStatusFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    reason: '',
    notes: '',
    recipient: '',
    diagnosis_ids: [] as string[],
    diagnosis_text: '',
    medical_history: '',
    treatment_done: '',
    follow_up_plan: '',
    createSummary: true
  });
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'pending'>('all');
  const [pendingPatients, setPendingPatients] = useState<PendingPatient[]>([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [selectedPending, setSelectedPending] = useState<PendingPatient | null>(null);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [showViewSheet, setShowViewSheet] = useState(false);
  const [selectedPatientForView, setSelectedPatientForView] = useState<any>(null);
  const [branch, setBranch] = useState<any>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<any>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [showFileDropdown, setShowFileDropdown] = useState(false);

  // Patient Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [parsedPatients, setParsedPatients] = useState<any[] | null>(null);

  // Patient Files Modal State
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [selectedPatientForFiles, setSelectedPatientForFiles] = useState<Patient | null>(null);

  // Patient Resources State
  const [showResourcesModal, setShowResourcesModal] = useState(false);
  const [selectedPatientForResources, setSelectedPatientForResources] = useState<any>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [patientResourcesList, setPatientResourcesList] = useState<any[]>([]);
  const [resourceModalTab, setResourceModalTab] = useState<'list' | 'share'>('list');
  
  // New Resource Form state
  const [newResourceForm, setNewResourceForm] = useState({
    title: '',
    description: '',
    resource_type: 'video_link', // 'video_link' | 'pdf_file' | 'other'
    url: '',
    expiry_hours: '24', // '1', '6', '24', '72', '168', 'custom'
    custom_expiry_date: '',
    custom_expiry_time: ''
  });
  const [resourceSourceType, setResourceSourceType] = useState<'link' | 'upload'>('link');
  const [resourceUploadFile, setResourceUploadFile] = useState<File | null>(null);
  const [uploadingResourceFile, setUploadingResourceFile] = useState(false);
  const [patientFiles, setPatientFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [fileForm, setFileForm] = useState({
    title: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [formData, setFormData] = useState({
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
    send_sms: false
  });

  useEffect(() => {
    if (profile) {
      loadPatients();
      loadDoctors();
      loadMedicalAids();
      loadReferralDoctors();
      loadFileNumberPool();
      loadDiagnoses();
    }
    loadBranch();
  }, [profile]);

  const loadDiagnoses = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;
    try {
      let query = supabase
        .from('diagnoses')
        .select('id, name, icd10_code')
        .eq('is_active', true);

      if (profile.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDiagnoses(data || []);
    } catch (error) {
      console.error('Error loading diagnoses:', error);
    }
  };

  const loadBranch = async () => {
    if (!profile?.branch_id) return;
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', profile.branch_id)
        .single();
      if (error) throw error;
      setBranch(data);
    } catch (error) {
      console.error('Error loading branch:', error);
    }
  };

  const handleViewPatient = (patient: any) => {
    setSelectedPatientForView(patient);
    setShowViewSheet(true);
  };

  const loadPatientHistory = async (patientId: string) => {
    try {
      setHistoryLoading(true);
      setHistorySearch('');
      const { data: bills } = await supabase
        .from('bills')
        .select('id, bill_number, bill_date')
        .eq('patient_id', patientId);
      
      const bIds = (bills || []).map(b => b.id);
      if (bIds.length === 0) { 
        setPaymentHistory([]); 
        return; 
      }
      
      const { data: pmts, error } = await supabase
        .from('payments')
        .select('id, amount, payment_method, payment_date, created_at, target_portion, notes, bill_id')
        .in('bill_id', bIds)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      
      setPaymentHistory((pmts || []).map(p => {
        const b = (bills || []).find(x => x.id === p.bill_id);
        return { ...p, bill_number: b?.bill_number, bill_date: b?.bill_date };
      }));
    } catch (err) { 
      console.error('Error loading patient history:', err); 
      showToast('Failed to load payment history', 'error');
    } finally { 
      setHistoryLoading(false); 
    }
  };

  const handleOpenHistory = (patient: Patient) => {
    setSelectedPatientForHistory(patient);
    setPaymentHistory([]);
    setShowHistoryModal(true);
    loadPatientHistory(patient.id);
  };

  const handleExportHistory = (format: 'pdf' | 'excel', filteredItems: any[]) => {
    if (!selectedPatientForHistory) return;
    const title = `Payment History - ${selectedPatientForHistory.full_name}`;
    const fname = `${selectedPatientForHistory.full_name.replace(/\s+/g, '_')}_History`;
    if (format === 'excel') {
      const data = filteredItems.map(p => ({
        'INV #': p.bill_number,
        'Date': new Date(p.payment_date).toLocaleDateString(),
        'Method': p.payment_method?.replace(/_/g, ' '),
        'Portion': p.target_portion === 'medical_aid' ? 'Medical Aid' : 'Patient',
        'Amount': p.amount.toFixed(2),
        'Notes': p.notes || ''
      }));
      exportToExcel(data, fname);
    } else {
      const headers = ['INV #', 'Date', 'Method', 'Portion', 'Amount'];
      const data = filteredItems.map(p => [
        p.bill_number,
        new Date(p.payment_date).toLocaleDateString(),
        p.payment_method?.replace(/_/g, ' '),
        p.target_portion === 'medical_aid' ? 'Medical Aid' : 'Patient',
        `$${p.amount.toFixed(2)}`
      ]);
      exportToPDF(headers, data, title, fname);
    }
  };

  const downloadSampleExcel = () => {
    const headers = [
      'Title',
      'Full Name',
      'Gender',
      'Date of Birth',
      'Phone',
      'Email',
      'Address',
      'File Number',
      'Payment Method',
      'Medical Aid Name',
      'Medical Aid Number',
      'Medical Aid Main Member',
      'Allergies',
      'Chronic Conditions'
    ];
    
    const sampleData = [
      [
        'Mr.',
        'Collen Hunters',
        'Male',
        '1990-05-15',
        '+263771234567',
        'collenhunters@example.com',
        '123 Medical Way, Harare',
        'FILE-99450',
        'Cash',
        '',
        '',
        '',
        'Peanuts',
        'Hypertension'
      ],
      [
        'Mrs.',
        'Jane Hunters',
        'Female',
        '1985-08-22',
        '+263772345678',
        'janehunters@example.com',
        '456 Clinic Avenue, Bulawayo',
        'FILE-88320',
        'Medical Aid',
        'CIMAS',
        'MA-442110',
        'Jane Hunters',
        'Penicillin',
        'Asthma'
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    
    // Set custom column widths so headers and data are beautifully spaced out and don't bunch up
    ws['!cols'] = [
      { wch: 10 }, // Title
      { wch: 25 }, // Full Name
      { wch: 12 }, // Gender
      { wch: 15 }, // Date of Birth
      { wch: 18 }, // Phone
      { wch: 30 }, // Email
      { wch: 35 }, // Address
      { wch: 15 }, // File Number
      { wch: 16 }, // Payment Method
      { wch: 25 }, // Medical Aid Name
      { wch: 20 }, // Medical Aid Number
      { wch: 25 }, // Medical Aid Main Member
      { wch: 18 }, // Allergies
      { wch: 22 }  // Chronic Conditions
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Patients Import Template');
    
    XLSX.writeFile(wb, 'spiritmed_patients_import_template.xlsx');
    showToast('Sample import template downloaded successfully!');
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImportFile(file);
      setImportLogs([]);
      setParsedPatients(null);
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (rawData.length < 2) {
            setImportLogs(['Error: The file is empty or missing data rows.']);
            return;
          }
          
          const headers = rawData[0].map(h => String(h || '').trim().toLowerCase());
          
          const titleIdx = headers.indexOf('title');
          const fullNameIdx = headers.indexOf('full name');
          const genderIdx = headers.indexOf('gender');
          const dobIdx = headers.indexOf('date of birth');
          const phoneIdx = headers.indexOf('phone');
          const emailIdx = headers.indexOf('email');
          const addressIdx = headers.indexOf('address');
          const fileNumberIdx = headers.indexOf('file number');
          const paymentMethodIdx = headers.indexOf('payment method');
          const maNameIdx = headers.indexOf('medical aid name');
          const maNumIdx = headers.indexOf('medical aid number');
          const maMainIdx = headers.indexOf('medical aid main member');
          const allergiesIdx = headers.indexOf('allergies');
          const chronicIdx = headers.indexOf('chronic conditions');

          if (fullNameIdx === -1) {
            setImportLogs(['Error: Missing required column "Full Name".']);
            return;
          }
          if (genderIdx === -1) {
            setImportLogs(['Error: Missing required column "Gender".']);
            return;
          }
          if (dobIdx === -1) {
            setImportLogs(['Error: Missing required column "Date of Birth".']);
            return;
          }

          const parsedList: any[] = [];
          const logs: string[] = [];

          for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0 || !row[fullNameIdx]) continue;

            const title = titleIdx !== -1 ? String(row[titleIdx] || '').trim() : '';
            const fullName = String(row[fullNameIdx] || '').trim();
            const gender = String(row[genderIdx] || '').trim().toLowerCase();
            const dobString = String(row[dobIdx] || '').trim();
            const phone = phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '';
            const email = emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '';
            const address = addressIdx !== -1 ? String(row[addressIdx] || '').trim() : '';
            const fileNumber = fileNumberIdx !== -1 ? String(row[fileNumberIdx] || '').trim() : '';
            
            let paymentMethod = paymentMethodIdx !== -1 ? String(row[paymentMethodIdx] || '').trim().toLowerCase() : 'cash';
            if (paymentMethod === 'medical aid') {
              paymentMethod = 'medical_aid';
            }

            const medicalAidName = maNameIdx !== -1 ? String(row[maNameIdx] || '').trim() : '';
            const medicalAidNumber = maNumIdx !== -1 ? String(row[maNumIdx] || '').trim() : '';
            const medicalAidMainMember = maMainIdx !== -1 ? String(row[maMainIdx] || '').trim() : '';
            const allergies = allergiesIdx !== -1 ? String(row[allergiesIdx] || '').trim() : '';
            const chronicConditions = chronicIdx !== -1 ? String(row[chronicIdx] || '').trim() : '';

            let dob = dobString;
            if (!isNaN(Number(dobString)) && Number(dobString) > 20000) {
              const date = new Date((Number(dobString) - 25569) * 86400 * 1000);
              dob = date.toISOString().split('T')[0];
            } else {
              const dateMatch = dobString.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
              if (!dateMatch) {
                logs.push(`Row ${i + 1} ("${fullName}"): Invalid Date of Birth format "${dobString}". Expected YYYY-MM-DD.`);
                continue;
              }
            }

            if (gender !== 'male' && gender !== 'female' && gender !== 'other') {
              logs.push(`Row ${i + 1} ("${fullName}"): Invalid gender "${gender}". Expected Male or Female.`);
              continue;
            }

            let resolvedMedicalAidId = null;
            if (paymentMethod === 'medical_aid' && medicalAidName) {
              const matchedAid = medicalAids.find(
                a => a.name.toLowerCase() === medicalAidName.toLowerCase()
              );
              if (matchedAid) {
                resolvedMedicalAidId = matchedAid.id;
              } else {
                logs.push(`Row ${i + 1} ("${fullName}"): Warning - Medical Aid "${medicalAidName}" not found in system.`);
              }
            }

            parsedList.push({
              title: title || null,
              full_name: fullName,
              gender: gender,
              date_of_birth: dob,
              phone: phone || null,
              email: email || null,
              address: address || null,
              file_number: fileNumber || null,
              payment_method: paymentMethod || 'cash',
              medical_aid_id: resolvedMedicalAidId,
              medical_aid_number: medicalAidNumber || null,
              medical_aid_main_member: medicalAidMainMember || null,
              allergies: allergies || null,
              chronic_conditions: chronicConditions || null
            });
          }

          setParsedPatients(parsedList);
          setImportLogs([
            `Successfully parsed ${parsedList.length} patient record(s) from Excel file.`,
            ...logs
          ]);
        } catch (error: any) {
          console.error('Error parsing excel:', error);
          setImportLogs([`Error reading Excel file: ${error.message}`]);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedPatients || parsedPatients.length === 0) return;
    setImporting(true);
    try {
      const logs: string[] = [...importLogs];
      logs.push('Starting upload to database...');
      setImportLogs([...logs]);

      const chunkSize = 50;
      let successCount = 0;
      
      for (let i = 0; i < parsedPatients.length; i += chunkSize) {
        const chunk = parsedPatients.slice(i, i + chunkSize);
        
        const payload = chunk.map((p, idx) => {
          const patientNumber = generatePatientNumber(i + idx);
          const generatedEmail = p.email || `patient.${patientNumber.toLowerCase()}@spiritmed.com`;
          const generatedPassword = p.password || 'patient123456';
          return {
            ...p,
            email: generatedEmail,
            password: generatedPassword,
            branch_id: profile?.branch_id,
            patient_number: patientNumber,
            status: 'active',
            created_at: new Date().toISOString()
          };
        });

        const { error } = await supabase
          .from('patients')
          .insert(payload);

        if (error) {
          console.error('Error inserting chunk:', error);
          logs.push(`Error saving block starting at index ${i + 1}: ${error.message}`);
          setImportLogs([...logs]);
        } else {
          successCount += chunk.length;
          logs.push(`Saved records ${i + 1} to ${Math.min(i + chunk.length, parsedPatients.length)}...`);
          setImportLogs([...logs]);
        }
      }

      logs.push(`🎉 Import completed! Successfully imported ${successCount} patient(s).`);
      setImportLogs([...logs]);
      showToast(`Imported ${successCount} patients successfully!`);
      loadPatients();
      
      setParsedPatients(null);
      setImportFile(null);
    } catch (error: any) {
      console.error('Import process failed:', error);
      showToast('Patient import process failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const loadPatientFiles = async (patientId: string) => {
    try {
      setLoadingFiles(true);
      const { data, error } = await supabase
        .from('patient_files')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPatientFiles(data || []);
    } catch (error) {
      console.error('Error loading patient files:', error);
      showToast('Failed to load patient files', 'error');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleOpenFiles = (patient: Patient) => {
    setSelectedPatientForFiles(patient);
    setPatientFiles([]);
    setSelectedUploadFile(null);
    setFileForm({
      title: '',
      notes: '',
      date: new Date().toISOString().split('T')[0]
    });
    setShowFilesModal(true);
    loadPatientFiles(patient.id);
  };

  const handleOpenResources = (patient: any) => {
    setSelectedPatientForResources(patient);
    setResourceModalTab('list');
    setResourceSourceType('link');
    setResourceUploadFile(null);
    setUploadingResourceFile(false);
    setNewResourceForm({
      title: '',
      description: '',
      resource_type: 'video_link',
      url: '',
      expiry_hours: '24',
      custom_expiry_date: '',
      custom_expiry_time: ''
    });
    setShowResourcesModal(true);
    fetchPatientResources(patient.id);
  };

  const fetchPatientResources = async (patientId: string) => {
    setResourcesLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_resources')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist yet, fall back to LocalStorage
          const localData = localStorage.getItem('mock_patient_resources');
          if (localData) {
            const parsed = JSON.parse(localData);
            const filtered = parsed.filter((r: any) => r.patient_id === patientId);
            setPatientResourcesList(filtered.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
          } else {
            setPatientResourcesList([]);
          }
        } else {
          throw error;
        }
      } else {
        setPatientResourcesList(data || []);
      }
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'Error fetching resources', 'error');
    } finally {
      setResourcesLoading(false);
    }
  };

  const handleShareResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resourceSourceType === 'upload' && !resourceUploadFile) {
      showToast('Please select a file to upload', 'error');
      return;
    }
    if (resourceSourceType === 'link' && (!newResourceForm.title || !newResourceForm.url)) {
      showToast('Title and URL are required', 'error');
      return;
    }

    setResourcesLoading(true);
    try {
      // Calculate expires_at
      let expiresAt = new Date();
      if (newResourceForm.expiry_hours === 'custom') {
        if (!newResourceForm.custom_expiry_date || !newResourceForm.custom_expiry_time) {
          showToast('Custom expiry date and time must be set', 'error');
          setResourcesLoading(false);
          return;
        }
        expiresAt = new Date(`${newResourceForm.custom_expiry_date}T${newResourceForm.custom_expiry_time}`);
      } else {
        const hrs = parseInt(newResourceForm.expiry_hours, 10);
        expiresAt.setHours(expiresAt.getHours() + hrs);
      }

      let resourceUrl = newResourceForm.url;
      if (resourceSourceType === 'upload' && resourceUploadFile) {
        setUploadingResourceFile(true);
        try {
          const fileExt = resourceUploadFile.name.split('.').pop();
          const fileName = `${Date.now()}_res_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `patient-files/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('patient-files')
            .upload(filePath, resourceUploadFile);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('patient-files')
            .getPublicUrl(filePath);

          resourceUrl = publicUrl;
        } catch (err: any) {
          console.warn('Storage upload failed, attempting local dataURL fallback...', err);
          if (resourceUploadFile.size > 1.5 * 1024 * 1024) {
            resourceUrl = `https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=60`;
            showToast('Storage offline. Using high-definition demo placeholder URL due to size limits (>1.5MB).', 'warning');
          } else {
            resourceUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(resourceUploadFile);
            });
          }
        } finally {
          setUploadingResourceFile(false);
        }
      }

      const payload = {
        patient_id: selectedPatientForResources.id,
        branch_id: profile?.branch_id,
        title: newResourceForm.title || (resourceUploadFile ? resourceUploadFile.name.split('.')[0] : 'Clinical Shared File'),
        description: newResourceForm.description,
        resource_type: newResourceForm.resource_type,
        url: resourceUrl,
        expires_at: expiresAt.toISOString(),
        shared_by: profile?.id
      };

      let insertedId = `res-${Date.now()}`;

      // 1. Try inserting to Supabase
      const { data, error } = await supabase
        .from('patient_resources')
        .insert([payload])
        .select()
        .single();

      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist, fall back to LocalStorage
          console.log('Inserting resource to mock LocalStorage repository...');
          const localData = localStorage.getItem('mock_patient_resources');
          const list = localData ? JSON.parse(localData) : [];
          const newResource = {
            id: insertedId,
            ...payload,
            created_at: new Date().toISOString()
          };
          list.push(newResource);
          localStorage.setItem('mock_patient_resources', JSON.stringify(list));
        } else {
          throw error;
        }
      } else if (data) {
        insertedId = data.id;
      }

      // 2. Send email via emailService
      const secureLink = `${window.location.origin}/shared-resource/${insertedId}`;
      const emailRes = await emailService.sendEmail({
        recipientEmail: selectedPatientForResources.email || `patient.${selectedPatientForResources.patient_number.toLowerCase()}@spiritmed.com`,
        recipientName: selectedPatientForResources.full_name,
        subject: `🔒 Secure Shared Clinical Resource: ${newResourceForm.title}`,
        body: `Dear ${selectedPatientForResources.full_name},<br/><br/>
               Dr. ${profile?.full_name || 'Your Clinician'} has shared a secure clinical resource with you: <strong>${newResourceForm.title}</strong>.<br/><br/>
               This resource is available for secure temporary viewing using the link below:<br/>
               <a href="${secureLink}">${secureLink}</a><br/><br/>
               <strong>⚠️ Access Notice:</strong> For patient safety and confidentiality, this link is temporary and will completely expire on <strong>${expiresAt.toLocaleString()}</strong>. After this time, access will be blocked.<br/><br/>
               Best regards,<br/>
               ${branch?.name || 'Spiritmed Clinic'}`.replace(/\n/g, ''),
        branchId: profile?.branch_id || ''
      });

      let smsStatus = '';
      if (selectedPatientForResources.phone) {
        try {
          const smsRes = await smsService.sendSms({
            recipientPhone: selectedPatientForResources.phone,
            triggerType: 'resource_shared',
            variables: {
              patient_name: selectedPatientForResources.full_name,
              title: newResourceForm.title,
              link: secureLink,
              expiry: expiresAt.toLocaleString()
            },
            branchId: profile?.branch_id || '',
            patientId: selectedPatientForResources.id
          });
          if (smsRes.success) {
            smsStatus = ' and SMS dispatched!';
          } else {
            console.warn('SMS dispatch failed:', smsRes.error);
          }
        } catch (smsErr) {
          console.warn('SMS trigger error:', smsErr);
        }
      }

      if (emailRes.success) {
        showToast(`Resource shared successfully, email${smsStatus ? smsStatus : ' dispatched!'}`, 'success');
      } else {
        showToast(`Resource saved${smsStatus ? ', SMS dispatched' : ''}, but email trigger failed: ${emailRes.error || 'Delivery issue'}`, 'warning');
      }

      // Log audit trail
      await logActivity(supabase, {
        userId: profile?.id || '',
        branchId: profile?.branch_id || '',
        action: 'patient_resources_share',
        recordId: selectedPatientForResources.id,
        details: `Shared resource "${newResourceForm.title}" with patient. Expiry: ${expiresAt.toLocaleString()}`
      });

      // Refresh list
      fetchPatientResources(selectedPatientForResources.id);
      
      // Reset form
      setNewResourceForm({
        title: '',
        description: '',
        resource_type: 'video_link',
        url: '',
        expiry_hours: '24',
        custom_expiry_date: '',
        custom_expiry_time: ''
      });
      setResourceModalTab('list');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error sharing resource', 'error');
    } finally {
      setResourcesLoading(false);
    }
  };

  const handleRevokeResource = async (resourceId: string) => {
    if (!confirm('Are you sure you want to revoke patient access to this resource immediately?')) return;
    setResourcesLoading(true);
    try {
      // 1. Try deleting or updating to expire now in Supabase
      const { error } = await supabase
        .from('patient_resources')
        .delete()
        .eq('id', resourceId);

      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist, fall back to LocalStorage deletion
          const localData = localStorage.getItem('mock_patient_resources');
          if (localData) {
            const list = JSON.parse(localData);
            const filtered = list.filter((r: any) => r.id !== resourceId);
            localStorage.setItem('mock_patient_resources', JSON.stringify(filtered));
          }
        } else {
          throw error;
        }
      }

      showToast('Access revoked successfully!', 'success');
      
      // Log audit trail
      await logActivity(supabase, {
        userId: profile?.id || '',
        branchId: profile?.branch_id || '',
        action: 'patient_resources_revoke',
        recordId: selectedPatientForResources.id,
        details: `Revoked access to resource ID: ${resourceId} immediately.`
      });

      fetchPatientResources(selectedPatientForResources.id);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error revoking access', 'error');
    } finally {
      setResourcesLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        showToast('File size must be less than 10MB', 'error');
        return;
      }
      setSelectedUploadFile(file);
      if (!fileForm.title) {
        setFileForm(prev => ({ ...prev, title: file.name }));
      }
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUploadFile || !selectedPatientForFiles) {
      showToast('Please select a file to upload', 'error');
      return;
    }

    try {
      setUploadingFile(true);
      const fileExt = selectedUploadFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `patient-files/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(filePath, selectedUploadFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('patient-files')
        .getPublicUrl(filePath);

      const fileData = {
        patient_id: selectedPatientForFiles.id,
        file_name: selectedUploadFile.name,
        file_type: selectedUploadFile.type,
        file_url: publicUrl,
        file_size: selectedUploadFile.size,
        title: fileForm.title || selectedUploadFile.name,
        upload_date: fileForm.date,
        notes: fileForm.notes,
        branch_id: profile?.branch_id,
        uploaded_by: profile?.id
      };

      const { error: dbError } = await supabase
        .from('patient_files')
        .insert([fileData]);

      if (dbError) throw dbError;

      showToast('File uploaded successfully');
      setSelectedUploadFile(null);
      setFileForm({
        title: '',
        notes: '',
        date: new Date().toISOString().split('T')[0]
      });
      // Clear file input element
      const fileInput = document.getElementById('patient-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      loadPatientFiles(selectedPatientForFiles.id);

      // Log activity
      if (profile?.id && profile?.branch_id) {
        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id,
          action: 'CREATE',
          tableName: 'patient_files',
          recordId: selectedPatientForFiles.id,
          details: `Uploaded file "${fileForm.title || selectedUploadFile.name}" for patient ${selectedPatientForFiles.full_name}`,
          newValues: fileData
        });
      }
    } catch (error: any) {
      console.error('Error uploading file:', error);
      showToast(error.message || 'Failed to upload file. Please check bucket settings.', 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteFile = async (file: any) => {
    if (!confirm(`Are you sure you want to delete "${file.title || file.file_name}"?`)) return;

    try {
      setLoadingFiles(true);
      const filePath = file.file_url.split('/').pop();
      if (filePath) {
        await supabase.storage
          .from('patient-files')
          .remove([`patient-files/${filePath}`]);
      }

      const { error } = await supabase
        .from('patient_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;
      showToast('File deleted successfully');
      if (selectedPatientForFiles) {
        loadPatientFiles(selectedPatientForFiles.id);
      }
    } catch (error: any) {
      console.error('Error deleting file:', error);
      showToast('Failed to delete file', 'error');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleDownloadFile = async (file: any) => {
    try {
      const response = await fetch(file.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.title || file.file_name;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      showToast('Failed to download file', 'error');
    }
  };

  const loadPendingPatients = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;
    try {
      let query = supabase.from('patient_temporary_db').select('*');
      if (profile?.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }
      const { data, error } = await query.order('submitted_at', { ascending: false });

      if (error) throw error;
      setPendingPatients(data || []);
    } catch (err) {
      console.error('Error loading pending patients:', err);
    }
  };

  const loadPatients = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      // 1. Get the real total count (bypasses the 1000-row default limit)
      let countQuery = supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if (profile.role !== 'super_admin') {
        countQuery = countQuery.eq('branch_id', profile.branch_id);
      }
      const { count } = await countQuery;
      setTotalPatientCount(count || 0);

      // 2. Load all patient data in pages of 1000 to bypass server-side PostgREST limits
      let allPatients: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        let query = supabase
          .from('patients')
          .select(`
            *,
            medical_aid:medical_aids(name),
            bills(balance, medical_aid_balance, shortfall_balance)
          `)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (profile.role !== 'super_admin') {
          query = query.eq('branch_id', profile.branch_id);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allPatients = allPatients.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      
      const patientsWithDue = allPatients.map((p: any) => ({
        ...p,
        total_due: p.bills?.reduce((sum: number, inv: any) => sum + (inv.balance || 0), 0) || 0,
        total_shortfall_due: p.bills?.reduce((sum: number, inv: any) => sum + (inv.shortfall_balance || 0), 0) || 0,
        total_medical_aid_due: p.bills?.reduce((sum: number, inv: any) => sum + (inv.medical_aid_balance || 0), 0) || 0
      }));

      setPatients(patientsWithDue);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  };

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
      let query = supabase
        .from('medical_aids')
        .select('id, name')
        .eq('is_active', true);

      const { data, error } = await query;
      if (error) throw error;
      setMedicalAids(data || []);
    } catch (error) {
      console.error('Error loading medical aids:', error);
    }
  };

  const loadFileNumberPool = async () => {
    try {
      // 1. Fetch manual entries from file_number_pool
      const { data: manualPool } = await supabase
        .from('file_number_pool')
        .select('file_number, is_occupied')
        .order('file_number', { ascending: true });

      // 2. Fetch file_numbers from discharged & deceased patients
      const { data: inactivePatients } = await supabase
        .from('patients')
        .select('file_number, full_name, patient_number, status')
        .in('status', ['discharged', 'deceased']);

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
          const tag = p.status === 'discharged' ? 'Discharged' : 'Deceased';
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

  const generatePatientNumber = (indexOffset = 0) => {
    const timestamp = (Date.now() + indexOffset).toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `P${timestamp}${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { send_sms, ...dbData } = formData;
      
      // Sanitize data: Convert empty strings to null for database compatibility
      const sanitizedData = Object.fromEntries(
        Object.entries(dbData).map(([key, value]) => [
          key,
          value === "" ? null : value
        ])
      );

      if (editingPatient) {
        const { error } = await supabase
          .from('patients')
          .update({
            ...sanitizedData,
            // Don't update password if it's empty
            ...(dbData.password ? { password: dbData.password } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('id', editingPatient.id);

        if (error) throw error;
        
        if (profile?.id && profile?.branch_id) {
            const isFromPool = fileNumberPool.some(f => f.file_number === formData.file_number);
            const fileSource = isFromPool ? 'managed pool' : 'manual entry';
            const fileDetails = (formData.file_number && formData.file_number !== editingPatient?.file_number) 
                ? ` [File Number changed to ${formData.file_number} from ${fileSource}]` 
                : '';

            await logActivity(supabase, {
                userId: profile.id,
                branchId: profile.branch_id,
                action: 'UPDATE',
                tableName: 'patients',
                recordId: editingPatient.id,
                details: `Updated patient details for ${formData.full_name}${fileDetails}`,
                newValues: formData
            });
        }
      } else {
        const patientNumber = generatePatientNumber();
        const generatedEmail = sanitizedData.email || `patient.${patientNumber.toLowerCase()}@spiritmed.com`;
        const generatedPassword = sanitizedData.password || 'patient123456';

        const { error, data } = await supabase
          .from('patients')
          .insert([{
            ...sanitizedData,
            email: generatedEmail,
            password: generatedPassword,
            branch_id: profile?.branch_id,
            patient_number: patientNumber,
            status: 'active'
          }])
          .select()
          .single();

        if (error) throw error;

        if (profile?.id && profile?.branch_id && data) {
            const isFromPool = fileNumberPool.some(f => f.file_number === formData.file_number);
            const fileSource = isFromPool ? 'managed pool' : 'manual entry';
            const fileDetails = formData.file_number ? ` [File: ${formData.file_number} selected from ${fileSource}]` : '';

            await logActivity(supabase, {
                userId: profile.id,
                branchId: profile.branch_id,
                action: 'CREATE',
                tableName: 'patients',
                recordId: data.id,
                details: `Registered new patient: ${formData.full_name} (${patientNumber})${fileDetails}`,
                newValues: formData
            });
        }
      }

      setShowModal(false);
      resetForm();
      loadPatients();
      showToast('Patient saved successfully!');
    } catch (error) {
      console.error('Error saving patient:', error);
      showToast('Failed to save patient', 'error');
    }
  };

  const handleEdit = (patient: any) => {
    setEditingPatient(patient);
    setFormData({
      title: patient.title || '',
      full_name: patient.full_name || '',
      gender: patient.gender || 'male',
      email: patient.email || '',
      password: '',
      address: patient.address || '',
      phone: patient.phone || '',
      date_of_birth: patient.date_of_birth || '',
      doctor_id: patient.doctor_id || '',
      clinical_history: patient.clinical_history || '',
      chronic_medications: patient.chronic_medications || '',
      smoke: patient.smoke || 'never',
      alcohol: patient.alcohol || 'never',
      flags: patient.flags || '',
      allergies: patient.allergies || '',
      chronic_conditions: patient.chronic_conditions || '',
      occupation: patient.occupation || '',
      emergency_contact_name: patient.emergency_contact_name || '',
      emergency_contact_phone: patient.emergency_contact_phone || '',
      next_of_kin_address: patient.next_of_kin_address || '',
      next_of_kin_relation: patient.next_of_kin_relation || '',
      next_of_kin_email: patient.next_of_kin_email || '',
      responsible_person_name: patient.responsible_person_name || '',
      responsible_person_address: patient.responsible_person_address || '',
      responsible_person_phone: patient.responsible_person_phone || '',
      responsible_person_id_number: patient.responsible_person_id_number || '',
      responsible_person_email: patient.responsible_person_email || '',
      payment_method: patient.payment_method || 'cash',
      medical_aid_id: patient.medical_aid_id || '',
      medical_aid_number: patient.medical_aid_number || '',
      medical_aid_suffix: patient.medical_aid_suffix || '',
      medical_aid_main_member: patient.medical_aid_main_member || '',
      referral_doctor_id: patient.referral_doctor_id || '',
      file_number: patient.file_number || '',
      send_sms: patient.send_sms || false
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
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
      send_sms: false
    });
    setEditingPatient(null);
    setCurrentTab('personal');
  };

  const handleDelete = async (patientId: string, name: string) => {
    if (!confirm(`Are you sure you want to archive patient "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('patients')
        .update({ status: 'inactive' })
        .eq('id', patientId);

      if (error) throw error;

      if (profile?.id && profile?.branch_id) {
          await logActivity(supabase, {
              userId: profile.id,
              branchId: profile.branch_id,
              action: 'DELETE',
              tableName: 'patients',
              recordId: patientId,
              details: `Archived patient profile: ${name}`,
              newValues: { status: 'inactive' }
          });
      }
      loadPatients();
    } catch (error: any) {
      console.error('Error archiving patient:', error);
      alert(`Failed to archive patient: ${error?.message || error?.details || 'Unknown error'}`);
    }
  };

  const handleUpdateStatus = async (status: 'deceased' | 'discharged') => {
    if (!selectedPatientForStatus) return;

    try {
      setLoading(true);
      const updateData: any = {
        status: status,
        updated_at: new Date().toISOString()
      };

      if (status === 'deceased') {
        updateData.deceased_date = statusFormData.date;
        updateData.deceased_reason = statusFormData.reason;
      } else if (status === 'discharged') {
        updateData.discharged_date = statusFormData.date;
        updateData.discharge_status = statusFormData.reason; // We use the reason field for the status selection
        updateData.discharge_notes = statusFormData.notes;
      }

      const { error } = await supabase
        .from('patients')
        .update(updateData)
        .eq('id', selectedPatientForStatus.id);

      if (error) throw error;

      // Create Discharge Summary if info is provided
      if (status === 'discharged' && (statusFormData.diagnosis_ids.length > 0 || statusFormData.treatment_done || statusFormData.medical_history)) {
        if (!profile) throw new Error('User profile not found');
        
        const summaryData = {
          branch_id: profile.branch_id,
          patient_id: selectedPatientForStatus.id,
          doctor_id: profile.id,
          report_date: statusFormData.date,
          recipient: statusFormData.recipient,
          diagnosis_ids: statusFormData.diagnosis_ids,
          diagnosis_text: statusFormData.diagnosis_text,
          medical_history: statusFormData.medical_history,
          treatment_done: statusFormData.treatment_done,
          follow_up_plan: statusFormData.follow_up_plan
        };

        const { error: summaryError } = await supabase
          .from('discharge_summaries')
          .insert([summaryData]);

        if (summaryError) {
          console.error('Error creating discharge summary:', summaryError);
          // Don't throw here to avoid preventing the discharge status update
        } else {
            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'CREATE',
                    tableName: 'discharge_summaries',
                    recordId: selectedPatientForStatus.id, // Using patient ID as reference
                    details: `Created discharge summary for ${selectedPatientForStatus.full_name}`,
                    newValues: summaryData
                });
            }
        }
      }

      if (profile?.id && profile?.branch_id) {
          await logActivity(supabase, {
              userId: profile.id,
              branchId: profile.branch_id,
              action: 'STATUS_CHANGE',
              tableName: 'patients',
              recordId: selectedPatientForStatus.id,
              details: `Changed patient status to ${status.toUpperCase()} (Reason: ${statusFormData.reason})`,
              newValues: updateData
          });
      }

      showToast(`Patient marked as ${status} successfully`);
      setShowDeceasedModal(false);
      setShowDischargedModal(false);
      loadPatients();
      loadFileNumberPool();

      setStatusFormData({
        date: new Date().toISOString().split('T')[0],
        reason: '',
        notes: '',
        recipient: '',
        diagnosis_ids: [],
        diagnosis_text: '',
        medical_history: '',
        treatment_done: '',
        follow_up_plan: '',
        createSummary: true
      });
      setSelectedPatientForStatus(null);
    } catch (error: any) {
      console.error(`Error updating patient status to ${status}:`, error);
      showToast(`Failed to mark patient as ${status}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprovePatient = async (pending: PendingPatient) => {
    if (!confirm(`Approve and register patient "${pending.full_name}"?`)) return;

    try {
      setLoading(true);
      const patientNumber = generatePatientNumber();
      
      // 1. Move to patients table
      const { id, submitted_at, ...cleanData } = pending;
      const generatedEmail = cleanData.email || `patient.${patientNumber.toLowerCase()}@spiritmed.com`;
      const generatedPassword = cleanData.password || 'patient123456';

      const { error: insertError, data: newPatient } = await supabase
        .from('patients')
        .insert([{
          ...cleanData,
          email: generatedEmail,
          password: generatedPassword,
          patient_number: patientNumber,
          status: 'active'
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. Delete from temporary table
      const { error: deleteError } = await supabase
        .from('patient_temporary_db')
        .delete()
        .eq('id', pending.id);

      if (deleteError) throw deleteError;

      if (profile?.id && profile?.branch_id && newPatient) {
        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id,
          action: 'CREATE',
          tableName: 'patients',
          recordId: newPatient.id,
          details: `Approved patient registration: ${pending.full_name} (${patientNumber})`,
          newValues: newPatient
        });
      }

      alert('Patient approved successfully!');
      setShowPendingModal(false);
      setSelectedPending(null);
      loadPatients();
      loadPendingPatients();
    } catch (err: any) {
      console.error('Error approving patient:', err);
      alert(err.message || 'Failed to approve patient');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectPatient = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to reject and delete registration for "${name}"?`)) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('patient_temporary_db')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alert('Registration rejected.');
      loadPendingPatients();
    } catch (err: any) {
      console.error('Error rejecting patient:', err);
      alert('Failed to reject registration');
    } finally {
      setLoading(false);
    }
  };

  const copyRegistrationLink = () => {
    if (!profile?.branch_id) return;
    const url = `${window.location.origin}/register/${profile.branch_id}`;
    navigator.clipboard.writeText(url);
    alert('Registration link copied to clipboard!');
  };

  const exportToCSV = () => {
    const headers = ['Patient Number', 'Full Name', 'Age', 'Gender', 'Phone', 'Email', 'Registration Date'];
    const csvData = filteredPatients.map(patient => [
      patient.patient_number,
      patient.full_name,
      patient.date_of_birth ? getAge(patient.date_of_birth) : '',
      patient.gender,
      patient.phone || '',
      patient.email || '',
      new Date(patient.created_at).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patients_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportExcel = () => {
    const data = filteredPatients.map(p => ({
      'Patient Number': p.patient_number,
      'Full Name': p.full_name,
      'Age': p.date_of_birth ? getAge(p.date_of_birth) : 'N/A',
      'Gender': p.gender,
      'Phone': p.phone || '',
      'Email': p.email || '',
      'Total Due': p.total_due || 0,
      'Registration Date': new Date(p.created_at).toLocaleDateString()
    }));
    exportToExcel(data, 'spiritmed_patients');
  };

  const handleExportPDF = () => {
    const headers = ['#', 'Name', 'Phone', 'Due', 'Gender'];
    const data = filteredPatients.map((p, i) => [
      i + 1,
      p.full_name,
      p.phone || 'N/A',
      `$${(p.total_due || 0).toLocaleString()}`,
      p.gender
    ]);
    exportToPDF(headers, data, 'Spiritmed Patient Directory', 'spiritmed_patients');
  };

  const filteredPatients = patients.filter(patient => {
    const matchesSearch =
      patient.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.patient_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (patient.file_number && patient.file_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (patient.phone && patient.phone.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesGender = filters.gender === 'all' || patient.gender === filters.gender;
    const matchesBalance = filters.hasBalance === 'all' || 
                          (filters.hasBalance === 'due' && (patient.total_due || 0) > 0) ||
                          (filters.hasBalance === 'none' && (patient.total_due || 0) <= 0);

    return matchesSearch && matchesGender && matchesBalance;
  });

  const totalClinicReceivable = filteredPatients.reduce((sum, p) => sum + (p.total_due || 0), 0);

  const totalPages = Math.ceil(filteredPatients.length / itemsPerPage);
  const paginated = filteredPatients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getAge = (dob: string) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  if (showViewSheet && selectedPatientForView && branch) {
    return (
      <PatientPrintView 
        patient={selectedPatientForView} 
        branch={branch} 
        onBack={() => setShowViewSheet(false)} 
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Active Patients</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage active patient records</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={copyRegistrationLink}
            className="flex items-center space-x-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-100 transition border border-indigo-100 font-bold text-sm"
          >
            <Mail className="w-4 h-4" />
            <span>Share Registration Link</span>
          </button>
          {hasPermission('patients', 'add') && (
            <button
              onClick={() => {
                setShowImportModal(true);
                setImportFile(null);
                setImportLogs([]);
                setParsedPatients(null);
              }}
              className="flex items-center space-x-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition shadow-md font-bold text-sm"
            >
              <Upload className="w-4 h-4" />
              <span>Import Patients</span>
            </button>
          )}
          {hasPermission('patients', 'add') && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-md font-bold text-sm"
            >
              <Plus className="w-5 h-5" />
              <span>Add Patient</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit mb-4">
        <button 
          onClick={() => setActiveSubTab('all')}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all ${
            activeSubTab === 'all' ? 'bg-white dark:bg-gray-700 text-green-600 shadow-sm' : 'text-gray-500 hover:bg-white/50'
          }`}
        >
          <Users className="w-4 h-4" />
          All Patients
        </button>
        <button 
          onClick={() => setActiveSubTab('pending')}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-black transition-all relative ${
            activeSubTab === 'pending' ? 'bg-white dark:bg-gray-700 text-orange-600 shadow-sm' : 'text-gray-500 hover:bg-white/50'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pending Approvals
          {pendingPatients.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white dark:border-gray-800">
              {pendingPatients.length}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-xs text-gray-500 uppercase font-bold mb-1">Total Patients</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {searchQuery || filters.gender !== 'all' || filters.hasBalance !== 'all'
              ? filteredPatients.length
              : totalPatientCount || filteredPatients.length}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-xs text-amber-500 uppercase font-bold mb-1">Total Dues</div>
          <div className="text-2xl font-bold text-amber-600">${totalClinicReceivable.toLocaleString()}</div>
        </div>
      </div>

      {activeSubTab === 'all' ? (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-col md:flex-row gap-3">
          <div className="flex flex-col md:flex-row gap-3 w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="ID, Name, or Phone..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm outline-none bg-white dark:bg-gray-700"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold transition"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>{showFilters ? 'Hide' : 'Show'} Filters</span>
                </button>
                <div className="flex bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
                  <button onClick={handleExportExcel} className="p-2 text-green-600 hover:bg-white rounded-md transition"><FileSpreadsheet className="w-4 h-4" /></button>
                  <button onClick={handleExportPDF} className="p-2 text-red-600 hover:bg-white rounded-md transition"><FileJson className="w-4 h-4" /></button>
                  <button onClick={exportToCSV} className="p-2 text-blue-600 hover:bg-white rounded-md transition"><Download className="w-4 h-4" /></button>
                </div>
              </div>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Gender</label>
                <select
                  value={filters.gender}
                  onChange={(e) => { setFilters({ ...filters, gender: e.target.value }); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold outline-none bg-transparent"
                >
                  <option value="all">All Genders</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1.5 tracking-widest">Financial State</label>
                <select
                  value={filters.hasBalance}
                  onChange={(e) => { setFilters({ ...filters, hasBalance: e.target.value }); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold outline-none bg-transparent"
                >
                  <option value="all">All Patients</option>
                  <option value="due">With Outstanding Dues</option>
                  <option value="none">No Dues</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => { setFilters({ gender: 'all', hasBalance: 'all' }); setCurrentPage(1); }}
                  className="w-full py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[10px] font-black uppercase rounded-lg hover:bg-gray-100 transition tracking-widest"
                >
                  Reset All Filters
                </button>
              </div>
          </div>
        )}
      </div>

      {/* 📱 Mobile Patient Cards (< md) */}
      <div className="md:hidden space-y-3 mb-4">
        {paginated.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
            No patients found
          </div>
        ) : (
          paginated.map((patient, idx) => (
            <div key={patient.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center text-green-600 font-extrabold text-sm">
                    {(currentPage - 1) * itemsPerPage + idx + 1}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-gray-900 dark:text-white uppercase">
                      {patient.title ? `${patient.title} ` : ''}{patient.full_name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400">
                        ID: {patient.patient_number ? patient.patient_number.split('-')[0] : ''}
                      </span>
                      {patient.file_number && (
                        <span className="text-[10px] font-mono bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-1.5 py-0.5 rounded-sm font-bold">
                          File: {patient.file_number.split('-')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 shrink-0">
                  {patient.gender} • {patient.date_of_birth ? `${getAge(patient.date_of_birth)} YRS` : 'N/A'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Contact</span>
                  <a href={`tel:${patient.phone}`} className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3" />
                    {patient.phone || 'N/A'}
                  </a>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Financial Due</span>
                  <span className={`font-black ${ (patient.total_due || 0) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                    ${(patient.total_due || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => openViewSheet(patient)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-green-50 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition"
                    title="View Profile"
                  >
                    <Eye className="w-4 h-4 text-green-600" />
                  </button>
                  <button
                    onClick={() => handleEdit(patient)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-blue-50 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition"
                    title="Edit Patient"
                  >
                    <Edit2 className="w-4 h-4 text-blue-600" />
                  </button>
                  <button
                    onClick={() => { setSelectedPatientForHistory(patient); loadPatientPaymentHistory(patient.id); setShowHistoryModal(true); }}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-indigo-50 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition"
                    title="Payments"
                  >
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                  </button>
                  <button
                    onClick={() => { setSelectedPatientForFiles(patient); loadPatientFiles(patient.id); setShowFilesModal(true); }}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-teal-50 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition"
                    title="Files"
                  >
                    <FileText className="w-4 h-4 text-teal-600" />
                  </button>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => { setSelectedPatientForStatus(patient); setShowDischargedModal(true); }}
                    className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 transition"
                  >
                    Discharge
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 💻 Desktop Table View (>= md) */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-100 dark:bg-gray-900 border-b-2 border-gray-200 dark:border-gray-700">
              <tr className="divide-x dark:divide-gray-700">
                <th className="px-5 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Patient ID</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">National ID</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">File No</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Age / Gender</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Financials</th>
                <th className="px-5 py-3 text-left text-xs font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm font-bold text-gray-500 dark:text-gray-400">
                    No patients found
                  </td>
                </tr>
              ) : (
                paginated.map((patient, idx) => (
                  <tr key={patient.id} className="hover:bg-gray-100/70 dark:hover:bg-gray-900/60 transition divide-x dark:divide-gray-700">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-extrabold text-gray-400 dark:text-gray-500 font-mono">{(currentPage - 1) * itemsPerPage + idx + 1}</div>
                        <div className="text-sm font-extrabold text-gray-900 dark:text-white uppercase tracking-tight">
                          {patient.title ? `${patient.title} ` : ''}{patient.full_name}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-extrabold text-blue-600 dark:text-blue-400 font-mono">{patient.patient_number ? patient.patient_number.split('-')[0] : ''}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-extrabold font-mono text-gray-800 dark:text-gray-100">{patient.national_id || <span className="text-gray-400 dark:text-gray-500 font-bold">N/A</span>}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-extrabold text-green-600 dark:text-green-400 font-mono">{patient.file_number ? patient.file_number.split('-')[0] : <span className="text-gray-400">NO FILE</span>}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm font-extrabold text-gray-800 dark:text-gray-100">{patient.date_of_birth ? `${getAge(patient.date_of_birth)} YRS` : 'N/A'}</div>
                      <div className="text-xs font-extrabold text-gray-500 dark:text-gray-400 uppercase mt-0.5">{patient.gender}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-sm font-extrabold text-gray-800 dark:text-gray-100"><Phone className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />{patient.phone}</div>
                      {patient.email && <div className="flex items-center gap-1.5 text-xs font-extrabold text-gray-500 dark:text-gray-400 mt-0.5"><Mail className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />{patient.email}</div>}
                    </td>
                    <td className="px-4 py-3.5 bg-amber-50/20 dark:bg-amber-950/5">
                      {patient.medical_aid_id || patient.medical_aid ? (
                        <div className="space-y-1">
                          <div className="flex justify-between items-center gap-4"><span className="text-[10px] font-extrabold text-rose-500 dark:text-rose-400 uppercase tracking-wider">Shortfall</span><span className={`text-sm font-black ${ (patient.total_shortfall_due || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-300 dark:text-gray-600'}`}>${(patient.total_shortfall_due || 0).toLocaleString()}</span></div>
                          <div className="flex justify-between items-center gap-4"><span className="text-[10px] font-extrabold text-amber-500 dark:text-amber-400 uppercase tracking-wider">Total</span><span className={`text-sm font-black ${ (patient.total_due || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}>${(patient.total_due || 0).toLocaleString()}</span></div>
                        </div>
                      ) : (
                        <div className={`text-sm font-black text-right ${ (patient.total_due || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}>${(patient.total_due || 0).toLocaleString()}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => handleViewPatient(patient)}
                          className="p-1.5 hover:bg-green-50 dark:hover:bg-green-950/20 text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 rounded-lg transition-colors"
                          title="View Records"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => window.location.href = `/consultations?patientId=${patient.id}`}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 rounded-lg transition-colors"
                          title="Start Consultation"
                        >
                          <Stethoscope className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => window.location.href = `/vital-signs?patientId=${patient.id}`}
                          className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300 rounded-lg transition-colors"
                          title="Record Vitals"
                        >
                          <HeartPulse className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleOpenFiles(patient)}
                          className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 rounded-lg transition-colors"
                          title="Patient Files"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleOpenHistory(patient)}
                          className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/20 text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 rounded-lg transition-colors"
                          title="Payment History"
                        >
                          <CreditCard className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleOpenResources(patient)}
                          className="p-1.5 hover:bg-teal-50 dark:hover:bg-teal-950/20 text-teal-600 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-300 rounded-lg transition-colors"
                          title="Share Resources"
                        >
                          <Share2 className="w-5 h-5" />
                        </button>
                        {hasPermission('patients', 'edit') && (
                          <button
                            onClick={() => handleEdit(patient)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-655 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 rounded-lg transition-colors"
                            title="Edit Patient"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                        )}
                        {hasPermission('patients', 'edit') && (
                          <button
                            onClick={() => {
                              setSelectedPatientForStatus(patient);
                              setShowDeceasedModal(true);
                            }}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                            title="Mark Deceased"
                          >
                            <Skull className="w-5 h-5" />
                          </button>
                        )}
                        {hasPermission('patients', 'edit') && (
                          <button
                            onClick={() => {
                              setSelectedPatientForStatus(patient);
                              setShowDischargedModal(true);
                            }}
                            className="p-1.5 hover:bg-orange-50 dark:hover:bg-orange-950/20 text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300 rounded-lg transition-colors"
                            title="Mark Discharged"
                          >
                            <LogOut className="w-5 h-5" />
                          </button>
                        )}
                        {hasPermission('patients', 'delete') && (
                          <button
                            onClick={() => handleDelete(patient.id, patient.full_name)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 rounded-lg transition-colors"
                            title="Delete Patient"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredPatients.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
                <p className="text-xs text-gray-500">
                  Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredPatients.length)} of {filteredPatients.length}
                </p>
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                    <select
                        value={itemsPerPage === filteredPatients.length ? 'all' : itemsPerPage}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'all') {
                                setItemsPerPage(filteredPatients.length || 1000000);
                            } else {
                                setItemsPerPage(Number(val));
                            }
                            setCurrentPage(1);
                        }}
                        className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-green-500"
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value="all">ALL</option>
                    </select>
                </div>
            </div>
            
            {itemsPerPage < filteredPatients.length && totalPages > 1 && (
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
              <div className="flex gap-1 items-center">
                {(() => {
                  const pages: (number | string)[] = [];
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (currentPage > 4) pages.push('...');
                    for (let i = Math.max(2, currentPage - 2); i <= Math.min(totalPages - 1, currentPage + 2); i++) {
                      pages.push(i);
                    }
                    if (currentPage < totalPages - 3) pages.push('...');
                    pages.push(totalPages);
                  }
                  return pages.map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(Number(p))}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === p ? 'bg-green-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
                      >
                        {p}
                      </button>
                    )
                  );
                })()}
              </div>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
              >
                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            )}
          </div>
        )}
      </div>
    </>
  ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Submitted</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Gender</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {pendingPatients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      No pending registration approvals
                    </td>
                  </tr>
                ) : (
                  pendingPatients.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                      <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900 dark:text-white">
                        {p.full_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">{p.phone}</div>
                        <div className="text-xs text-gray-500">{p.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(p.submitted_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                        {p.gender}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => { setSelectedPending(p); setShowPendingModal(true); }}
                            className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition text-xs font-bold"
                          >
                            Review & Approve
                          </button>
                          <button 
                            onClick={() => handleRejectPatient(p.id, p.full_name)}
                            className="p-1 px-2 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition text-xs font-bold"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-5xl w-full my-8 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingPatient ? 'Edit Patient' : 'Add New Patient'}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="border-b border-gray-200 dark:border-gray-700">
              <div className="flex overflow-x-auto">
                <button
                  onClick={() => setCurrentTab('personal')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'personal'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Personal Info
                </button>
                <button
                  onClick={() => setCurrentTab('medical')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'medical'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Medical Info
                </button>
                <button
                  onClick={() => setCurrentTab('nextofkin')}
                  className={`px-6 py-3 text-sm font-medium whitespace-nowrap ${currentTab === 'nextofkin'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                >
                  Next of Kin
                </button>
                <button
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

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
              {currentTab === 'personal' && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Personal Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                      <select
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File Number</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={formData.file_number}
                          onFocus={() => setShowFileDropdown(true)}
                          onChange={(e) => {
                            setFormData({ ...formData, file_number: e.target.value });
                            setShowFileDropdown(true);
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          placeholder="Type or select file..."
                        />
                        
                        {showFileDropdown && (
                          <>
                            <div className="fixed inset-0 z-[60]" onClick={() => setShowFileDropdown(false)}></div>
                            <div className="absolute z-[70] left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {fileNumberPool
                                .filter(f => (!f.is_occupied || f.file_number === editingPatient?.file_number) && (f.file_number.toLowerCase().includes(formData.file_number.toLowerCase()) || (f.label && f.label.toLowerCase().includes(formData.file_number.toLowerCase()))))
                                .length > 0 ? (
                                  fileNumberPool
                                    .filter(f => (!f.is_occupied || f.file_number === editingPatient?.file_number) && (f.file_number.toLowerCase().includes(formData.file_number.toLowerCase()) || (f.label && f.label.toLowerCase().includes(formData.file_number.toLowerCase()))))
                                    .map(f => (
                                      <button
                                        key={f.file_number}
                                        type="button"
                                        onClick={() => {
                                          setFormData({ ...formData, file_number: f.file_number });
                                          setShowFileDropdown(false);
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
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gender</label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
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
                        value={formData.date_of_birth}
                        onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Occupation</label>
                      <input
                        type="text"
                        value={formData.occupation}
                        onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Home Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="send_sms"
                      checked={formData.send_sms}
                      onChange={(e) => setFormData({ ...formData, send_sms: e.target.checked })}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <label htmlFor="send_sms" className="text-sm font-medium text-gray-700 dark:text-gray-300">
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
                        value={formData.doctor_id}
                        onChange={(val) => setFormData({ ...formData, doctor_id: val })}
                        placeholder="Search or select doctor..."
                        searchPlaceholder="Search doctor by name..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Clinical History</label>
                    <textarea
                      value={formData.clinical_history}
                      onChange={(e) => setFormData({ ...formData, clinical_history: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Chronic Medications</label>
                    <textarea
                      value={formData.chronic_medications}
                      onChange={(e) => setFormData({ ...formData, chronic_medications: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Smoke</label>
                      <select
                        value={formData.smoke}
                        onChange={(e) => setFormData({ ...formData, smoke: e.target.value })}
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
                        value={formData.alcohol}
                        onChange={(e) => setFormData({ ...formData, alcohol: e.target.value })}
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
                      value={formData.flags}
                      onChange={(e) => setFormData({ ...formData, flags: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Special alerts or warnings"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Allergies</label>
                    <textarea
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Referral Doctor</label>
                    <SearchableSelect
                      options={referralDoctors.map(doctor => ({ value: doctor.id, label: doctor.full_name }))}
                      value={formData.referral_doctor_id}
                      onChange={(val) => setFormData({ ...formData, referral_doctor_id: val })}
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
                        value={formData.emergency_contact_name}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Contact</label>
                      <input
                        type="tel"
                        value={formData.emergency_contact_phone}
                        onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Relation</label>
                      <input
                        type="text"
                        value={formData.next_of_kin_relation}
                        onChange={(e) => setFormData({ ...formData, next_of_kin_relation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="e.g., Spouse, Parent, Sibling"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Email</label>
                      <input
                        type="email"
                        value={formData.next_of_kin_email}
                        onChange={(e) => setFormData({ ...formData, next_of_kin_email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Next of Kin Address</label>
                    <textarea
                      value={formData.next_of_kin_address}
                      onChange={(e) => setFormData({ ...formData, next_of_kin_address: e.target.value })}
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
                          value={formData.responsible_person_name}
                          onChange={(e) => setFormData({ ...formData, responsible_person_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                          <input
                            type="tel"
                            value={formData.responsible_person_phone}
                            onChange={(e) => setFormData({ ...formData, responsible_person_phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID Number</label>
                          <input
                            type="text"
                            value={formData.responsible_person_id_number}
                            onChange={(e) => setFormData({ ...formData, responsible_person_id_number: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                        <input
                          type="email"
                          value={formData.responsible_person_email}
                          onChange={(e) => setFormData({ ...formData, responsible_person_email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                        <textarea
                          value={formData.responsible_person_address}
                          onChange={(e) => setFormData({ ...formData, responsible_person_address: e.target.value })}
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
                          value={formData.payment_method}
                          onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="cash">Cash</option>
                          <option value="medical_aid">Medical Aid</option>
                        </select>
                      </div>

                      {formData.payment_method === 'medical_aid' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Medical Aid</label>
                            <SearchDropdown
                              placeholder="Select Medical Aid"
                              items={medicalAids}
                              selectedId={formData.medical_aid_id}
                              onSelect={(id) => setFormData({ ...formData, medical_aid_id: id })}
                              displayFn={(aid) => aid.name}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Number</label>
                              <input
                                type="text"
                                value={formData.medical_aid_number}
                                onChange={(e) => setFormData({ ...formData, medical_aid_number: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Suffix</label>
                              <input
                                type="text"
                                value={formData.medical_aid_suffix}
                                onChange={(e) => setFormData({ ...formData, medical_aid_suffix: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Medical Aid Main Member</label>
                            <input
                              type="text"
                              value={formData.medical_aid_main_member}
                              onChange={(e) => setFormData({ ...formData, medical_aid_main_member: e.target.value })}
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
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md"
                >
                  {editingPatient ? 'Save Changes' : 'Add Patient'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeceasedModal && selectedPatientForStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Skull className="w-6 h-6 text-red-600" />
                Mark Patient as Deceased
              </h2>
              <button onClick={() => setShowDeceasedModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Patient: <span className="font-bold text-gray-900 dark:text-white">{selectedPatientForStatus.full_name} ({selectedPatientForStatus.patient_number})</span>
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date of Death *</label>
                <input
                  type="date"
                  value={statusFormData.date}
                  onChange={(e) => setStatusFormData({ ...statusFormData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason for Death *</label>
                <textarea
                  value={statusFormData.reason}
                  onChange={(e) => setStatusFormData({ ...statusFormData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                  placeholder="Enter reason or cause of death..."
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDeceasedModal(false)}
                  className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateStatus('deceased')}
                  disabled={loading}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-md disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Confirm Deceased'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDischargedModal && selectedPatientForStatus && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                Discharge & Complete Summary
              </h2>
              <button onClick={() => setShowDischargedModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 max-h-[80vh] overflow-y-auto pr-4">
                <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-800/30 flex items-center justify-between">
                   <div>
                        <p className="text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">Patient for Discharge</p>
                        <p className="text-lg font-black text-gray-900 dark:text-white">{selectedPatientForStatus.full_name} <span className="text-gray-400 font-normal ml-2">({selectedPatientForStatus.patient_number})</span></p>
                   </div>
                   <div className="text-right">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Status change to</p>
                        <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-black uppercase">Discharged</span>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Basic Info */}
                    <div className="space-y-4 pt-2 border-r border-gray-100 dark:border-gray-700 pr-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Discharge Date *</label>
                                <input
                                    type="date"
                                    value={statusFormData.date}
                                    onChange={(e) => setStatusFormData({ ...statusFormData, date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Discharge Status *</label>
                                <select
                                    value={statusFormData.reason}
                                    onChange={(e) => setStatusFormData({ ...statusFormData, reason: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    required
                                >
                                    <option value="">Select status</option>
                                    <option value="recovered">Recovered</option>
                                    <option value="improved">Improved</option>
                                    <option value="transferred">Transferred</option>
                                    <option value="self_discharged">Self-Discharged / AMA</option>
                                    <option value="referred">Referred</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Recipient (TO)</label>
                            <input
                                type="text"
                                placeholder="e.g. TO WHOM IT MAY CONCERN"
                                value={statusFormData.recipient}
                                onChange={(e) => setStatusFormData({ ...statusFormData, recipient: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>

                        <SearchDropdown
                            label="Diagnosis(es)"
                            placeholder="Select ICD-10 Diagnosis..."
                            items={diagnoses}
                            multiSelect={true}
                            selectedIds={statusFormData.diagnosis_ids}
                            onSelectMultiple={(ids: string[]) => setStatusFormData({ ...statusFormData, diagnosis_ids: ids })}
                            displayFn={(d: any) => d.name + (d.icd10_code ? ` (${d.icd10_code})` : '')}
                        />

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Quick Clinical Notes</label>
                            <textarea
                                value={statusFormData.notes}
                                onChange={(e) => setStatusFormData({ ...statusFormData, notes: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                rows={4}
                                placeholder="Brief summary notes..."
                            />
                        </div>
                    </div>

                    {/* Detailed Summary */}
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Diagnosis Text (Technical)</label>
                            <textarea
                                value={statusFormData.diagnosis_text}
                                onChange={(e) => setStatusFormData({ ...statusFormData, diagnosis_text: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                rows={3}
                                placeholder="Detailed diagnosis description..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Medical History</label>
                            <textarea
                                value={statusFormData.medical_history}
                                onChange={(e) => setStatusFormData({ ...statusFormData, medical_history: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                rows={4}
                                placeholder="Summary of patient history..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Treatment Done</label>
                            <textarea
                                value={statusFormData.treatment_done}
                                onChange={(e) => setStatusFormData({ ...statusFormData, treatment_done: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                rows={4}
                                placeholder="Treatments, Procedures, Medications..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Follow-up Plan</label>
                            <textarea
                                value={statusFormData.follow_up_plan}
                                onChange={(e) => setStatusFormData({ ...statusFormData, follow_up_plan: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                rows={3}
                                placeholder="Future care instructions..."
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
                <button
                    onClick={() => setShowDischargedModal(false)}
                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 transition"
                >
                    Cancel
                </button>
                <button
                    onClick={() => handleUpdateStatus('discharged')}
                    disabled={loading}
                    className="px-8 py-2 bg-orange-600 text-white rounded-lg text-sm font-black hover:bg-orange-700 transition shadow-lg disabled:opacity-50"
                >
                    {loading ? 'Processing...' : 'Complete Discharge & Save Summary'}
                </button>
            </div>
          </div>
        </div>
      )}
      {showPendingModal && selectedPending && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full p-8 space-y-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">Review Registration</h2>
                <p className="text-sm text-gray-500 font-bold">Submitted on {new Date(selectedPending.submitted_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setShowPendingModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition">
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-8">
              {/* Categorized Information */}
              <div className="space-y-6">
                {/* 1. Patient Profile */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-2">
                    <User className="w-3 h-3" /> Patient Profile
                  </h3>
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div>
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">Full Name</span>
                      <span className="font-bold dark:text-white capitalize">{selectedPending.full_name}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">ID/Passport</span>
                      <span className="font-bold dark:text-white">{selectedPending.id_passport_number || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">Gender / Blood</span>
                      <span className="font-bold dark:text-white capitalize">{selectedPending.gender} ({selectedPending.blood_group || 'N/A'})</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">Initial Consultation</span>
                      <span className="font-bold dark:text-white">{selectedPending.initial_consultation_date || 'N/A'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">Home Address</span>
                      <span className="font-bold dark:text-white">{selectedPending.address}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Medical History */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-600 flex items-center gap-2">
                    <HeartPulse className="w-3 h-3" /> Medical Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-4 bg-rose-50/50 dark:bg-rose-900/10 p-4 rounded-xl border border-rose-100/50 dark:border-rose-900/20">
                    <div>
                      <span className="block text-[10px] text-rose-400 font-bold uppercase">Food Allergies</span>
                      <span className="font-bold text-rose-700 dark:text-rose-400">{selectedPending.food_allergies || 'None'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-rose-400 font-bold uppercase">Medication Allergies</span>
                      <span className="font-bold text-rose-700 dark:text-rose-400">{selectedPending.medication_allergies || 'None'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">Current Medications</span>
                      <span className="block text-sm dark:text-gray-300">{selectedPending.chronic_medications || 'None listed'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">Referring Doctor</span>
                      <span className="font-bold dark:text-white">{selectedPending.referring_doctor || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">GP Practitioner</span>
                      <span className="font-bold dark:text-white">{selectedPending.gp_practitioner || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Next of Kin & Emergency */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 flex items-center gap-2">
                      <Users className="w-3 h-3" /> Next of Kin
                    </h3>
                    <div className="bg-orange-50/50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100/50 dark:border-orange-900/20 text-xs">
                      <div className="font-bold dark:text-white">{selectedPending.next_of_kin_name}</div>
                      <div className="text-orange-700 dark:text-orange-400 font-bold mt-1">{selectedPending.next_of_kin_phone}</div>
                      <div className="text-gray-500 mt-1">{selectedPending.next_of_kin_relationship}</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3" /> Emergency
                    </h3>
                    <div className="bg-red-50/50 dark:bg-red-900/10 p-4 rounded-xl border border-red-100/50 dark:border-red-900/20 text-xs">
                      <div className="font-bold dark:text-white">{selectedPending.emergency_contact_name}</div>
                      <div className="text-red-700 dark:text-red-400 font-bold mt-1">{selectedPending.emergency_contact_phone}</div>
                      <div className="text-gray-500 mt-1">{selectedPending.emergency_contact_relationship}</div>
                    </div>
                  </div>
                </div>

                {/* 4. Payment Details */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 flex items-center gap-2">
                    <CreditCard className="w-3 h-3" /> Payment & Responsibility
                  </h3>
                  <div className="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100/50 dark:border-blue-900/20 grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[10px] text-blue-400 font-bold uppercase">Method</span>
                      <span className="font-bold text-blue-700 dark:text-blue-400 uppercase">{selectedPending.payment_method}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-blue-400 font-bold uppercase">Responsible Person</span>
                      <span className="font-bold dark:text-white">{selectedPending.responsible_person_name}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">Responsible ID</span>
                      <span className="font-bold dark:text-white">{selectedPending.responsible_person_id_number || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-gray-400 font-bold uppercase">Responsible Contact</span>
                      <span className="font-bold dark:text-white">{selectedPending.responsible_person_phone}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button 
                onClick={() => handleRejectPatient(selectedPending.id, selectedPending.full_name)}
                className="flex-1 py-4 text-rose-600 font-black hover:bg-rose-50 transition rounded-xl"
              >
                Reject Registration
              </button>
              <button 
                onClick={() => handleApprovePatient(selectedPending)}
                disabled={loading}
                className="flex-[2] py-4 bg-emerald-600 text-white font-black rounded-xl shadow-lg shadow-emerald-200 dark:shadow-none hover:bg-emerald-700 transition"
              >
                {loading ? 'Approving...' : 'Approve & Register Patient'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Files & Uploads Modal */}
      {showFilesModal && selectedPatientForFiles && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Patient Files & Clinical Uploads
                </h2>
                <p className="text-xs text-gray-500 font-bold mt-1">
                  Managing documents for: <span className="text-indigo-600 dark:text-indigo-400 uppercase font-extrabold">{selectedPatientForFiles.full_name}</span> ({selectedPatientForFiles.patient_number})
                </p>
              </div>
              <button 
                onClick={() => { setShowFilesModal(false); setSelectedPatientForFiles(null); }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            </div>

            {/* Split Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Left Column: Upload Form */}
              <div className="lg:col-span-2 space-y-4 bg-gray-50/50 dark:bg-gray-900/20 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider flex items-center gap-1.5 border-b pb-2 mb-2">
                  <Upload className="w-3.5 h-3.5 text-green-600" /> Upload New File
                </h3>
                <form onSubmit={handleFileUpload} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">File Title *</label>
                    <input
                      type="text"
                      value={fileForm.title}
                      onChange={(e) => setFileForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., Blood Report, Chest X-Ray"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Upload Date *</label>
                    <input
                      type="date"
                      value={fileForm.date}
                      onChange={(e) => setFileForm(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Notes / Description</label>
                    <textarea
                      value={fileForm.notes}
                      onChange={(e) => setFileForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Clinical details, observations about this record..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Select File *</label>
                    <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-white dark:bg-gray-800">
                      <div className="flex flex-col items-center justify-center text-center">
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <input
                          id="patient-file-input"
                          type="file"
                          onChange={handleFileSelect}
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          className="text-xs text-gray-500 dark:text-gray-400 w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 dark:file:bg-green-900/30 dark:file:text-green-400 hover:file:bg-green-100"
                          required
                        />
                        {selectedUploadFile && (
                          <div className="mt-2 text-[10px] text-green-600 font-extrabold bg-green-50 dark:bg-green-950/20 px-2 py-0.5 rounded border border-green-100/50">
                            Selected: {selectedUploadFile.name.substring(0, 20)}... ({(selectedUploadFile.size / 1024 / 1024).toFixed(2)} MB)
                          </div>
                        )}
                        <p className="text-[9px] text-gray-400 font-bold mt-2">
                          PDF, JPEG, PNG, DOC (Max 10MB)
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={uploadingFile}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-lg text-sm font-black hover:bg-green-700 transition shadow-lg disabled:opacity-50"
                  >
                    {uploadingFile ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        <span>Uploading file...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        <span>Upload to Patient Record</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Right Column: Uploaded Files List */}
              <div className="lg:col-span-3 space-y-4">
                <h3 className="text-xs font-black uppercase text-gray-400 tracking-wider flex items-center justify-between border-b pb-2 mb-2">
                  <span>Uploaded Documents</span>
                  <span className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-indigo-100/50">
                    {patientFiles.length} files
                  </span>
                </h3>

                {loadingFiles ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    <span className="text-xs text-gray-400 font-extrabold mt-3">Loading documents...</span>
                  </div>
                ) : patientFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-gray-150 dark:border-gray-700/50 rounded-2xl">
                    <FileText className="w-10 h-10 text-gray-300 mb-2" />
                    <span className="text-xs text-gray-400 font-bold">No uploaded files for this patient yet</span>
                    <p className="text-[10px] text-gray-400 mt-1">Use the upload tool on the left to add folders, lab reports, or X-rays.</p>
                  </div>
                ) : (
                  <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-3">
                    {patientFiles.map((file) => (
                      <div key={file.id} className="flex items-center justify-between p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 hover:shadow-md transition divide-x divide-gray-100 dark:divide-gray-700">
                        <div className="flex items-center gap-3 flex-1 pr-4">
                          <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-lg flex items-center justify-center border border-indigo-100/50 dark:border-indigo-900/30">
                            {file.file_type?.includes('pdf') ? (
                              <FileText className="w-5 h-5 text-red-500" />
                            ) : file.file_type?.includes('image') ? (
                              <Eye className="w-5 h-5 text-blue-500" />
                            ) : (
                              <FileText className="w-5 h-5 text-gray-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-black text-gray-900 dark:text-white uppercase truncate" title={file.title}>
                              {file.title || file.file_name}
                            </div>
                            <div className="text-[10px] text-gray-400 font-bold mt-0.5 flex items-center gap-2">
                              <span>{(file.file_size / 1024).toFixed(0)} KB</span>
                              <span>•</span>
                              <span>{file.upload_date ? new Date(file.upload_date).toLocaleDateString() : new Date(file.created_at).toLocaleDateString()}</span>
                            </div>
                            {file.notes && (
                              <p className="text-[10px] text-gray-500 italic mt-1 line-clamp-2 leading-relaxed bg-gray-50 dark:bg-gray-900/40 p-1.5 rounded border border-gray-100/50 dark:border-gray-700/50">
                                {file.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* File Action Controls */}
                        <div className="flex items-center gap-1.5 pl-4 flex-shrink-0">
                          <button
                            onClick={() => window.open(file.file_url, '_blank')}
                            className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition"
                            title="View / Open File"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 rounded-lg transition"
                            title="Download File"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteFile(file)}
                            className="p-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patient Resources Modal */}
      {showResourcesModal && selectedPatientForResources && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  Patient Shared Resources & Temporary Access
                </h2>
                <p className="text-xs text-gray-500 font-bold mt-1">
                  Managing temporary education & documents for: <span className="text-teal-600 dark:text-teal-400 uppercase font-extrabold">{selectedPatientForResources.full_name}</span> ({selectedPatientForResources.patient_number})
                </p>
              </div>
              <button 
                onClick={() => { setShowResourcesModal(false); setSelectedPatientForResources(null); }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-gray-150 dark:border-gray-700 mb-6 gap-2">
              <button
                onClick={() => setResourceModalTab('list')}
                className={`py-2.5 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition ${
                  resourceModalTab === 'list' 
                    ? 'border-teal-500 text-teal-600 dark:text-teal-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Active Shared Resources ({patientResourcesList.length})
              </button>
              <button
                onClick={() => setResourceModalTab('share')}
                className={`py-2.5 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition ${
                  resourceModalTab === 'share' 
                    ? 'border-teal-500 text-teal-600 dark:text-teal-400' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Share New Resource
              </button>
            </div>

            {/* Tab Contents */}
            {resourceModalTab === 'list' ? (
              <div className="space-y-4">
                {resourcesLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
                    <span className="text-xs text-gray-400 font-extrabold mt-3 animate-pulse">Loading patient resources...</span>
                  </div>
                ) : patientResourcesList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-gray-150 dark:border-gray-700/50 rounded-2xl">
                    <Share2 className="w-10 h-10 text-gray-300 mb-2" />
                    <span className="text-xs text-gray-400 font-bold">No resources shared with this patient yet</span>
                    <p className="text-[10px] text-gray-400 mt-1">Click the "Share New Resource" tab to share videos or documents with expiry timers.</p>
                  </div>
                ) : (
                  <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-3">
                    {patientResourcesList.map((res) => {
                      const expired = new Date(res.expires_at) < new Date();
                      return (
                        <div key={res.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-gray-150 dark:border-gray-700 hover:shadow transition gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 bg-teal-50 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 rounded-lg flex items-center justify-center border border-teal-100/50 dark:border-teal-900/30 shrink-0">
                              {res.resource_type === 'video_link' ? (
                                <Video className="w-5 h-5" />
                              ) : res.resource_type === 'pdf_file' ? (
                                <FileText className="w-5 h-5 text-red-500" />
                              ) : (
                                <Link className="w-5 h-5 text-indigo-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-black text-gray-900 dark:text-white uppercase truncate flex items-center gap-2">
                                <span>{res.title}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-extrabold ${
                                  expired 
                                    ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-100/50' 
                                    : 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 border-green-100/50'
                                }`}>
                                  {expired ? 'EXPIRED' : 'ACTIVE'}
                                </span>
                              </div>
                              <p className="text-[10px] text-gray-400 font-bold mt-1 line-clamp-1">{res.url}</p>
                              <div className="text-[9px] text-gray-400 font-medium mt-1 flex flex-wrap gap-2">
                                <span>Shared on: {new Date(res.created_at).toLocaleString()}</span>
                                <span>•</span>
                                <span className={expired ? 'text-red-500 font-bold' : 'text-teal-600 dark:text-teal-400 font-bold'}>
                                  Expires: {new Date(res.expires_at).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Link Actions */}
                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            <button
                              onClick={() => {
                                const link = `${window.location.origin}/shared-resource/${res.id}`;
                                navigator.clipboard.writeText(link);
                                showToast('Secure viewer link copied to clipboard!', 'success');
                              }}
                              className="p-2 bg-white dark:bg-gray-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/20 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                              title="Copy temporary public link"
                            >
                              <Link className="w-3.5 h-3.5" />
                              Copy Link
                            </button>
                            <button
                              onClick={() => handleRevokeResource(res.id)}
                              className="p-2 bg-white dark:bg-gray-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                              title="Revoke and delete access link immediately"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Revoke
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleShareResource} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Resource Title */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Resource Title *</label>
                    <input
                      type="text"
                      value={newResourceForm.title}
                      onChange={(e) => setNewResourceForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Post-Op Knee Recovery Exercises"
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  {/* Resource Type */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Resource Type *</label>
                    <select
                      value={newResourceForm.resource_type}
                      onChange={(e) => setNewResourceForm(prev => ({ ...prev, resource_type: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    >
                      <option value="video_link">🎬 Video Link (YouTube, Vimeo, MP4)</option>
                      <option value="pdf_file">📄 PDF Document URL</option>
                      <option value="other">🔗 Generic Link / Other</option>
                    </select>
                  </div>
                </div>

                {/* Source Selection Toggle */}
                <div className="flex flex-col gap-1.5">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase">Resource Source *</label>
                  <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 flex gap-1 w-max">
                    <button
                      type="button"
                      onClick={() => setResourceSourceType('link')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1 ${
                        resourceSourceType === 'link'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-750 dark:hover:text-white'
                      }`}
                    >
                      <Link className="w-3 h-3" />
                      <span>Paste Link</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setResourceSourceType('upload')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1 ${
                        resourceSourceType === 'upload'
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-750 dark:hover:text-white'
                      }`}
                    >
                      <Upload className="w-3 h-3" />
                      <span>Upload File</span>
                    </button>
                  </div>
                </div>

                {resourceSourceType === 'link' ? (
                  /* Resource URL */
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Resource URL (Video Link / PDF URL) *</label>
                    <input
                      type="url"
                      value={newResourceForm.url}
                      onChange={(e) => setNewResourceForm(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="e.g. https://www.youtube.com/watch?v=..."
                      required={resourceSourceType === 'link'}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none font-mono"
                    />
                    <p className="text-[9px] text-gray-400 font-bold mt-1">
                      YouTube links, Vimeo links, and raw file URLs will embed interactively in the patient portal.
                    </p>
                  </div>
                ) : (
                  /* File Upload Selector */
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Select File (PDF, Video, or Image) *</label>
                    <div className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-teal-500 dark:hover:border-teal-400 rounded-xl p-6 transition text-center cursor-pointer bg-white dark:bg-gray-800/40">
                      <input
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setResourceUploadFile(file);
                          if (file) {
                            // Pre-fill Title with file name (without extension) if title is empty
                            if (!newResourceForm.title) {
                              const cleanName = file.name.split('.').slice(0, -1).join('.');
                              setNewResourceForm(prev => ({ ...prev, title: cleanName }));
                            }
                            // Dynamically determine resource_type based on mime type
                            let rType = 'other';
                            if (file.type.startsWith('video/')) {
                              rType = 'video_link';
                            } else if (file.type === 'application/pdf') {
                              rType = 'pdf_file';
                            }
                            setNewResourceForm(prev => ({ ...prev, resource_type: rType }));
                          }
                        }}
                        accept="application/pdf, video/*, image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        required={resourceSourceType === 'upload'}
                      />
                      <div className="flex flex-col items-center gap-2">
                        <Upload className={`w-8 h-8 ${resourceUploadFile ? 'text-teal-500' : 'text-gray-400'}`} />
                        {resourceUploadFile ? (
                          <div>
                            <p className="text-xs font-black text-teal-600 dark:text-teal-400">{resourceUploadFile.name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{(resourceUploadFile.size / (1024 * 1024)).toFixed(2)} MB • Mime: {resourceUploadFile.type}</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Drag & Drop or Click to browse</p>
                            <p className="text-[10px] text-gray-400 mt-1">Supports PDF guides, patient instruction sheets, MP4/clinical videos, or images</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Clinical Instructions / Notes</label>
                  <textarea
                    value={newResourceForm.description}
                    onChange={(e) => setNewResourceForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Instructions or guidelines regarding how the patient should utilize this shared file..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>

                {/* Expiry Settings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl border border-gray-150 dark:border-gray-700/50">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Access Expiry Period *</label>
                    <select
                      value={newResourceForm.expiry_hours}
                      onChange={(e) => setNewResourceForm(prev => ({ ...prev, expiry_hours: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none font-bold"
                    >
                      <option value="1">⏱️ 1 Hour</option>
                      <option value="6">⏱️ 6 Hours</option>
                      <option value="24">⏱️ 24 Hours (1 Day)</option>
                      <option value="72">⏱️ 72 Hours (3 Days)</option>
                      <option value="168">⏱️ 168 Hours (7 Days)</option>
                      <option value="custom">📅 Custom Expiry Date/Time</option>
                    </select>
                  </div>

                  {newResourceForm.expiry_hours === 'custom' && (
                    <>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Custom Expiry Date *</label>
                        <input
                          type="date"
                          value={newResourceForm.custom_expiry_date}
                          onChange={(e) => setNewResourceForm(prev => ({ ...prev, custom_expiry_date: e.target.value }))}
                          required
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Custom Expiry Time *</label>
                        <input
                          type="time"
                          value={newResourceForm.custom_expiry_time}
                          onChange={(e) => setNewResourceForm(prev => ({ ...prev, custom_expiry_time: e.target.value }))}
                          required
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => setShowResourcesModal(false)}
                    className="py-2.5 px-6 border border-gray-350 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-black uppercase hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resourcesLoading}
                    className="py-2.5 px-8 bg-teal-600 text-white rounded-xl text-xs font-black uppercase hover:bg-teal-700 transition shadow-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    {resourcesLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        <span>Sharing...</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-4 h-4" />
                        <span>Share & Dispatch Email</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Patient Payment History Modal */}
      {showHistoryModal && selectedPatientForHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-amber-500" />
                  Patient Payment Ledger & History
                </h2>
                <p className="text-xs text-gray-500 font-bold mt-1">
                  Viewing ledger for: <span className="text-amber-500 uppercase font-extrabold">{selectedPatientForHistory.full_name}</span> ({selectedPatientForHistory.patient_number})
                </p>
              </div>
              <button 
                onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            </div>

            {/* Toolbar Filters & Exports */}
            <div className="bg-gray-50/50 dark:bg-gray-900/20 border border-gray-100 dark:border-gray-700 p-3 rounded-xl flex flex-col md:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search invoice number, payment method..." 
                  value={historySearch}
                  onChange={e => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" 
                />
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleExportHistory('excel', paymentHistory.filter(p => !historySearch || p.bill_number?.toLowerCase().includes(historySearch.toLowerCase()) || p.payment_method?.toLowerCase().includes(historySearch.toLowerCase()) || p.target_portion?.toLowerCase().includes(historySearch.toLowerCase())))} 
                  disabled={paymentHistory.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-100 transition border border-green-200 dark:border-green-800/50 disabled:opacity-40"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button 
                  onClick={() => handleExportHistory('pdf', paymentHistory.filter(p => !historySearch || p.bill_number?.toLowerCase().includes(historySearch.toLowerCase()) || p.payment_method?.toLowerCase().includes(historySearch.toLowerCase()) || p.target_portion?.toLowerCase().includes(historySearch.toLowerCase())))} 
                  disabled={paymentHistory.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition border border-red-200 dark:border-red-800/50 disabled:opacity-40"
                >
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            </div>

            {/* Payment List Table */}
            <div className="flex-1 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-850">
              {historyLoading ? (
                <div className="py-20 flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fetching records...</p>
                </div>
              ) : paymentHistory.length === 0 ? (
                <div className="py-20 text-center flex flex-col items-center justify-center">
                  <CreditCard className="w-10 h-10 text-gray-300 mb-2" />
                  <p className="text-xs font-bold text-gray-400">No payment records found for this patient</p>
                </div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 border-b dark:border-gray-700">
                    <tr className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                      <th className="px-6 py-3">Invoice #</th>
                      <th className="px-4 py-3">Payment Date</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Portion</th>
                      <th className="px-6 py-3 text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {paymentHistory
                      .filter(p => !historySearch || p.bill_number?.toLowerCase().includes(historySearch.toLowerCase()) || p.payment_method?.toLowerCase().includes(historySearch.toLowerCase()) || p.target_portion?.toLowerCase().includes(historySearch.toLowerCase()) || p.notes?.toLowerCase().includes(historySearch.toLowerCase()))
                      .map(p => (
                      <tr key={p.id} className="hover:bg-gray-100 dark:hover:bg-gray-950/20 transition">
                        <td className="px-6 py-4 font-bold text-gray-700 dark:text-gray-300 font-mono">
                          {p.bill_number ? `#${p.bill_number}` : '—'}
                        </td>
                        <td className="px-4 py-4 text-gray-500 dark:text-gray-400 font-medium">
                          {new Date(p.payment_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-[9px] font-black uppercase tracking-wider">
                            {p.payment_method?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${p.target_portion === 'medical_aid' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20 dark:text-indigo-400' : 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400'}`}>
                            {p.target_portion === 'medical_aid' ? 'Medical Aid' : 'Patient'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-black text-gray-950 dark:text-white text-sm">
                          ${p.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button 
                onClick={() => { setShowHistoryModal(false); setSelectedPatientForHistory(null); }} 
                className="px-8 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-xs font-black uppercase hover:scale-105 active:scale-95 transition shadow-lg"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-gray-100 dark:border-gray-700 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-4 mb-6">
              <div>
                <h2 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <Upload className="w-5 h-5 text-amber-500" />
                  Import Patients Directory (Excel / CSV)
                </h2>
                <p className="text-xs text-gray-500 font-bold mt-1">
                  Upload bulk patient records directly into the clinical directory
                </p>
              </div>
              <button 
                onClick={() => { setShowImportModal(false); setImportFile(null); setImportLogs([]); setParsedPatients(null); }}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
              </button>
            </div>

            {/* Split layout: Upload box & Instructions / Template */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {/* Instructions column */}
              <div className="md:col-span-1 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-100 dark:border-gray-700 space-y-4">
                <div>
                  <h4 className="text-xs font-black uppercase text-gray-700 dark:text-gray-300 tracking-wider">Required Fields</h4>
                  <ul className="text-[11px] text-gray-500 font-bold mt-1 space-y-1.5 list-disc list-inside">
                    <li><span className="text-gray-700 dark:text-gray-300">Full Name</span></li>
                    <li><span className="text-gray-700 dark:text-gray-300">Gender</span> (Male, Female, Other)</li>
                    <li><span className="text-gray-700 dark:text-gray-300">Date of Birth</span> (YYYY-MM-DD)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase text-gray-700 dark:text-gray-300 tracking-wider">Optional Fields</h4>
                  <ul className="text-[11px] text-gray-400 font-bold mt-1 space-y-1 list-disc list-inside">
                    <li>Title</li>
                    <li>Phone</li>
                    <li>Email</li>
                    <li>Address</li>
                    <li>File Number</li>
                    <li>Payment Method</li>
                    <li>Medical Aid Number</li>
                    <li>Medical Aid Main Member</li>
                    <li>Allergies</li>
                    <li>Chronic Conditions</li>
                  </ul>
                </div>
                <div className="pt-2 border-t dark:border-gray-800">
                  <p className="text-[10px] text-gray-400 font-bold mb-3 leading-relaxed">
                    Always use the standardized Excel template to prevent mapping errors.
                  </p>
                  <button 
                    onClick={downloadSampleExcel}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 rounded-xl text-xs font-black uppercase tracking-wider border border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-100 transition shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" /> Template
                  </button>
                </div>
              </div>

              {/* Upload Drag Drop Area */}
              <div className="md:col-span-2 flex flex-col justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center bg-gray-50/20 dark:bg-gray-900/10 hover:bg-gray-50 dark:hover:bg-gray-900/20 transition relative">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleImportFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={importing}
                />
                <div className="flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center text-amber-500 mb-3 border border-amber-100 dark:border-amber-900/40">
                    <FileSpreadsheet className="w-6 h-6 animate-pulse" />
                  </div>
                  <h4 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase tracking-tight">
                    {importFile ? importFile.name : 'Select Bulk Excel / CSV File'}
                  </h4>
                  <p className="text-xs text-gray-400 font-bold mt-1.5">
                    {importFile ? `(${(importFile.size / 1024).toFixed(1)} KB) - Click or drag to change` : 'Drag and drop your spreadsheet here or click to browse'}
                  </p>
                </div>
              </div>
            </div>

            {/* Parsing Logs & Preview Split Panel */}
            <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-4">
              
              {/* Parsing Logs Panel */}
              <div className="w-full md:w-1/3 flex flex-col border border-gray-100 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/40 min-h-[150px]">
                <div className="px-4 py-2 border-b dark:border-gray-850 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Process & Validation Logs</span>
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] text-gray-600 dark:text-gray-400 space-y-1.5">
                  {importLogs.length === 0 ? (
                    <div className="text-gray-400 italic">No logs generated. Please choose a spreadsheet.</div>
                  ) : (
                    importLogs.map((log, index) => {
                      const isError = log.startsWith('Error') || log.includes('Invalid') || log.includes('failed');
                      const isSuccess = log.startsWith('🎉') || log.includes('Successfully') || log.includes('Saved');
                      return (
                        <div key={index} className={`leading-relaxed border-l-2 pl-2 ${isError ? 'text-red-500 border-red-500' : isSuccess ? 'text-green-600 dark:text-green-400 border-green-500' : 'text-gray-500 border-gray-400'}`}>
                          {log}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Parsed Patients Preview Panel */}
              <div className="w-full md:w-2/3 flex flex-col border border-gray-100 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-850 overflow-hidden min-h-[200px]">
                <div className="px-4 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider">Parsed Patient Preview</span>
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-0.5 rounded-full">
                    {parsedPatients ? `${parsedPatients.length} Rows` : '0 Rows'}
                  </span>
                </div>
                <div className="flex-1 overflow-auto">
                  {!parsedPatients || parsedPatients.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                      <Users className="w-8 h-8 mb-2" />
                      <p className="text-xs font-bold">No preview data. Upload a valid template to start parsing.</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-gray-50 dark:bg-gray-900/50 sticky top-0 border-b dark:border-gray-700">
                        <tr className="text-[9px] font-black uppercase text-gray-400 tracking-wider">
                          <th className="px-4 py-2.5">Name</th>
                          <th className="px-3 py-2.5">Gender</th>
                          <th className="px-3 py-2.5">Date of Birth</th>
                          <th className="px-3 py-2.5">Phone</th>
                          <th className="px-4 py-2.5">Method</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y dark:divide-gray-700">
                        {parsedPatients.slice(0, 100).map((p, index) => (
                          <tr key={index} className="hover:bg-gray-100 dark:hover:bg-gray-950/20 transition">
                            <td className="px-4 py-2 font-bold text-gray-800 dark:text-gray-200">
                              {p.title ? `${p.title} ` : ''}{p.full_name}
                            </td>
                            <td className="px-3 py-2 uppercase font-bold text-gray-500">{p.gender}</td>
                            <td className="px-3 py-2 font-mono text-gray-500">{p.date_of_birth}</td>
                            <td className="px-3 py-2 font-mono text-gray-500">{p.phone || '—'}</td>
                            <td className="px-4 py-2 font-semibold capitalize text-amber-600 dark:text-amber-400">{p.payment_method}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {parsedPatients && parsedPatients.length > 100 && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 p-2 text-center text-[10px] text-gray-400 font-bold border-t dark:border-gray-700">
                    Showing first 100 records for performance preview. All {parsedPatients.length} records will be imported.
                  </div>
                )}
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
              <button 
                onClick={() => { setShowImportModal(false); setImportFile(null); setImportLogs([]); setParsedPatients(null); }}
                className="px-6 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-xs font-black uppercase transition hover:bg-gray-200 dark:hover:bg-gray-600"
                disabled={importing}
              >
                Close
              </button>
              <button 
                onClick={handleExecuteImport}
                disabled={!parsedPatients || parsedPatients.length === 0 || importing}
                className="px-8 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-black uppercase hover:bg-amber-700 hover:scale-105 active:scale-95 transition shadow-lg disabled:opacity-40 disabled:scale-100"
              >
                {importing ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                    Executing Import...
                  </span>
                ) : 'Confirm & Execute Import'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
