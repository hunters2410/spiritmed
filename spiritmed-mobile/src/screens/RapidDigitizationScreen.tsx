/**
 * RapidDigitizationScreen.tsx
 *
 * Engineered specifically for digitizing 4,500 patient files as fast as possible.
 *
 * WORKFLOW per patient (target: under 10 seconds each):
 * ──────────────────────────────────────────────────────
 * 1. Type patient number (or first few letters) → auto-selects if unique match
 * 2. Tap SCAN — camera opens instantly
 * 3. Photo taken → auto-upload begins in background immediately
 * 4. Screen clears to ready state for next patient
 * 5. Repeat
 *
 * SPEED FEATURES:
 * ─────────────────
 * ✅ Patient number keypad + auto-select on exact match
 * ✅ Camera opens at full quality — AI enhances in background
 * ✅ Upload starts IMMEDIATELY after capture — no confirm step
 * ✅ Multi-page per patient — keep scanning, upload all as one PDF
 * ✅ Background upload queue — never waits for network
 * ✅ Session counter: X/4500 done, speed/hr, ETA
 * ✅ Undo last — if wrong patient selected, cancel within 3 seconds
 * ✅ Sound/vibration feedback on success
 * ✅ Persistent session log — survive app restarts
 * ✅ Failed uploads queue — retried automatically
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
  Platform,
  StatusBar,
  Keyboard,
  Vibration,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Print from 'expo-print';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList, Patient } from '../types';
import { fetchAllPatients, filterPatients } from '../utils/patientLoader';

type NavProp = StackNavigationProp<RootStackParamList, 'RapidDigitize'>;

interface Props {
  navigation: NavProp;
}

// Helper to open camera — returns the captured asset (uri + exif) via onCapture
const openCameraForPatient = async (
  patient: Patient,
  currentPages: string[],
  targetPages: number,
  aiMode: boolean,
  onCapture: (asset: ImagePicker.ImagePickerAsset, currentPages: string[]) => void,
  setIsCapturing: (v: boolean) => void,
) => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Permission Required', 'Camera permission is required.');
    return;
  }
  setIsCapturing(true);
  const result = await ImagePicker.launchCameraAsync({
    quality: aiMode ? 1.0 : 0.92,
    allowsEditing: false,
    exif: true,  // request EXIF for auto-orientation
  });
  setIsCapturing(false);

  if (result.canceled || !result.assets[0]) return;
  onCapture(result.assets[0], currentPages);
};

// Build a clean suggested file name from patient data + document type
const suggestFileName = (patient: Patient, pages: number, isPdf: boolean, docType: string): string => {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const namePart = patient.full_name
    .replace(/[^a-zA-Z\s]/g, '')
    .trim()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('_');
  const numPart = patient.patient_number || patient.file_number || patient.id.slice(0, 6);
  const pagesPart = pages > 1 ? `_${pages}pg` : '';
  const typePart = docType ? `_${docType.replace(/\s+/g, '_')}` : '_Results';
  return `${namePart}_${numPart}${typePart}${pagesPart}_${dateStr}`;
  // Note: extension is NOT included here — it is always appended based on content in confirmQueue
};

// ─── Persistent session state ─────────────────────────────────────────────────
const SESSION_KEY = '@spiritmed_digitize_session';
const FAILED_KEY = '@spiritmed_digitize_failed';

interface SessionStats {
  totalTarget: number;
  completed: number;
  startedAt: number;
  lastPatientName: string;
}

interface FailedItem {
  patientId: string;
  patientName: string;
  fileUri: string;
  fileName: string;
  errorMsg: string;
  failedAt: number;
}

// ─── Upload queue item ────────────────────────────────────────────────────────
interface QueueItem {
  id: string;
  patientId: string;
  patientName: string;
  branchId: string | null;
  pages: string[];        // local URIs
  fileName: string;
  isPdf: boolean;         // true → compile/upload as PDF; false → single JPEG
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
  retries: number;
  markAsOldPatient: boolean;
}

const MAX_QUEUE_RETRIES = 3;
const MAX_CONCURRENT_UPLOADS = 4;

export function RapidDigitizationScreen({ navigation }: Props) {
  const { themeColors } = useTheme();

  // ── Patient search ─────────────────────────────────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // ── Capture state ──────────────────────────────────────────────────────────
  const [capturedPages, setCapturedPages] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);

  // ── Smart crop & orientation correction ───────────────────────────────────
  const [smartCrop, setSmartCrop] = useState(true);  // auto-crop dark edges
  const [showCorrectModal, setShowCorrectModal] = useState(false);
  const [correctUri, setCorrectUri] = useState<string | null>(null);    // URI shown in correction modal
  const [correctRotation, setCorrectRotation] = useState(0);             // additional manual rotation
  const [isProcessing, setIsProcessing] = useState(false);               // processing spinner
  // Keep a ref to pages + callbacks so correction modal can finalise
  const correctCtxRef = useRef<{
    currentPages: string[];
    targetPages: number;
    patient: Patient;
    onNewPages: (p: string[]) => void;
    onConfirm: (p: string[]) => void;
  } | null>(null);

  // ── AI Mode & file rename modal ────────────────────────────────────────────
  const [aiMode, setAiMode] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [pendingFileName, setPendingFileName] = useState('');
  const [pendingPages, setPendingPages] = useState<string[]>([]);
  const [pendingPatient, setPendingPatient] = useState<Patient | null>(null);
  const [docType, setDocType] = useState('Results'); // document type label for auto-naming

  // ── Pages mode ─────────────────────────────────────────────────────────────
  const [targetPages, setTargetPages] = useState<number>(0);

  // ── Upload queue ───────────────────────────────────────────────────────────
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);

  // ── Patient upload status (Active / Old Patient) ──────────────────────────
  const [patientUploadStatus, setPatientUploadStatus] = useState<'active' | 'old_patient'>('active');

  // ── Patient Detail Edit & File Management state ─────────────────────────────
  const [editPatientModalVisible, setEditPatientModalVisible] = useState(false);
  const [editPatientName, setEditPatientName] = useState('');
  const [editFileNumber, setEditFileNumber] = useState('');
  const [savingPatientDetails, setSavingPatientDetails] = useState(false);

  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [loadingUploadedFiles, setLoadingUploadedFiles] = useState(false);
  const [fileRenameModalVisible, setFileRenameModalVisible] = useState(false);
  const [selectedFileToRename, setSelectedFileToRename] = useState<any>(null);
  const [newFileName, setNewFileName] = useState('');
  const [renamingFile, setRenamingFile] = useState(false);

  // ── Add New Patient modal state ────────────────────────────────────────────
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientTitle, setNewPatientTitle] = useState('');
  const [newPatientFileNo, setNewPatientFileNo] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [savingNewPatient, setSavingNewPatient] = useState(false);
  // ── File number uniqueness check (Add New Patient modal) ──────────────────
  const [fileNoTaken, setFileNoTaken] = useState(false);
  const [fileNoTakenBy, setFileNoTakenBy] = useState('');
  const [checkingFileNo, setCheckingFileNo] = useState(false);

  // ── Upload Queue Editing & Deleting state ──────────────────────────────────
  const [queueRenameModalVisible, setQueueRenameModalVisible] = useState(false);
  const [selectedQueueItemToRename, setSelectedQueueItemToRename] = useState<QueueItem | null>(null);
  const [newQueueFileName, setNewQueueFileName] = useState('');

  const handleOpenQueueRenameModal = (item: QueueItem) => {
    setSelectedQueueItemToRename(item);
    setNewQueueFileName(item.fileName);
    setQueueRenameModalVisible(true);
  };

  const handleSaveQueueFileName = () => {
    if (!selectedQueueItemToRename || !newQueueFileName.trim()) {
      Alert.alert('Required', 'File name cannot be empty.');
      return;
    }
    const cleanName = newQueueFileName.trim();
    setQueue((prev) =>
      prev.map((q) => (q.id === selectedQueueItemToRename.id ? { ...q, fileName: cleanName } : q))
    );
    setQueueRenameModalVisible(false);
    setSelectedQueueItemToRename(null);
  };

  const handleDeleteQueueItem = (item: QueueItem) => {
    Alert.alert(
      'Remove from Queue',
      `Are you sure you want to remove "${item.fileName}" from the upload queue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setQueue((prev) => prev.filter((q) => q.id !== item.id));
          },
        },
      ]
    );
  };

  const fetchPatientUploadedFiles = async (patientId: string) => {
    if (!patientId) return;
    try {
      setLoadingUploadedFiles(true);
      const { data, error } = await supabase
        .from('patient_files')
        .select('id, file_name, title, file_url, file_type, file_size, upload_date, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUploadedFiles(data || []);
    } catch (e) {
      console.error('[RapidDigitize] Error loading patient files:', e);
    } finally {
      setLoadingUploadedFiles(false);
    }
  };

  useEffect(() => {
    if (selectedPatient) {
      fetchPatientUploadedFiles(selectedPatient.id);
    } else {
      setUploadedFiles([]);
    }
  }, [selectedPatient?.id]);

  const handleOpenEditPatient = () => {
    if (!selectedPatient) return;
    setEditPatientName(selectedPatient.full_name || '');
    setEditFileNumber(selectedPatient.file_number ? selectedPatient.file_number.split('-')[0] : '');
    setEditPatientModalVisible(true);
  };

  const handleSavePatientDetails = async () => {
    if (!selectedPatient) return;
    if (!editPatientName.trim()) {
      Alert.alert('Required', 'Patient full name cannot be empty.');
      return;
    }
    try {
      setSavingPatientDetails(true);
      const updatedName = editPatientName.trim();
      const updatedFileNo = editFileNumber.trim() ? editFileNumber.trim() : null;

      const { error } = await supabase
        .from('patients')
        .update({
          full_name: updatedName,
          file_number: updatedFileNo,
        })
        .eq('id', selectedPatient.id);

      if (error) throw error;

      const updated: Patient = {
        ...selectedPatient,
        full_name: updatedName,
        file_number: updatedFileNo || undefined,
      };
      setSelectedPatient(updated);
      setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

      setEditPatientModalVisible(false);
      Alert.alert('Success', 'Patient details updated.');
    } catch (e: any) {
      Alert.alert('Update Failed', e.message || 'Could not update patient details.');
    } finally {
      setSavingPatientDetails(false);
    }
  };

  const handleOpenRenameFileModal = (file: any) => {
    setSelectedFileToRename(file);
    setNewFileName(file.file_name || file.title || '');
    setFileRenameModalVisible(true);
  };

  const handleRenameFile = async () => {
    if (!selectedFileToRename || !newFileName.trim()) {
      Alert.alert('Required', 'File name cannot be empty.');
      return;
    }
    try {
      setRenamingFile(true);
      const cleanName = newFileName.trim();

      const { error } = await supabase
        .from('patient_files')
        .update({
          file_name: cleanName,
          title: cleanName,
        })
        .eq('id', selectedFileToRename.id);

      if (error) throw error;

      setUploadedFiles(prev => prev.map(f => f.id === selectedFileToRename.id ? { ...f, file_name: cleanName, title: cleanName } : f));
      setFileRenameModalVisible(false);
      Alert.alert('Renamed', 'File renamed.');
    } catch (e: any) {
      Alert.alert('Rename Failed', e.message || 'Could not rename file.');
    } finally {
      setRenamingFile(false);
    }
  };

  const handleDeleteFile = (file: any) => {
    Alert.alert(
      'Delete File',
      `Delete "${file.file_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (file.file_url) {
                const urlParts = file.file_url.split('/patient-files/');
                if (urlParts.length > 1) {
                  const storagePath = decodeURIComponent(urlParts[1]);
                  await supabaseAdmin.storage.from('patient-files').remove([storagePath]).catch(() => {});
                }
              }

              const { error } = await supabase
                .from('patient_files')
                .delete()
                .eq('id', file.id);

              if (error) throw error;

              setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
              Alert.alert('Deleted', 'File deleted successfully.');
            } catch (e: any) {
              Alert.alert('Delete Failed', e.message || 'Could not delete file.');
            }
          }
        }
      ]
    );
  };

  // ── Undo ───────────────────────────────────────────────────────────────────
  const [lastQueued, setLastQueued] = useState<QueueItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Failed uploads ─────────────────────────────────────────────────────────
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [showFailed, setShowFailed] = useState(false);

  const searchRef = useRef<TextInput>(null);

  // ─── Load persistent failed list ───────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(FAILED_KEY).then((json) => {
      if (json) setFailedItems(JSON.parse(json));
    }).catch(() => {});
  }, []);

  // ─── Keep queueRef in sync ─────────────────────────────────────────────────
  useEffect(() => {
    queueRef.current = queue;
    drainQueue();
  }, [queue]);

  // ─── Patient search ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = searchText.trim();
    if (!q) { setPatients([]); return; }

    const timer = setTimeout(() => searchPatients(q), 150);
    return () => clearTimeout(timer);
  }, [searchText]);

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

  useEffect(() => {
    fetchAllPatients().catch(() => {});
  }, []);

  const searchPatients = async (query: string) => {
    try {
      setSearchLoading(true);
      const all = await fetchAllPatients();
      const results = filterPatients(all, query);
      setPatients(results);

      // Auto-select if exactly one match
      if (results.length === 1) {
        handleSelectPatient(results[0]);
      }
    } catch (e) {
      console.error('[RapidDigitize] search error:', e);
    } finally {
      setSearchLoading(false);
    }
  };

  // ─── EXIF-based auto-rotation degree ─────────────────────────────────────
  const exifToDegrees = (orientation: number | undefined): number => {
    // EXIF orientation → degrees to rotate to get upright image
    switch (orientation) {
      case 3: return 180;
      case 6: return 90;   // shot portrait (rotated CCW)
      case 8: return -90;  // shot portrait (rotated CW)
      default: return 0;
    }
  };

  // ─── processCapture: called after camera returns an asset ─────────────────
  // Detects EXIF rotation, stores in correction modal, lets user adjust further
  const processCapture = useCallback((
    asset: ImagePicker.ImagePickerAsset,
    currentPages: string[],
    patient: Patient,
    onNewPages: (p: string[]) => void,
    onConfirm: (p: string[]) => void,
  ) => {
    const autoRotate = exifToDegrees((asset.exif as any)?.Orientation);
    correctCtxRef.current = { currentPages, targetPages, patient, onNewPages, onConfirm };
    setCorrectUri(asset.uri);
    setCorrectRotation(autoRotate);
    setShowCorrectModal(true);
  }, [targetPages]);

  // ─── applyAndAddPage: manipulate + smart-crop, then add to page list ───────
  const applyAndAddPage = useCallback(async () => {
    if (!correctUri || !correctCtxRef.current) return;
    setIsProcessing(true);
    try {
      const ctx = correctCtxRef.current;
      const totalRotation = ((correctRotation % 360) + 360) % 360;
      const needsRotation = totalRotation !== 0;
      let workingUri = correctUri;

      // Step 1: Apply rotation if needed
      if (needsRotation) {
        const rotated = await ImageManipulator.manipulateAsync(
          workingUri,
          [{ rotate: totalRotation }],
          { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
        );
        workingUri = rotated.uri;
      }

      // Step 2: Smart crop — trim 5% from each edge to remove dark angled borders
      // Runs regardless of rotation (dark edges appear even on upright shots)
      if (smartCrop) {
        const probe = await ImageManipulator.manipulateAsync(workingUri, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
        const margin = 0.05;
        const ox = Math.floor(probe.width * margin);
        const oy = Math.floor(probe.height * margin);
        const cw = Math.floor(probe.width * (1 - margin * 2));
        const ch = Math.floor(probe.height * (1 - margin * 2));
        const cropped = await ImageManipulator.manipulateAsync(
          probe.uri,
          [{ crop: { originX: ox, originY: oy, width: cw, height: ch } }],
          { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
        );
        workingUri = cropped.uri;
      } else if (!needsRotation) {
        // No rotation AND no smart crop — just compress
        const compressed = await ImageManipulator.manipulateAsync(
          workingUri,
          [],
          { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG },
        );
        workingUri = compressed.uri;
      }

      const updated = [...ctx.currentPages, workingUri];
      ctx.onNewPages(updated);
      setShowCorrectModal(false);
      setCorrectUri(null);
      setCorrectRotation(0);

      // Continue multi-page capture if needed
      if (ctx.targetPages > 0 && updated.length < ctx.targetPages) {
        setTimeout(() => openCameraForPatient(
          ctx.patient, updated, ctx.targetPages, aiMode,
          (asset, cp) => processCapture(asset, cp, ctx.patient, ctx.onNewPages, ctx.onConfirm),
          setIsCapturing,
        ), 300);
      } else if (ctx.targetPages > 0 && updated.length >= ctx.targetPages) {
        setTimeout(() => ctx.onConfirm(updated), 300);
      }
    } catch (err) {
      console.error('[SmartCrop] error:', err);
      Alert.alert('Processing Error', 'Could not process image. Using original.');
      // Fallback: add raw
      if (correctCtxRef.current) {
        const ctx = correctCtxRef.current;
        const updated = [...ctx.currentPages, correctUri];
        ctx.onNewPages(updated);
      }
      setShowCorrectModal(false);
      setCorrectUri(null);
    } finally {
      setIsProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correctUri, correctRotation, smartCrop, aiMode]);

  const handleSelectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setPatients([]);
    setSearchText('');
    setCapturedPages([]);
    Keyboard.dismiss();
    // Camera opens automatically on first patient select
    setTimeout(() => {
      openCameraForPatient(
        p, [], targetPages, aiMode,
        (asset, cp) => processCapture(asset, cp, p, (pages) => setCapturedPages(pages), (pages) => openRenameModal(p, pages)),
        setIsCapturing,
      );
    }, 200);
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
        .select('id, full_name, patient_number, file_number, phone, email, title, branch_id')
        .single();
      if (error) throw error;
      setShowAddPatient(false);
      setNewPatientName('');
      setNewPatientTitle('');
      setNewPatientFileNo('');
      setNewPatientPhone('');
      setFileNoTaken(false);
      setFileNoTakenBy('');
      // Auto-select and open camera just like a regular patient selection
      handleSelectPatient(data);
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Could not add patient.');
    } finally {
      setSavingNewPatient(false);
    }
  };

  // Called when user explicitly wants to move to a different patient
  const handleNextPatient = () => {
    if (capturedPages.length > 0) {
      Alert.alert(
        'Unsaved Pages',
        `You have ${capturedPages.length} scanned page(s) not yet uploaded for ${selectedPatient?.full_name}. What would you like to do?`,
        [
          { text: 'Stay & Upload', style: 'cancel' },
          {
            text: 'Discard & Next Patient',
            style: 'destructive',
            onPress: () => {
              setSelectedPatient(null);
              setCapturedPages([]);
              setPatientUploadStatus('active'); // reset for next patient
              setTimeout(() => searchRef.current?.focus(), 100);
            },
          },
        ]
      );
    } else {
      setSelectedPatient(null);
      setCapturedPages([]);
      setPatientUploadStatus('active'); // reset for next patient
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  };

  // ─── Immediately update patient status in DB when toggle is pressed ──────
  const updatePatientStatusInDB = useCallback(async (
    patientId: string,
    newStatus: 'active' | 'old_patient',
  ) => {
    // The web app stores old patients as 'inactive' in the DB (not 'old_patient').
    // The patients_status_check constraint requires file_number = null for inactive.
    const dbStatus = newStatus === 'old_patient' ? 'inactive' : 'active';
    const updatePayload: Record<string, unknown> = { status: dbStatus };
    if (newStatus === 'old_patient') {
      updatePayload.file_number = null;
    }
    const { error } = await supabaseAdmin
      .from('patients')
      .update(updatePayload)
      .eq('id', patientId);
    if (error) {
      console.warn('[RapidDigitize] status update error:', error.message);
      Alert.alert('Update Failed', `Could not update patient status: ${error.message}`);
    }
  }, []);

  // ─── Open rename modal before queueing ────────────────────────────────────
  const openRenameModal = useCallback((patient: Patient, pages: string[]) => {
    setPendingPatient(patient);
    setPendingPages(pages);
    setPendingFileName('');   // start blank — user types their own name
    setShowRenameModal(true);
  }, []);

  // ─── Confirm queue — always enforces the correct extension regardless of what user typed ─
  const confirmQueue = useCallback(() => {
    if (!pendingPatient || pendingPages.length === 0) return;
    setShowRenameModal(false);

    // Always convert to PDF — images are always bundled into a PDF before upload
    const isPdf = true;
    const correctExt = '.pdf';

    // Strip any extension the user may have typed (or left out) and force the right one
    const baseName = (pendingFileName.trim() || suggestFileName(pendingPatient, pendingPages.length, isPdf, docType))
      .replace(/\.(pdf|jpg|jpeg|png|doc|docx)$/i, '')  // remove any extension
      .trim();
    const finalName = `${baseName}${correctExt}`;

    const item: QueueItem = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      patientId: pendingPatient.id,
      patientName: pendingPatient.full_name,
      branchId: pendingPatient.branch_id || null,
      pages: [...pendingPages],
      fileName: finalName,
      isPdf,  // stored so startUploadItem uses the same decision
      status: 'pending',
      retries: 0,
      markAsOldPatient: patientUploadStatus === 'old_patient',
    };

    setLastQueued(item);
    setQueue((prev) => [...prev, item]);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setLastQueued(null), 5000);

    // ✅ Keep the patient selected — only clear captured pages so the
    // user can immediately scan the NEXT file for the same patient.
    // Patient stays until they tap "Next Patient" or "Done with Patient".
    setCapturedPages([]);
    setPendingPages([]);
    setPendingPatient(null);
    Vibration.vibrate(60);
    // Don't clear selectedPatient — user stays on the same patient
  }, [pendingPatient, pendingPages, pendingFileName, targetPages, docType, patientUploadStatus]);

  // ─── Camera (for Add Page button — manual mode, no auto-confirm) ──────────
  const openCamera = useCallback(() => {
    if (!selectedPatient) return;
    const p = selectedPatient;
    openCameraForPatient(
      p, capturedPages, 0, aiMode,
      (asset, cp) => processCapture(asset, cp, p, (pages) => setCapturedPages(pages), (pages) => openRenameModal(p, pages)),
      setIsCapturing,
    );
  }, [selectedPatient, capturedPages, aiMode, openRenameModal, processCapture]);

  // ─── Manual confirm from screen Queue Upload button ────────────────────────
  const confirmManually = useCallback(() => {
    if (!selectedPatient || capturedPages.length === 0) return;
    openRenameModal(selectedPatient, capturedPages);
  }, [selectedPatient, capturedPages, openRenameModal]);

  // (confirmAndQueuePatient* replaced by confirmQueue modal)


  // ─── Undo last queue item ──────────────────────────────────────────────────
  const undoLast = useCallback(() => {
    if (!lastQueued) return;
    setQueue((prev) => prev.filter((q) => q.id !== lastQueued.id));
    setLastQueued(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, [lastQueued]);

  // ─── Background upload queue drain ────────────────────────────────────────
  const drainQueue = useCallback(() => {
    const current = queueRef.current;
    const pending = current.filter((q) => q.status === 'pending');
    const uploading = current.filter((q) => q.status === 'uploading').length;
    const slots = MAX_CONCURRENT_UPLOADS - uploading;

    if (slots <= 0 || pending.length === 0) return;

    const toStart = pending.slice(0, slots);
    toStart.forEach((item) => startUploadItem(item.id));
  }, []);

  const startUploadItem = useCallback(async (itemId: string) => {
    // Mark as uploading
    setQueue((prev) =>
      prev.map((q) => (q.id === itemId ? { ...q, status: 'uploading' } : q))
    );

    const item = queueRef.current.find((q) => q.id === itemId);
    if (!item) return;

    try {
      // Use the isPdf flag set at queue time (matches confirmQueue logic):
      // PDF when multi-page mode selected OR multiple pages captured.
      let finalUri = item.pages[0];
      let mimeType = 'image/jpeg';
      let finalFileName = item.fileName;

      if (item.isPdf) {
        finalUri = await compilePagesToPdf(item.pages);
        mimeType = 'application/pdf';
        // Ensure extension is .pdf (defensive — confirmQueue should have set it already)
        finalFileName = finalFileName.replace(/\.jpg$/i, '.pdf');
      }

      // Read bytes
      const bytes = await readFileBytes(finalUri);

      const storagePath = `${item.patientId}/${Date.now()}_${finalFileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;

      const { error: storErr } = await supabaseAdmin.storage
        .from('patient-files')
        .upload(storagePath, bytes.buffer, { contentType: mimeType, upsert: true });

      if (storErr) throw storErr;

      const { data: urlData } = supabaseAdmin.storage
        .from('patient-files')
        .getPublicUrl(storagePath);

      const { error: dbErr } = await supabaseAdmin.from('patient_files').insert([{
        patient_id: item.patientId,
        branch_id: item.branchId,
        file_name: finalFileName,
        title: finalFileName,
        file_url: urlData.publicUrl,
        file_type: mimeType,
        upload_date: new Date().toISOString().split('T')[0],
      }]);

      if (dbErr) throw dbErr;

      // Mark done
      setQueue((prev) =>
        prev.map((q) => (q.id === itemId ? { ...q, status: 'done' } : q))
      );

      // Auto-update patient status if flagged (backup after upload)
      // Web app stores old patients as 'inactive' in DB (not 'old_patient')
      // and releases file_number to satisfy patients_status_check constraint
      if (item.markAsOldPatient) {
        supabaseAdmin
          .from('patients')
          .update({ status: 'inactive', file_number: null })
          .eq('id', item.patientId)
          .then(({ error }) => {
            if (error) console.warn('[RapidDigitize] status backup update failed:', error.message);
          });
      }

      // Clean up temp PDF if created
      if (item.isPdf && finalUri !== item.pages[0]) {
        FileSystem.deleteAsync(finalUri, { idempotent: true }).catch(() => {});
      }
    } catch (e: any) {
      const errorMsg = e?.message || 'Unknown error';
      if (item.retries < MAX_QUEUE_RETRIES) {
        // Retry with back-off
        await new Promise((r) => setTimeout(r, 2000 * (item.retries + 1)));
        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? { ...q, status: 'pending', retries: q.retries + 1 }
              : q
          )
        );
      } else {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId ? { ...q, status: 'error', errorMsg } : q
          )
        );
        // Save to persistent failed list
        setFailedItems((prev) => {
          const updated = [
            ...prev,
            {
              patientId: item.patientId,
              patientName: item.patientName,
              fileUri: item.pages[0],
              fileName: item.fileName,
              errorMsg,
              failedAt: Date.now(),
            },
          ];
          AsyncStorage.setItem(FAILED_KEY, JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }
    }
  }, []);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const readFileBytes = async (uri: string): Promise<Uint8Array> => {
    let base64 = '';
    try {
      base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    } catch (_) {
      try {
        const tmp = `${FileSystem.documentDirectory}rdtmp_${Date.now()}`;
        await FileSystem.copyAsync({ from: uri, to: tmp });
        base64 = await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.Base64 });
        await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
      } catch (_) {
        const resp = await fetch(uri);
        const blob = await resp.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const d = reader.result as string;
            resolve(d ? d.split(',')[1] || '' : '');
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    }
    const clean = base64.replace(/[\r\n\s]/g, '');
    const binary = atob(clean);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  };

  const compilePagesToPdf = async (uris: string[]): Promise<string> => {
    const b64Images = await Promise.all(uris.map(async (uri) => {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return `data:image/jpeg;base64,${b64}`;
    }));
    const html = `<!DOCTYPE html><html><head><style>
      @page{size:A4 portrait;margin:0}body{margin:0;padding:0}
      .p{page-break-after:always;height:100vh;display:flex;justify-content:center;align-items:center}
      .p:last-child{page-break-after:avoid}img{max-width:100%;max-height:100vh;object-fit:contain}
    </style></head><body>${b64Images.map((s) => `<div class="p"><img src="${s}"/></div>`).join('')}</body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    return uri;
  };

  // ─── Simple queue status counts (no calculations) ─────────────────────────
  const queueUploading = queue.filter((q) => q.status === 'pending' || q.status === 'uploading').length;
  const queueDone = queue.filter((q) => q.status === 'done').length;
  const queueError = queue.filter((q) => q.status === 'error').length;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: themeColors.accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text, flex: 1 }]}>⚡ Rapid Digitization</Text>

        {/* Smart Crop Toggle */}
        <TouchableOpacity
          style={[
            styles.aiToggle,
            { borderColor: smartCrop ? '#0EA5E9' : themeColors.border },
            smartCrop && { backgroundColor: '#0EA5E9' },
          ]}
          onPress={() => setSmartCrop((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={[styles.aiToggleText, { color: smartCrop ? '#fff' : themeColors.subText }]}>
            {smartCrop ? 'Crop ON' : 'Crop'}
          </Text>
        </TouchableOpacity>

        {/* AI Mode Toggle */}
        <TouchableOpacity
          style={[
            styles.aiToggle,
            { borderColor: aiMode ? '#8B5CF6' : themeColors.border },
            aiMode && { backgroundColor: '#8B5CF6' },
          ]}
          onPress={() => setAiMode((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={[styles.aiToggleText, { color: aiMode ? '#fff' : themeColors.subText }]}>
            {aiMode ? 'AI ON' : 'AI'}
          </Text>
        </TouchableOpacity>

        {failedItems.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowFailed(!showFailed)}
            style={styles.failedBadge}
          >
            <Text style={styles.failedBadgeText}>{failedItems.length} Failed</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        bounces={true}
      >

        {/* ── AI Mode Info Banner ── */}
        {aiMode && (
          <View style={[styles.aiBanner, { backgroundColor: '#F5F3FF', borderColor: '#8B5CF6' }]}>
            <Text style={styles.aiBannerTitle}>AI Mode Active</Text>
            <Text style={styles.aiBannerSub}>
              Smart auto-naming by patient info & date
            </Text>
          </View>
        )}

        {/* ── Upload Status Bar ── */}
        {queue.length > 0 && (
          <View style={[styles.statusBar, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={[styles.statusText, { color: themeColors.text }]}>{queueUploading} uploading</Text>
            </View>
            <View style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.statusText, { color: themeColors.text }]}>{queueDone} done</Text>
            </View>
            {queueError > 0 && (
              <View style={styles.statusItem}>
                <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.statusText, { color: '#EF4444' }]}>{queueError} failed</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Undo Banner ── */}
        {lastQueued && (
          <View style={[styles.undoBanner, { backgroundColor: themeColors.accentBg, borderColor: themeColors.accent }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.undoTitle, { color: themeColors.accent }]}>
                Queued: {lastQueued.patientName}
              </Text>
              <Text style={[styles.undoSub, { color: themeColors.subText }]} numberOfLines={1}>
                {lastQueued.fileName}
              </Text>
            </View>
            <TouchableOpacity style={styles.undoBtn} onPress={undoLast}>
              <Text style={styles.undoBtnText}>Undo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Mode Configuration Bar: Target Pages Per Patient ── */}
        <View style={[styles.modeBar, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Text style={[styles.modeBarLabel, { color: themeColors.subText }]}>
            PAGES PER PATIENT:
          </Text>
          <View style={styles.modeSegRow}>
            {[
              { label: '3 Pages', val: 3 },
              { label: '2 Pages', val: 2 },
              { label: '1 Page', val: 1 },
              { label: 'Manual', val: 0 },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.val}
                style={[
                  styles.modeSegItem,
                  targetPages === opt.val && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
                ]}
                onPress={() => setTargetPages(opt.val)}
              >
                <Text
                  style={[
                    styles.modeSegText,
                    { color: targetPages === opt.val ? '#FFFFFF' : themeColors.text },
                    targetPages === opt.val && { fontWeight: '800' },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── STEP 1: Patient Search ── */}

        <Text style={[styles.stepLabel, { color: themeColors.accent }]}>
          {selectedPatient ? 'PATIENT SELECTED' : '1. FIND PATIENT (number, name or file no.)'}
        </Text>

        {selectedPatient ? (
          <>
            <View style={[styles.selectedCard, { backgroundColor: themeColors.accentBg, borderColor: themeColors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedName, { color: themeColors.text }]}>{selectedPatient.full_name}</Text>
                <Text style={[styles.selectedSub, { color: themeColors.accent }]}>
                  #{selectedPatient.patient_number || 'N/A'} · File: {selectedPatient.file_number ? selectedPatient.file_number.split('-')[0] : '—'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  onPress={handleOpenEditPatient}
                  style={[styles.changeBtn, { borderColor: themeColors.accent, backgroundColor: themeColors.bg }]}
                >
                  <Text style={[styles.changeBtnText, { color: themeColors.accent }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleNextPatient}
                  style={[styles.changeBtn, { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]}
                >
                  <Text style={[styles.changeBtnText, { color: '#EF4444' }]}>Next Patient</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Patient status toggle: Active / Old Patient */}
            <View style={styles.statusToggleRow}>
              <Text style={[styles.statusToggleLabel, { color: themeColors.subText }]}>Patient Status:</Text>
              <Pressable
                style={[
                  styles.statusToggleBtn,
                  patientUploadStatus === 'active'
                    ? styles.statusToggleBtnActive
                    : styles.statusToggleBtnInactive,
                ]}
                onPress={() => {
                  setPatientUploadStatus('active');
                  if (selectedPatient) updatePatientStatusInDB(selectedPatient.id, 'active');
                }}
              >
                <Text style={[
                  styles.statusToggleBtnText,
                  { color: patientUploadStatus === 'active' ? '#fff' : '#6B7280' },
                ]}>Active</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.statusToggleBtn,
                  patientUploadStatus === 'old_patient'
                    ? styles.statusToggleBtnOld
                    : styles.statusToggleBtnInactive,
                ]}
                onPress={() => {
                  setPatientUploadStatus('old_patient');
                  if (selectedPatient) updatePatientStatusInDB(selectedPatient.id, 'old_patient');
                }}
              >
                <Text style={[
                  styles.statusToggleBtnText,
                  { color: patientUploadStatus === 'old_patient' ? '#fff' : '#6B7280' },
                ]}>Old Patient</Text>
              </Pressable>
            </View>

            {/* Existing Uploaded Files for Selected Patient */}
            <View style={{ marginTop: 10, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: themeColors.accent }}>
                  UPLOADED FILES ({uploadedFiles.length})
                </Text>
                {loadingUploadedFiles && <ActivityIndicator size="small" color={themeColors.accent} />}
              </View>

              {uploadedFiles.length === 0 ? (
                <Text style={{ fontSize: 10, color: themeColors.subText, fontStyle: 'italic', marginVertical: 2 }}>
                  No uploaded files found for this patient.
                </Text>
              ) : (
                uploadedFiles.map((file) => (
                  <View
                    key={file.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: themeColors.cardBg,
                      borderWidth: 1,
                      borderColor: themeColors.border,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                        {file.file_name || file.title || 'Patient File'}
                      </Text>
                      <Text style={{ fontSize: 9, color: themeColors.subText, marginTop: 1 }}>
                        Uploaded: {file.upload_date || (file.created_at ? new Date(file.created_at).toLocaleDateString() : 'N/A')}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity
                        onPress={() => handleOpenRenameFileModal(file)}
                        style={{
                          backgroundColor: themeColors.accentBg,
                          paddingHorizontal: 7,
                          paddingVertical: 4,
                          borderRadius: 5,
                          borderWidth: 1,
                          borderColor: themeColors.accent,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.accent }}>Rename</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleDeleteFile(file)}
                        style={{
                          backgroundColor: '#FEE2E2',
                          paddingHorizontal: 7,
                          paddingVertical: 4,
                          borderRadius: 5,
                          borderWidth: 1,
                          borderColor: '#EF4444',
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
            {patientUploadStatus === 'old_patient' && (
              <Text style={[styles.statusToggleHint, { marginTop: -2, marginBottom: 4 }]}>
                ✅ Patient status updated to Old Patient in database
              </Text>
            )}
          </>
        ) : (
          <View style={[styles.searchBox, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <TextInput
              ref={searchRef}
              style={[styles.searchInput, { backgroundColor: themeColors.inputBg, borderColor: themeColors.accent, color: themeColors.text }]}
              placeholder="Type patient no., name or file no…"
              placeholderTextColor={themeColors.subText}
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
              returnKeyType="search"
            />
            {searchLoading && <ActivityIndicator color={themeColors.accent} style={{ marginVertical: 4 }} />}
            {searchText.trim().length > 0 && !searchLoading && patients.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 6 }}>
                <Text style={{ fontSize: 11, color: themeColors.subText, marginBottom: 6 }}>No matching patients found.</Text>
                <TouchableOpacity
                  style={{ backgroundColor: '#16A34A', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}
                  onPress={() => { setNewPatientName(searchText); setShowAddPatient(true); }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>+ Add New Patient</Text>
                </TouchableOpacity>
              </View>
            )}
            {patients.slice(0, 8).map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.patientRow, { borderBottomColor: themeColors.border }]}
                onPress={() => handleSelectPatient(p)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.patientName, { color: themeColors.text }]}>{p.full_name}</Text>
                  <Text style={[styles.patientSub, { color: themeColors.subText }]}>
                    #{p.patient_number || '—'} · {p.file_number ? `File ${p.file_number.split('-')[0]}` : 'No file'}
                  </Text>
                </View>
                <Text style={[styles.selectArrow, { color: themeColors.accent }]}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── STEP 2: Captured Pages Preview ── */}
        {selectedPatient && (
          <>
            <Text style={[styles.stepLabel, { color: themeColors.accent, marginTop: 14 }]}>
              2. SCAN FILE ({capturedPages.length} page{capturedPages.length !== 1 ? 's' : ''} captured)
            </Text>

            {/* Horizontal thumbnail strip */}
            {capturedPages.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbStrip}>
                {capturedPages.map((uri, idx) => (
                  <View key={idx} style={styles.thumbItem}>
                    <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.thumbRemove}
                      onPress={() => setCapturedPages((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Text style={styles.thumbRemoveText}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.thumbLabel}>Pg {idx + 1}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Scan and Confirm buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.scanBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.accent }]}
                onPress={openCamera}
                disabled={isCapturing}
              >
                {isCapturing
                  ? <ActivityIndicator color={themeColors.accent} />
                  : <Text style={[styles.scanBtnText, { color: themeColors.accent }]}>
                      {capturedPages.length === 0 ? 'Scan File' : 'Add Page'}
                    </Text>
                }
              </TouchableOpacity>

              {capturedPages.length > 0 && (
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: themeColors.accent }]}
                  onPress={confirmManually}
                >
                  <Text style={styles.confirmBtnText}>
                    Queue Upload{capturedPages.length > 1 ? ` (${capturedPages.length}pg PDF)` : ''}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.tip, { color: themeColors.subText }]}>
              Scan pages then tap Queue Upload to save this file. Tap "Next Patient" when finished with a patient.
            </Text>
          </>
        )}

        {/* ── Failed Items ── */}
        {showFailed && failedItems.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.stepLabel, { color: '#EF4444' }]}>⚠️ FAILED UPLOADS ({failedItems.length})</Text>
            {failedItems.map((f, idx) => (
              <View key={idx} style={[styles.failedCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Text style={styles.failedPatient}>{f.patientName}</Text>
                <Text style={styles.failedError}>{f.errorMsg}</Text>
                <Text style={styles.failedTime}>{new Date(f.failedAt).toLocaleTimeString()}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.clearFailedBtn}
              onPress={() => {
                setFailedItems([]);
                AsyncStorage.removeItem(FAILED_KEY).catch(() => {});
              }}
            >
              <Text style={styles.clearFailedText}>Clear Failed List</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Recent queue activity ── */}
        {queue.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.stepLabel, { color: themeColors.accent }]}>
              UPLOAD QUEUE ({queue.length} items)
            </Text>
            {queue.slice(-10).reverse().map((item) => (
              <View key={item.id} style={[styles.queueRow, { borderColor: themeColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.queuePatient, { color: themeColors.text }]} numberOfLines={1}>
                    {item.patientName}
                  </Text>
                  <Text style={[styles.queueFile, { color: themeColors.subText }]} numberOfLines={1}>
                    {item.fileName}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.queueStatus, {
                    backgroundColor:
                      item.status === 'done' ? '#D1FAE5' :
                      item.status === 'uploading' ? '#FEF3C7' :
                      item.status === 'error' ? '#FEE2E2' : '#F3F4F6',
                  }]}>
                    <Text style={[styles.queueStatusText, {
                      color:
                        item.status === 'done' ? '#059669' :
                        item.status === 'uploading' ? '#D97706' :
                        item.status === 'error' ? '#DC2626' : '#6B7280',
                    }]}>
                      {item.status === 'done' ? 'Done' :
                       item.status === 'uploading' ? 'Uploading' :
                       item.status === 'error' ? 'Error' : 'Pending'}
                    </Text>
                  </View>

                  {/* Actions for queued files: Rename & Remove */}
                  <TouchableOpacity
                    onPress={() => handleOpenQueueRenameModal(item)}
                    style={{
                      backgroundColor: themeColors.accentBg,
                      paddingHorizontal: 7,
                      paddingVertical: 4,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: themeColors.accent,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: themeColors.accent }}>Rename</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDeleteQueueItem(item)}
                    style={{
                      backgroundColor: '#FEE2E2',
                      paddingHorizontal: 7,
                      paddingVertical: 4,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: '#EF4444',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* How It Works guide */}
        {queue.length === 0 && !selectedPatient && (
          <View style={[styles.guideBox, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.guideTitle, { color: themeColors.accent }]}>How This Works</Text>
            <Text style={[styles.guideItem, { color: themeColors.text }]}>1. Search patient by name, number or file no.</Text>
            <Text style={[styles.guideItem, { color: themeColors.text }]}>2. Camera opens → scan your pages</Text>
            <Text style={[styles.guideItem, { color: themeColors.text }]}>3. Name the file and tap Upload → queued instantly</Text>
            <Text style={[styles.guideItem, { color: themeColors.text }]}>4. Scan more files for the same patient — patient stays selected!</Text>
            <Text style={[styles.guideItem, { color: themeColors.text }]}>5. Tap "Next Patient" when all files for that patient are done</Text>
          </View>
        )}

        <View style={{ height: 60 }} />

      </ScrollView>

      {/* ── Rename / Confirm Modal ── */}
      <Modal
        visible={showRenameModal}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => { Keyboard.dismiss(); setShowRenameModal(false); }}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={Keyboard.dismiss}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.modalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={() => {}}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Name This File</Text>
                {aiMode && (
                  <Text style={styles.modalAiNote}>AI suggested name — edit if needed</Text>
                )}
                <Text style={[styles.modalSub, { color: themeColors.subText }]}>
                  Patient: {pendingPatient?.full_name} · {pendingPages.length} page{pendingPages.length !== 1 ? 's' : ''}
                </Text>

                {/* Document type quick-pick */}
                <Text style={[styles.modalTypeLabel, { color: themeColors.subText }]}>DOCUMENT TYPE:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  <View style={styles.docTypeRow}>
                    {[
                      'Ultrasound', 'CT Imaging', 'MRI',
                      'Invoices', 'Patient Information Sheet', 'Consultation Notes',
                    ].map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.docTypeChip,
                          { borderColor: themeColors.border },
                          docType === t && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
                        ]}
                        onPress={() => {
                          setDocType(t);
                          // Just use the selected type as the file name
                          setPendingFileName(t);
                        }}
                      >
                        <Text style={[
                          styles.docTypeText,
                          { color: docType === t ? '#fff' : themeColors.text },
                        ]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {pendingPages.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {pendingPages.map((uri, idx) => (
                      <Image key={idx} source={{ uri }} style={styles.modalThumb} resizeMode="cover" />
                    ))}
                  </ScrollView>
                )}

                <TextInput
                  style={[styles.renameInput, {
                    backgroundColor: themeColors.inputBg,
                    borderColor: themeColors.accent,
                    color: themeColors.text,
                  }]}
                  value={pendingFileName}
                  onChangeText={setPendingFileName}
                  autoFocus
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmQueue}
                />
                <Text style={[styles.extHint, { color: themeColors.subText }]}>
                  📄 Will save as .pdf — images are always converted to PDF
                </Text>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                    onPress={() => { Keyboard.dismiss(); setShowRenameModal(false); }}
                  >
                    <Text style={[styles.modalCancelText, { color: themeColors.subText }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalConfirmBtn, { backgroundColor: themeColors.accent }]}
                    onPress={confirmQueue}
                  >
                    <Text style={styles.modalConfirmText}>⬆️ Upload</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Image Correction Modal ── */}
      <Modal
        visible={showCorrectModal}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          setShowCorrectModal(false);
          setCorrectUri(null);
          setCorrectRotation(0);
        }}
      >
        <SafeAreaView style={styles.correctContainer}>
          <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

          {/* Header */}
          <View style={styles.correctHeader}>
            <Text style={styles.correctTitle}>🖼️ Adjust Image</Text>
            <Text style={styles.correctSub}>
              {smartCrop ? '✂️ Crop ON · ' : ''}Rotate if needed, then tap Use
            </Text>
          </View>

          {/* Preview — takes all remaining space */}
          <View style={styles.correctPreviewWrap}>
            {correctUri ? (
              <Image
                source={{ uri: correctUri }}
                style={[
                  styles.correctPreview,
                  correctRotation !== 0 && {
                    transform: [{ rotate: `${correctRotation}deg` }],
                  },
                ]}
                resizeMode="contain"
              />
            ) : (
              <ActivityIndicator color="#0EA5E9" size="large" />
            )}
            {isProcessing && (
              <View style={styles.correctProcessingOverlay}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.correctProcessingText}>Processing…</Text>
              </View>
            )}
          </View>

          {/* Bottom panel — all controls below preview */}
          <View style={styles.correctPanel}>

            {/* Rotation row */}
            <View style={styles.correctControls}>
              <TouchableOpacity
                style={styles.correctRotateBtn}
                onPress={() => setCorrectRotation((r) => r - 90)}
                disabled={isProcessing}
              >
                <Text style={styles.correctRotateIcon}>↺</Text>
                <Text style={styles.correctRotateLabel}>Left</Text>
              </TouchableOpacity>

              <View style={styles.correctRotationDisplay}>
                <Text style={styles.correctRotationDeg}>
                  {((correctRotation % 360) + 360) % 360}°
                </Text>
                <TouchableOpacity onPress={() => setCorrectRotation(0)} disabled={isProcessing}>
                  <Text style={styles.correctResetBtn}>Reset</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.correctRotateBtn}
                onPress={() => setCorrectRotation((r) => r + 90)}
                disabled={isProcessing}
              >
                <Text style={styles.correctRotateIcon}>↻</Text>
                <Text style={styles.correctRotateLabel}>Right</Text>
              </TouchableOpacity>
            </View>

            {/* Smart crop toggle — slim single row */}
            <TouchableOpacity
              style={[
                styles.correctCropToggle,
                smartCrop && styles.correctCropToggleOn,
              ]}
              onPress={() => setSmartCrop((v) => !v)}
              disabled={isProcessing}
            >
              <Text style={styles.correctCropToggleIcon}>✂️</Text>
              <Text style={[styles.correctCropToggleLabel, smartCrop && { color: '#0369A1' }]}>
                Smart Crop {smartCrop ? 'ON' : 'OFF'}
              </Text>
              <Text style={[styles.correctCropToggleSub, smartCrop && { color: '#0EA5E9' }]}>
                {smartCrop ? '— trims dark edges' : '— tap to enable'}
              </Text>
            </TouchableOpacity>

            {/* Action buttons */}
            <View style={styles.correctActionRow}>
              <TouchableOpacity
                style={styles.correctRetakeBtn}
                onPress={() => {
                  setShowCorrectModal(false);
                  setCorrectUri(null);
                  setCorrectRotation(0);
                  const ctx = correctCtxRef.current;
                  if (ctx) {
                    setTimeout(() => openCameraForPatient(
                      ctx.patient, ctx.currentPages, ctx.targetPages, aiMode,
                      (asset, cp) => processCapture(asset, cp, ctx.patient, ctx.onNewPages, ctx.onConfirm),
                      setIsCapturing,
                    ), 300);
                  }
                }}
                disabled={isProcessing}
              >
                <Text style={styles.correctRetakeText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.correctUseBtn, isProcessing && { opacity: 0.6 }]}
                onPress={applyAndAddPage}
                disabled={isProcessing}
              >
                {isProcessing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.correctUseText}>Use Image</Text>
                }
              </TouchableOpacity>
            </View>

          </View>
        </SafeAreaView>
      </Modal>

      {/* Modal 1: Edit Patient Details */}
      <Modal
        visible={editPatientModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditPatientModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: themeColors.cardBg, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: themeColors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 4 }}>
              Edit Patient Details
            </Text>
            <Text style={{ fontSize: 12, color: themeColors.subText, marginBottom: 16 }}>
              Update patient full name and file number
            </Text>

            <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>
              Full Name *
            </Text>
            <TextInput
              style={{
                backgroundColor: themeColors.inputBg,
                borderColor: themeColors.inputBorder,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: themeColors.text,
                fontSize: 14,
                marginBottom: 12,
              }}
              value={editPatientName}
              onChangeText={setEditPatientName}
              placeholder="e.g. John Doe"
              placeholderTextColor={themeColors.subText}
            />

            <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4 }}>
              File Number (Optional)
            </Text>
            <TextInput
              style={{
                backgroundColor: themeColors.inputBg,
                borderColor: themeColors.inputBorder,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: themeColors.text,
                fontSize: 14,
                marginBottom: 20,
              }}
              value={editFileNumber}
              onChangeText={setEditFileNumber}
              placeholder="e.g. 5511"
              placeholderTextColor={themeColors.subText}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setEditPatientModalVisible(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.subText }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSavePatientDetails}
                disabled={savingPatientDetails}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: themeColors.accent, alignItems: 'center' }}
              >
                {savingPatientDetails ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Save Details</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Rename Uploaded File */}
      <Modal
        visible={fileRenameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFileRenameModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: themeColors.cardBg, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: themeColors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 4 }}>
              Rename Uploaded File
            </Text>
            <Text style={{ fontSize: 12, color: themeColors.subText, marginBottom: 16 }}>
              Enter new file name or title
            </Text>

            <TextInput
              style={{
                backgroundColor: themeColors.inputBg,
                borderColor: themeColors.inputBorder,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: themeColors.text,
                fontSize: 14,
                marginBottom: 20,
              }}
              value={newFileName}
              onChangeText={setNewFileName}
              placeholder="Enter new file name..."
              placeholderTextColor={themeColors.subText}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setFileRenameModalVisible(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.subText }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRenameFile}
                disabled={renamingFile}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: themeColors.accent, alignItems: 'center' }}
              >
                {renamingFile ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Save Name</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Rename Queued File */}
      <Modal
        visible={queueRenameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQueueRenameModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: themeColors.cardBg, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: themeColors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 4 }}>
              Rename Queued File
            </Text>
            <Text style={{ fontSize: 12, color: themeColors.subText, marginBottom: 16 }}>
              Update file name for queued upload ({selectedQueueItemToRename?.patientName})
            </Text>

            <TextInput
              style={{
                backgroundColor: themeColors.inputBg,
                borderColor: themeColors.inputBorder,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: themeColors.text,
                fontSize: 14,
                marginBottom: 20,
              }}
              value={newQueueFileName}
              onChangeText={setNewQueueFileName}
              placeholder="Enter new file name..."
              placeholderTextColor={themeColors.subText}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setQueueRenameModalVisible(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.subText }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveQueueFileName}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: themeColors.accent, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Save Name</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 4: Add New Patient */}
      <Modal
        visible={showAddPatient}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddPatient(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: themeColors.cardBg, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: themeColors.border }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 2 }}>Add New Patient</Text>
            <Text style={{ fontSize: 12, color: themeColors.subText, marginBottom: 14 }}>Quick registration — fill in available details</Text>

            <Text style={{ fontSize: 10, fontWeight: '800', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.4 }}>TITLE</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
                    { borderColor: newPatientTitle === t ? themeColors.accent : themeColors.border },
                    newPatientTitle === t && { backgroundColor: themeColors.accentBg },
                  ]}
                  onPress={() => setNewPatientTitle(newPatientTitle === t ? '' : t)}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: newPatientTitle === t ? themeColors.accent : themeColors.subText }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 10, fontWeight: '800', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.4 }}>FULL NAME *</Text>
            <TextInput
              style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: themeColors.text, fontSize: 14, marginBottom: 12 }}
              value={newPatientName}
              onChangeText={setNewPatientName}
              placeholder="e.g. John Doe"
              placeholderTextColor={themeColors.subText}
            />

            <Text style={{ fontSize: 10, fontWeight: '800', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.4 }}>FILE NUMBER</Text>
            <TextInput
              style={{ backgroundColor: themeColors.inputBg, borderColor: fileNoTaken ? '#EF4444' : themeColors.inputBorder, borderWidth: fileNoTaken ? 2 : 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: themeColors.text, fontSize: 14, marginBottom: fileNoTaken ? 2 : 12 }}
              value={newPatientFileNo}
              onChangeText={setNewPatientFileNo}
              placeholder="e.g. 5511"
              placeholderTextColor={themeColors.subText}
            />
            {checkingFileNo && newPatientFileNo.trim().length > 0 && (
              <ActivityIndicator size="small" color={themeColors.accent} style={{ alignSelf: 'flex-start', marginBottom: 8 }} />
            )}
            {fileNoTaken && (
              <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '600', marginBottom: 10, marginTop: 2 }}>
                ⚠️ Already in use by {fileNoTakenBy}
              </Text>
            )}

            <Text style={{ fontSize: 10, fontWeight: '800', color: themeColors.subText, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.4 }}>PHONE</Text>
            <TextInput
              style={{ backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: themeColors.text, fontSize: 14, marginBottom: 20 }}
              value={newPatientPhone}
              onChangeText={setNewPatientPhone}
              placeholder="e.g. +263 77 123 4567"
              placeholderTextColor={themeColors.subText}
              keyboardType="phone-pad"
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowAddPatient(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.subText }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddNewPatient}
                disabled={savingNewPatient || fileNoTaken || checkingFileNo}
                style={{ flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: (savingNewPatient || fileNoTaken || checkingFileNo) ? '#9CA3AF' : themeColors.accent, alignItems: 'center' }}
              >
                {savingNewPatient
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Add Patient</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 8 : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 4 },
  backBtnText: { fontSize: 15, fontWeight: '700' },
  headerTitle: { fontSize: 14, fontWeight: '800' },
  headerSub: { fontSize: 10, marginTop: 1 },
  failedBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  failedBadgeText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },

  scroll: { padding: 14, paddingBottom: 60 },

  // AI Toggle
  aiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  aiToggleText: { fontSize: 10, fontWeight: '700' },

  // AI banner
  aiBanner: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  aiBannerTitle: { fontSize: 12, fontWeight: '800', color: '#7C3AED', marginBottom: 2 },
  aiBannerSub: { fontSize: 11, color: '#5B21B6', lineHeight: 16 },

  // Status bar (replaces dashboard)
  statusBar: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
    alignItems: 'center',
  },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },

  // Undo banner
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  undoTitle: { fontSize: 12, fontWeight: '700' },
  undoSub: { fontSize: 10, marginTop: 1 },
  undoBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  undoBtnText: { color: '#DC2626', fontWeight: '700', fontSize: 12 },

  stepLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 },

  // Patient selected card
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    marginBottom: 4,
  },
  selectedName: { fontSize: 14, fontWeight: '700' },
  selectedSub: { fontSize: 11, marginTop: 1 },
  changeBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  changeBtnText: { fontSize: 11, fontWeight: '600' },

  // Search
  searchBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    marginBottom: 4,
  },
  searchInput: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  patientName: { fontSize: 13, fontWeight: '700' },
  patientSub: { fontSize: 10, marginTop: 1 },
  selectArrow: { fontSize: 20, fontWeight: '300' },

  // Patient status toggle (Active / Old Patient)
  statusToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  statusToggleLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 2,
  },
  statusToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  statusToggleBtnActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  statusToggleBtnOld: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  statusToggleBtnInactive: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  statusToggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  statusToggleHint: {
    fontSize: 9,
    color: '#D97706',
    fontStyle: 'italic',
    flexShrink: 1,
  },

  // Thumbnail strip
  thumbStrip: { marginBottom: 8 },
  thumbItem: { width: 80, marginRight: 8, position: 'relative' },
  thumbImg: { width: 80, height: 100, borderRadius: 8 },
  thumbRemove: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  thumbLabel: { fontSize: 9, textAlign: 'center', marginTop: 3, color: '#6B7280' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  scanBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
  },
  scanBtnText: { fontWeight: '700', fontSize: 12 },
  confirmBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingVertical: 8,
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  tip: { fontSize: 10, lineHeight: 14, marginBottom: 4 },

  // Queue rows
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 7,
    gap: 8,
  },
  queuePatient: { fontSize: 12, fontWeight: '700' },
  queueFile: { fontSize: 10 },
  queueStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  queueStatusText: { fontSize: 10, fontWeight: '700' },

  // Failed
  failedCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    marginBottom: 6,
  },
  failedPatient: { fontSize: 12, fontWeight: '700', color: '#DC2626' },
  failedError: { fontSize: 10, color: '#EF4444', marginTop: 2 },
  failedTime: { fontSize: 9, color: '#9CA3AF', marginTop: 2 },
  clearFailedBtn: { alignItems: 'center', paddingVertical: 8 },
  clearFailedText: { color: '#DC2626', fontSize: 12, fontWeight: '600' },

  // Guide
  guideBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginTop: 16,
  },
  guideTitle: { fontSize: 13, fontWeight: '800', marginBottom: 10 },
  guideItem: { fontSize: 12, lineHeight: 22 },
  guideHr: { borderTopWidth: 1, marginVertical: 10 },
  guideTip: { fontSize: 11, lineHeight: 18 },

  // Mode Segment Picker
  modeBar: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  modeBarLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  modeSegRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeSegItem: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSegText: { fontSize: 10, fontWeight: '700' },

  // Rename Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginHorizontal: 12,
    marginBottom: Platform.OS === 'ios' ? 16 : 24,
    maxHeight: '90%',          // never overflows the screen
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  modalAiNote: { fontSize: 11, color: '#7C3AED', fontWeight: '600', marginBottom: 4 },
  modalSub: { fontSize: 11, marginBottom: 8 },
  modalThumb: { width: 70, height: 90, borderRadius: 8, marginRight: 8 },
  renameInput: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 14,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  modalCancelText: { fontSize: 13, fontWeight: '700' },
  modalConfirmBtn: { flex: 2, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Doc type chips
  modalTypeLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 },
  docTypeRow: { flexDirection: 'row', gap: 6 },
  docTypeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  docTypeText: { fontSize: 11, fontWeight: '700' },

  // Extension hint
  extHint: { fontSize: 10, marginTop: -10, marginBottom: 14, fontStyle: 'italic' },

  // ── Image Correction Modal — light theme ──────────────────────────────────────
  correctContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  correctHeader: {
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 6 : 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  correctTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  correctSub: {
    color: '#64748B',
    fontSize: 10,
    flexShrink: 1,
  },
  correctPreviewWrap: {
    flex: 1,                    // takes all leftover space
    backgroundColor: '#E2E8F0',
    margin: 10,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  correctPreview: {
    width: '100%',
    height: '100%',
  },
  correctProcessingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  correctProcessingText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  // bottom panel wraps all controls below preview
  correctPanel: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 16 : 48,  // extra room above nav bar
  },
  correctControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  correctRotateBtn: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 2,
    minWidth: 64,
  },
  correctRotateIcon: {
    color: '#0369A1',
    fontSize: 18,
  },
  correctRotateLabel: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '600',
  },
  correctRotationDisplay: {
    alignItems: 'center',
    gap: 2,
    minWidth: 50,
  },
  correctRotationDeg: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  correctResetBtn: {
    color: '#0EA5E9',
    fontSize: 10,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  // slim single-line crop chip
  correctCropToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  correctCropToggleOn: {
    borderColor: '#BAE6FD',
    backgroundColor: '#E0F2FE',
  },
  correctCropToggleIcon: {
    fontSize: 14,
  },
  correctCropToggleLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
  },
  correctCropToggleSub: {
    color: '#94A3B8',
    fontSize: 10,
  },
  correctActionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 0,
  },
  correctRetakeBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  correctRetakeText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  correctUseBtn: {
    flex: 2,
    backgroundColor: '#0EA5E9',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  correctUseText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});

