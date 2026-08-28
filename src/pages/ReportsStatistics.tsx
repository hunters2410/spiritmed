import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import {
    Calendar,
    Users,
    FolderUp,
    UserMinus,
    Skull,
    Clock,
    BarChart3,
    RefreshCw,
    FileSpreadsheet,
    FileText,
    ChevronLeft,
    ChevronRight,
    Search
} from 'lucide-react';

interface ActivityItem {
    id: string;
    type: 'appointment' | 'patient_added' | 'file_uploaded' | 'discharged' | 'deceased' | 'old_updated';
    date: string;
    title: string;
    subtitle?: string;
    statusBadge: string;
    rawDate: Date;
}

export function ReportsStatistics() {
    const { profile } = useAuth();

    // Period Filter State
    const [periodMode, setPeriodMode] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [customStartDate, setCustomStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

    // Data & UI State
    const [loading, setLoading] = useState<boolean>(true);
    const [stats, setStats] = useState({
        appointmentsCount: 0,
        patientsAddedCount: 0,
        patientFilesCount: 0,
        dischargedCount: 0,
        deceasedCount: 0,
        oldPatientsUpdatedCount: 0
    });

    const [activityLogs, setActivityLogs] = useState<ActivityItem[]>([]);
    const [activeTab, setActiveTab] = useState<'all' | 'appointment' | 'patient_added' | 'file_uploaded' | 'discharged' | 'deceased' | 'old_updated'>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 25;

    // Calculate Date Bounds based on periodMode
    const dateRange = useMemo(() => {
        let start: Date;
        let end: Date;

        const baseDate = selectedDate ? new Date(selectedDate) : new Date();

        if (periodMode === 'daily') {
            start = new Date(baseDate);
            start.setHours(0, 0, 0, 0);
            end = new Date(baseDate);
            end.setHours(23, 59, 59, 999);
        } else if (periodMode === 'weekly') {
            const day = baseDate.getDay();
            const diffToMon = baseDate.getDate() - day + (day === 0 ? -6 : 1);
            start = new Date(baseDate.setDate(diffToMon));
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
        } else if (periodMode === 'monthly') {
            start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1, 0, 0, 0, 0);
            end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0, 23, 59, 59, 999);
        } else {
            start = customStartDate ? new Date(customStartDate) : new Date();
            start.setHours(0, 0, 0, 0);
            end = customEndDate ? new Date(customEndDate) : new Date();
            end.setHours(23, 59, 59, 999);
        }

        return {
            start,
            end,
            startIso: start.toISOString(),
            endIso: end.toISOString(),
            startFormatted: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            endFormatted: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        };
    }, [periodMode, selectedDate, customStartDate, customEndDate]);

    // Navigation for Prev / Next date
    const handleNavigateDate = (direction: 'prev' | 'next') => {
        const d = new Date(selectedDate);
        const factor = direction === 'next' ? 1 : -1;

        if (periodMode === 'daily') {
            d.setDate(d.getDate() + factor);
        } else if (periodMode === 'weekly') {
            d.setDate(d.getDate() + (7 * factor));
        } else if (periodMode === 'monthly') {
            d.setMonth(d.getMonth() + factor);
        }
        setSelectedDate(d.toISOString().split('T')[0]);
    };

    // Helper: Check if a date string falls within range
    const isDateInRange = (dateStr?: string | null) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        return d >= dateRange.start && d <= dateRange.end;
    };

    // Load statistics and activity details
    const loadStatisticsData = useCallback(async () => {
        setLoading(true);
        try {
            const branchId = profile?.role !== 'super_admin' ? profile?.branch_id : null;
            const { startIso, endIso } = dateRange;
            const logs: ActivityItem[] = [];

            // 1. APPOINTMENTS ADDED
            let aptQuery = supabase
                .from('appointments')
                .select('id, created_at, appointment_date, status, appointment_type, patients!left(full_name, patient_number), users:doctor_id!left(full_name)');
            aptQuery = aptQuery.gte('created_at', startIso).lte('created_at', endIso);
            if (branchId) aptQuery = aptQuery.eq('branch_id', branchId);

            const { data: appointmentsData } = await aptQuery;
            const aptList = appointmentsData || [];
            aptList.forEach((a: any) => {
                const dateObj = new Date(a.created_at || a.appointment_date);
                logs.push({
                    id: `apt-${a.id}`,
                    type: 'appointment',
                    date: dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    title: `Appointment: ${a.patients?.full_name || 'Patient'}`,
                    subtitle: `Type: ${a.appointment_type ? a.appointment_type.replace('_', ' ') : 'Consultation'} • Doctor: Dr. ${a.users?.full_name || 'Staff'}`,
                    statusBadge: (a.status || 'pending').replace('_', ' ').toUpperCase(),
                    rawDate: dateObj
                });
            });

            // 2. PATIENTS ADDED
            let patQuery = supabase
                .from('patients')
                .select('id, full_name, patient_number, gender, created_at, phone');
            patQuery = patQuery.gte('created_at', startIso).lte('created_at', endIso);
            if (branchId) patQuery = patQuery.eq('branch_id', branchId);

            const { data: patientsData } = await patQuery;
            const patList = patientsData || [];
            patList.forEach((p: any) => {
                const dateObj = new Date(p.created_at);
                logs.push({
                    id: `pat-${p.id}`,
                    type: 'patient_added',
                    date: dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    title: `New Patient Registered: ${p.full_name}`,
                    subtitle: `Patient ID: ${p.patient_number} • Phone: ${p.phone || 'N/A'} • Gender: ${p.gender || 'N/A'}`,
                    statusBadge: 'NEW PATIENT',
                    rawDate: dateObj
                });
            });

            // 3. PATIENT FILES UPLOADED
            let filesQuery = supabase
                .from('patient_files')
                .select('id, file_name, file_type, created_at, upload_date, patient_id, patients(full_name, patient_number, status)');
            filesQuery = filesQuery.gte('created_at', startIso).lte('created_at', endIso);
            if (branchId) filesQuery = filesQuery.eq('branch_id', branchId);

            const { data: filesData } = await filesQuery;
            const filesList = filesData || [];
            filesList.forEach((f: any) => {
                const dateObj = new Date(f.created_at || f.upload_date);
                logs.push({
                    id: `file-${f.id}`,
                    type: 'file_uploaded',
                    date: dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    title: `File Uploaded: ${f.file_name}`,
                    subtitle: `Patient: ${f.patients?.full_name || 'Patient'} (${f.patients?.patient_number || 'N/A'})`,
                    statusBadge: 'FILE UPLOAD',
                    rawDate: dateObj
                });
            });

            // 4. DISCHARGED PATIENTS
            let disQuery = supabase
                .from('patients')
                .select('id, full_name, patient_number, discharged_date, updated_at, created_at, status')
                .eq('status', 'discharged');
            if (branchId) disQuery = disQuery.eq('branch_id', branchId);

            const { data: dischargedData } = await disQuery;
            const dischargedList = (dischargedData || []).filter((d: any) =>
                isDateInRange(d.discharged_date) || isDateInRange(d.updated_at) || isDateInRange(d.created_at)
            );
            dischargedList.forEach((d: any) => {
                const dateObj = new Date(d.discharged_date || d.updated_at || d.created_at);
                logs.push({
                    id: `dis-${d.id}`,
                    type: 'discharged',
                    date: dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    title: `Patient Discharged: ${d.full_name}`,
                    subtitle: `Patient ID: ${d.patient_number}`,
                    statusBadge: 'DISCHARGED',
                    rawDate: dateObj
                });
            });

            // 5. DECEASED PATIENTS
            let decQuery = supabase
                .from('patients')
                .select('id, full_name, patient_number, deceased_date, deceased_reason, updated_at, created_at, status')
                .eq('status', 'deceased');
            if (branchId) decQuery = decQuery.eq('branch_id', branchId);

            const { data: deceasedData } = await decQuery;
            const deceasedList = (deceasedData || []).filter((d: any) =>
                isDateInRange(d.deceased_date) || isDateInRange(d.updated_at) || isDateInRange(d.created_at)
            );
            deceasedList.forEach((d: any) => {
                const dateObj = new Date(d.deceased_date || d.updated_at || d.created_at);
                logs.push({
                    id: `dec-${d.id}`,
                    type: 'deceased',
                    date: dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                    title: `Deceased Patient: ${d.full_name}`,
                    subtitle: `Patient ID: ${d.patient_number} ${d.deceased_reason ? `• Reason: ${d.deceased_reason}` : ''}`,
                    statusBadge: 'DECEASED',
                    rawDate: dateObj
                });
            });

            // 6. OLD PATIENTS UPDATED (including Mobile App file upload status transitions!)
            const processedOldPatientIds = new Set<string>();

            // 6A. Patient Files uploaded for Old Patients (Mobile App file upload flow)
            filesList.forEach((f: any) => {
                const pStatus = (f.patients?.status || '').toLowerCase();
                if (['inactive', 'old_patient', 'old'].includes(pStatus)) {
                    const dateObj = new Date(f.created_at || f.upload_date);
                    processedOldPatientIds.add(f.patient_id || f.id);
                    logs.push({
                        id: `old-file-${f.id}`,
                        type: 'old_updated',
                        date: dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        title: `Old Patient File Uploaded: ${f.patients?.full_name || 'Patient'}`,
                        subtitle: `File: ${f.file_name} • Patient ID: ${f.patients?.patient_number || 'N/A'}`,
                        statusBadge: 'OLD PATIENT',
                        rawDate: dateObj
                    });
                }
            });

            // 6B. Patients with status in ('inactive', 'old_patient', 'old') updated/created in period
            let oldQuery = supabase
                .from('patients')
                .select('id, full_name, patient_number, updated_at, created_at, status')
                .in('status', ['inactive', 'old_patient', 'old']);
            if (branchId) oldQuery = oldQuery.eq('branch_id', branchId);

            const { data: oldData } = await oldQuery;
            const oldList = (oldData || []).filter((o: any) =>
                isDateInRange(o.updated_at) || isDateInRange(o.created_at)
            );

            oldList.forEach((o: any) => {
                if (!processedOldPatientIds.has(o.id)) {
                    processedOldPatientIds.add(o.id);
                    const dateObj = new Date(o.updated_at || o.created_at);
                    logs.push({
                        id: `old-pat-${o.id}`,
                        type: 'old_updated',
                        date: dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        title: `Old Patient Status Updated: ${o.full_name}`,
                        subtitle: `Patient ID: ${o.patient_number} • Status: ${(o.status || 'old_patient').replace(/_/g, ' ')}`,
                        statusBadge: 'OLD PATIENT',
                        rawDate: dateObj
                    });
                }
            });

            // 6C. Audit Logs for Mobile App Status Changes
            let auditQuery = supabase
                .from('audit_logs')
                .select('id, action, details, created_at, record_id')
                .eq('table_name', 'patients')
                .gte('created_at', startIso)
                .lte('created_at', endIso);

            if (branchId) auditQuery = auditQuery.eq('branch_id', branchId);

            const { data: auditLogsData } = await auditQuery;
            if (auditLogsData) {
                auditLogsData.forEach((al: any) => {
                    const detailsLower = (al.details || '').toLowerCase();
                    if (
                        (detailsLower.includes('old') || detailsLower.includes('inactive') || detailsLower.includes('patient_files')) &&
                        !processedOldPatientIds.has(al.record_id)
                    ) {
                        processedOldPatientIds.add(al.record_id);
                        const dateObj = new Date(al.created_at);
                        logs.push({
                            id: `audit-${al.id}`,
                            type: 'old_updated',
                            date: dateObj.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                            title: `Old Patient Status Updated (Mobile App)`,
                            subtitle: al.details,
                            statusBadge: 'OLD PATIENT',
                            rawDate: dateObj
                        });
                    }
                });
            }

            // Sort logs by date descending
            logs.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());

            // Deduplicate logs by ID
            const uniqueLogsMap = new Map<string, ActivityItem>();
            logs.forEach(l => uniqueLogsMap.set(l.id, l));
            const finalLogs = Array.from(uniqueLogsMap.values());

            setStats({
                appointmentsCount: aptList.length,
                patientsAddedCount: patList.length,
                patientFilesCount: filesList.length,
                dischargedCount: dischargedList.length,
                deceasedCount: deceasedList.length,
                oldPatientsUpdatedCount: finalLogs.filter(l => l.type === 'old_updated').length
            });

            setActivityLogs(finalLogs);
        } catch (err) {
            console.error('Error in loadStatisticsData:', err);
        } finally {
            setLoading(false);
        }
    }, [dateRange, profile]);

    useEffect(() => {
        loadStatisticsData();
    }, [loadStatisticsData]);

    // Filter activity logs based on active tab and search query
    const filteredLogs = useMemo(() => {
        return activityLogs.filter(log => {
            if (activeTab !== 'all' && log.type !== activeTab) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                return (
                    log.title.toLowerCase().includes(q) ||
                    (log.subtitle && log.subtitle.toLowerCase().includes(q)) ||
                    log.statusBadge.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [activityLogs, activeTab, searchQuery]);

    // Paginate logs
    const paginatedLogs = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredLogs.slice(start, start + itemsPerPage);
    }, [filteredLogs, currentPage, itemsPerPage]);

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));

    // Handle Exports
    const handleExportExcel = () => {
        const exportData = filteredLogs.map((item, idx) => ({
            '#': idx + 1,
            'Date & Time': item.date,
            'Activity Type': item.type.replace('_', ' ').toUpperCase(),
            'Title': item.title,
            'Details': item.subtitle || '',
            'Status': item.statusBadge
        }));
        exportToExcel(exportData, `Reports_Statistics_${periodMode}_${selectedDate}`);
    };

    const handleExportPDF = () => {
        const headers = ['#', 'Date & Time', 'Activity', 'Details', 'Status'];
        const rows = filteredLogs.map((item, idx) => [
            idx + 1,
            item.date,
            item.title,
            item.subtitle || '',
            item.statusBadge
        ]);
        exportToPDF(
            headers,
            rows,
            `Reports Statistics (${dateRange.startFormatted} - ${dateRange.endFormatted})`,
            `reports_statistics_${periodMode}`
        );
    };

    return (
        <div className="space-y-6 pb-12 font-sans max-w-7xl mx-auto">
            {/* Header: Clean & Simple */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        Reports Statistics
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Simple activity breakdown ({dateRange.startFormatted} — {dateRange.endFormatted})
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={loadStatisticsData}
                        disabled={loading}
                        className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-lg transition"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition"
                    >
                        <FileSpreadsheet className="w-4 h-4" /> Excel
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition"
                    >
                        <FileText className="w-4 h-4" /> PDF
                    </button>
                </div>
            </div>

            {/* Simple Period Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                {/* Period tabs */}
                <div className="flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-lg border border-gray-200 dark:border-gray-700">
                    {(['daily', 'weekly', 'monthly', 'custom'] as const).map(mode => (
                        <button
                            key={mode}
                            onClick={() => {
                                setPeriodMode(mode);
                                setCurrentPage(1);
                            }}
                            className={`px-3 py-1.5 rounded text-xs font-bold capitalize transition ${
                                periodMode === mode
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                            }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>

                {/* Navigation Date Picker */}
                {periodMode !== 'custom' ? (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleNavigateDate('prev')}
                            className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        <input
                            type={periodMode === 'monthly' ? 'month' : 'date'}
                            value={periodMode === 'monthly' ? selectedDate.slice(0, 7) : selectedDate}
                            onChange={e => {
                                const val = e.target.value;
                                setSelectedDate(periodMode === 'monthly' ? `${val}-01` : val);
                            }}
                            className="px-2.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs font-semibold text-gray-800 dark:text-white bg-white dark:bg-gray-700"
                        />

                        <button
                            onClick={() => handleNavigateDate('next')}
                            className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                            className="px-2.5 py-1 text-xs font-semibold bg-white border border-gray-300 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-50"
                        >
                            Today
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-xs">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={e => setCustomStartDate(e.target.value)}
                            className="px-2.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs font-semibold text-gray-800 dark:text-white bg-white dark:bg-gray-700"
                        />
                        <span className="text-gray-400">to</span>
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={e => setCustomEndDate(e.target.value)}
                            className="px-2.5 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs font-semibold text-gray-800 dark:text-white bg-white dark:bg-gray-700"
                        />
                    </div>
                )}
            </div>

            {/* 6 Minimal Metric Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                
                {/* 1. Appointments */}
                <div
                    onClick={() => setActiveTab('appointment')}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                        activeTab === 'appointment'
                            ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-950/40 dark:border-indigo-500 ring-1 ring-indigo-500'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                    }`}
                >
                    <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-2">
                        <Calendar className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Additions</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {loading ? '...' : stats.appointmentsCount}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                        Appointments Added
                    </div>
                </div>

                {/* 2. Patients Added */}
                <div
                    onClick={() => setActiveTab('patient_added')}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                        activeTab === 'patient_added'
                            ? 'bg-emerald-50 border-emerald-500 dark:bg-emerald-950/40 dark:border-emerald-500 ring-1 ring-emerald-500'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-emerald-300'
                    }`}
                >
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-2">
                        <Users className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">New</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {loading ? '...' : stats.patientsAddedCount}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                        Patients Added
                    </div>
                </div>

                {/* 3. Patient Files Uploaded */}
                <div
                    onClick={() => setActiveTab('file_uploaded')}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                        activeTab === 'file_uploaded'
                            ? 'bg-amber-50 border-amber-500 dark:bg-amber-950/40 dark:border-amber-500 ring-1 ring-amber-500'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-amber-300'
                    }`}
                >
                    <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-2">
                        <FolderUp className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Files</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {loading ? '...' : stats.patientFilesCount}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                        Files Uploaded
                    </div>
                </div>

                {/* 4. Discharged Patients */}
                <div
                    onClick={() => setActiveTab('discharged')}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                        activeTab === 'discharged'
                            ? 'bg-cyan-50 border-cyan-500 dark:bg-cyan-950/40 dark:border-cyan-500 ring-1 ring-cyan-500'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-cyan-300'
                    }`}
                >
                    <div className="flex items-center justify-between text-cyan-600 dark:text-cyan-400 mb-2">
                        <UserMinus className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Discharge</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {loading ? '...' : stats.dischargedCount}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                        Discharged Patients
                    </div>
                </div>

                {/* 5. Deceased Patients */}
                <div
                    onClick={() => setActiveTab('deceased')}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                        activeTab === 'deceased'
                            ? 'bg-rose-50 border-rose-500 dark:bg-rose-950/40 dark:border-rose-500 ring-1 ring-rose-500'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-rose-300'
                    }`}
                >
                    <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 mb-2">
                        <Skull className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Deceased</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {loading ? '...' : stats.deceasedCount}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                        Deceased Patients
                    </div>
                </div>

                {/* 6. Old Patients Updated */}
                <div
                    onClick={() => setActiveTab('old_updated')}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                        activeTab === 'old_updated'
                            ? 'bg-purple-50 border-purple-500 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-300'
                    }`}
                >
                    <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-2">
                        <Clock className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                        {loading ? '...' : stats.oldPatientsUpdatedCount}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                        Old Patients Updated
                    </div>
                </div>

            </div>

            {/* Simple Activity Table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                
                {/* Minimal Filter Bar */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
                        <span className="text-xs font-bold text-gray-500 uppercase mr-1">Filter:</span>
                        {[
                            { key: 'all', label: `All (${activityLogs.length})` },
                            { key: 'appointment', label: `Appointments (${stats.appointmentsCount})` },
                            { key: 'patient_added', label: `Patients (${stats.patientsAddedCount})` },
                            { key: 'file_uploaded', label: `Files (${stats.patientFilesCount})` },
                            { key: 'discharged', label: `Discharged (${stats.dischargedCount})` },
                            { key: 'deceased', label: `Deceased (${stats.deceasedCount})` },
                            { key: 'old_updated', label: `Old Patients (${stats.oldPatientsUpdatedCount})` }
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => {
                                    setActiveTab(tab.key as any);
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition ${
                                    activeTab === tab.key
                                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-bold'
                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Search box */}
                    <div className="relative w-full sm:w-64">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Filter records..."
                            value={searchQuery}
                            onChange={e => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700">
                                <th className="py-3 px-4">Date & Time</th>
                                <th className="py-3 px-4">Title</th>
                                <th className="py-3 px-4">Details</th>
                                <th className="py-3 px-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-gray-400">
                                        Loading activity reports...
                                    </td>
                                </tr>
                            ) : paginatedLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="text-center py-10 text-gray-400">
                                        No activity recorded for this period.
                                    </td>
                                </tr>
                            ) : (
                                paginatedLogs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/40 transition">
                                        <td className="py-3 px-4 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                            {log.date}
                                        </td>
                                        <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
                                            {log.title}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                                            {log.subtitle || '—'}
                                        </td>
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                                {log.statusBadge}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Minimal Pagination */}
                {totalPages > 1 && (
                    <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500">
                        <div>
                            Page {currentPage} of {totalPages} ({filteredLogs.length} items)
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1 border rounded disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1 border rounded disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
