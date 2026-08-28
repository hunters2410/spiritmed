import React, { useState, useEffect } from 'react';
import { supabase, UserProfile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Box, Plus, Search, Filter, Download, Edit3, Trash2, Tool, 
  CheckCircle2, AlertTriangle, Clock, Wrench, Calendar, DollarSign, 
  MapPin, ShieldAlert, FileText, ChevronRight, ChevronDown, X, Loader2, Info, Eye
} from 'lucide-react';

export interface HospitalAsset {
  id: string;
  branch_id?: string | null;
  asset_code: string;
  name: string;
  category: 'biomedical' | 'it_hardware' | 'facilities' | 'vehicles' | 'furniture' | 'other';
  model_number?: string | null;
  serial_number?: string | null;
  manufacturer?: string | null;
  location?: string | null;
  department?: string | null;
  assigned_to?: string | null;
  status: 'operational' | 'in_maintenance' | 'calibration_due' | 'faulty' | 'disposed';
  condition: 'excellent' | 'good' | 'fair' | 'poor';
  purchase_date?: string | null;
  purchase_cost?: number | null;
  salvage_value?: number | null;
  useful_life_years?: number | null;
  warranty_expiry?: string | null;
  last_maintenance_date?: string | null;
  next_maintenance_date?: string | null;
  last_calibration_date?: string | null;
  next_calibration_date?: string | null;
  notes?: string | null;
  created_at?: string;
  assigned_user?: UserProfile;
}

export interface MaintenanceLog {
  id: string;
  asset_id: string;
  type: 'preventive_maintenance' | 'repair' | 'calibration' | 'inspection';
  performed_by: string;
  cost: number;
  log_date: string;
  details: string;
  created_at?: string;
}

