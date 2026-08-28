import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
  Platform,
  StatusBar,
  Switch,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList, Patient } from '../types';
import { fetchAllPatients, filterPatients } from '../utils/patientLoader';

type UploadFileScreenNavigationProp = StackNavigationProp<RootStackParamList, 'UploadFile'>;
type UploadFileScreenRouteProp = RouteProp<RootStackParamList, 'UploadFile'>;

interface Props {
  navigation: UploadFileScreenNavigationProp;
  route: UploadFileScreenRouteProp;
}

const UPLOAD_DRAFT_KEY = '@spiritmed_upload_draft';

interface UploadDraft {
  selectedPatientId: string;
  capturedPages: string[];
  singleDocumentUri: string | null;
  customFileName: string;
  convertToPdf: boolean;
}

export function UploadFileScreen({ navigation, route }: Props) {
  const initialPatientId = route.params?.patientId;
  const { themeColors } = useTheme();
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [patientSearch, setPatientSearch] = useState('');
  
  // Multi-page image capture & file management
  const [capturedPages, setCapturedPages] = useState<string[]>([]);
  const [singleDocumentUri, setSingleDocumentUri] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string>('');
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [convertToPdf, setConvertToPdf] = useState<boolean>(true);
  const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(false);
  
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Edit Patient Details state
  const [editPatientModalVisible, setEditPatientModalVisible] = useState(false);
  const [editPatientName, setEditPatientName] = useState('');
  const [editFileNumber, setEditFileNumber] = useState('');
  const [savingPatientDetails, setSavingPatientDetails] = useState(false);

  // Uploaded Files Management state
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [loadingUploadedFiles, setLoadingUploadedFiles] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [selectedFileToRename, setSelectedFileToRename] = useState<any>(null);
  const [newFileName, setNewFileName] = useState('');
  const [renamingFile, setRenamingFile] = useState(false);

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

  // Fetch existing uploaded files for the selected patient
  const fetchUploadedFiles = async (patientId: string) => {
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
      console.error('Error fetching patient files:', e);
    } finally {
      setLoadingUploadedFiles(false);
    }
  };

  useEffect(() => {
    if (selectedPatientId) {
      fetchUploadedFiles(selectedPatientId);
    } else {
      setUploadedFiles([]);
    }
  }, [selectedPatientId]);

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

  const handleOpenEditPatient = () => {
    const patient = patients.find((p) => p.id === selectedPatientId);
    if (!patient) return;
    setEditPatientName(patient.full_name || '');
    setEditFileNumber(patient.file_number ? patient.file_number.split('-')[0] : '');
    setEditPatientModalVisible(true);
  };

  const handleSavePatientDetails = async () => {
    if (!selectedPatientId) return;
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
        .eq('id', selectedPatientId);

      if (error) throw error;

      setPatients((prev) =>
        prev.map((p) =>
          p.id === selectedPatientId
            ? { ...p, full_name: updatedName, file_number: updatedFileNo || undefined }
            : p
        )
      );

      setEditPatientModalVisible(false);
      Alert.alert('Success', 'Patient details updated successfully.');
    } catch (e: any) {
      Alert.alert('Update Failed', e.message || 'Could not update patient details.');
    } finally {
      setSavingPatientDetails(false);
    }
  };

  const handleOpenRenameModal = (file: any) => {
    setSelectedFileToRename(file);
    setNewFileName(file.file_name || file.title || '');
    setRenameModalVisible(true);
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

      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === selectedFileToRename.id ? { ...f, file_name: cleanName, title: cleanName } : f))
      );
      setRenameModalVisible(false);
      Alert.alert('Renamed', 'File renamed successfully.');
    } catch (e: any) {
      Alert.alert('Rename Failed', e.message || 'Could not rename file.');
    } finally {
      setRenamingFile(false);
    }
  };

  const handleDeleteFile = (file: any) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${file.file_name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from Supabase Storage bucket if file_url exists
              if (file.file_url) {
                const urlParts = file.file_url.split('/patient-files/');
                if (urlParts.length > 1) {
                  const storagePath = decodeURIComponent(urlParts[1]);
                  await supabaseAdmin.storage.from('patient-files').remove([storagePath]).catch(() => {});
                }
              }

              // Delete database record
              const { error } = await supabase
                .from('patient_files')
                .delete()
                .eq('id', file.id);

              if (error) throw error;

              setUploadedFiles((prev) => prev.filter((f) => f.id !== file.id));
              Alert.alert('Deleted', 'File deleted successfully.');
            } catch (e: any) {
              Alert.alert('Delete Failed', e.message || 'Could not delete file.');
            }
          },
        },
      ]
    );
  };


  // Restore interrupted draft on component mount
  useEffect(() => {
    AsyncStorage.getItem(UPLOAD_DRAFT_KEY).then((json) => {
      if (json) {
        try {
          const draft: UploadDraft = JSON.parse(json);
          let restored = false;

          if (draft.selectedPatientId) {
            setSelectedPatientId(draft.selectedPatientId);
            fetchPatientById(draft.selectedPatientId);
            restored = true;
          }
          if (draft.capturedPages && draft.capturedPages.length > 0) {
            setCapturedPages(draft.capturedPages);
            restored = true;
          }
          if (draft.singleDocumentUri) {
            setSingleDocumentUri(draft.singleDocumentUri);
            restored = true;
          }
          if (draft.customFileName) {
            setCustomFileName(draft.customFileName);
            restored = true;
          }
          if (typeof draft.convertToPdf === 'boolean') {
            setConvertToPdf(draft.convertToPdf);
          }

          if (restored) {
            setHasRestoredDraft(true);
          }
        } catch (e) {
          console.error('Error parsing upload draft:', e);
        }
      }
    }).catch(() => {});
  }, []);

  // Auto-save draft whenever user modifies upload inputs
  useEffect(() => {
    if (selectedPatientId || capturedPages.length > 0 || singleDocumentUri || customFileName) {
      const draft: UploadDraft = {
        selectedPatientId,
        capturedPages,
        singleDocumentUri,
        customFileName,
        convertToPdf,
      };
      AsyncStorage.setItem(UPLOAD_DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
    }
  }, [selectedPatientId, capturedPages, singleDocumentUri, customFileName, convertToPdf]);

  const clearDraftState = async () => {
    setCapturedPages([]);
    setSingleDocumentUri(null);
    setCustomFileName('');
    setSelectedPatientId('');
    setHasRestoredDraft(false);
    await AsyncStorage.removeItem(UPLOAD_DRAFT_KEY).catch(() => {});
  };

  const fetchPatientById = async (patientId: string) => {
    try {
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, patient_number, file_number, phone, email')
        .eq('id', patientId)
        .single();
      if (data) {
        setPatients((prev) => {
          if (prev.some((p) => p.id === data.id)) return prev;
          return [data, ...prev];
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Search patients ONLY when user types into the search input
  useEffect(() => {
    const q = patientSearch.trim();
    if (!q) {
      setPatients((prev) => prev.filter((p) => p.id === selectedPatientId));
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      fetchPatients(q);
    }, 200);
    return () => clearTimeout(timer);
  }, [patientSearch]);


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
      console.error('Error loading patients:', e);
    } finally {
      setLoading(false);
    }
  };

  const takePhotoWithCamera = async () => {
    Keyboard.dismiss();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Camera access permission is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const newUri = result.assets[0].uri;
      const updated = [...capturedPages, newUri];
      setCapturedPages(updated);
      setSingleDocumentUri(null);
      
      if (!customFileName) {
        const patient = patients.find((p) => p.id === selectedPatientId);
        const namePrefix = patient ? patient.full_name.replace(/\s+/g, '_') : 'Patient_File';
        setCustomFileName(`${namePrefix}_Document.pdf`);
      }
    }
  };

  const openSmartScan = () => {
    Keyboard.dismiss();
    navigation.navigate('SmartScan', {
      onComplete: (enhancedUris: string[], suggestedName: string | null) => {
        const updated = [...capturedPages, ...enhancedUris];
        setCapturedPages(updated);
        setSingleDocumentUri(null);
        // Use AI-suggested name if user hasn't typed one
        if (suggestedName && !customFileName) {
          const patient = patients.find((p) => p.id === selectedPatientId);
          const prefix = patient ? `${patient.full_name.replace(/\s+/g, '_')}_` : '';
          setCustomFileName(`${prefix}${suggestedName}`);
        } else if (!customFileName) {
          const patient = patients.find((p) => p.id === selectedPatientId);
          const namePrefix = patient ? patient.full_name.replace(/\s+/g, '_') : 'Patient_File';
          setCustomFileName(`${namePrefix}_Document.pdf`);
        }
      },
    });
  };

  const pickImageFromGallery = async () => {
    Keyboard.dismiss();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const newUris = result.assets.map((a) => a.uri);
      const updated = [...capturedPages, ...newUris];
      setCapturedPages(updated);
      setSingleDocumentUri(null);
      
      if (!customFileName) {
        const patient = patients.find((p) => p.id === selectedPatientId);
        const namePrefix = patient ? patient.full_name.replace(/\s+/g, '_') : 'Patient_File';
        setCustomFileName(`${namePrefix}_Document.pdf`);
      }
    }
  };

  const pickDocument = async () => {
    Keyboard.dismiss();
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSingleDocumentUri(asset.uri);
        setCapturedPages([]);
        setCustomFileName(asset.name);
        setMimeType(asset.mimeType || 'application/octet-stream');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removeCapturedPage = (index: number) => {
    const updated = capturedPages.filter((_, i) => i !== index);
    setCapturedPages(updated);
  };

  const compileImagesToPdf = async (imageUris: string[]): Promise<string> => {
    const base64Images = await Promise.all(
      imageUris.map(async (uri) => {
        try {
          if (FileSystem && FileSystem.readAsStringAsync) {
            const base64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            return `data:image/jpeg;base64,${base64}`;
          }
        } catch (e) {
          console.warn('FileSystem legacy fallback:', e);
        }

        const response = await fetch(uri);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      })
    );

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; padding: 0; background: #ffffff; }
            .page { page-break-after: always; height: 100vh; display: flex; justify-content: center; align-items: center; }
            .page:last-child { page-break-after: avoid; }
            img { max-width: 100%; max-height: 100vh; object-fit: contain; }
          </style>
        </head>
        <body>
          ${base64Images
            .map((src) => `<div class="page"><img src="${src}" /></div>`)
            .join('')}
        </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html: htmlContent });
    return uri;
  };

  const handleUpload = async () => {
    Keyboard.dismiss();
    if (!selectedPatientId) {
      Alert.alert('Required', 'Please select a patient first.');
      return;
    }
    if (capturedPages.length === 0 && !singleDocumentUri) {
      Alert.alert('Required', 'Please capture photo pages or select a document.');
      return;
    }
    if (!customFileName.trim()) {
      Alert.alert('Required', 'Please enter a name for the file.');
      return;
    }

    try {
      setUploading(true);

      let finalUploadUri: string = '';
      let finalMimeType: string = mimeType;
      let finalFileName: string = customFileName.trim();

      if (capturedPages.length > 0) {
        if (convertToPdf || capturedPages.length > 1) {
          finalUploadUri = await compileImagesToPdf(capturedPages);
          finalMimeType = 'application/pdf';
          finalFileName = finalFileName.replace(/\.(jpg|jpeg|png|webp|pdf)$/i, '') + '.pdf';
        } else {
          finalUploadUri = capturedPages[0];
          finalMimeType = 'image/jpeg';
          finalFileName = finalFileName.replace(/\.(jpg|jpeg|png|webp|pdf)$/i, '') + '.jpg';
        }
      } else if (singleDocumentUri) {
        finalUploadUri = singleDocumentUri;
        const originalExt = singleDocumentUri.split('.').pop()?.toLowerCase();
        if (originalExt && originalExt.length <= 5 && !finalFileName.toLowerCase().endsWith(`.${originalExt}`)) {
          finalFileName = `${finalFileName.replace(/\.[a-zA-Z0-9]+$/, '')}.${originalExt}`;
        }

        // Detect MIME type for Excel, Word, PDF, Images, CSV, Text
        const ext = finalFileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') finalMimeType = 'application/pdf';
        else if (ext === 'doc') finalMimeType = 'application/msword';
        else if (ext === 'docx') finalMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (ext === 'xls') finalMimeType = 'application/vnd.ms-excel';
        else if (ext === 'xlsx') finalMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (ext === 'csv') finalMimeType = 'text/csv';
        else if (['jpg', 'jpeg'].includes(ext || '')) finalMimeType = 'image/jpeg';
        else if (ext === 'png') finalMimeType = 'image/png';
        else if (ext === 'webp') finalMimeType = 'image/webp';
        else if (ext === 'txt') finalMimeType = 'text/plain';
      }

      // Read local file as base64 with triple failsafe for Android temporary print cache permissions
      let base64String = '';
      try {
        base64String = await FileSystem.readAsStringAsync(finalUploadUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (readErr) {
        console.warn('Direct read failed, copying to documentDirectory:', readErr);
        try {
          const tempDocPath = `${FileSystem.documentDirectory}temp_upload_${Date.now()}`;
          await FileSystem.copyAsync({ from: finalUploadUri, to: tempDocPath });
          base64String = await FileSystem.readAsStringAsync(tempDocPath, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.deleteAsync(tempDocPath, { idempotent: true }).catch(() => {});
        } catch (copyErr) {
          console.warn('Copy read failed, falling back to fetch blob:', copyErr);
          const resp = await fetch(finalUploadUri);
          const blob = await resp.blob();
          base64String = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              const base64 = dataUrl ? dataUrl.split(',')[1] || '' : '';
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      }

      const cleanBase64 = base64String.replace(/[\r\n\s]/g, '');
      const binaryString = atob(cleanBase64);
      const fileBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        fileBytes[i] = binaryString.charCodeAt(i);
      }

      const fileInfo = await FileSystem.getInfoAsync(finalUploadUri).catch(() => null);
      const computedSize = fileInfo && fileInfo.exists && 'size' in fileInfo ? fileInfo.size : fileBytes.byteLength;

      const storagePath = `${selectedPatientId}/${Date.now()}_${finalFileName.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;

      const { error: storageError } = await supabaseAdmin.storage
        .from('patient-files')
        .upload(storagePath, fileBytes.buffer, { contentType: finalMimeType, upsert: true });

      if (storageError) throw storageError;

      const { data: urlData } = supabaseAdmin.storage
        .from('patient-files')
        .getPublicUrl(storagePath);

      const { error: dbError } = await supabaseAdmin.from('patient_files').insert([
        {
          patient_id: selectedPatientId,
          branch_id: selectedPatient?.branch_id || null,
          file_name: finalFileName,
          title: finalFileName,
          file_url: urlData.publicUrl,
          file_type: finalMimeType,
          file_size: computedSize,
          upload_date: new Date().toISOString().split('T')[0],
        },
      ]);

      if (dbError) throw dbError;

      await AsyncStorage.removeItem(UPLOAD_DRAFT_KEY).catch(() => {});

      // Refresh list of files for this patient
      fetchUploadedFiles(selectedPatientId);

      // Reset form state so user stays on upload screen and can upload more files
      setCapturedPages([]);
      setSingleDocumentUri(null);
      setCustomFileName('');

      Alert.alert(
        'Upload Successful! 🎉',
        `File "${finalFileName}" has been uploaded successfully. You can upload another file or tap Back when finished.`
      );
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Error uploading file.');
    } finally {
      setUploading(false);
    }
  };

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={themeColors.statusBar} backgroundColor={themeColors.bg} />

      {/* Screen Header */}
      <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { color: themeColors.accent }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.text, flex: 1 }]}>Upload Patient File</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          {/* Rapid Digitization Mode Banner */}
          <TouchableOpacity
            style={[styles.draftBanner, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B', marginBottom: 16 }]}
            onPress={() => navigation.navigate('RapidDigitize')}
          >
            <Text style={{ fontSize: 18, marginRight: 6 }}>⚡</Text>
            <Text style={[styles.draftBannerTitle, { color: '#D97706', fontSize: 13, flex: 1 }]}>
              Rapid Digitization Mode
            </Text>
            <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 11 }}>START ›</Text>
            </View>
          </TouchableOpacity>

          {/* Restored Interrupted Draft Banner */}
          {hasRestoredDraft && (
            <View style={[styles.draftBanner, { backgroundColor: themeColors.accentBg, borderColor: themeColors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.draftBannerTitle, { color: themeColors.accent }]}>
                  🔄 Restored Interrupted Upload
                </Text>
                <Text style={[styles.draftBannerSub, { color: themeColors.text }]}>
                  Saved draft restored.
                </Text>
              </View>
              <TouchableOpacity style={styles.clearDraftBtn} onPress={clearDraftState}>
                <Text style={styles.clearDraftText}>Discard</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step 1: Select Patient */}
          <Text style={[styles.stepTitle, { color: themeColors.accent }]}>1. SELECT PATIENT</Text>

          {selectedPatient ? (
            <View style={[styles.selectedBox, { backgroundColor: themeColors.accentBg, borderColor: themeColors.accent }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectedName, { color: themeColors.text }]}>{selectedPatient.full_name}</Text>
                <Text style={[styles.selectedSub, { color: themeColors.accent }]}>
                  ID: {selectedPatient.patient_number || 'N/A'} • File: {selectedPatient.file_number ? selectedPatient.file_number.split('-')[0] : 'NO FILE'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  onPress={handleOpenEditPatient}
                  style={[styles.changeBtn, { backgroundColor: themeColors.bg, borderColor: themeColors.accent }]}
                >
                  <Text style={[styles.changeBtnText, { color: themeColors.accent }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSelectedPatientId('')}
                  style={[styles.changeBtn, { backgroundColor: themeColors.bg, borderColor: '#9CA3AF' }]}
                >
                  <Text style={[styles.changeBtnText, { color: themeColors.subText }]}>Change</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={[styles.searchBox, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.inputBg,
                    borderColor: themeColors.inputBorder,
                    color: themeColors.text,
                  },
                ]}
                placeholder="Type patient name, ID, or file no..."
                placeholderTextColor={themeColors.subText}
                value={patientSearch}
                onChangeText={setPatientSearch}
              />

              {patientSearch.trim().length === 0 ? (
                <Text style={[styles.noResultText, { color: themeColors.subText }]}>
                  Type patient name, ID, or file no to search...
                </Text>
              ) : loading ? (
                <ActivityIndicator color={themeColors.accent} style={{ marginVertical: 8 }} />
              ) : patients.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={[styles.noResultText, { color: themeColors.subText }]}>
                    No matching patients found.
                  </Text>
                  <TouchableOpacity
                    style={styles.addPatientBtn}
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
                    onPress={() => setSelectedPatientId(p.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.patientName, { color: themeColors.text }]}>
                        {p.title ? `${p.title} ` : ''}{p.full_name}
                      </Text>
                      <Text style={[styles.patientIdText, { color: themeColors.subText }]}>
                        ID: {p.patient_number || 'N/A'} • {p.phone || 'No phone'}
                      </Text>
                    </View>
                    <View style={[styles.fileBadge, { backgroundColor: p.file_number ? themeColors.accentBg : themeColors.cardBg }]}>
                      <Text style={[styles.patientFile, { color: p.file_number ? themeColors.accent : themeColors.subText }]}>
                        {p.file_number ? `File: ${p.file_number.split('-')[0]}` : 'NO FILE'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Existing Uploaded Files for Selected Patient */}
          {selectedPatientId ? (
            <View style={{ marginTop: 12, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: themeColors.accent }}>
                  UPLOADED FILES ({uploadedFiles.length})
                </Text>
                {loadingUploadedFiles && <ActivityIndicator size="small" color={themeColors.accent} />}
              </View>

              {uploadedFiles.length === 0 ? (
                <Text style={{ fontSize: 11, color: themeColors.subText, fontStyle: 'italic', marginVertical: 4 }}>
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
                      paddingVertical: 7,
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.text }} numberOfLines={1}>
                        {file.file_name || file.title || 'Patient File'}
                      </Text>
                      <Text style={{ fontSize: 10, color: themeColors.subText, marginTop: 2 }}>
                        Uploaded: {file.upload_date || (file.created_at ? new Date(file.created_at).toLocaleDateString() : 'N/A')}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => handleOpenRenameModal(file)}
                        style={{
                          backgroundColor: themeColors.accentBg,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: themeColors.accent,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: themeColors.accent }}>Rename</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleDeleteFile(file)}
                        style={{
                          backgroundColor: '#FEE2E2',
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: '#EF4444',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {/* Step 2: Choose or Scan Document */}
          <Text style={[styles.stepTitle, { color: themeColors.accent, marginTop: 16 }]}>
            2. CHOOSE OR SCAN FILE
          </Text>

          <View style={styles.tileRow}>
            <TouchableOpacity
              style={[styles.tile, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={openSmartScan}
            >
              <Text style={[styles.tileText, { color: themeColors.text, fontWeight: '700' }]}>Smart Scan</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.tile, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]} onPress={takePhotoWithCamera}>
              <Text style={[styles.tileText, { color: themeColors.text }]}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.tile, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]} onPress={pickImageFromGallery}>
              <Text style={[styles.tileText, { color: themeColors.text }]}>Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.tile, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]} onPress={pickDocument}>
              <Text style={[styles.tileText, { color: themeColors.text }]}>Pick File</Text>
            </TouchableOpacity>
          </View>

          {/* Multi-Page Captured Photos Thumbnail Carousel */}
          {capturedPages.length > 0 && (
            <View style={[styles.pagesContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
              <View style={styles.pagesHeader}>
                <Text style={[styles.pagesTitle, { color: themeColors.text }]}>
                  Captured Pages ({capturedPages.length})
                </Text>
                {capturedPages.length > 1 && (
                  <View style={styles.pdfBadge}>
                    <Text style={styles.pdfBadgeText}>1 Combined PDF</Text>
                  </View>
                )}
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailRow}>
                {capturedPages.map((uri, index) => (
                  <View key={index} style={styles.thumbnailItem}>
                    <Image source={{ uri }} style={styles.thumbnailImage} />
                    <Text style={styles.pageLabel}>Page {index + 1}</Text>
                    <TouchableOpacity
                      style={styles.removePageBtn}
                      onPress={() => removeCapturedPage(index)}
                    >
                      <Text style={styles.removePageText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>

              {/* Convert to PDF Toggle Switch */}
              <View style={[styles.pdfToggleRow, { borderTopColor: themeColors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pdfToggleLabel, { color: themeColors.text }]}>
                    📄 Convert & Combine Images to PDF
                  </Text>
                </View>
                <Switch
                  value={convertToPdf}
                  onValueChange={setConvertToPdf}
                  trackColor={{ false: '#E5E7EB', true: '#059669' }}
                  thumbColor={convertToPdf ? '#10B981' : '#9CA3AF'}
                />
              </View>
            </View>
          )}

          {/* Single Document Preview */}
          {singleDocumentUri && (
            <View style={[styles.previewCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
              <Text style={{ fontSize: 24, marginBottom: 4 }}>📄</Text>
              <Text style={[styles.previewName, { color: themeColors.text }]} numberOfLines={1}>
                {customFileName}
              </Text>
            </View>
          )}

          {/* Step 3: Rename File Before Uploading */}
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.stepTitle, { color: themeColors.accent }]}>
              3. RENAME FILE BEFORE UPLOADING
            </Text>

            {/* Document type quick-pick */}
            <Text style={[styles.docTypeLabel, { color: themeColors.subText }]}>DOCUMENT TYPE:</Text>
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
                      customFileName.startsWith(t) && {
                        backgroundColor: themeColors.accent,
                        borderColor: themeColors.accent,
                      },
                    ]}
                    onPress={() => setCustomFileName(t)}
                  >
                    <Text style={[
                      styles.docTypeChipText,
                      { color: customFileName.startsWith(t) ? '#fff' : themeColors.text },
                    ]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TextInput
              style={[
                styles.renameInput,
                {
                  backgroundColor: themeColors.inputBg,
                  borderColor: themeColors.inputBorder,
                  color: themeColors.text,
                },
              ]}
              placeholder="e.g. X-Ray Report 2026.pdf"
              placeholderTextColor={themeColors.subText}
              value={customFileName}
              onChangeText={setCustomFileName}
            />
          </View>


          {/* Submit Upload Button */}
          <TouchableOpacity
            style={[
              styles.uploadBtn,
              { backgroundColor: themeColors.accent },
              (uploading || (capturedPages.length === 0 && !singleDocumentUri) || !selectedPatientId) && {
                opacity: 0.5,
              },
            ]}
            onPress={handleUpload}
            disabled={uploading || (capturedPages.length === 0 && !singleDocumentUri) || !selectedPatientId}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.uploadBtnText}>
                {capturedPages.length > 1
                  ? `Combine ${capturedPages.length} Pages & Upload PDF`
                  : 'Upload File'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal 1: Edit Patient Details Modal */}
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

      {/* Modal 2: Rename Uploaded File Modal */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
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
                onPress={() => setRenameModalVisible(false)}
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

      {/* Add New Patient Modal */}
      <Modal
        visible={showAddPatient}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddPatient(false)}
      >
        <View style={styles.addPatientOverlay}>
          <View style={[styles.addPatientCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 2 }}>Add New Patient</Text>
            <Text style={{ fontSize: 12, color: themeColors.subText, marginBottom: 14 }}>Quick registration — fill in available details</Text>

            <Text style={[styles.addPatientLabel, { color: themeColors.subText }]}>TITLE</Text>
            <View style={styles.addPatientTitleRow}>
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

            <Text style={[styles.addPatientLabel, { color: themeColors.subText }]}>FULL NAME *</Text>
            <TextInput
              style={[styles.addPatientInput, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              value={newPatientName}
              onChangeText={setNewPatientName}
              placeholder="e.g. John Doe"
              placeholderTextColor={themeColors.subText}
            />

            <Text style={[styles.addPatientLabel, { color: themeColors.subText }]}>FILE NUMBER</Text>
            <TextInput
              style={[styles.addPatientInput, { backgroundColor: themeColors.inputBg, borderColor: fileNoTaken ? '#EF4444' : themeColors.inputBorder, borderWidth: fileNoTaken ? 2 : 1, color: themeColors.text, marginBottom: fileNoTaken ? 2 : 12 }]}
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

            <Text style={[styles.addPatientLabel, { color: themeColors.subText }]}>PHONE</Text>
            <TextInput
              style={[styles.addPatientInput, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder, color: themeColors.text }]}
              value={newPatientPhone}
              onChangeText={setNewPatientPhone}
              placeholder="e.g. +263 77 123 4567"
              placeholderTextColor={themeColors.subText}
              keyboardType="phone-pad"
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setShowAddPatient(false)}
                style={{ flex: 1, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: themeColors.border, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: themeColors.subText }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddNewPatient}
                disabled={savingNewPatient || fileNoTaken || checkingFileNo}
                style={{ flex: 2, paddingVertical: 11, borderRadius: 8, backgroundColor: (savingNewPatient || fileNoTaken || checkingFileNo) ? '#9CA3AF' : themeColors.accent, alignItems: 'center' }}
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
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dismissBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  dismissText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 350,
  },
  addPatientBtn: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#16A34A',
  },
  addPatientBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  addPatientOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addPatientCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  addPatientLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  addPatientTitleRow: {
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
  addPatientInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 12,
  },
  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    marginBottom: 12,
    gap: 8,
  },
  draftBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  draftBannerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  clearDraftBtn: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  clearDraftText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  stepTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  selectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
  },
  selectedName: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectedSub: {
    fontSize: 11,
    marginTop: 2,
  },
  changeBtn: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  searchBox: {
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  noResultText: {
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 10,
  },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  patientName: {
    fontSize: 13,
    fontWeight: '600',
  },
  patientIdText: {
    fontSize: 11,
    marginTop: 1,
  },
  fileBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  patientFile: {
    fontSize: 11,
    fontWeight: '700',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  tileIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tileText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  tileAi: {
    position: 'relative',
  },
  tileAiBadge: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },

  pagesContainer: {
    marginTop: 12,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  pagesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pagesTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  pdfBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pdfBadgeText: {
    fontSize: 10,
    color: '#00A859',
    fontWeight: '700',
  },
  thumbnailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  thumbnailItem: {
    position: 'relative',
    marginRight: 10,
    alignItems: 'center',
  },
  thumbnailImage: {
    width: 64,
    height: 80,
    borderRadius: 6,
  },
  pageLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  removePageBtn: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#DC2626',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePageText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  pdfToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 4,
  },
  pdfToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  previewCard: {
    marginTop: 12,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  previewName: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Document type chips
  docTypeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  docTypeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  docTypeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  docTypeChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  renameInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '600',
  },
  uploadBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 18,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
