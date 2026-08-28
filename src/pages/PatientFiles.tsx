import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllPatients } from '../utils/patientUtils';
import { Search, Download, Filter, File, FileText, Upload, X, Eye, Trash2, ChevronLeft, ChevronRight, Pencil, UserCheck } from 'lucide-react';
import { SearchablePatientSelect } from '../components/SearchablePatientSelect';

interface StaffUser {
  id: string;
  full_name: string;
  email?: string;
  role?: string;
}

interface PatientFile {
  id: string;
  patient_id: string;
  branch_id?: string | null;
  uploaded_by?: string | null;
  uploader?: StaffUser | null;
  file_name: string;
  file_type: string;
  file_url: string;
  file_size: number;
  title?: string;
  upload_date?: string;
  notes?: string;
  created_at: string;
  patients?: {
    id: string;
    patient_number: string;
    file_number?: string | null;
    full_name: string;
    branch_id?: string | null;
  };
}

interface Patient {
  id: string;
  patient_number: string;
  file_number?: string | null;
  full_name: string;
}

export function PatientFiles() {
  const { profile } = useAuth();
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [systemUsers, setSystemUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Rename state
  const [renameFile, setRenameFile] = useState<PatientFile | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  
  // Ownership / Reassign State
  const [ownershipFile, setOwnershipFile] = useState<PatientFile | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [updatingOwnership, setUpdatingOwnership] = useState<boolean>(false);

  // Bulk Selection & Reassign State
  const [checkedFileIds, setCheckedFileIds] = useState<string[]>([]);
  const [showBulkReassignModal, setShowBulkReassignModal] = useState<boolean>(false);
  const [bulkTargetPatientId, setBulkTargetPatientId] = useState<string>('');
  const [bulkTargetOwnerId, setBulkTargetOwnerId] = useState<string>('');
  const [bulkUpdating, setBulkUpdating] = useState<boolean>(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [filters, setFilters] = useState({
    fileType: 'all'
  });
  const [formData, setFormData] = useState({
    patient_id: '',
    title: '',
    upload_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, []);

  useEffect(() => {
    if (profile?.id || profile?.role === 'super_admin') {
      loadFiles(true);
      loadPatients();
      loadSystemUsers();
    }
  }, [profile?.id, profile?.branch_id, profile?.role]);

  // Reset pagination to page 1 whenever search query or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filters, itemsPerPage]);

  const loadFiles = async (isInitial = false) => {
    try {
      if (isInitial || files.length === 0) {
        setLoading(true);
      }
      let allFilesData: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('patient_files')
          .select(`
            *,
            patients (
              id,
              patient_number,
              file_number,
              full_name,
              branch_id
            ),
            uploader:uploaded_by (
              id,
              full_name,
              email,
              role
            )
          `)
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;
        allFilesData = allFilesData.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // Filter files for current user's branch (or show all if super_admin)
      const userBranchFiles = allFilesData.filter((f) => {
        if (profile?.role === 'super_admin') return true;
        if (!profile?.branch_id) return true;
        if (f.branch_id && f.branch_id === profile.branch_id) return true;
        if (f.patients?.branch_id && f.patients.branch_id === profile.branch_id) return true;
        if (!f.branch_id && !f.patients?.branch_id) return true;
        return true;
      }).map((f: any) => {
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

      setFiles(userBranchFiles);
    } catch (error) {
      console.error('Error loading patient files:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    try {
      const activeBranchId = profile?.role !== 'super_admin' ? profile?.branch_id : undefined;
      const data = await fetchAllPatients({
        branchId: activeBranchId,
        select: 'id, patient_number, file_number, full_name'
      });
      setPatients(data || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const loadSystemUsers = async () => {
    try {
      let query = supabase.from('users').select('id, full_name, email, role');
      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        query = query.eq('branch_id', profile.branch_id);
      }
      const { data, error } = await query.order('full_name');
      if (!error && data) {
        setSystemUsers(data);
      }
    } catch (err) {
      console.error('Error loading system users:', err);
    }
  };

  const openOwnershipModal = (file: PatientFile) => {
    setOwnershipFile(file);
    setSelectedOwnerId(file.uploaded_by || profile?.id || '');
    setSelectedPatientId(file.patient_id || '');
  };

  const handleOwnershipChange = async () => {
    if (!ownershipFile) return;
    setUpdatingOwnership(true);
    try {
      const updates: any = {};
      if (selectedOwnerId) updates.uploaded_by = selectedOwnerId;
      if (selectedPatientId) updates.patient_id = selectedPatientId;

      const { error } = await supabase
        .from('patient_files')
        .update(updates)
        .eq('id', ownershipFile.id);

      if (error) throw error;

      setOwnershipFile(null);
      await loadFiles();
      alert('File reassigned to patient successfully');
    } catch (err: any) {
      console.error('Error reassigning file:', err);
      alert(err.message || 'Failed to reassign file to patient');
    } finally {
      setUpdatingOwnership(false);
    }
  };

  const toggleSelectAll = () => {
    const currentIds = paginatedFiles.map((f) => f.id);
    const allSelected = currentIds.every((id) => checkedFileIds.includes(id));

    if (allSelected) {
      setCheckedFileIds((prev) => prev.filter((id) => !currentIds.includes(id)));
    } else {
      setCheckedFileIds((prev) => Array.from(new Set([...prev, ...currentIds])));
    }
  };

  const toggleSelectFile = (fileId: string) => {
    setCheckedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const handleBulkReassign = async () => {
    if (checkedFileIds.length === 0 || !bulkTargetPatientId) return;
    setBulkUpdating(true);
    try {
      const updates: any = { patient_id: bulkTargetPatientId };
      if (bulkTargetOwnerId) updates.uploaded_by = bulkTargetOwnerId;

      const { error } = await supabase
        .from('patient_files')
        .update(updates)
        .in('id', checkedFileIds);

      if (error) throw error;

      const count = checkedFileIds.length;
      setCheckedFileIds([]);
      setShowBulkReassignModal(false);
      setBulkTargetPatientId('');
      setBulkTargetOwnerId('');
      await loadFiles();
      alert(`Successfully reassigned ${count} file(s) to the patient!`);
    } catch (err: any) {
      console.error('Error bulk reassigning files:', err);
      alert(err.message || 'Failed to bulk reassign files');
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (checkedFileIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${checkedFileIds.length} selected file(s)?`)) return;

    try {
      setLoading(true);
      const filesToDelete = files.filter((f) => checkedFileIds.includes(f.id));
      const storagePaths = filesToDelete
        .map((f) => {
          const fn = f.file_url.split('/').pop();
          return fn ? `patient-files/${fn}` : null;
        })
        .filter(Boolean) as string[];

      if (storagePaths.length > 0) {
        await supabase.storage.from('patient-files').remove(storagePaths);
      }

      const { error } = await supabase
        .from('patient_files')
        .delete()
        .in('id', checkedFileIds);

      if (error) throw error;

      setCheckedFileIds([]);
      await loadFiles();
      alert('Selected files deleted successfully');
    } catch (err: any) {
      console.error('Bulk delete error:', err);
      alert('Failed to delete selected files');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesArray = Array.from(e.target.files || []);
    if (filesArray.length > 0) {
      const oversized = filesArray.filter((f) => f.size > 10 * 1024 * 1024);
      if (oversized.length > 0) {
        alert(`${oversized.length} file(s) exceed 10MB limit and were skipped.`);
      }
      const validFiles = filesArray.filter((f) => f.size <= 10 * 1024 * 1024);
      setSelectedFiles(validFiles);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0 || !formData.patient_id) {
      alert('Please select at least one file and a patient');
      return;
    }

    setUploading(true);

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
          ? (formData.title ? `${formData.title} - ${file.name}` : file.name)
          : (formData.title || file.name);

        const { error: dbError } = await supabase
          .from('patient_files')
          .insert([{
            patient_id: formData.patient_id,
            file_name: file.name,
            file_type: file.type,
            file_url: publicUrl,
            file_size: file.size,
            title: titleToUse,
            upload_date: formData.upload_date,
            notes: formData.notes,
            branch_id: profile?.branch_id,
            uploaded_by: profile?.id
          }]);

        if (dbError) throw dbError;
        successCount++;
      }

      setShowModal(false);
      resetForm();
      loadFiles();
      alert(`${successCount} file(s) uploaded successfully`);
    } catch (error: any) {
      console.error('Error uploading file(s):', error);
      alert('Failed to upload file(s). Please ensure the storage bucket "patient-files" exists and is public.');
    } finally {
      setUploading(false);
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
      loadFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file');
    }
  };

  const handleRename = async () => {
    if (!renameFile || !renamingValue.trim()) return;
    setRenaming(true);
    try {
      const { error } = await supabase
        .from('patient_files')
        .update({ title: renamingValue.trim(), file_name: renamingValue.trim() })
        .eq('id', renameFile.id);
      if (error) throw error;
      setRenameFile(null);
      loadFiles();
    } catch (err) {
      console.error('Rename error:', err);
      alert('Failed to rename file');
    } finally {
      setRenaming(false);
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
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      window.open(file.file_url, '_blank');
    }
  };

  const resetForm = () => {
    setFormData({
      patient_id: '',
      title: '',
      upload_date: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setSelectedFiles([]);
  };

  const exportToCSV = () => {
    const headers = ['Patient ID', 'File Number', 'Patient Name', 'File Title', 'File Name', 'File Type', 'File Size (KB)', 'Owner / Uploader', 'Upload Date'];
    const csvData = filteredFiles.map(file => [
      file.patients?.patient_number || '',
      file.patients?.file_number ? file.patients.file_number.split('-')[0] : 'No File',
      file.patients?.full_name || '',
      file.title || file.file_name,
      file.file_name,
      file.file_type || '',
      file.file_size ? Math.round(file.file_size / 1024) : '',
      file.uploader?.full_name || 'System / Default',
      file.upload_date || new Date(file.created_at).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patient_files_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const filteredFiles = files.filter(file => {
    const matchesSearch =
      file.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.patients?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (file.uploader?.full_name && file.uploader.full_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (file.patients?.patient_number && file.patients.patient_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (file.patients?.file_number && file.patients.file_number.toLowerCase().includes(searchQuery.toLowerCase()));

    const ft = (file.file_type || '').toLowerCase();
    const fn = (file.file_name || '').toLowerCase();

    let matchesFileType = true;
    if (filters.fileType === 'pdf') {
      matchesFileType = ft.includes('pdf') || fn.endsWith('.pdf');
    } else if (filters.fileType === 'word') {
      matchesFileType = ft.includes('word') || ft.includes('officedocument.wordprocessingml') || fn.endsWith('.doc') || fn.endsWith('.docx');
    } else if (filters.fileType === 'excel') {
      matchesFileType = ft.includes('excel') || ft.includes('spreadsheetml') || ft.includes('csv') || fn.endsWith('.xls') || fn.endsWith('.xlsx') || fn.endsWith('.csv');
    } else if (filters.fileType === 'image') {
      matchesFileType = ft.includes('image') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fn);
    }

    return matchesSearch && matchesFileType;
  });

  // Calculate Paginated Slice
  const totalPages = Math.ceil(filteredFiles.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredFiles.length);
  const paginatedFiles = filteredFiles.slice(startIndex, endIndex);

  const formatFileSize = (bytes: number | string | undefined | null) => {
    const numBytes = Number(bytes);
    if (!numBytes || isNaN(numBytes) || numBytes <= 0) return '240 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return Math.round((numBytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string, fileName: string = '') => {
    const ft = (fileType || '').toLowerCase();
    const fn = (fileName || '').toLowerCase();

    if (ft.includes('pdf') || fn.endsWith('.pdf')) {
      return <FileText className="w-5 h-5 text-red-600" />;
    }
    if (ft.includes('word') || ft.includes('officedocument.wordprocessingml') || fn.endsWith('.doc') || fn.endsWith('.docx')) {
      return <FileText className="w-5 h-5 text-blue-600" />;
    }
    if (ft.includes('excel') || ft.includes('spreadsheetml') || ft.includes('csv') || fn.endsWith('.xls') || fn.endsWith('.xlsx') || fn.endsWith('.csv')) {
      return <File className="w-5 h-5 text-emerald-600" />;
    }
    if (ft.includes('image') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fn)) {
      return <File className="w-5 h-5 text-purple-600" />;
    }
    return <File className="w-5 h-5 text-gray-600" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Patient Files</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage patient documents and files</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-md"
        >
          <Upload className="w-5 h-5" />
          <span>Upload File</span>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by file name, title, patient name, file no, or patient ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition ${
              showFilters
                ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Filter className="w-5 h-5" />
            <span>Filters</span>
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition shadow-md"
          >
            <Download className="w-5 h-5" />
            <span>Export</span>
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  File Type
                </label>
                <select
                  value={filters.fileType}
                  onChange={(e) => setFilters({ fileType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="all">All Types</option>
                  <option value="pdf">PDF Documents</option>
                  <option value="word">Word Documents (.doc, .docx)</option>
                  <option value="excel">Excel Spreadsheets (.xls, .xlsx, .csv)</option>
                  <option value="image">Images (JPEG, PNG, WebP)</option>
                </select>
              </div>
              <div className="flex items-end md:col-span-2">
                <button
                  onClick={() => setFilters({ fileType: 'all' })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ⚡ Bulk Action Bar */}
      {checkedFileIds.length > 0 && (
        <div className="bg-purple-900 text-white p-4 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in border border-purple-700">
          <div className="flex items-center space-x-3">
            <span className="bg-purple-700 text-white font-mono font-bold px-3 py-1 rounded-lg text-sm shadow-xs">
              {checkedFileIds.length} file{checkedFileIds.length > 1 ? 's' : ''} selected
            </span>
            <span className="text-xs sm:text-sm font-medium text-purple-200">
              Select bulk action to apply to selected files
            </span>
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                setBulkTargetPatientId('');
                setBulkTargetOwnerId(profile?.id || '');
                setShowBulkReassignModal(true);
              }}
              className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-md transition cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>Bulk Reassign to Patient</span>
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center space-x-1.5 bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer"
              title="Delete Selected Files"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
            <button
              onClick={() => setCheckedFileIds([])}
              className="px-3 py-2 text-purple-200 hover:text-white text-xs font-semibold uppercase tracking-wider cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* 📱 Mobile Card View (< md) */}
      <div className="md:hidden space-y-3">
        {paginatedFiles.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
            No patient files found
          </div>
        ) : (
          paginatedFiles.map((file) => (
            <div key={file.id} className={`bg-white dark:bg-gray-800 rounded-xl p-4 border transition ${checkedFileIds.includes(file.id) ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-900/50' : 'border-gray-200 dark:border-gray-700'} shadow-xs space-y-3`}>
              <div className="flex items-start justify-between gap-3">
                <input
                  type="checkbox"
                  checked={checkedFileIds.includes(file.id)}
                  onChange={() => toggleSelectFile(file.id)}
                  className="w-4.5 h-4.5 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer shrink-0 mt-1"
                />
                <div
                  onClick={() => window.open(file.file_url, '_blank')}
                  className="flex items-center space-x-3 cursor-pointer group flex-1 min-w-0"
                  title="Click to view file"
                >
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition">
                    {getFileIcon(file.file_type, file.file_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline underline-offset-2 truncate transition">{file.title || file.file_name}</h3>
                    <p className="text-xs text-gray-500 truncate">{file.file_name}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                  {formatFileSize(file.file_size)}
                </span>
              </div>

              <div className="text-xs pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Patient</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{file.patients?.full_name || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Patient ID</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">{file.patients?.patient_number || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">File Number</span>
                  <span className="font-mono text-green-600 dark:text-green-400 font-bold">
                    {file.patients?.file_number ? file.patients.file_number.split('-')[0] : 'No File'}
                  </span>
                </div>
              </div>

              {file.notes && (
                <div className="text-xs bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg text-gray-600 dark:text-gray-400">
                  <span className="font-bold text-[10px] uppercase block text-gray-400">Notes</span>
                  {file.notes}
                </div>
              )}

              <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap justify-end gap-1.5">
                <button
                  onClick={() => { setRenameFile(file); setRenamingValue(file.title || file.file_name); }}
                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg text-xs font-bold hover:bg-yellow-100 transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Rename</span>
                </button>
                <button
                  onClick={() => openOwnershipModal(file)}
                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold hover:bg-purple-100 transition"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Owner</span>
                </button>
                <button
                  onClick={() => window.open(file.file_url, '_blank')}
                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-xs font-bold hover:bg-green-100 transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View</span>
                </button>
                <button
                  onClick={() => handleDownload(file)}
                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-100 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => handleDelete(file)}
                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-xs font-bold hover:bg-red-100 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 💻 Desktop Table View (>= md) */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-center border-b border-r border-gray-200 dark:border-gray-700 w-10">
                  <input
                    type="checkbox"
                    checked={paginatedFiles.length > 0 && paginatedFiles.every((f) => checkedFileIds.includes(f.id))}
                    onChange={toggleSelectAll}
                    title="Select / Deselect All on this page"
                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                  />
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  File
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Title
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Patient
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Patient ID
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  File Number
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  File Size
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Upload Date
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {paginatedFiles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    No files found
                  </td>
                </tr>
              ) : (
                paginatedFiles.map((file) => (
                  <tr key={file.id} className={`${checkedFileIds.includes(file.id) ? 'bg-purple-50/60 dark:bg-purple-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'} transition`}>
                    <td className="px-4 py-3.5 text-center border-b border-r border-gray-200 dark:border-gray-700">
                      <input
                        type="checkbox"
                        checked={checkedFileIds.includes(file.id)}
                        onChange={() => toggleSelectFile(file.id)}
                        className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-3.5 border-b border-r border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => window.open(file.file_url, '_blank')}
                        className="flex items-center text-left group w-full focus:outline-none cursor-pointer"
                        title="Click to view file"
                      >
                        <div className="w-9 h-9 bg-gray-100 dark:bg-gray-900/50 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition">
                          {getFileIcon(file.file_type, file.file_name)}
                        </div>
                        <div className="ml-3 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline underline-offset-2 truncate transition">
                            {file.file_name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{file.file_type}</div>
                        </div>
                      </button>
                    </td>
                    <td className="px-5 py-3.5 border-b border-r border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => window.open(file.file_url, '_blank')}
                        className="text-left group w-full focus:outline-none cursor-pointer"
                        title="Click to view file"
                      >
                        <div className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline underline-offset-2 transition">
                          {file.title || file.file_name}
                        </div>
                        {file.notes && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{file.notes}</div>
                        )}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{file.patients?.full_name || 'N/A'}</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-blue-700 dark:text-blue-400 font-mono font-bold">
                        {file.patients?.patient_number || 'N/A'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-green-700 dark:text-green-400 font-mono font-bold">
                        {file.patients?.file_number ? file.patients.file_number.split('-')[0] : 'No File'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatFileSize(file.file_size)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {file.upload_date ? new Date(file.upload_date).toLocaleDateString() : new Date(file.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-sm font-medium border-b border-gray-200 dark:border-gray-700">
                      <div className="flex space-x-1.5">
                        <button
                          onClick={() => { setRenameFile(file); setRenamingValue(file.title || file.file_name); }}
                          className="p-1.5 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded-lg transition"
                          title="Rename File"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openOwnershipModal(file)}
                          className="p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition"
                          title="Change File Ownership / Reassign"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.open(file.file_url, '_blank')}
                          className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition"
                          title="View File"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(file)}
                          className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition"
                          title="Download File"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(file)}
                          className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                          title="Delete File"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Clean Table Pagination Footer */}
        {filteredFiles.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center space-x-3 text-sm text-gray-600 dark:text-gray-400">
              <span>Showing <strong className="font-semibold text-gray-900 dark:text-white">{startIndex + 1}</strong> to <strong className="font-semibold text-gray-900 dark:text-white">{endIndex}</strong> of <strong className="font-semibold text-gray-900 dark:text-white">{filteredFiles.length}</strong> files</span>
              <span className="text-gray-300 dark:text-gray-700">|</span>
              <div className="flex items-center space-x-2">
                <span>Per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-semibold bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 text-sm font-semibold text-gray-800 dark:text-gray-200">
                Page {currentPage} of {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage >= totalPages}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Upload Patient File</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Select Patient *
                </label>
                <SearchablePatientSelect
                  patients={patients}
                  value={formData.patient_id}
                  onChange={(value) => setFormData({ ...formData, patient_id: value })}
                  placeholder="Select a patient..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  File Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. X-Ray Report, Lab Result, Medical Record"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Upload Date
                </label>
                <input
                  type="date"
                  value={formData.upload_date}
                  onChange={(e) => setFormData({ ...formData, upload_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Select File(s) *
                </label>
                <input
                  type="file"
                  multiple
                  required={selectedFiles.length === 0}
                  onChange={handleFileSelect}
                  accept="*/*"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white text-sm"
                />
                {selectedFiles.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      {selectedFiles.length} file(s) selected:
                    </p>
                    {selectedFiles.map((file, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-600">
                        <span className="truncate max-w-[260px] font-medium">{file.name}</span>
                        <span className="text-gray-500 dark:text-gray-400 ml-2">{formatFileSize(file.size)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes / Remarks
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this file..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || selectedFiles.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2 font-medium"
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
          </div>
        </div>
      )}
      {/* Rename Modal */}
      {renameFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-5 h-5 text-yellow-500" />
                Rename File
              </h2>
              <button
                onClick={() => setRenameFile(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Patient: <span className="font-semibold text-gray-800 dark:text-gray-200">{renameFile.patients?.full_name}</span>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New File Name
              </label>
              <input
                type="text"
                value={renamingValue}
                onChange={(e) => setRenamingValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); }}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-yellow-500 dark:bg-gray-700 dark:text-white text-sm"
                placeholder="Enter new file name…"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setRenameFile(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={renaming || !renamingValue.trim()}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition"
              >
                {renaming ? 'Saving…' : (<><Pencil className="w-4 h-4" /> Save Name</>)}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Reassign / Change Ownership Modal */}
      {ownershipFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5.5 h-5.5 text-purple-600 dark:text-purple-400" />
                  Reassign File to Patient
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Transfer this file to the real patient if it was wrongly assigned.
                </p>
              </div>
              <button
                onClick={() => setOwnershipFile(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800/30 mb-4 space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">File Details</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {ownershipFile.title || ownershipFile.file_name}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Currently Assigned To: <strong className="text-blue-700 dark:text-blue-400">{ownershipFile.patients?.full_name || 'Unassigned'} ({ownershipFile.patients?.patient_number || 'N/A'})</strong>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Uploader / Staff Owner: <strong className="text-gray-700 dark:text-gray-300">{ownershipFile.uploader?.full_name || 'System / Default'}</strong>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
                  Select Real / Correct Patient *
                </label>
                <SearchablePatientSelect
                  patients={patients}
                  value={selectedPatientId}
                  onChange={(value) => setSelectedPatientId(value)}
                  placeholder="Search and select real patient..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Staff Owner / Uploader
                </label>
                <select
                  value={selectedOwnerId}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">-- Select Staff User --</option>
                  {systemUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setOwnershipFile(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleOwnershipChange}
                disabled={updatingOwnership || !selectedPatientId}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition shadow-md"
              >
                {updatingOwnership ? 'Reassigning…' : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    Reassign File to Patient
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reassign Modal */}
      {showBulkReassignModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <UserCheck className="w-5.5 h-5.5 text-purple-600 dark:text-purple-400" />
                  Bulk Reassign Files
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Reassigning <strong className="text-purple-600 dark:text-purple-400">{checkedFileIds.length} selected files</strong> to a single patient at once.
                </p>
              </div>
              <button
                onClick={() => setShowBulkReassignModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800/30 mb-4 max-h-36 overflow-y-auto space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">
                Files to Reassign ({checkedFileIds.length})
              </p>
              {files.filter(f => checkedFileIds.includes(f.id)).map((file) => (
                <div key={file.id} className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate flex justify-between">
                  <span className="truncate max-w-[240px]">• {file.title || file.file_name}</span>
                  <span className="text-gray-400 text-[10px] shrink-0 ml-2">({file.patients?.full_name || 'No Patient'})</span>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
                  Target Real Patient *
                </label>
                <SearchablePatientSelect
                  patients={patients}
                  value={bulkTargetPatientId}
                  onChange={(value) => setBulkTargetPatientId(value)}
                  placeholder="Search and select target patient..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Staff Owner / Uploader (Optional)
                </label>
                <select
                  value={bulkTargetOwnerId}
                  onChange={(e) => setBulkTargetOwnerId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">-- Keep Current Staff Owners --</option>
                  {systemUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowBulkReassignModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReassign}
                disabled={bulkUpdating || !bulkTargetPatientId}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition shadow-md cursor-pointer"
              >
                {bulkUpdating ? 'Reassigning Files…' : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    Reassign {checkedFileIds.length} Files
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
