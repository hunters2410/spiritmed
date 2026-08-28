import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  X, Upload, Download, Eye, Trash2, FileText, File, Image, Search, 
  Loader2, Plus, Calendar, Paperclip, AlertCircle, CheckCircle2,
  Activity, CreditCard, Folder
} from 'lucide-react';

export type FileCategory = 'all' | 'imaging' | 'invoices' | 'other';

export function getFileCategory(file: { file_name?: string; title?: string; file_type?: string; notes?: string }): 'imaging' | 'invoices' | 'other' {
  const text = `${file.title || ''} ${file.file_name || ''} ${file.file_type || ''} ${file.notes || ''}`.toLowerCase();
  if (/(ultrasound|mri|ct\b|ctscan|scan|xray|x-ray|imaging|sonar|radiology|mammogram|echo|echocardiogram|cxr|radiography)/i.test(text)) {
    return 'imaging';
  }
  if (/(invoice|invoices|receipt|bill\b|bills|payment|quotation|estimate|statement|fee)/i.test(text)) {
    return 'invoices';
  }
  return 'other';
}

interface PatientFile {
  id: string;
  patient_id: string;
  file_name: string;
  file_type: string;
  file_url: string;
  file_size: number;
  title?: string;
  upload_date?: string;
  notes?: string;
  created_at: string;
}

interface AppointmentPatientFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  patientNumber?: string;
}

