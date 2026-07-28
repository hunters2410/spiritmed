import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Plus, Search, Download, File, FileText, Upload,
    X, Eye, Trash2, Folder, Grid, List as ListIcon,
    Edit2, Check, AlertCircle, FileImage, FileBarChart,
    ChevronLeft, ChevronRight
} from 'lucide-react';

interface HospitalFile {
    id: string;
    branch_id: string;
    name: string;
    description: string;
    file_url: string;
    file_type: string;
    file_size: number;
    category: string;
    tags?: string[];
    created_at: string;
    uploaded_by: string;
}

const CATEGORIES = ['General', 'HR', 'Finance', 'Legal', 'Medical', 'Equipment', 'Maintenance', 'Policies'];

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

export function HospitalFiles() {
    const { profile } = useAuth();
    const [files, setFiles] = useState<HospitalFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [filters, setFilters] = useState({ category: 'all', type: 'all' });

    /* ─── pagination state ─── */
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    /* ─── upload state ─── */
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
    const [uploadError, setUploadError] = useState<string | null>(null);

    /* ─── edit state ─── */
    const [editingFile, setEditingFile] = useState<HospitalFile | null>(null);
    const [editFormData, setEditFormData] = useState({ name: '', description: '', category: 'General' });

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadFiles();
    }, [profile?.id]);

    async function loadFiles() {
        if (!profile?.branch_id) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('hospital_files')
            .select('*')
            .eq('branch_id', profile.branch_id)
            .order('created_at', { ascending: false });
        if (!error) setFiles(data || []);
        setLoading(false);
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            // Limit to 10MB per file
            const oversized = newFiles.filter(f => f.size > 10 * 1024 * 1024);
            if (oversized.length > 0) {
                alert(`Some files are too large! Max size is 10MB. (${oversized.map(f => f.name).join(', ')})`);
                return;
            }
            setSelectedFiles(prev => [...prev, ...newFiles]);
        }
    };

    const removeSelectedFile = (idx: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleBatchUpload = async () => {
        if (selectedFiles.length === 0 || !profile?.branch_id) return;
        setUploading(true);
        setUploadError(null);
        let completedCount = 0;

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `hospital_files/${fileName}`;

            try {
                // 1. Storage Upload
                const { error: storageErr } = await supabase.storage
                    .from('hospital-files')
                    .upload(filePath, file);
                if (storageErr) throw storageErr;

                // 2. Get Public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('hospital-files')
                    .getPublicUrl(filePath);

                // 3. Database Entry
                const { error: dbErr } = await supabase
                    .from('hospital_files')
                    .insert([{
                        branch_id: profile.branch_id,
                        name: file.name,
                        description: '',
                        file_url: publicUrl,
                        file_type: file.type,
                        file_size: file.size,
                        category: 'General',
                        uploaded_by: profile.id
                    }]);
                if (dbErr) throw dbErr;

                completedCount++;
                setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
            } catch (err: any) {
                console.error(`Error uploading ${file.name}:`, err);
                setUploadError(`Failed to upload ${file.name}: ${err.message}`);
                break;
            }
        }

        if (completedCount === selectedFiles.length) {
            setSelectedFiles([]);
            setUploadProgress({});
            setShowUploadModal(false);
            loadFiles();
            alert('All files uploaded successfully!');
        }
        setUploading(false);
    };

    const handleEditSave = async () => {
        if (!editingFile) return;
        const { error } = await supabase
            .from('hospital_files')
            .update(editFormData)
            .eq('id', editingFile.id);
        if (!error) {
            setShowEditModal(false);
            loadFiles();
        } else {
            alert(error.message);
        }
    };

    const handleDelete = async (file: HospitalFile) => {
        if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;
        try {
            // 1. Delete from storage (parsing file name from URL)
            const filePath = file.file_url.split('/').pop();
            if (filePath) {
                await supabase.storage.from('hospital-files').remove([`hospital_files/${filePath}`]);
            }
            // 2. Delete from DB
            const { error } = await supabase.from('hospital_files').delete().eq('id', file.id);
            if (error) throw error;
            loadFiles();
        } catch (err: any) {
            alert('Delete failed: ' + err.message);
        }
    };

    const handleDownload = async (file: HospitalFile) => {
        try {
            const res = await fetch(file.file_url);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) { alert('Download failed'); }
    }

    const filtered = files.filter(f => {
        const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.category.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCat = filters.category === 'all' || f.category === filters.category;
        return matchesSearch && matchesCat;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // Reset page if filters or search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filters]);

    const formatSize = (b: number) => {
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getFileIcon = (type: string) => {
        if (type.includes('pdf')) return <FileText className="w-8 h-8 text-rose-500" />;
        if (type.includes('image')) return <FileImage className="w-8 h-8 text-emerald-500" />;
        if (type.includes('excel') || type.includes('sheet')) return <FileBarChart className="w-8 h-8 text-green-600" />;
        return <File className="w-8 h-8 text-indigo-500" />;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Folder className="w-8 h-8 text-indigo-600 font-bold" /> Hospital Documents
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage institutional files, policies and reports</p>
                </div>
                <button onClick={() => setShowUploadModal(true)}
                    className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md font-semibold">
                    <Upload className="w-5 h-5" /><span>Upload Files</span>
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Search by filename or category..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                </div>
                <div className="flex gap-2 items-center">
                    <select value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}
                        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none bg-white dark:bg-gray-700 text-sm">
                        <option value="all">All Categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                        <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-400'}`}><Grid className="w-4 h-4" /></button>
                        <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-400'}`}><ListIcon className="w-4 h-4" /></button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" /></div>
            ) : filtered.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-20 text-center flex flex-col items-center">
                    <Folder className="w-16 h-16 text-gray-200 mb-4" />
                    <p className="text-gray-500 font-bold">No files found</p>
                    <button onClick={() => setShowUploadModal(true)} className="mt-4 text-indigo-600 font-bold hover:underline">Upload your first document</button>
                </div>
            ) : (
                <>
                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {paginatedItems.map(f => (
                                <div key={f.id} className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-xl transition-all relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg group-hover:scale-110 transition-transform">
                                            {getFileIcon(f.file_type)}
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => { setEditingFile(f); setEditFormData({ name: f.name, description: f.description || '', category: f.category }); setShowEditModal(true); }}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition"><Edit2 className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => handleDelete(f)}
                                                className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-md transition"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-gray-900 dark:text-white truncate text-sm mb-1" title={f.name}>{f.name}</h3>
                                    <p className="text-[10px] text-gray-500 flex items-center gap-2 mb-2">
                                        <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded uppercase font-bold">{f.category}</span>
                                        <span>{formatSize(f.file_size)}</span>
                                    </p>
                                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50 dark:border-gray-700/50">
                                        <button onClick={() => window.open(f.file_url, '_blank')} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900/40 py-2 rounded-lg transition"><Eye className="w-3.5 h-3.5" /> View</button>
                                        <button onClick={() => handleDownload(f)} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 py-2 rounded-lg transition"><Download className="w-3.5 h-3.5" /> DL</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <table className="w-full text-sm border-collapse border border-gray-200 dark:border-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 text-xs uppercase font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4 text-left">Document</th>
                                        <th className="px-6 py-4 text-left">Category</th>
                                        <th className="px-6 py-4 text-left">Size</th>
                                        <th className="px-6 py-4 text-left">Uploaded</th>
                                        <th className="px-6 py-4 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                    {paginatedItems.map(f => (
                                        <tr key={f.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {getFileIcon(f.file_type)}
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-gray-900 dark:text-white truncate">{f.name}</p>
                                                        <p className="text-[10px] text-gray-500 truncate italic">{f.description || 'No description'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4"><span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-[10px] uppercase font-bold">{f.category}</span></td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">{formatSize(f.file_size)}</td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">{new Date(f.created_at).toLocaleDateString()}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => window.open(f.file_url, '_blank')} className="p-1.5 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><Eye className="w-4 h-4" /></button>
                                                    <button onClick={() => handleDownload(f)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg"><Download className="w-4 h-4" /></button>
                                                    <button onClick={() => { setEditingFile(f); setEditFormData({ name: f.name, description: f.description || '', category: f.category }); setShowEditModal(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                                                    <button onClick={() => handleDelete(f)} className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 pb-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Showing <span className="font-bold text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{filtered.length}</span> documents
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition text-gray-600 dark:text-gray-400"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="flex gap-1">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-8 rounded-lg font-bold transition text-xs ${currentPage === page ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition text-gray-600 dark:text-gray-400"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ─── UPLOAD MODAL ─── */}
            {showUploadModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-indigo-600 text-white">
                            <h2 className="text-lg font-bold flex items-center gap-2"><Upload className="w-5 h-5" /> Batch File Upload</h2>
                            <button onClick={() => setShowUploadModal(false)} className="text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6">
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-8 text-center hover:border-indigo-500 transition-colors bg-gray-50/50 dark:bg-gray-900/20 cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}>
                                <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                                <div className="bg-indigo-100 dark:bg-indigo-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Plus className="text-indigo-600 w-8 h-8 font-bold" />
                                </div>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">Click or Drop files here to upload</p>
                                <p className="text-xs text-gray-500 mt-1">Multi-file selection up to 10MB each</p>
                            </div>

                            {selectedFiles.length > 0 && (
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Queue ({selectedFiles.length} files)</h4>
                                    <div className="space-y-2">
                                        {selectedFiles.map((f, i) => (
                                            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 rounded-xl flex items-center justify-between shadow-sm">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {getFileIcon(f.type)}
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{f.name}</p>
                                                        <p className="text-[10px] text-gray-500">{formatSize(f.size)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {uploadProgress[f.name] === 100 ? (
                                                        <span className="text-green-600 p-1.5 bg-green-50 dark:bg-green-900/20 rounded-full"><Check className="w-4 h-4" /></span>
                                                    ) : uploading ? (
                                                        <div className="w-12 bg-gray-200 rounded-full h-1.5 overflow-hidden"><div className="bg-indigo-600 h-full animate-pulse" style={{ width: '60%' }} /></div>
                                                    ) : (
                                                        <button onClick={() => removeSelectedFile(i)} className="p-1.5 text-gray-300 hover:text-rose-600 transition"><X className="w-4 h-4" /></button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {uploadError && (
                                <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-xs font-bold leading-relaxed">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    {uploadError}
                                </div>
                            )}
                        </div>
                        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex gap-4">
                            <button onClick={() => setShowUploadModal(false)} className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-white dark:hover:bg-gray-800 transition">Cancel</button>
                            <button onClick={handleBatchUpload} disabled={uploading || selectedFiles.length === 0}
                                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-extrabold hover:bg-indigo-700 shadow-xl disabled:opacity-50 transition active:scale-95">
                                {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── EDIT MODAL ─── */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2"><Edit2 className="w-5 h-5 text-indigo-600" /> Edit File Details</h2>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-400"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className={labelCls}>File Display Name</label>
                                <input type="text" value={editFormData.name} onChange={e => setEditFormData({ ...editFormData, name: e.target.value })} className={inputCls} />
                            </div>
                            <div>
                                <label className={labelCls}>Category</label>
                                <select value={editFormData.category} onChange={e => setEditFormData({ ...editFormData, category: e.target.value })} className={inputCls}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Description</label>
                                <textarea value={editFormData.description} onChange={e => setEditFormData({ ...editFormData, description: e.target.value })} className={`${inputCls} h-24 resize-none`} />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-bold text-gray-500">Cancel</button>
                                <button onClick={handleEditSave} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700">Save Changes</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
