import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Download, Filter, File, FileText, Upload, X, Eye, Trash2 } from 'lucide-react';

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
  patients?: {
    patient_number: string;
    full_name: string;
  };
}

interface Patient {
  id: string;
  patient_number: string;
  full_name: string;
}

export function PatientFiles() {
  const { profile } = useAuth();
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    loadFiles();
    loadPatients();
  }, [profile]);

  const loadFiles = async () => {
    if (!profile?.branch_id && profile?.role !== 'super_admin') return;

    try {
      let query = supabase
        .from('patient_files')
        .select(`
          *,
          patients (
            patient_number,
            full_name
          )
        `)
        .order('created_at', { ascending: false });

      if (profile.role !== 'super_admin') {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error('Error loading patient files:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    try {
      let query = supabase
        .from('patients')
        .select('id, patient_number, full_name')
        .order('full_name');

      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        query = query.eq('branch_id', profile.branch_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !formData.patient_id) {
      alert('Please select a file and patient');
      return;
    }

    setUploading(true);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `patient-files/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('patient-files')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('patient-files')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('patient_files')
        .insert([{
          patient_id: formData.patient_id,
          file_name: selectedFile.name,
          file_type: selectedFile.type,
          file_url: publicUrl,
          file_size: selectedFile.size,
          title: formData.title || selectedFile.name,
          upload_date: formData.upload_date,
          notes: formData.notes,
          branch_id: profile?.branch_id,
          uploaded_by: profile?.id
        }]);

      if (dbError) throw dbError;

      setShowModal(false);
      resetForm();
      loadFiles();
      alert('File uploaded successfully');
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. Please ensure the storage bucket "patient-files" exists and is public.');
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
      alert('Failed to download file');
    }
  };

  const resetForm = () => {
    setFormData({
      patient_id: '',
      title: '',
      upload_date: new Date().toISOString().split('T')[0],
      notes: ''
    });
    setSelectedFile(null);
  };

  const exportToCSV = () => {
    const headers = ['Patient Number', 'Patient Name', 'File Title', 'File Name', 'File Type', 'File Size (KB)', 'Upload Date'];
    const csvData = filteredFiles.map(file => [
      file.patients?.patient_number || '',
      file.patients?.full_name || '',
      file.title || '',
      file.file_name,
      file.file_type || '',
      file.file_size ? Math.round(file.file_size / 1024) : '',
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
      file.patients?.patient_number.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFileType = filters.fileType === 'all' || file.file_type === filters.fileType;

    return matchesSearch && matchesFileType;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType?.includes('pdf')) return <FileText className="w-5 h-5 text-red-600" />;
    if (fileType?.includes('image')) return <File className="w-5 h-5 text-blue-600" />;
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
              placeholder="Search by file name, title, patient name, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-gray-700 dark:text-gray-300"
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File Type</label>
                <select
                  value={filters.fileType}
                  onChange={(e) => setFilters({ ...filters, fileType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="all">All Types</option>
                  <option value="application/pdf">PDF</option>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/png">PNG</option>
                  <option value="application/msword">Word Document</option>
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

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  File
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Patient ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  File Size
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-r border-gray-200 dark:border-gray-700">
                  Upload Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    No files found
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                    <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-900/50 rounded-lg flex items-center justify-center">
                          {getFileIcon(file.file_type)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{file.file_name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{file.file_type}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">{file.title || '-'}</div>
                      {file.notes && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{file.notes}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">{file.patients?.full_name || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white font-mono">
                        {file.patients?.patient_number || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatFileSize(file.file_size)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {file.upload_date ? new Date(file.upload_date).toLocaleDateString() : new Date(file.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium border-b border-gray-200 dark:border-gray-700">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => window.open(file.file_url, '_blank')}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                          title="View File"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(file)}
                          className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                          title="Download File"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(file)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
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
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Upload Patient File</h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Patient *</label>
                <select
                  value={formData.patient_id}
                  onChange={(e) => setFormData({ ...formData, patient_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select Patient</option>
                  {patients.map(patient => (
                    <option key={patient.id} value={patient.id}>
                      {patient.patient_number} - {patient.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">File Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="e.g., X-Ray Results, Lab Report"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Upload Date *</label>
                <input
                  type="date"
                  value={formData.upload_date}
                  onChange={(e) => setFormData({ ...formData, upload_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  rows={3}
                  placeholder="Additional notes about this file"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select File *</label>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
                  <div className="flex flex-col items-center">
                    <Upload className="w-12 h-12 text-gray-400 mb-4" />
                    <input
                      type="file"
                      onChange={handleFileSelect}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      className="block w-full text-sm text-gray-900 dark:text-white
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-sm file:font-semibold
                        file:bg-green-50 file:text-green-700
                        hover:file:bg-green-100
                        dark:file:bg-green-900/30 dark:file:text-green-400"
                      required
                    />
                    {selectedFile && (
                      <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                        Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                      </div>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      Supported formats: PDF, JPEG, PNG, DOCX (Max 10MB)
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); resetForm(); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
