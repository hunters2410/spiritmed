import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Search, Calendar, Settings as SettingsIcon,
    Plus, User, Check, X, FileText, Printer, Download,
    CreditCard, ToggleLeft, ToggleRight,
    ShieldCheck, Trash2, AlertCircle,
    ChevronLeft, ChevronRight, FileSpreadsheet, FileJson
} from 'lucide-react';
import { calculateMonthlyPayroll, PayrollSettings, CustomDeduction } from '../utils/payrollCalculations';
import { logActivity } from '../utils/auditLogger';
import { exportElementToPdf, exportToExcel, exportToPDF } from '../utils/exportUtils';

interface UserProfile {
    id: string;
    full_name: string;
    role: string;
    phone: string | null;
}

interface SalaryConfig {
    id?: string;
    user_id: string;
    basic_salary: number;
    housing_allowance: number;
    transport_allowance: number;
    other_allowances: number;
    medical_aid_deduction: number;
    pension_deduction: number;
    custom_deductions: CustomDeduction[];
    branch_id: string;
}

interface PayrollRecord {
    id: string;
    user_id: string;
    branch_id: string;
    period_start: string;
    period_end: string;
    period_month: number;
    period_year: number;
    basic_salary: number;
    allowances: number;
    gross_salary: number;
    paye: number;
    nssa: number;
    aids_levy: number;
    deductions: number;
    net_salary: number;
    status: string;
    created_at?: string;
    users: UserProfile;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

export function Payroll() {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState<'history' | 'staff' | 'settings'>('history');
    const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
    const [salaryConfigs, setSalaryConfigs] = useState<{ [key: string]: SalaryConfig }>({});
    const [staff, setStaff] = useState<UserProfile[]>([]);
    const [settings, setSettings] = useState<PayrollSettings | null>(null);
    const [branchName, setBranchName] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showProcessModal, setShowProcessModal] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showPayslipModal, setShowPayslipModal] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);

    /* ─── Pagination states ─── */
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    /* ─── selected states ─── */
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
    const [processMonth, setProcessMonth] = useState(new Date().getMonth() + 1);
    const [processYear, setProcessYear] = useState(new Date().getFullYear());

    /* ─── config modal local state ─── */
    const [localCustomDeds, setLocalCustomDeds] = useState<CustomDeduction[]>([]);

    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadData();
    }, [profile?.id]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, activeTab, itemsPerPage]);

    async function loadData() {
        setLoading(true);
        const bid = profile?.branch_id;

        let payrollQ = supabase.from('payroll').select('*, users:user_id(id, full_name, role, phone)');
        let configQ = supabase.from('salary_configurations').select('*');
        let staffQ = supabase.from('users').select('*').eq('is_active', true);
        let settingsQ = supabase.from('payroll_settings').select('*');
        let branchQ = bid ? supabase.from('branches').select('name').eq('id', bid).single() : null;

        if (bid) {
            payrollQ = payrollQ.eq('branch_id', bid);
            configQ = configQ.eq('branch_id', bid);
            staffQ = staffQ.eq('branch_id', bid);
            settingsQ = settingsQ.eq('branch_id', bid);
        }

        const [payrollRes, configRes, staffRes, settingsRes, branchRes] = await Promise.all([
            payrollQ.order('period_year', { ascending: false }).order('period_month', { ascending: false }),
            configQ,
            staffQ,
            bid ? settingsQ.single() : settingsQ.limit(1).maybeSingle(),
            branchQ ? branchQ : Promise.resolve({ data: { name: 'Main Clinic' }, error: null })
        ]);

        if (!payrollRes.error) setPayroll(payrollRes.data || []);
        if (!staffRes.error) setStaff(staffRes.data || []);
        if (!settingsRes.error && settingsRes.data) setSettings(settingsRes.data);
        if (branchRes && !branchRes.error && branchRes.data) setBranchName((branchRes.data as any).name);

        if ((settingsRes.error && settingsRes.error.code === 'PGRST116') || (!settingsRes.error && !settingsRes.data)) {
           const defaultSettings: PayrollSettings = {
                paye_enabled: true,
                nssa_enabled: true,
                aids_levy_enabled: true,
                nssa_rate: 4.5,
                nssa_limit: 700,
                aids_levy_rate: 3.0,
                tax_brackets: [
                    { min: 0, max: 100, rate: 0 },
                    { min: 101, max: 300, rate: 20 },
                    { min: 301, max: 1000, rate: 25 },
                    { min: 1001, max: 2000, rate: 30 },
                    { min: 2001, max: 3000, rate: 35 },
                    { min: 3001, max: 9999999, rate: 40 }
                ]
           };
           setSettings(defaultSettings);
           if (bid) {
               await supabase.from('payroll_settings').insert([{ branch_id: bid, ...defaultSettings }]);
           }
        }

        if (!configRes.error) {
            const configMap: { [key: string]: SalaryConfig } = {};
            configRes.data?.forEach(c => { configMap[c.user_id] = c; });
            setSalaryConfigs(configMap);
        }

        setLoading(false);
    }

    const handleRunPayroll = async () => {
        if (!profile?.branch_id || !settings) return;
        setLoading(true);

        const period_start = new Date(processYear, processMonth - 1, 1).toISOString();
        const period_end = new Date(processYear, processMonth, 0).toISOString();

        const recordsToInsert = staff.map(user => {
            const config = salaryConfigs[user.id] || { basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, custom_deductions: [] };
            const allowances = (config.housing_allowance || 0) + (config.transport_allowance || 0) + (config.other_allowances || 0);
            const extraDeductions = (config.medical_aid_deduction || 0) + (config.pension_deduction || 0);

            const calc = calculateMonthlyPayroll(config.basic_salary, allowances, extraDeductions, config.custom_deductions || [], settings);

            return {
                user_id: user.id,
                branch_id: profile.branch_id,
                period_start,
                period_end,
                period_month: processMonth,
                period_year: processYear,
                basic_salary: config.basic_salary,
                allowances: allowances,
                gross_salary: calc.gross,
                paye: calc.paye,
                nssa: calc.nssa,
                aids_levy: calc.aidsLevy,
                deductions: calc.totalDeductions,
                net_salary: calc.net,
                status: 'pending'
            };
        });

        const { error } = await supabase.from('payroll').insert(recordsToInsert);
        if (error) {
            alert('Failed to process payroll: ' + error.message);
        } else {
            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'PROCESS',
                    tableName: 'payroll',
                    details: `Processed monthly payroll for ${staff.length} staff members for ${months[processMonth - 1]} ${processYear}`,
                    newValues: { month: processMonth, year: processYear, staffCount: staff.length }
                });
            }
            alert('Monthly payroll processed successfully!');
            setShowProcessModal(false);
            loadData();
        }
        setLoading(false);
    };

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || !profile?.branch_id) return;

        const config = salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, branch_id: profile.branch_id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0 };
        const payload = {
            ...config,
            custom_deductions: localCustomDeds
        };

        const { error } = await supabase.from('salary_configurations').upsert(payload, { onConflict: 'user_id' });
        if (!error) {
            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'UPDATE',
                    tableName: 'salary_configurations',
                    recordId: selectedUser.id,
                    details: `Updated salary configuration for ${selectedUser.full_name}`,
                    newValues: payload
                });
            }
            setShowConfigModal(false);
            loadData();
        } else {
            alert(error.message);
        }
    };

    const handleSaveSettings = async () => {
        if (!profile?.branch_id || !settings) return;
        const { error } = await supabase.from('payroll_settings').upsert({ branch_id: profile.branch_id, ...settings }, { onConflict: 'branch_id' });
        if (!error) {
            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'UPDATE',
                    tableName: 'payroll_settings',
                    details: `Updated global payroll statutory settings and tax logic`,
                    newValues: settings
                });
            }
            alert('Settings saved successfully!');
            loadData();
        } else {
            alert(error.message);
        }
    };

    const handleSettlePayroll = async (id: string) => {
        const { error } = await supabase.from('payroll').update({ status: 'paid' }).eq('id', id);
        if (!error) {
            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'STATUS_CHANGE',
                    tableName: 'payroll',
                    recordId: id,
                    details: `Marked payroll record ${id} as PAID`,
                    newValues: { status: 'paid' }
                });
            }
            loadData();
        } else {
            alert('Error settling payroll: ' + error.message);
        }
    };

    const handlePrint = () => {
        const content = printRef.current?.innerHTML;
        const win = window.open('', '', 'width=850,height=950');
        if (win && content) {
            win.document.write(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>Payslip - ${selectedRecord?.users?.full_name || 'Staff'}</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                        <style>
                            @page { size: A4 portrait; margin: 12mm; }
                            @media print {
                                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                                .no-print { display: none !important; }
                            }
                            body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #111827; }
                        </style>
                    </head>
                    <body class="p-4">
                        ${content}
                        <script>
                            window.onload = function() {
                                window.print();
                                setTimeout(() => window.close(), 500);
                            };
                        </script>
                    </body>
                </html>
            `);
            win.document.close();
        }
    };

    const handleDownloadPDF = async (record?: PayrollRecord) => {
        const targetRecord = record || selectedRecord;
        if (!targetRecord) return;

        if (printRef.current && selectedRecord?.id === targetRecord.id) {
            setDownloadingPdf(true);
            try {
                const empName = (targetRecord.users?.full_name || 'Staff').replace(/\s+/g, '_');
                const monthStr = months[targetRecord.period_month - 1];
                const fileName = `PAYSLIP_${empName}_${monthStr}_${targetRecord.period_year}.pdf`;
                await exportElementToPdf(printRef.current, fileName);
            } catch (err) {
                console.error('Failed to download PDF:', err);
                alert('Failed to generate PDF payslip.');
            } finally {
                setDownloadingPdf(false);
            }
        } else {
            setSelectedRecord(targetRecord);
            setShowPayslipModal(true);
            setDownloadingPdf(true);
            setTimeout(async () => {
                if (printRef.current) {
                    try {
                        const empName = (targetRecord.users?.full_name || 'Staff').replace(/\s+/g, '_');
                        const monthStr = months[targetRecord.period_month - 1];
                        const fileName = `PAYSLIP_${empName}_${monthStr}_${targetRecord.period_year}.pdf`;
                        await exportElementToPdf(printRef.current, fileName);
                    } catch (err) {
                        console.error('Failed to download PDF:', err);
                    } finally {
                        setDownloadingPdf(false);
                    }
                }
            }, 300);
        }
    };

    const handleExportPayrollExcel = () => {
        const dataToExport = filteredPayroll.map((p, idx) => ({
            '#': idx + 1,
            'Staff Name': p.users?.full_name || 'Staff Member',
            'Role': p.users?.role || 'Staff',
            'Period': `${months[p.period_month - 1]} ${p.period_year}`,
            'Basic Salary ($)': Number(p.basic_salary || 0).toFixed(2),
            'Allowances ($)': Number(p.allowances || 0).toFixed(2),
            'Gross Pay ($)': Number(p.gross_salary || 0).toFixed(2),
            'PAYE Tax ($)': Number(p.paye || 0).toFixed(2),
            'NSSA ($)': Number(p.nssa || 0).toFixed(2),
            'AIDS Levy ($)': Number(p.aids_levy || 0).toFixed(2),
            'Total Deductions ($)': Number(p.deductions || 0).toFixed(2),
            'Net Salary ($)': Number(p.net_salary || 0).toFixed(2),
            'Status': p.status.toUpperCase(),
            'Date Created': p.created_at ? p.created_at.substring(0, 10) : ''
        }));

        exportToExcel(dataToExport, 'spiritmed_payroll_summary');
    };

    const handleExportPayrollPDF = () => {
        const headers = ['#', 'Staff Name', 'Role', 'Period', 'Gross Pay', 'Deductions', 'Net Salary', 'Status'];
        const data = filteredPayroll.map((p, idx) => [
            idx + 1,
            p.users?.full_name || 'Staff Member',
            p.users?.role || 'Staff',
            `${months[p.period_month - 1]} ${p.period_year}`,
            `$${Number(p.gross_salary || 0).toFixed(2)}`,
            `-$${Number(p.deductions || 0).toFixed(2)}`,
            `$${Number(p.net_salary || 0).toFixed(2)}`,
            p.status.toUpperCase()
        ]);

        exportToPDF(headers, data, 'SpiritMed Payroll Summary Report', 'spiritmed_payroll_summary');
    };

    const handleExportStaffSalaryExcel = () => {
        const dataToExport = filteredStaff.map((user, idx) => {
            const config = salaryConfigs[user.id] || { basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, custom_deductions: [] };
            const allowances = (config.housing_allowance || 0) + (config.transport_allowance || 0) + (config.other_allowances || 0);
            return {
                '#': idx + 1,
                'Staff Name': user.full_name,
                'Role': user.role,
                'Basic Salary ($)': Number(config.basic_salary || 0).toFixed(2),
                'Housing Allowance ($)': Number(config.housing_allowance || 0).toFixed(2),
                'Transport Allowance ($)': Number(config.transport_allowance || 0).toFixed(2),
                'Other Allowances ($)': Number(config.other_allowances || 0).toFixed(2),
                'Total Allowances ($)': Number(allowances || 0).toFixed(2),
                'Custom Deductions Count': config.custom_deductions?.length || 0
            };
        });

        exportToExcel(dataToExport, 'spiritmed_staff_salary_configurations');
    };

    const handleExportStaffSalaryPDF = () => {
        const headers = ['#', 'Staff Name', 'Role', 'Basic Salary', 'Allowances', 'Custom Deductions'];
        const data = filteredStaff.map((user, idx) => {
            const config = salaryConfigs[user.id] || { basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, custom_deductions: [] };
            const allowances = (config.housing_allowance || 0) + (config.transport_allowance || 0) + (config.other_allowances || 0);
            return [
                idx + 1,
                user.full_name,
                user.role,
                `$${Number(config.basic_salary || 0).toFixed(2)}`,
                `$${Number(allowances || 0).toFixed(2)}`,
                `${config.custom_deductions?.length || 0} Added`
            ];
        });

        exportToPDF(headers, data, 'SpiritMed Staff Salary Configurations', 'spiritmed_staff_salary_configurations');
    };

    const addCustomDeduction = () => {
        setLocalCustomDeds([...localCustomDeds, { label: 'Extra Deduction', amount: 0 }]);
    };

    const removeCustomDeduction = (idx: number) => {
        setLocalCustomDeds(localCustomDeds.filter((_, i) => i !== idx));
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    // Filtered lists
    const filteredPayroll = payroll.filter(p => p.users?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.users?.role?.toLowerCase().includes(searchQuery.toLowerCase()));
    const filteredStaff = staff.filter(s => s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || s.role?.toLowerCase().includes(searchQuery.toLowerCase()));

    // Pagination calculations
    const totalPayrollItems = filteredPayroll.length;
    const totalPayrollPages = Math.ceil(totalPayrollItems / itemsPerPage) || 1;
    const paginatedPayroll = filteredPayroll.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const totalStaffItems = filteredStaff.length;
    const totalStaffPages = Math.ceil(totalStaffItems / itemsPerPage) || 1;
    const paginatedStaff = filteredStaff.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="space-y-4">
            {/* Header Banner */}
            <div className="flex flex-col md:flex-row items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Payroll & Payslips</h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Financial Management — {branchName || 'SpiritMed Hospital'}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowProcessModal(true)}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm">
                        <Plus className="w-4 h-4" /> Process Monthly Salaries
                    </button>
                </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700 w-fit">
                <button onClick={() => setActiveTab('history')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}><Calendar className="w-3.5 h-3.5" /> Payroll History</button>
                <button onClick={() => setActiveTab('staff')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'staff' ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}><User className="w-3.5 h-3.5" /> Staff Salary Setup</button>
                <button onClick={() => setActiveTab('settings')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}><SettingsIcon className="w-3.5 h-3.5" /> Statutory Settings</button>
            </div>

            {loading ? (
                <div className="flex justify-center p-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" /></div>
            ) : activeTab === 'history' ? (
                /* ─── PAYROLL HISTORY TABLE VIEW ─── */
                <div className="space-y-4">
                    {/* Search & Filter Bar */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input type="text" placeholder="Search staff member or role..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs" />
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium hidden md:block">
                                Showing <span className="font-semibold text-gray-900 dark:text-white">{totalPayrollItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-semibold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, totalPayrollItems)}</span> of <span className="font-semibold text-gray-900 dark:text-white">{totalPayrollItems}</span> records
                            </div>
                            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                                <button
                                    onClick={handleExportPayrollExcel}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-white dark:hover:bg-gray-600 rounded-md transition shadow-xs"
                                    title="Export Payroll to Excel"
                                >
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                    <span>Excel</span>
                                </button>
                                <button
                                    onClick={handleExportPayrollPDF}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-white dark:hover:bg-gray-600 rounded-md transition shadow-xs"
                                    title="Export Payroll to PDF"
                                >
                                    <FileJson className="w-4 h-4 text-rose-600" />
                                    <span>PDF</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700 uppercase tracking-wider text-[11px]">
                                    <tr>
                                        <th className="px-5 py-3.5">Staff Member</th>
                                        <th className="px-5 py-3.5">Period</th>
                                        <th className="px-5 py-3.5">Gross Pay</th>
                                        <th className="px-5 py-3.5">Deductions</th>
                                        <th className="px-5 py-3.5 font-bold text-gray-900 dark:text-white">Net Total</th>
                                        <th className="px-5 py-3.5 text-center">Status</th>
                                        <th className="px-5 py-3.5 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700/60">
                                    {paginatedPayroll.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-5 py-10 text-center text-gray-400 font-medium">
                                                No payroll records found.
                                            </td>
                                        </tr>
                                    ) : paginatedPayroll.map(p => (
                                        <tr key={p.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
                                                        {p.users?.full_name ? p.users.full_name.charAt(0).toUpperCase() : 'U'}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-gray-900 dark:text-white text-xs">{p.users?.full_name || 'Staff Member'}</p>
                                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{p.users?.role || 'Staff'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 font-medium text-gray-700 dark:text-gray-300">
                                                {months[p.period_month - 1]} {p.period_year}
                                            </td>
                                            <td className="px-5 py-3.5 font-medium text-gray-900 dark:text-white">
                                                ${Number(p.gross_salary || 0).toFixed(2)}
                                            </td>
                                            <td className="px-5 py-3.5 font-medium text-rose-600 dark:text-rose-400">
                                                -${Number(p.deductions || 0).toFixed(2)}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                                                    ${Number(p.net_salary || 0).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                                    p.status === 'paid'
                                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                                }`}>
                                                    {p.status === 'paid' ? 'Paid' : 'Pending'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button onClick={() => { setSelectedRecord(p); setShowPayslipModal(true); }}
                                                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md transition"
                                                        title="View & Print Payslip">
                                                        <FileText className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDownloadPDF(p)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition"
                                                        title="Download PDF Payslip">
                                                        <Download className="w-4 h-4" />
                                                    </button>
                                                    {p.status === 'pending' && (
                                                        <button onClick={() => { if (confirm('Mark this salary as PAID?')) handleSettlePayroll(p.id); }}
                                                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition"
                                                            title="Mark as Paid">
                                                            <Check className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Bar */}
                        {totalPayrollPages > 1 && (
                            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/40">
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span>Rows per page:</span>
                                    <select value={itemsPerPage} onChange={e => setItemsPerPage(Number(e.target.value))}
                                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none">
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                                        className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-700 disabled:opacity-40 transition">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                                        Page {currentPage} of {totalPayrollPages}
                                    </span>
                                    <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPayrollPages))} disabled={currentPage === totalPayrollPages}
                                        className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-700 disabled:opacity-40 transition">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : activeTab === 'staff' ? (
                /* ─── STAFF SALARY LIST VIEW ─── */
                <div className="space-y-4">
                    {/* Search & Filter Bar */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input type="text" placeholder="Search staff member or role..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs" />
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium hidden md:block">
                                Showing <span className="font-semibold text-gray-900 dark:text-white">{totalStaffItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-semibold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, totalStaffItems)}</span> of <span className="font-semibold text-gray-900 dark:text-white">{totalStaffItems}</span> staff members
                            </div>
                            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg p-1">
                                <button
                                    onClick={handleExportStaffSalaryExcel}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-white dark:hover:bg-gray-600 rounded-md transition shadow-xs"
                                    title="Export Staff Salary Setup to Excel"
                                >
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                    <span>Excel</span>
                                </button>
                                <button
                                    onClick={handleExportStaffSalaryPDF}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-white dark:hover:bg-gray-600 rounded-md transition shadow-xs"
                                    title="Export Staff Salary Setup to PDF"
                                >
                                    <FileJson className="w-4 h-4 text-rose-600" />
                                    <span>PDF</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Staff Table */}
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-700 uppercase tracking-wider text-[11px]">
                                    <tr>
                                        <th className="px-5 py-3.5">Staff Name</th>
                                        <th className="px-5 py-3.5">Role</th>
                                        <th className="px-5 py-3.5">Basic Salary</th>
                                        <th className="px-5 py-3.5">Allowances</th>
                                        <th className="px-5 py-3.5">Custom Deductions</th>
                                        <th className="px-5 py-3.5 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700/60">
                                    {paginatedStaff.map(user => {
                                        const config = salaryConfigs[user.id] || { basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, custom_deductions: [] };
                                        const allowances = (config.housing_allowance || 0) + (config.transport_allowance || 0) + (config.other_allowances || 0);
                                        const customDedsCount = config.custom_deductions?.length || 0;
                                        return (
                                            <tr key={user.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors">
                                                <td className="px-5 py-3.5 font-semibold text-gray-900 dark:text-white">{user.full_name}</td>
                                                <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400 capitalize">{user.role}</td>
                                                <td className="px-5 py-3.5 text-emerald-700 dark:text-emerald-400 font-medium">${Number(config.basic_salary || 0).toFixed(2)}</td>
                                                <td className="px-5 py-3.5 text-blue-600 dark:text-blue-400 font-medium">${Number(allowances || 0).toFixed(2)}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${customDedsCount > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                                                        {customDedsCount} Added
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3.5 text-center">
                                                    <button onClick={() => { setSelectedUser(user); setLocalCustomDeds(config.custom_deductions || []); setShowConfigModal(true); }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-emerald-50 dark:bg-gray-700 dark:hover:bg-emerald-900/30 text-gray-700 hover:text-emerald-600 dark:text-gray-300 dark:hover:text-emerald-400 rounded-lg font-medium text-xs transition">
                                                        <SettingsIcon className="w-3.5 h-3.5" /> Salary Setup
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Bar */}
                        {totalStaffPages > 1 && (
                            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-900/40">
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span>Rows per page:</span>
                                    <select value={itemsPerPage} onChange={e => setItemsPerPage(Number(e.target.value))}
                                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none">
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                                        className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-700 disabled:opacity-40 transition">
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <span className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                                        Page {currentPage} of {totalStaffPages}
                                    </span>
                                    <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalStaffPages))} disabled={currentPage === totalStaffPages}
                                        className="p-1.5 border border-gray-300 dark:border-gray-600 rounded hover:bg-white dark:hover:bg-gray-700 disabled:opacity-40 transition">
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* ─── STATUTORY SETTINGS TAB ─── */
                <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Statutory Tax & Calculation Controls</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Configure PAYE tax brackets, NSSA ceiling, and AIDS levy percentages</p>
                            </div>
                        </div>
                        <button onClick={handleSaveSettings} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition shadow-sm">
                            <Check className="w-4 h-4" /> Save Statutory Settings
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2 space-y-4">
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">Statutory Toggles</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div>
                                            <p className="font-semibold text-xs text-gray-900 dark:text-white">Enable PAYE (Income Tax)</p>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">Apply tax brackets to monthly taxable salary.</p>
                                        </div>
                                        <button onClick={() => setSettings(s => s ? ({ ...s, paye_enabled: !s.paye_enabled }) : null)}>
                                            {settings?.paye_enabled ? <ToggleRight className="w-7 h-7 text-emerald-600" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div>
                                            <p className="font-semibold text-xs text-gray-900 dark:text-white">Enable NSSA Deduction</p>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">Social security contribution calculated against income ceiling.</p>
                                        </div>
                                        <button onClick={() => setSettings(s => s ? ({ ...s, nssa_enabled: !s.nssa_enabled }) : null)}>
                                            {settings?.nssa_enabled ? <ToggleRight className="w-7 h-7 text-emerald-600" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div>
                                            <p className="font-semibold text-xs text-gray-900 dark:text-white">Enable AIDS Levy</p>
                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">Percentage surcharge calculated on PAYE tax.</p>
                                        </div>
                                        <button onClick={() => setSettings(s => s ? ({ ...s, aids_levy_enabled: !s.aids_levy_enabled }) : null)}>
                                            {settings?.aids_levy_enabled ? <ToggleRight className="w-7 h-7 text-emerald-600" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">PAYE Tax Brackets</h3>
                                <div className="space-y-3">
                                    {settings?.tax_brackets.map((b, i) => (
                                        <div key={i} className="flex gap-3 items-center">
                                            <div className="flex-1">
                                                <label className={labelCls}>Min Income ($)</label>
                                                <input type="number" value={b.min} onChange={e => {
                                                    const newBrackets = [...settings.tax_brackets];
                                                    newBrackets[i].min = parseFloat(e.target.value);
                                                    setSettings({ ...settings, tax_brackets: newBrackets });
                                                }} className={inputCls} />
                                            </div>
                                            <div className="flex-1">
                                                <label className={labelCls}>Max Income ($)</label>
                                                <input type="number" value={b.max} onChange={e => {
                                                    const newBrackets = [...settings.tax_brackets];
                                                    newBrackets[i].max = parseFloat(e.target.value);
                                                    setSettings({ ...settings, tax_brackets: newBrackets });
                                                }} className={inputCls} />
                                            </div>
                                            <div className="w-24">
                                                <label className={labelCls}>Rate %</label>
                                                <input type="number" value={b.rate} onChange={e => {
                                                    const newBrackets = [...settings.tax_brackets];
                                                    newBrackets[i].rate = parseFloat(e.target.value);
                                                    setSettings({ ...settings, tax_brackets: newBrackets });
                                                }} className={inputCls} />
                                            </div>
                                            <button onClick={() => {
                                                const newBrackets = settings.tax_brackets.filter((_, idx) => idx !== i);
                                                setSettings({ ...settings, tax_brackets: newBrackets });
                                            }} className="mt-5 p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    ))}
                                    <button onClick={() => setSettings(s => s ? ({ ...s, tax_brackets: [...s.tax_brackets, { min: 0, max: 0, rate: 0 }] }) : null)}
                                        className="w-full py-2 border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-500 font-medium text-xs hover:border-emerald-500 hover:text-emerald-600 transition rounded-lg flex items-center justify-center gap-1.5">
                                        <Plus className="w-3.5 h-3.5" /> Add Bracket Row
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                                <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">Statutory Percentages</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className={labelCls}>NSSA Rate (%)</label>
                                        <input type="number" step="0.1" value={settings?.nssa_rate} onChange={e => setSettings(s => s ? ({ ...s, nssa_rate: parseFloat(e.target.value) }) : null)} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>NSSA Ceiling Limit ($)</label>
                                        <input type="number" value={settings?.nssa_limit} onChange={e => setSettings(s => s ? ({ ...s, nssa_limit: parseFloat(e.target.value) }) : null)} className={inputCls} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>AIDS Levy Rate (%)</label>
                                        <input type="number" step="0.1" value={settings?.aids_levy_rate} onChange={e => setSettings(s => s ? ({ ...s, aids_levy_rate: parseFloat(e.target.value) }) : null)} className={inputCls} />
                                    </div>
                                </div>
                                <button onClick={handleSaveSettings} className="w-full mt-5 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition text-xs">
                                    Update Statutory Rates
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── SALARY CONFIG MODAL ─── */}
            {showConfigModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
                        <div className="flex justify-between items-center mb-6 pb-3 border-b border-gray-200 dark:border-gray-700">
                            <div>
                                <h2 className="text-base font-bold text-gray-900 dark:text-white">Staff Salary Configuration</h2>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{selectedUser.full_name} ({selectedUser.role})</p>
                            </div>
                            <button onClick={() => setShowConfigModal(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X className="w-5 h-5" /></button>
                        </div>

                        <form onSubmit={handleSaveConfig} className="space-y-6 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <h4 className="font-bold text-gray-900 dark:text-white">Earnings & Allowances</h4>
                                    <div>
                                        <label className={labelCls}>Basic Monthly Salary ($)</label>
                                        <input type="number" step="0.01" value={salaryConfigs[selectedUser.id]?.basic_salary || 0} onChange={e => setSalaryConfigs({ ...salaryConfigs, [selectedUser.id]: { ...salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, branch_id: profile?.branch_id || '', custom_deductions: [] }, basic_salary: parseFloat(e.target.value) } })} className={inputCls} required />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls}>Housing ($)</label>
                                            <input type="number" step="0.01" value={salaryConfigs[selectedUser.id]?.housing_allowance || 0} onChange={e => setSalaryConfigs({ ...salaryConfigs, [selectedUser.id]: { ...salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, branch_id: profile?.branch_id || '', custom_deductions: [] }, housing_allowance: parseFloat(e.target.value) } })} className={inputCls} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Transport ($)</label>
                                            <input type="number" step="0.01" value={salaryConfigs[selectedUser.id]?.transport_allowance || 0} onChange={e => setSalaryConfigs({ ...salaryConfigs, [selectedUser.id]: { ...salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, branch_id: profile?.branch_id || '', custom_deductions: [] }, transport_allowance: parseFloat(e.target.value) } })} className={inputCls} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h4 className="font-bold text-gray-900 dark:text-white">Custom Deductions</h4>
                                        <button type="button" onClick={addCustomDeduction} className="text-xs text-emerald-600 hover:underline font-medium">+ Add New</button>
                                    </div>
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {localCustomDeds.length === 0 ? (
                                            <p className="text-gray-400 py-4 text-center">No extra deductions added.</p>
                                        ) : localCustomDeds.map((d, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <input type="text" value={d.label} onChange={e => {
                                                    const next = [...localCustomDeds];
                                                    next[i].label = e.target.value;
                                                    setLocalCustomDeds(next);
                                                }} className={`${inputCls} flex-1`} placeholder="Deduction Label" />
                                                <input type="number" value={d.amount} onChange={e => {
                                                    const next = [...localCustomDeds];
                                                    next[i].amount = parseFloat(e.target.value);
                                                    setLocalCustomDeds(next);
                                                }} className={`${inputCls} w-24`} placeholder="Amount" />
                                                <button type="button" onClick={() => removeCustomDeduction(i)} className="p-1 text-rose-500"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <button type="button" onClick={() => setShowConfigModal(false)} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 font-medium">Cancel</button>
                                <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700">Save Configuration</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── PROCESS PAYROLL MODAL ─── */}
            {showProcessModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-xl p-6 border border-gray-200 dark:border-gray-700">
                        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-2 text-center">Process Monthly Payroll</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 text-center">Calculates salaries for active staff using statutory rules.</p>

                        <div className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>Month</label>
                                    <select value={processMonth} onChange={e => setProcessMonth(parseInt(e.target.value))} className={inputCls}>
                                        {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Year</label>
                                    <select value={processYear} onChange={e => setProcessYear(parseInt(e.target.value))} className={inputCls}>
                                        <option value={2024}>2024</option>
                                        <option value={2025}>2025</option>
                                        <option value={2026}>2026</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 pt-3">
                                <button onClick={handleRunPayroll} disabled={loading} className="w-full py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition">
                                    {loading ? 'Processing...' : 'Run Payroll Now'}
                                </button>
                                <button onClick={() => setShowProcessModal(false)} className="w-full py-1.5 text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── SIMPLE & CLEAN PAYSLIP MODAL & PRINT VIEW ─── */}
            {showPayslipModal && selectedRecord && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700 relative">
                        {/* Top Action Bar (No-Print) */}
                        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between no-print">
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                                <FileText className="w-4 h-4 text-emerald-600" /> Staff Payslip Document
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => handleDownloadPDF()} disabled={downloadingPdf} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium text-xs transition shadow-sm">
                                    <Download className="w-4 h-4" /> {downloadingPdf ? 'Exporting PDF...' : 'Download PDF'}
                                </button>
                                <button onClick={handlePrint} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg font-medium text-xs transition shadow-sm">
                                    <Printer className="w-4 h-4" /> Print Payslip
                                </button>
                                <button onClick={() => setShowPayslipModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Printable Payslip Body */}
                        <div ref={printRef} className="p-8 text-gray-900 bg-white">
                            {/* Header */}
                            <div className="flex justify-between items-start border-b border-gray-300 pb-6 mb-6">
                                <div>
                                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">SPIRITMED HOSPITAL</h1>
                                    <p className="text-xs text-gray-600 font-medium">{branchName || 'Urocare Clinic Branch'}</p>
                                    <p className="text-[11px] text-gray-500">19 Lezard Avenue, Milton Park, Harare</p>
                                </div>
                                <div className="text-right">
                                    <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-900 font-bold text-xs rounded uppercase tracking-wider mb-1">
                                        PAYSLIP
                                    </span>
                                    <p className="text-xs text-gray-700 font-semibold">
                                        Period: {months[selectedRecord.period_month - 1]} {selectedRecord.period_year}
                                    </p>
                                    <p className="text-[11px] text-gray-500">Issued: {selectedRecord.created_at ? selectedRecord.created_at.substring(0, 10) : '2026-08-04'}</p>
                                </div>
                            </div>

                            {/* Employee Information */}
                            <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                                    <div>
                                        <span className="text-gray-500 block text-[10px] uppercase font-semibold">Employee Name</span>
                                        <span className="font-bold text-gray-900 text-sm">{selectedRecord.users?.full_name || 'Staff Member'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block text-[10px] uppercase font-semibold">Designation / Role</span>
                                        <span className="font-semibold text-gray-800 capitalize">{selectedRecord.users?.role || 'Staff'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block text-[10px] uppercase font-semibold">Employee ID</span>
                                        <span className="font-mono text-gray-800 font-medium">EMP-{selectedRecord.user_id.substring(0, 8).toUpperCase()}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 block text-[10px] uppercase font-semibold">Currency</span>
                                        <span className="font-semibold text-gray-800">USD ($)</span>
                                    </div>
                                </div>
                            </div>

                            {/* Earnings & Deductions Tables */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                                {/* Earnings */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col justify-between">
                                    <div>
                                        <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-800 uppercase tracking-wider border-b border-gray-200">
                                            Earnings Breakdown
                                        </div>
                                        <div className="p-4 space-y-2.5 text-xs">
                                            <div className="flex justify-between text-gray-700">
                                                <span>Basic Monthly Salary</span>
                                                <span className="font-medium">${Number(selectedRecord.basic_salary || 0).toFixed(2)}</span>
                                            </div>
                                            {(salaryConfigs[selectedRecord.user_id]?.housing_allowance || 0) > 0 && (
                                                <div className="flex justify-between text-gray-700">
                                                    <span>Housing Allowance</span>
                                                    <span className="font-medium">${Number(salaryConfigs[selectedRecord.user_id].housing_allowance).toFixed(2)}</span>
                                                </div>
                                            )}
                                            {(salaryConfigs[selectedRecord.user_id]?.transport_allowance || 0) > 0 && (
                                                <div className="flex justify-between text-gray-700">
                                                    <span>Transport Allowance</span>
                                                    <span className="font-medium">${Number(salaryConfigs[selectedRecord.user_id].transport_allowance).toFixed(2)}</span>
                                                </div>
                                            )}
                                            {(salaryConfigs[selectedRecord.user_id]?.other_allowances || 0) > 0 && (
                                                <div className="flex justify-between text-gray-700">
                                                    <span>Other Allowances</span>
                                                    <span className="font-medium">${Number(salaryConfigs[selectedRecord.user_id].other_allowances).toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 px-4 py-2.5 border-t border-gray-200 flex justify-between items-center text-xs font-bold text-gray-900">
                                        <span>Total Gross Salary</span>
                                        <span className="text-emerald-700">${Number(selectedRecord.gross_salary || 0).toFixed(2)}</span>
                                    </div>
                                </div>

                                {/* Deductions */}
                                <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col justify-between">
                                    <div>
                                        <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-800 uppercase tracking-wider border-b border-gray-200">
                                            Deductions & Taxes
                                        </div>
                                        <div className="p-4 space-y-2.5 text-xs">
                                            {selectedRecord.paye > 0 && (
                                                <div className="flex justify-between text-gray-700">
                                                    <span>PAYE Income Tax</span>
                                                    <span className="font-medium text-rose-600">-${Number(selectedRecord.paye).toFixed(2)}</span>
                                                </div>
                                            )}
                                            {selectedRecord.nssa > 0 && (
                                                <div className="flex justify-between text-gray-700">
                                                    <span>NSSA Social Security</span>
                                                    <span className="font-medium text-rose-600">-${Number(selectedRecord.nssa).toFixed(2)}</span>
                                                </div>
                                            )}
                                            {selectedRecord.aids_levy > 0 && (
                                                <div className="flex justify-between text-gray-700">
                                                    <span>AIDS Levy Contribution</span>
                                                    <span className="font-medium text-rose-600">-${Number(selectedRecord.aids_levy).toFixed(2)}</span>
                                                </div>
                                            )}
                                            {salaryConfigs[selectedRecord.user_id]?.custom_deductions?.map((d, idx) => (
                                                <div key={idx} className="flex justify-between text-gray-700">
                                                    <span>{d.label}</span>
                                                    <span className="font-medium text-rose-600">-${Number(d.amount).toFixed(2)}</span>
                                                </div>
                                            ))}
                                            {selectedRecord.paye === 0 && selectedRecord.nssa === 0 && selectedRecord.aids_levy === 0 && (selectedRecord.deductions || 0) > 0 && (
                                                <div className="flex justify-between text-gray-700">
                                                    <span>Statutory / Custom Deductions</span>
                                                    <span className="font-medium text-rose-600">-${Number(selectedRecord.deductions).toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 px-4 py-2.5 border-t border-gray-200 flex justify-between items-center text-xs font-bold text-gray-900">
                                        <span>Total Deductions</span>
                                        <span className="text-rose-600">-${Number(selectedRecord.deductions || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Net Disbursement Box */}
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 flex justify-between items-center mb-8">
                                <div>
                                    <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide block">Net Salary Payable</span>
                                    <span className="text-[11px] text-emerald-700">Electronic Transfer / Bank Payment</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-2xl font-extrabold text-emerald-800">${Number(selectedRecord.net_salary || 0).toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Authorization Footer */}
                            <div className="pt-6 border-t border-gray-200 flex justify-between items-end text-xs text-gray-500">
                                <div>
                                    <p className="font-semibold text-gray-700">SpiritMed Hospital HR & Payroll Dept</p>
                                    <p className="text-[10px]">Confidential — Issued for Employee Record</p>
                                </div>
                                <div className="text-right border-t border-gray-400 pt-1 w-48 text-center">
                                    <span className="text-[10px] uppercase font-semibold text-gray-600">Authorized Signatory</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