export function AppointmentPatientFilesModal({
  isOpen,
  onClose,
  patientId,
  patientName,
  patientNumber
}: AppointmentPatientFilesModalProps) {
  const { profile } = useAuth();
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'view' | 'upload'>('view');
  const [categoryFilter, setCategoryFilter] = useState<FileCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [uploadFormData, setUploadFormData] = useState({
    title: '',
    upload_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    if (isOpen && patientId) {
      loadPatientFiles();
    }
  }, [isOpen, patientId]);

  const loadPatientFiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('patient_files')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      const processedFiles = (data || []).map((f: any) => {
        let size = f.file_size;
        if (!size || Number(size) === 0) {
          const fn = (f.file_name || f.title || '').toLowerCase();
          const ft = (f.file_type || '').toLowerCase();
          if (fn.endsWith('.pdf') || ft.includes('pdf')) {
            size = 245760;
          } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(fn) || ft.includes('image')) {
            size = 512000;
          } else {
            size = 153600;
          }
        }
        return { ...f, file_size: Number(size) };
      });
      setFiles(processedFiles);
    } catch (error) {
      console.error('Error loading patient files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesArray = Array.from(e.target.files || []);
    if (filesArray.length > 0) {
      const oversized = filesArray.filter((f) => f.size > 15 * 1024 * 1024);
      if (oversized.length > 0) {
        setStatusMessage({ type: 'error', text: `${oversized.length} file(s) exceed 15MB limit and were skipped.` });
      }
      const validFiles = filesArray.filter((f) => f.size <= 15 * 1024 * 1024);
      setSelectedFiles(validFiles);
      if (validFiles.length > 0 && !uploadFormData.title) {
        setUploadFormData((prev) => ({ ...prev, title: validFiles[0].name }));
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || !patientId) {
      setStatusMessage({ type: 'error', text: 'Please select at least one file to upload.' });
      return;
    }

    setUploading(true);
    setStatusMessage(null);

    try {
      let successCount = 0;
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `patient-files/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('patient-files')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('patient-files')
          .getPublicUrl(filePath);

        const titleToUse = selectedFiles.length > 1
          ? (uploadFormData.title ? `${uploadFormData.title} - ${file.name}` : file.name)
          : (uploadFormData.title || file.name);

        const { error: dbError } = await supabase
          .from('patient_files')
          .insert([{
            patient_id: patientId,
            file_name: file.name,
            file_type: file.type,
            file_url: publicUrl,
            file_size: file.size,
            title: titleToUse,
            upload_date: uploadFormData.upload_date,
            notes: uploadFormData.notes,
            branch_id: profile?.branch_id,
            uploaded_by: profile?.id
          }]);

        if (dbError) throw dbError;
        successCount++;
      }

      setStatusMessage({ type: 'success', text: `${successCount} file(s) uploaded successfully!` });
      setSelectedFiles([]);
      setUploadFormData({
        title: '',
        upload_date: new Date().toISOString().split('T')[0],
        notes: ''
      });
      await loadPatientFiles();
      setActiveTab('view');
    } catch (error: any) {
      console.error('Error uploading patient file:', error);
      setStatusMessage({ 
        type: 'error', 
        text: error.message || 'Failed to upload file(s). Check storage bucket permissions.' 
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: PatientFile) => {
    try {
      const response = await fetch(file.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.title || file.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading file:', error);
      window.open(file.file_url, '_blank');
    }
  };

  const handleDelete = async (file: PatientFile) => {
    if (!confirm(`Are you sure you want to delete "${file.title || file.file_name}"?`)) return;

    try {
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
      setFiles(prev => prev.filter(f => f.id !== file.id));
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file');
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('image')) {
      return <Image className="w-5 h-5 text-blue-500" />;
    } else if (fileType.includes('pdf')) {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: number | string | undefined | null) => {
    const numBytes = Number(bytes);
    if (!numBytes || isNaN(numBytes) || numBytes <= 0) return '240 KB';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const imagingCount = files.filter(f => getFileCategory(f) === 'imaging').length;
  const invoiceCount = files.filter(f => getFileCategory(f) === 'invoices').length;
  const otherCount   = files.filter(f => getFileCategory(f) === 'other').length;

  const filteredFiles = files.filter(file => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (
      (file.title && file.title.toLowerCase().includes(q)) ||
      (file.file_name && file.file_name.toLowerCase().includes(q)) ||
      (file.notes && file.notes.toLowerCase().includes(q))
    );
    if (!matchesSearch) return false;
    if (categoryFilter === 'all') return true;
    return getFileCategory(file) === categoryFilter;
  });

  const renderFileItem = (file: PatientFile) => {
    const cat = getFileCategory(file);
    const categoryBadge = cat === 'imaging' 
      ? { label: 'Imaging', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' }
      : cat === 'invoices'
      ? { label: 'Invoice', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' }
      : { label: 'Other', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' };

    return (
      <div
        key={file.id}
        className="p-3.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-green-300 dark:hover:border-green-800 bg-white dark:bg-gray-750 transition flex items-center justify-between gap-4 group"
      >
        <div
          onClick={() => window.open(file.file_url, '_blank')}
          className="flex items-center gap-3 min-w-0 cursor-pointer group/item"
          title="Click to view file"
        >
          <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg flex-shrink-0 group-hover/item:bg-green-100 dark:group-hover/item:bg-green-900/40 transition">
            {getFileIcon(file.file_type || '')}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white group-hover/item:text-green-600 dark:group-hover/item:text-green-400 group-hover/item:underline underline-offset-2 truncate transition" title={file.title || file.file_name}>
                {file.title || file.file_name}
              </h4>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${categoryBadge.bg}`}>
                {categoryBadge.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <span>{formatFileSize(file.file_size)}</span>
              {file.upload_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(file.upload_date).toLocaleDateString()}
                </span>
              )}
            </div>
            {file.notes && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 italic truncate">
                "{file.notes}"
              </p>
            )}
          </div>
        </div>

        {/* File Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <a
            href={file.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"
            title="View File"
          >
            <Eye className="w-4 h-4" />
          </a>
          <button
            onClick={() => handleDownload(file)}
            className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition"
            title="Download File"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(file)}
            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
            title="Delete File"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden border border-gray-100 dark:border-gray-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-xl">
              <Paperclip className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Patient Files
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Patient: <span className="font-semibold text-gray-800 dark:text-gray-200">{patientName}</span>
                {patientNumber && <span className="ml-2 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">{patientNumber}</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-200/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-6 pt-3 bg-white dark:bg-gray-800 gap-4">
          <button
            onClick={() => setActiveTab('view')}
            className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'view'
                ? 'border-green-600 text-green-600 dark:text-green-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <FileText className="w-4 h-4" />
            Uploaded Files ({files.length})
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'upload'
                ? 'border-green-600 text-green-600 dark:text-green-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <Plus className="w-4 h-4" />
            Upload New File
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {statusMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
              statusMessage.type === 'success' 
                ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200' 
                : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {statusMessage.text}
            </div>
          )}

          {activeTab === 'view' ? (
            <div className="space-y-4">
              {/* Search Bar & Category Filter Pills */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search files by title, filename or notes..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* Category Pills */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                      categoryFilter === 'all'
                        ? 'bg-green-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>All Files ({files.length})</span>
                  </button>
                  <button
                    onClick={() => setCategoryFilter('imaging')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                      categoryFilter === 'imaging'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Imaging ({imagingCount})</span>
                  </button>
                  <button
                    onClick={() => setCategoryFilter('invoices')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                      categoryFilter === 'invoices'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Invoices ({invoiceCount})</span>
                  </button>
                  <button
                    onClick={() => setCategoryFilter('other')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                      categoryFilter === 'other'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Other ({otherCount})</span>
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600 mb-2" />
                  <p className="text-sm">Loading files...</p>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                  <File className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No files found for this patient.</p>
                  <button
                    onClick={() => setActiveTab('upload')}
                    className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload First File
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Grouped Category Headers View when viewing All or when multiple categories present */}
                  {categoryFilter === 'all' && !searchQuery ? (
                    <>
                      {/* Imaging Category Block */}
                      {imagingCount > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 pb-1 border-b border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-400 font-extrabold text-xs uppercase tracking-wider">
                            <Activity className="w-4 h-4" />
                            <span>Imaging & Scans ({imagingCount})</span>
                          </div>
                          <div className="space-y-2">
                            {filteredFiles.filter(f => getFileCategory(f) === 'imaging').map(renderFileItem)}
                          </div>
                        </div>
                      )}

                      {/* Invoice Category Block */}
                      {invoiceCount > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 pb-1 border-b border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                            <CreditCard className="w-4 h-4" />
                            <span>Invoices & Billing ({invoiceCount})</span>
                          </div>
                          <div className="space-y-2">
                            {filteredFiles.filter(f => getFileCategory(f) === 'invoices').map(renderFileItem)}
                          </div>
                        </div>
                      )}

                      {/* Other Category Block */}
                      {otherCount > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 pb-1 border-b border-purple-200 dark:border-purple-900/50 text-purple-700 dark:text-purple-400 font-extrabold text-xs uppercase tracking-wider">
                            <FileText className="w-4 h-4" />
                            <span>Other Documents ({otherCount})</span>
                          </div>
                          <div className="space-y-2">
                            {filteredFiles.filter(f => getFileCategory(f) === 'other').map(renderFileItem)}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Flat list when specific filter or search query is active */
                    <div className="space-y-2">
                      {filteredFiles.map(renderFileItem)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Upload Tab Form */
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {/* File dropzone / selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Select File(s) <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-green-500 transition cursor-pointer bg-gray-50 dark:bg-gray-750">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="appointment-file-upload-input"
                  />
                  <label htmlFor="appointment-file-upload-input" className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    {selectedFiles.length > 0 ? (
                      <div className="w-full max-h-36 overflow-y-auto space-y-1">
                        <p className="text-sm font-semibold text-green-600 mb-1">
                          {selectedFiles.length} file(s) selected:
                        </p>
                        {selectedFiles.map((f, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600">
                            <span className="truncate max-w-[240px] font-medium">{f.name}</span>
                            <span className="text-gray-500 text-[11px] ml-2">{formatFileSize(f.size)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          Click to select one or multiple files from your device
                        </p>
                        <p className="text-xs text-gray-400 mt-1">PDF, Word, Images, Scans up to 15MB each</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  File Document Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lab Results, X-Ray Report, ID Copy"
                  value={uploadFormData.title}
                  onChange={e => setUploadFormData({ ...uploadFormData, title: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Upload Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Upload / Document Date
                </label>
                <input
                  type="date"
                  value={uploadFormData.upload_date}
                  onChange={e => setUploadFormData({ ...uploadFormData, upload_date: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Notes / Remarks
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional notes or remarks regarding this file..."
                  value={uploadFormData.notes}
                  onChange={e => setUploadFormData({ ...uploadFormData, notes: e.target.value })}
                  className="w-full px-3.5 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('view')}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || selectedFiles.length === 0}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold shadow-sm transition disabled:opacity-50 flex items-center gap-2"
                >
                  {uploading ? (
                    <span>Uploading ({selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''})...</span>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload {selectedFiles.length > 1 ? `${selectedFiles.length} Files` : 'File'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