export function AssetsRegister() {
  const { profile } = useAuth();
  const [assets, setAssets] = useState<HospitalAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  // Modal States
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<HospitalAsset | null>(null);

  const [showLogModal, setShowLogModal] = useState(false);
  const [logAsset, setLogAsset] = useState<HospitalAsset | null>(null);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailAsset, setDetailAsset] = useState<HospitalAsset | null>(null);

  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [dbCategories, setDbCategories] = useState<{ id: string; name: string; code: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Quick Add Category Modal State
  const [showQuickCatModal, setShowQuickCatModal] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [quickCatCode, setQuickCatCode] = useState('');
  const [savingQuickCat, setSavingQuickCat] = useState(false);

  // Custom Searchable Category Combobox State
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [catSearchTerm, setCatSearchTerm] = useState('');
  const catDropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(event.target as Node)) {
        setIsCatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Asset Form State
  const [formData, setFormData] = useState({
    asset_code: '',
    name: '',
    category: 'biomedical',
    model_number: '',
    serial_number: '',
    manufacturer: '',
    location: '',
    department: 'Radiology',
    assigned_to: '',
    status: 'operational',
    condition: 'good',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_cost: '',
    useful_life_years: '5',
    warranty_expiry: '',
    last_maintenance_date: '',
    next_maintenance_date: '',
    notes: ''
  });

  // Maintenance Log Form State
  const [logFormData, setLogFormData] = useState({
    type: 'preventive_maintenance',
    performed_by: '',
    cost: '',
    log_date: new Date().toISOString().split('T')[0],
    details: '',
    update_next_maintenance: ''
  });

  useEffect(() => {
    loadAssets();
    loadStaff();
    loadCategoriesDB();
  }, []);

  const loadCategoriesDB = async () => {
    try {
      const { data } = await supabase.from('asset_categories').select('*').order('name');
      if (data && data.length > 0) setDbCategories(data);
    } catch (e) {
      // Fallback
    }
  };

  const handleQuickSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCatName.trim() || !quickCatCode.trim()) {
      alert('Category Name and Code are required.');
      return;
    }

    setSavingQuickCat(true);
    try {
      const code = quickCatCode.trim().toUpperCase();
      const name = quickCatName.trim();

      const { error } = await supabase.from('asset_categories').insert([{ name, code }]);
      if (error) throw error;

      await loadCategoriesDB();
      setFormData(prev => ({ ...prev, category: code.toLowerCase() }));
      setShowQuickCatModal(false);
      setQuickCatName('');
      setQuickCatCode('');
    } catch (err: any) {
      console.error('Error adding quick category:', err);
      alert('Failed to add category: ' + (err.message || 'Error occurred'));
    } finally {
      setSavingQuickCat(false);
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hospital_assets')
        .select('*, assigned_user:users(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssets((data as any) || []);
    } catch (err) {
      console.error('Error loading assets:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStaff = async () => {
    try {
      const { data } = await supabase.from('users').select('*').order('full_name');
      setStaffList(data || []);
    } catch (err) {
      console.error('Error loading staff:', err);
    }
  };

  const loadAssetLogs = async (assetId: string) => {
    try {
      const { data } = await supabase
        .from('asset_maintenance_logs')
        .select('*')
        .eq('asset_id', assetId)
        .order('log_date', { ascending: false });

      setMaintenanceLogs(data || []);
    } catch (err) {
      console.error('Error loading maintenance logs:', err);
    }
  };

  const handleOpenAddModal = () => {
    setEditingAsset(null);
    const randomTag = `AST-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    setFormData({
      asset_code: randomTag,
      name: '',
      category: 'biomedical',
      model_number: '',
      serial_number: '',
      manufacturer: '',
      location: '',
      department: 'Radiology',
      assigned_to: '',
      status: 'operational',
      condition: 'good',
      purchase_date: new Date().toISOString().split('T')[0],
      purchase_cost: '',
      useful_life_years: '5',
      warranty_expiry: '',
      last_maintenance_date: '',
      next_maintenance_date: '',
      notes: ''
    });
    setShowAssetModal(true);
  };

  const handleOpenEditModal = (asset: HospitalAsset) => {
    setEditingAsset(asset);
    setFormData({
      asset_code: asset.asset_code || '',
      name: asset.name || '',
      category: asset.category || 'biomedical',
      model_number: asset.model_number || '',
      serial_number: asset.serial_number || '',
      manufacturer: asset.manufacturer || '',
      location: asset.location || '',
      department: asset.department || 'Radiology',
      assigned_to: asset.assigned_to || '',
      status: asset.status || 'operational',
      condition: asset.condition || 'good',
      purchase_date: asset.purchase_date || '',
      purchase_cost: asset.purchase_cost ? String(asset.purchase_cost) : '',
      useful_life_years: asset.useful_life_years ? String(asset.useful_life_years) : '5',
      warranty_expiry: asset.warranty_expiry || '',
      last_maintenance_date: asset.last_maintenance_date || '',
      next_maintenance_date: asset.next_maintenance_date || '',
      notes: asset.notes || ''
    });
    setShowAssetModal(true);
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.asset_code.trim()) {
      alert('Asset Code and Asset Name are required.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        branch_id: profile?.branch_id || null,
        asset_code: formData.asset_code.trim(),
        name: formData.name.trim(),
        category: formData.category,
        model_number: formData.model_number.trim() || null,
        serial_number: formData.serial_number.trim() || null,
        manufacturer: formData.manufacturer.trim() || null,
        location: formData.location.trim() || null,
        department: formData.department.trim() || null,
        assigned_to: formData.assigned_to || null,
        status: formData.status,
        condition: formData.condition,
        purchase_date: formData.purchase_date || null,
        purchase_cost: formData.purchase_cost ? parseFloat(formData.purchase_cost) : 0,
        useful_life_years: formData.useful_life_years ? parseInt(formData.useful_life_years) : 5,
        warranty_expiry: formData.warranty_expiry || null,
        last_maintenance_date: formData.last_maintenance_date || null,
        next_maintenance_date: formData.next_maintenance_date || null,
        notes: formData.notes.trim() || null,
        updated_at: new Date().toISOString()
      };

      if (editingAsset) {
        const { error } = await supabase
          .from('hospital_assets')
          .update(payload)
          .eq('id', editingAsset.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('hospital_assets')
          .insert([payload]);
        if (error) throw error;
      }

      setShowAssetModal(false);
      loadAssets();
    } catch (err: any) {
      console.error('Error saving asset:', err);
      alert('Failed to save asset: ' + (err.message || 'Error occurred'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAsset = async (asset: HospitalAsset) => {
    if (!window.confirm(`Are you sure you want to delete asset "${asset.name}" (${asset.asset_code})?`)) return;

    try {
      const { error } = await supabase.from('hospital_assets').delete().eq('id', asset.id);
      if (error) throw error;
      loadAssets();
    } catch (err: any) {
      console.error('Error deleting asset:', err);
      alert('Failed to delete asset');
    }
  };

  const handleOpenLogModal = (asset: HospitalAsset) => {
    setLogAsset(asset);
    setLogFormData({
      type: 'preventive_maintenance',
      performed_by: '',
      cost: '',
      log_date: new Date().toISOString().split('T')[0],
      details: '',
      update_next_maintenance: ''
    });
    loadAssetLogs(asset.id);
    setShowLogModal(true);
  };

  const handleSaveMaintenanceLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logAsset || !logFormData.details.trim()) {
      alert('Maintenance details are required.');
      return;
    }

    setSubmitting(true);
    try {
      const logPayload = {
        asset_id: logAsset.id,
        type: logFormData.type,
        performed_by: logFormData.performed_by.trim() || 'Internal Engineering',
        cost: logFormData.cost ? parseFloat(logFormData.cost) : 0,
        log_date: logFormData.log_date,
        details: logFormData.details.trim(),
        created_by: profile?.id
      };

      const { error: logErr } = await supabase.from('asset_maintenance_logs').insert([logPayload]);
      if (logErr) throw logErr;

      // Update asset's last and next maintenance dates
      const updateData: any = {
        last_maintenance_date: logFormData.log_date,
        updated_at: new Date().toISOString()
      };
      if (logFormData.update_next_maintenance) {
        updateData.next_maintenance_date = logFormData.update_next_maintenance;
      }
      if (logFormData.type === 'repair') {
        updateData.status = 'operational';
      }

      await supabase.from('hospital_assets').update(updateData).eq('id', logAsset.id);

      setShowLogModal(false);
      loadAssets();
    } catch (err: any) {
      console.error('Error saving maintenance log:', err);
      alert('Failed to save log');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetailModal = (asset: HospitalAsset) => {
    setDetailAsset(asset);
    loadAssetLogs(asset.id);
    setShowDetailModal(true);
  };

  // Export Assets to CSV
  const handleExportCSV = () => {
    if (assets.length === 0) return;
    const headers = ['Asset Code', 'Name', 'Category', 'Serial No', 'Department', 'Location', 'Status', 'Condition', 'Purchase Cost', 'Warranty Expiry'];
    const rows = assets.map(a => [
      `"${a.asset_code}"`,
      `"${a.name}"`,
      `"${a.category}"`,
      `"${a.serial_number || ''}"`,
      `"${a.department || ''}"`,
      `"${a.location || ''}"`,
      `"${a.status}"`,
      `"${a.condition}"`,
      `"${a.purchase_cost || 0}"`,
      `"${a.warranty_expiry || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Hospital_Assets_Register_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered Assets
  const filteredAssets = assets.filter(a => {
    const matchesSearch = 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.asset_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.serial_number && a.serial_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (a.location && a.location.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || a.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchesDept = departmentFilter === 'all' || (a.department && a.department.toLowerCase() === departmentFilter.toLowerCase());

    return matchesSearch && matchesCategory && matchesStatus && matchesDept;
  });

  // Calculate Metrics
  const totalValuation = assets.reduce((sum, a) => sum + (Number(a.purchase_cost) || 0), 0);
  const maintenanceDueCount = assets.filter(a => a.status === 'in_maintenance' || a.status === 'calibration_due' || (a.next_maintenance_date && new Date(a.next_maintenance_date) <= new Date())).length;
  const operationalCount = assets.filter(a => a.status === 'operational').length;
  const operationalRate = assets.length > 0 ? Math.round((operationalCount / assets.length) * 100) : 100;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'operational':
        return <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full text-xs font-bold flex items-center gap-1 w-max"><CheckCircle2 className="w-3.5 h-3.5" /> Operational</span>;
      case 'in_maintenance':
        return <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-xs font-bold flex items-center gap-1 w-max"><Wrench className="w-3.5 h-3.5" /> In Maintenance</span>;
      case 'calibration_due':
        return <span className="px-2.5 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs font-bold flex items-center gap-1 w-max"><Clock className="w-3.5 h-3.5" /> Calibration Due</span>;
      case 'faulty':
        return <span className="px-2.5 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-xs font-bold flex items-center gap-1 w-max"><AlertTriangle className="w-3.5 h-3.5" /> Faulty / Out of Service</span>;
      case 'disposed':
        return <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs font-bold flex items-center gap-1 w-max">Disposed</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  const getCategoryLabel = (cat: string) => {
    const found = dbCategories.find(c => c.code.toLowerCase() === cat.toLowerCase() || c.name.toLowerCase() === cat.toLowerCase());
    if (found) return found.name;
    switch (cat.toLowerCase()) {
      case 'biomedical': return 'Biomedical Equipment';
      case 'it_hardware': return 'IT Hardware';
      case 'facilities': return 'Facilities & Plant';
      case 'vehicles': return 'Vehicles & Ambulance';
      case 'furniture': return 'Furniture & Fixtures';
      default: return cat;
    }
  };

  return (
    <div className="space-y-6">
      {/* 🚀 Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            <Box className="w-7 h-7 text-green-600" />
            Hospital Assets Register
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Record, track, and schedule maintenance for hospital equipment, medical devices, and facilities.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add New Asset
          </button>
        </div>
      </div>

      {/* 📊 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Total Assets</p>
            <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{assets.length}</h3>
          </div>
          <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 rounded-xl">
            <Box className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Total Valuation</p>
            <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Maintenance & Cal. Due</p>
            <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">{maintenanceDueCount}</h3>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-xl">
            <Wrench className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Operational Rate</p>
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{operationalRate}%</h3>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 🔍 Search & Filter Bar */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by asset tag, name, serial number, location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2.5 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-semibold"
          >
            <option value="all">All Categories</option>
            {dbCategories.map(c => (
              <option key={c.id} value={c.code.toLowerCase()}>{c.name}</option>
            ))}
            {dbCategories.length === 0 && (
              <>
                <option value="biomedical">Biomedical Equipment</option>
                <option value="it_hardware">IT Hardware</option>
                <option value="facilities">Facilities & Plant</option>
                <option value="vehicles">Vehicles & Ambulance</option>
                <option value="furniture">Furniture & Fixtures</option>
              </>
            )}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-semibold"
          >
            <option value="all">All Statuses</option>
            <option value="operational">Operational</option>
            <option value="in_maintenance">In Maintenance</option>
            <option value="calibration_due">Calibration Due</option>
            <option value="faulty">Faulty / Out of Service</option>
            <option value="disposed">Disposed</option>
          </select>
        </div>
      </div>

      {/* 📋 Asset Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-green-600 mb-2" />
            <p className="text-xs font-semibold">Loading hospital assets register...</p>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Box className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm font-bold">No assets found</p>
            <p className="text-xs text-gray-400 mt-1">Try adjusting your search terms or add a new asset.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase font-black tracking-wider">
                  <th className="p-4">Asset Code</th>
                  <th className="p-4">Asset Name & Model</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Department / Location</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Condition</th>
                  <th className="p-4">Purchase Cost</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 font-medium">
                {filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition">
                    <td className="p-4 font-mono font-bold text-green-700 dark:text-green-400 whitespace-nowrap">
                      {asset.asset_code}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{asset.name}</div>
                      <div className="text-[11px] text-gray-400">
                        {asset.manufacturer ? `${asset.manufacturer} ` : ''}{asset.model_number ? `(${asset.model_number})` : ''} {asset.serial_number ? `• SN: ${asset.serial_number}` : ''}
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-gray-700 dark:text-gray-300">
                      {getCategoryLabel(asset.category)}
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-gray-900 dark:text-white">{asset.department || 'N/A'}</div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400" /> {asset.location || 'Unassigned'}
                      </div>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(asset.status)}
                    </td>
                    <td className="p-4 capitalize font-semibold">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                        asset.condition === 'excellent' ? 'bg-emerald-50 text-emerald-700' :
                        asset.condition === 'good' ? 'bg-blue-50 text-blue-700' :
                        asset.condition === 'fair' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {asset.condition}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-gray-900 dark:text-white whitespace-nowrap">
                      ${Number(asset.purchase_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenDetailModal(asset)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 transition"
                          title="View Asset Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenLogModal(asset)}
                          className="p-1.5 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg text-amber-600 transition"
                          title="Log Maintenance / Calibration Work"
                        >
                          <Wrench className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(asset)}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 transition"
                          title="Edit Asset"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteAsset(asset)}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg text-red-600 transition"
                          title="Delete Asset"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 📝 Add/Edit Asset Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <h2 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <Box className="w-5 h-5 text-green-600" />
                {editingAsset ? 'Edit Hospital Asset' : 'Register New Hospital Asset'}
              </h2>
              <button onClick={() => setShowAssetModal(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Asset Code Tag *</label>
                  <input
                    type="text"
                    required
                    value={formData.asset_code}
                    onChange={(e) => setFormData({ ...formData, asset_code: e.target.value })}
                    placeholder="e.g. AST-2026-0001"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Asset Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. GE Ultrasound Machine"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
                  />
                </div>

                {/* Searchable Custom Category Combobox */}
                <div className="relative" ref={catDropdownRef}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-gray-700 dark:text-gray-300">Asset Category *</label>
                    <button
                      type="button"
                      onClick={() => setShowQuickCatModal(true)}
                      className="text-[11px] font-bold text-green-600 dark:text-green-400 hover:underline flex items-center gap-0.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Category
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-semibold flex items-center justify-between text-left text-xs shadow-2xs transition hover:border-gray-300 dark:hover:border-gray-500"
                  >
                    <span className="truncate text-gray-900 dark:text-white font-bold">
                      {getCategoryLabel(formData.category)}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ml-2 ${isCatDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Searchable Dropdown Popover */}
                  {isCatDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                      {/* Search Bar Input */}
                      <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                          <input
                            type="text"
                            autoFocus
                            placeholder="Type to search category..."
                            value={catSearchTerm}
                            onChange={(e) => setCatSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-1 focus:ring-green-500 font-medium"
                          />
                        </div>
                      </div>

                      {/* Category List */}
                      <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5 touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {(dbCategories.length > 0 ? dbCategories : [
                          { code: 'biomedical', name: 'Biomedical & Medical Equipment' },
                          { code: 'it_hardware', name: 'IT Hardware & Infrastructure' },
                          { code: 'facilities', name: 'Facilities & Power Plant' },
                          { code: 'vehicles', name: 'Vehicles & Ambulances' },
                          { code: 'furniture', name: 'Furniture & Hospital Fixtures' },
                          { code: 'lab_inst', name: 'Laboratory Instruments' },
                          { code: 'surgical', name: 'Surgical & Theatre Equipment' },
                          { code: 'general', name: 'General Appliances & Storage' }
                        ])
                          .filter(c => 
                            c.name.toLowerCase().includes(catSearchTerm.toLowerCase()) || 
                            c.code.toLowerCase().includes(catSearchTerm.toLowerCase())
                          )
                          .map((c) => {
                            const isSelected = formData.category.toLowerCase() === c.code.toLowerCase() || formData.category.toLowerCase() === c.name.toLowerCase();
                            return (
                              <button
                                type="button"
                                key={c.code}
                                onClick={() => {
                                  setFormData({ ...formData, category: c.code.toLowerCase() });
                                  setIsCatDropdownOpen(false);
                                  setCatSearchTerm('');
                                }}
                                className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition ${
                                  isSelected
                                    ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-bold'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200 font-medium'
                                }`}
                              >
                                <div className="truncate">
                                  <span>{c.name}</span>
                                  <span className="ml-1.5 text-[10px] text-gray-400 font-mono">({c.code})</span>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 ml-2" />}
                              </button>
                            );
                          })}

                        {(dbCategories.length > 0 ? dbCategories : []).filter(c => c.name.toLowerCase().includes(catSearchTerm.toLowerCase()) || c.code.toLowerCase().includes(catSearchTerm.toLowerCase())).length === 0 && (
                          <div className="p-3 text-center text-gray-400 text-xs font-medium">
                            No matching category found.
                          </div>
                        )}
                      </div>

                      {/* Add New Category Action at bottom */}
                      <div className="p-1.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40">
                        <button
                          type="button"
                          onClick={() => {
                            setIsCatDropdownOpen(false);
                            setCatSearchTerm('');
                            setShowQuickCatModal(true);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-green-600 dark:text-green-400 hover:bg-green-100/60 dark:hover:bg-green-900/30 flex items-center justify-center gap-1.5 transition"
                        >
                          <Plus className="w-4 h-4" /> Add New Category...
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="e.g. Radiology / ICU / Surgery"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Room / Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g. Room 102, Main Building"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Manufacturer</label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    placeholder="e.g. GE Healthcare / Philips"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Model Number</label>
                  <input
                    type="text"
                    value={formData.model_number}
                    onChange={(e) => setFormData({ ...formData, model_number: e.target.value })}
                    placeholder="e.g. Voluson E10"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={formData.serial_number}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    placeholder="e.g. SN-998822"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-semibold"
                  >
                    <option value="operational">Operational</option>
                    <option value="in_maintenance">In Maintenance</option>
                    <option value="calibration_due">Calibration Due</option>
                    <option value="faulty">Faulty / Out of Service</option>
                    <option value="disposed">Disposed</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-semibold"
                  >
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Purchase Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.purchase_cost}
                    onChange={(e) => setFormData({ ...formData, purchase_cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Warranty Expiry Date</label>
                  <input
                    type="date"
                    value={formData.warranty_expiry}
                    onChange={(e) => setFormData({ ...formData, warranty_expiry: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Notes / Specifications</label>
                <textarea
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional technical details or maintenance requirements..."
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowAssetModal(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-md flex items-center gap-1.5"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {editingAsset ? 'Update Asset' : 'Save Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔧 Log Maintenance Work Order Modal */}
      {showLogModal && logAsset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-amber-500 text-white">
              <h2 className="font-black text-base flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Log Maintenance Work ({logAsset.asset_code})
              </h2>
              <button onClick={() => setShowLogModal(false)} className="p-1 hover:bg-white/20 rounded-full text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMaintenanceLog} className="p-6 space-y-4 text-xs">
              <div>
                <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Work Type</label>
                <select
                  value={logFormData.type}
                  onChange={(e) => setLogFormData({ ...logFormData, type: e.target.value as any })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none font-semibold"
                >
                  <option value="preventive_maintenance">Preventive Maintenance (PM)</option>
                  <option value="repair">Repair Work Order</option>
                  <option value="calibration">Biomedical Calibration</option>
                  <option value="inspection">Safety Inspection</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Performed By / Vendor</label>
                  <input
                    type="text"
                    required
                    value={logFormData.performed_by}
                    onChange={(e) => setLogFormData({ ...logFormData, performed_by: e.target.value })}
                    placeholder="e.g. In-house BioMed / Vendor"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Cost ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={logFormData.cost}
                    onChange={(e) => setLogFormData({ ...logFormData, cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Work Details & Outcome *</label>
                <textarea
                  rows={3}
                  required
                  value={logFormData.details}
                  onChange={(e) => setLogFormData({ ...logFormData, details: e.target.value })}
                  placeholder="Describe maintenance performed, parts replaced, calibration results..."
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Update Next Maintenance Due Date</label>
                <input
                  type="date"
                  value={logFormData.update_next_maintenance}
                  onChange={(e) => setLogFormData({ ...logFormData, update_next_maintenance: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold shadow-md"
                >
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 👁️ Asset Details & History Modal */}
      {showDetailModal && detailAsset && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-900 text-white">
              <div>
                <span className="font-mono text-xs text-green-400 font-bold">{detailAsset.asset_code}</span>
                <h2 className="font-black text-lg">{detailAsset.name}</h2>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-white/20 rounded-full text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Asset Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border border-gray-200 dark:border-gray-600">
                <div>
                  <span className="text-gray-400 font-bold block">Category</span>
                  <span className="font-bold text-gray-900 dark:text-white capitalize">{detailAsset.category}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold block">Status</span>
                  {getStatusBadge(detailAsset.status)}
                </div>
                <div>
                  <span className="text-gray-400 font-bold block">Department</span>
                  <span className="font-bold text-gray-900 dark:text-white">{detailAsset.department || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold block">Location</span>
                  <span className="font-bold text-gray-900 dark:text-white">{detailAsset.location || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold block">Purchase Cost</span>
                  <span className="font-bold text-gray-900 dark:text-white">${Number(detailAsset.purchase_cost || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-bold block">Warranty Expiry</span>
                  <span className="font-bold text-gray-900 dark:text-white">{detailAsset.warranty_expiry || 'N/A'}</span>
                </div>
              </div>

              {/* Maintenance History */}
              <div>
                <h3 className="font-black text-sm text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-500" /> Maintenance & Calibration History
                </h3>

                {maintenanceLogs.length === 0 ? (
                  <p className="text-gray-400 italic p-4 text-center bg-gray-50 dark:bg-gray-700/30 rounded-xl">No maintenance logs recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {maintenanceLogs.map((log) => (
                      <div key={log.id} className="p-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-200/80 dark:border-gray-600">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-gray-900 dark:text-white capitalize">{log.type.replace('_', ' ')}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">{log.log_date}</span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 text-xs">{log.details}</p>
                        <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2 font-medium">
                          <span>Performed by: {log.performed_by}</span>
                          <span className="font-bold text-gray-700 dark:text-gray-200">${Number(log.cost).toFixed(2)}</span>
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

      {/* ➕ Quick Add Missing Category Mini-Modal */}
      {showQuickCatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-green-600 text-white">
              <h3 className="font-black text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Add Missing Category
              </h3>
              <button type="button" onClick={() => setShowQuickCatModal(false)} className="p-1 hover:bg-white/20 rounded-full text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickSaveCategory} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Category Code *</label>
                <input
                  type="text"
                  required
                  value={quickCatCode}
                  onChange={(e) => setQuickCatCode(e.target.value.toUpperCase())}
                  placeholder="e.g. RAD_IMG"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none font-mono font-bold uppercase focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 dark:text-gray-300 block mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={quickCatName}
                  onChange={(e) => setQuickCatName(e.target.value)}
                  placeholder="e.g. Radiology Imaging Devices"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl outline-none font-bold focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowQuickCatModal(false)}
                  className="px-3.5 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuickCat}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-md flex items-center gap-1.5"
                >
                  {savingQuickCat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
