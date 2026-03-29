import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Search, Calendar, Settings as SettingsIcon,
    Plus, User, ArrowUpRight, ArrowDownLeft,
    Check, X, FileText, Printer,
    Building2, CreditCard, ToggleLeft, ToggleRight,
    ShieldCheck, Trash2, AlertCircle
} from 'lucide-react';
import { calculateMonthlyPayroll, PayrollSettings, CustomDeduction } from '../utils/payrollCalculations';
import { logActivity } from '../utils/auditLogger';

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
    }, [profile?.branch_id]);

    async function loadData() {
        if (!profile?.branch_id) return;
        setLoading(true);

        const [payrollRes, configRes, staffRes, settingsRes, branchRes] = await Promise.all([
            supabase.from('payroll').select('*, users:user_id(id, full_name, role, phone)').eq('branch_id', profile.branch_id).order('period_year', { ascending: false }).order('period_month', { ascending: false }),
            supabase.from('salary_configurations').select('*').eq('branch_id', profile.branch_id),
            supabase.from('users').select('*').eq('branch_id', profile.branch_id).eq('is_active', true),
            supabase.from('payroll_settings').select('*').eq('branch_id', profile.branch_id).single(),
            supabase.from('branches').select('name').eq('id', profile.branch_id).single()
        ]);

        if (!payrollRes.error) setPayroll(payrollRes.data || []);
        if (!staffRes.error) setStaff(staffRes.data || []);
        if (!settingsRes.error) setSettings(settingsRes.data);
        if (!branchRes.error) setBranchName(branchRes.data.name);

        // If settings don't exist, create default
        if (settingsRes.error && settingsRes.error.code === 'PGRST116') {
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
           // Auto-save default if missing
           await supabase.from('payroll_settings').insert([{ branch_id: profile.branch_id, ...defaultSettings }]);
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
        const win = window.open('', '', 'width=800,height=900');
        if (win && content) {
            win.document.write(`
                <html>
                    <head>
                        <title>Payslip - ${selectedRecord?.users.full_name}</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                        <style>
                            @media print { .no-print { display: none; } }
                            body { font-family: sans-serif; }
                        </style>
                    </head>
                    <body class="p-8">
                        ${content}
                        <script>window.print(); setTimeout(() => window.close(), 500);</script>
                    </body>
                </html>
            `);
            win.document.close();
        }
    };

    const addCustomDeduction = () => {
        setLocalCustomDeds([...localCustomDeds, { label: 'Extra Deduction', amount: 0 }]);
    };

    const removeCustomDeduction = (idx: number) => {
        setLocalCustomDeds(localCustomDeds.filter((_, i) => i !== idx));
    };

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const filtered = payroll.filter(p => p.users.full_name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
                        <CreditCard className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Advanced Payroll</h1>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">Financial Management - {branchName}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowProcessModal(true)}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm">
                        <Plus className="w-4 h-4" /> Process Salaries
                    </button>
                </div>
            </div>

            <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-lg border border-gray-200 dark:border-gray-700 w-fit">
                <button onClick={() => setActiveTab('history')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-white dark:bg-gray-800 text-green-600 shadow-sm' : 'text-gray-500'}`}><Calendar className="w-3.5 h-3.5" /> History</button>
                <button onClick={() => setActiveTab('staff')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'staff' ? 'bg-white dark:bg-gray-800 text-green-600 shadow-sm' : 'text-gray-500'}`}><User className="w-3.5 h-3.5" /> Salaries</button>
                <button onClick={() => setActiveTab('settings')} className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-white dark:bg-gray-800 text-green-600 shadow-sm' : 'text-gray-500'}`}><SettingsIcon className="w-3.5 h-3.5" /> Calc. Settings</button>
            </div>

            {loading ? (
                <div className="flex justify-center p-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" /></div>
            ) : activeTab === 'history' ? (
                /* ─── PAYROLL HISTORY VIEW ─── */
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input type="text" placeholder="Search by staff member..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                                <tr>
                                    <th className="px-6 py-3 text-left">Staff Member</th>
                                    <th className="px-6 py-3 text-left">Period</th>
                                    <th className="px-6 py-3 text-left">Gross Pay</th>
                                    <th className="px-6 py-3 text-left text-rose-600">Total Deductions</th>
                                    <th className="px-6 py-3 text-left font-bold text-gray-900 dark:text-white">Net Total</th>
                                    <th className="px-6 py-3 text-center">Status</th>
                                    <th className="px-6 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {filtered.map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/10 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center text-green-700 font-bold text-xs">{p.users.full_name.charAt(0)}</div>
                                                <div>
                                                    <p className="font-semibold text-gray-900 dark:text-white">{p.users.full_name}</p>
                                                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-tight">{p.users.role}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-semibold text-gray-700 dark:text-gray-300">{months[p.period_month - 1]} {p.period_year}</td>
                                        <td className="px-6 py-4 text-indigo-600 dark:text-indigo-400 font-semibold text-sm">${p.gross_salary.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-rose-600 font-semibold text-sm">-${p.deductions.toLocaleString()}</td>
                                        <td className="px-6 py-4"><span className="px-2 py-1 bg-green-50 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded text-sm font-bold tracking-tight border border-green-100 dark:border-green-800">${p.net_salary.toLocaleString()}</span></td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center gap-2">
                                                <button onClick={() => { setSelectedRecord(p); setShowPayslipModal(true); }} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl" title="View Payslip"><FileText className="w-5 h-5" /></button>
                                                {p.status === 'pending' && <button onClick={() => { if (confirm('Are you sure?')) handleSettlePayroll(p.id); }} className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-xl" title="Mark as Paid"><Check className="w-5 h-5" /></button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : activeTab === 'staff' ? (
                /* ─── STAFF SALARY LIST VIEW ─── */
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="px-6 py-5 text-left">Staff Name</th>
                                <th className="px-6 py-5 text-left">Role</th>
                                <th className="px-6 py-5 text-left">Basic Salary</th>
                                <th className="px-6 py-5 text-left">Allowances</th>
                                <th className="px-6 py-5 text-left">Custom Deductions</th>
                                <th className="px-6 py-5 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {staff.map(user => {
                                const config = salaryConfigs[user.id] || { basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, custom_deductions: [] };
                                const allowances = (config.housing_allowance || 0) + (config.transport_allowance || 0) + (config.other_allowances || 0);
                                const customDedsCount = config.custom_deductions?.length || 0;
                                return (
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/10 transition-colors">
                                        <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">{user.full_name}</td>
                                        <td className="px-6 py-4 text-[10px] uppercase text-gray-400 font-bold tracking-tight">{user.role}</td>
                                        <td className="px-6 py-4 text-green-700 font-semibold text-sm">${config.basic_salary.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-indigo-600 font-semibold text-sm">${allowances.toLocaleString()}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${customDedsCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-gray-100 text-gray-400'}`}>{customDedsCount} Added</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">
                                                <button onClick={() => { setSelectedUser(user); setLocalCustomDeds(config.custom_deductions || []); setShowConfigModal(true); }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl font-semibold text-xs hover:bg-indigo-100 transition active:scale-95">
                                                    <SettingsIcon className="w-4 h-4" /> Setup Salary
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* ─── PAYROLL SETTINGS TAB ─── */
                <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                                <ShieldCheck className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Payroll Calculation Logic</h2>
                                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest mt-0.5">Configure tax brackets and statutory contributions</p>
                            </div>
                        </div>
                        <button onClick={handleSaveSettings} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-xs font-bold transition-all shadow-sm">
                            <Check className="w-4 h-4" /> Save All Settings
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-6">
                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 uppercase tracking-widest text-indigo-600">Tax Controls</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <div>
                                        <p className="font-bold text-xs uppercase tracking-tight text-gray-700 dark:text-gray-300">Enable PAYE (Income Tax)</p>
                                        <p className="text-[10px] text-gray-400">Apply tax brackets to employee monthly income.</p>
                                    </div>
                                    <button onClick={() => setSettings(s => s ? ({ ...s, paye_enabled: !s.paye_enabled }) : null)}>
                                        {settings?.paye_enabled ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <div>
                                        <p className="font-semibold text-sm uppercase tracking-tight">Enable NSSA Deduction</p>
                                        <p className="text-[10px] text-gray-400">Social security contribution at the specified rate.</p>
                                    </div>
                                    <button onClick={() => setSettings(s => s ? ({ ...s, nssa_enabled: !s.nssa_enabled }) : null)}>
                                        {settings?.nssa_enabled ? <ToggleRight className="w-10 h-10 text-green-500" /> : <ToggleLeft className="w-10 h-10 text-gray-300" />}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                                    <div>
                                        <p className="font-bold text-xs uppercase tracking-tight text-gray-700 dark:text-gray-300">Enable AIDS Levy</p>
                                        <p className="text-[10px] text-gray-400">Calculate as a percentage of the final PAYE amount.</p>
                                    </div>
                                    <button onClick={() => setSettings(s => s ? ({ ...s, aids_levy_enabled: !s.aids_levy_enabled }) : null)}>
                                        {settings?.aids_levy_enabled ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8 text-gray-300" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                            <h3 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 uppercase tracking-widest text-indigo-600">Tax Brackets & Tiers</h3>
                            <div className="space-y-4">
                                {settings?.tax_brackets.map((b, i) => (
                                    <div key={i} className="flex gap-4 items-center animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${i * 100}ms` }}>
                                        <div className="flex-1">
                                            <label className={labelCls}>Income Min ($)</label>
                                            <input type="number" value={b.min} onChange={e => {
                                                const newBrackets = [...settings.tax_brackets];
                                                newBrackets[i].min = parseFloat(e.target.value);
                                                setSettings({ ...settings, tax_brackets: newBrackets });
                                            }} className={inputCls} />
                                        </div>
                                        <div className="flex-1">
                                            <label className={labelCls}>Income Max ($)</label>
                                            <input type="number" value={b.max} onChange={e => {
                                                const newBrackets = [...settings.tax_brackets];
                                                newBrackets[i].max = parseFloat(e.target.value);
                                                setSettings({ ...settings, tax_brackets: newBrackets });
                                            }} className={inputCls} />
                                        </div>
                                        <div className="w-24">
                                            <label className={labelCls}>Rate %</label>
                                            <div className="relative">
                                                <input type="number" value={b.rate} onChange={e => {
                                                    const newBrackets = [...settings.tax_brackets];
                                                    newBrackets[i].rate = parseFloat(e.target.value);
                                                    setSettings({ ...settings, tax_brackets: newBrackets });
                                                }} className={`${inputCls} pr-8`} />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-[10px]">%</div>
                                            </div>
                                        </div>
                                        <button onClick={() => {
                                            const newBrackets = settings.tax_brackets.filter((_, idx) => idx !== i);
                                            setSettings({ ...settings, tax_brackets: newBrackets });
                                        }} className="mt-5 p-2 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                                <button onClick={() => setSettings(s => s ? ({ ...s, tax_brackets: [...s.tax_brackets, { min: 0, max: 0, rate: 0 }] }) : null)}
                                    className="w-full py-2 border-2 border-dashed border-gray-100 dark:border-gray-700 text-gray-400 font-bold text-[10px] uppercase hover:border-indigo-500 hover:text-indigo-500 transition-all rounded-lg flex items-center justify-center gap-2">
                                    <Plus className="w-3 h-3" /> Add Tax Bracket Row
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 sticky top-6">
                            <h3 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4 uppercase tracking-widest text-green-600">Statutory Rates</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className={labelCls}>NSSA Rate (%)</label>
                                    <div className="relative">
                                        <input type="number" step="0.1" value={settings?.nssa_rate} onChange={e => setSettings(s => s ? ({ ...s, nssa_rate: parseFloat(e.target.value) }) : null)} className={inputCls} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-xs text-gray-400">%</span>
                                    </div>
                                    <p className="text-[9px] text-gray-400 mt-1 uppercase font-bold italic tracking-tighter">Standard is usually 4.5%</p>
                                </div>
                                <div>
                                    <label className={labelCls}>NSSA Ceiling Limit ($)</label>
                                    <div className="relative">
                                        <input type="number" value={settings?.nssa_limit} onChange={e => setSettings(s => s ? ({ ...s, nssa_limit: parseFloat(e.target.value) }) : null)} className={inputCls} />
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-xs text-gray-300">$</span>
                                    </div>
                                    <p className="text-[9px] text-gray-400 mt-1 uppercase font-bold italic tracking-tighter">Max income targeted for NSSA</p>
                                </div>
                                <div>
                                    <label className={labelCls}>AIDS Levy Rate (%)</label>
                                    <div className="relative">
                                        <input type="number" step="0.1" value={settings?.aids_levy_rate} onChange={e => setSettings(s => s ? ({ ...s, aids_levy_rate: parseFloat(e.target.value) }) : null)} className={inputCls} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-xs text-gray-400">%</span>
                                    </div>
                                    <p className="text-[9px] text-gray-400 mt-1 uppercase font-bold italic tracking-tighter">Percentage of the PAYE amount</p>
                                </div>
                            </div>
                            <button onClick={handleSaveSettings} className="w-full mt-6 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 active:scale-95 transition-all text-xs uppercase tracking-widest">Update Rates</button>
                        </div>
                    </div>
                </div>
            </div>
        )}

            {/* ─── SALARY CONFIG MODAL WITH DYNAMIC DEDUCTIONS ─── */}
            {showConfigModal && selectedUser && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100 dark:border-gray-700">
                            <div>
                                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white leading-tight">Advanced Salary Setup</h2>
                                <p className="text-xs text-indigo-600 font-semibold uppercase tracking-[0.2em] mt-1">{selectedUser.full_name}</p>
                            </div>
                            <button onClick={() => setShowConfigModal(false)} className="p-2 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-colors"><X className="w-6 h-6" /></button>
                        </div>

                        <form onSubmit={handleSaveConfig} className="space-y-10">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-4">
                                    <h4 className="text-xs font-semibold text-indigo-600 uppercase flex items-center gap-2 tracking-widest"><CreditCard className="w-4 h-4" /> Fixed Earnings</h4>
                                    <div>
                                        <label className={labelCls}>Basic Monthly Salary ($)</label>
                                        <input type="number" step="0.01" value={salaryConfigs[selectedUser.id]?.basic_salary || 0} onChange={e => setSalaryConfigs({ ...salaryConfigs, [selectedUser.id]: { ...salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, branch_id: profile?.branch_id || '', custom_deductions: [] }, basic_salary: parseFloat(e.target.value) } })} className={inputCls} required />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelCls}>Housing ($)</label>
                                            <input type="number" step="0.01" value={salaryConfigs[selectedUser.id]?.housing_allowance || 0} onChange={e => setSalaryConfigs({ ...salaryConfigs, [selectedUser.id]: { ...salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, branch_id: profile?.branch_id || '', custom_deductions: [] }, housing_allowance: parseFloat(e.target.value) } })} className={inputCls} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Transport ($)</label>
                                            <input type="number" step="0.01" value={salaryConfigs[selectedUser.id]?.transport_allowance || 0} onChange={e => setSalaryConfigs({ ...salaryConfigs, [selectedUser.id]: { ...salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, branch_id: profile?.branch_id || '', custom_deductions: [] }, transport_allowance: parseFloat(e.target.value) } })} className={inputCls} />
                                        </div>
                                    </div>
                                    <h4 className="text-xs font-semibold text-rose-600 uppercase flex items-center gap-2 tracking-widest pt-4"><AlertCircle className="w-4 h-4" /> Common Deductions</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelCls}>Medical Aid ($)</label>
                                            <input type="number" step="0.01" value={salaryConfigs[selectedUser.id]?.medical_aid_deduction || 0} onChange={e => setSalaryConfigs({ ...salaryConfigs, [selectedUser.id]: { ...salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, branch_id: profile?.branch_id || '', custom_deductions: [] }, medical_aid_deduction: parseFloat(e.target.value) } })} className={inputCls} />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Pension ($)</label>
                                            <input type="number" step="0.01" value={salaryConfigs[selectedUser.id]?.pension_deduction || 0} onChange={e => setSalaryConfigs({ ...salaryConfigs, [selectedUser.id]: { ...salaryConfigs[selectedUser.id] || { user_id: selectedUser.id, basic_salary: 0, housing_allowance: 0, transport_allowance: 0, other_allowances: 0, medical_aid_deduction: 0, pension_deduction: 0, branch_id: profile?.branch_id || '', custom_deductions: [] }, pension_deduction: parseFloat(e.target.value) } })} className={inputCls} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-2">
                                        <h4 className="text-xs font-semibold text-rose-600 uppercase flex items-center gap-2 tracking-widest"><Plus className="w-4 h-4" /> Custom Deductions</h4>
                                        <button type="button" onClick={addCustomDeduction} className="text-[10px] font-semibold text-indigo-600 uppercase hover:underline">+ Add New</button>
                                    </div>
                                    <div className="space-y-3 min-h-[260px] max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {localCustomDeds.length === 0 ? (
                                            <div className="text-center py-10 bg-gray-50 dark:bg-gray-900/40 rounded-xl border-2 border-dashed border-gray-100 dark:border-gray-800">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">No extra deductions added</p>
                                            </div>
                                        ) : localCustomDeds.map((d, i) => (
                                            <div key={i} className="flex gap-2 items-center animate-in slide-in-from-right-2">
                                                <input type="text" value={d.label} onChange={e => {
                                                    const next = [...localCustomDeds];
                                                    next[i].label = e.target.value;
                                                    setLocalCustomDeds(next);
                                                }} className={`${inputCls} flex-1`} placeholder="Label (e.g. Loan)" />
                                                <input type="number" value={d.amount} onChange={e => {
                                                    const next = [...localCustomDeds];
                                                    next[i].amount = parseFloat(e.target.value);
                                                    setLocalCustomDeds(next);
                                                }} className={`${inputCls} w-24`} placeholder="Amt" />
                                                <button type="button" onClick={() => removeCustomDeduction(i)} className="p-2 text-rose-400 hover:text-rose-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button type="button" onClick={() => setShowConfigModal(false)} className="flex-1 py-4 border border-gray-300 rounded-lg font-semibold text-gray-500 hover:bg-gray-50 transition-all uppercase tracking-widest text-xs">Dismiss</button>
                                <button type="submit" className="flex-1 py-4 bg-green-600 text-white rounded-lg font-semibold shadow-xl hover:bg-green-700 active:scale-95 transition-all uppercase tracking-widest text-xs">Save Configuration</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── PROCESS PAYROLL MODAL ─── */}
            {showProcessModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl p-8 border border-gray-100 dark:border-gray-700">
                        <div className="bg-green-50 dark:bg-green-900/20 w-16 h-16 rounded-xl flex items-center justify-center mb-6 mx-auto"><Calendar className="w-8 h-8 text-green-600" /></div>
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2 text-center uppercase tracking-tighter">Run Monthly Payroll</h2>
                        <p className="text-[11px] text-gray-500 mb-8 text-center leading-relaxed">This will calculate salaries for all active staff for the selected period using your current <b>Global Tax Settings</b>.</p>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
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
                            <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-lg flex gap-3 border border-indigo-100 dark:border-indigo-800 shadow-inner">
                                <AlertCircle className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                                <p className="text-[10px] text-indigo-800 dark:text-indigo-200 font-bold leading-relaxed italic uppercase">Warning: Ensure all staff salaries are configured before running.</p>
                            </div>
                            <div className="flex flex-col gap-3 pt-4">
                                <button onClick={handleRunPayroll} disabled={loading} className="w-full py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 shadow-xl transition-all active:scale-95 uppercase tracking-[0.2em] text-xs">
                                    {loading ? 'Processing...' : 'Run Processing Now'}
                                </button>
                                <button onClick={() => setShowProcessModal(false)} className="w-full py-2 text-gray-400 font-bold hover:text-gray-600 transition-colors uppercase text-[10px] tracking-widest">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── PAYSLIP MODAL (Updated logic for custom deds) ─── */}
            {showPayslipModal && selectedRecord && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-900 rounded-xl w-full max-w-4xl shadow-2xl relative">
                        <div className="absolute top-6 right-8 flex gap-3 no-print">
                            <button onClick={handlePrint} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition shadow-xl font-semibold text-xs uppercase tracking-widest"><Printer className="w-4 h-4" /> Print Document</button>
                            <button onClick={() => setShowPayslipModal(false)} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-colors border border-gray-100 dark:border-gray-700"><X className="w-6 h-6" /></button>
                        </div>

                        <div ref={printRef} className="p-12 text-gray-900">
                             {/* (Payslip content stays mostly same but with dynamic custom deds) */}
                            <div className="flex justify-between items-start border-b-4 border-gray-900 pb-10 mb-10">
                                <div className="space-y-1">
                                    <h1 className="text-4xl font-semibold italic tracking-tighter text-indigo-700">SPIRITMED HOSPITAL</h1>
                                    <div className="flex items-center gap-2 text-[11px] font-semibold text-gray-400 uppercase tracking-[0.3em] mt-2"><Building2 className="w-4 h-4 text-indigo-200" /> Branch: {branchName || 'Main Centre'}</div>
                                    <p className="text-[10px] text-gray-300 font-bold uppercase mt-1 italic tracking-widest leading-relaxed">Excellence in Precision Healthcare & Personnel Management</p>
                                </div>
                                <div className="text-right">
                                    <h2 className="text-5xl font-semibold text-gray-900 tracking-tighter uppercase leading-none mb-1">PAYSLIP</h2>
                                    <p className="text-xs font-semibold text-indigo-600 border-2 border-indigo-600 bg-white px-4 py-1.5 rounded-xl inline-block mt-3 shadow-sm">FOR THE MONTH ENDING {months[selectedRecord.period_month - 1].toUpperCase()} {selectedRecord.period_year}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-16 mb-12">
                                <div className="space-y-6">
                                    <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.4em] border-l-4 border-indigo-600 pl-4 py-1">Employee Profile</h4>
                                    <div className="space-y-3 bg-gray-50 p-6 rounded-xl border border-gray-100 shadow-inner">
                                        <div className="flex justify-between items-center"><span className="text-[10px] font-semibold text-gray-400 uppercase">Full Name</span><span className="text-sm font-semibold text-gray-900">{selectedRecord.users.full_name}</span></div>
                                        <div className="flex justify-between items-center"><span className="text-[10px] font-semibold text-gray-400 uppercase">Designation</span><span className="text-sm font-semibold text-indigo-600 italic uppercase">{selectedRecord.users.role}</span></div>
                                        <div className="flex justify-between items-center"><span className="text-[10px] font-semibold text-gray-400 uppercase">Employee ID</span><span className="text-xs font-mono font-semibold border border-indigo-200 px-2 rounded-lg bg-white">EMP-${selectedRecord.user_id.substring(0, 8).toUpperCase()}</span></div>
                                    </div>
                                </div>
                                <div className="space-y-6 text-right">
                                    <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.4em] border-r-4 border-indigo-600 pr-4 py-1">Payment Reconciliation</h4>
                                    <div className="space-y-3 bg-indigo-50/30 p-6 rounded-xl border border-indigo-100 shadow-inner">
                                        <div className="flex justify-between items-center"><span className="text-[10px] font-semibold text-gray-400 uppercase">Currency</span><span className="text-sm font-semibold text-gray-900">U.S. DOLLARS ($)</span></div>
                                        <div className="flex justify-between items-center"><span className="text-[10px] font-semibold text-gray-400 uppercase">Ref. Code</span><span className="text-xs font-semibold text-gray-400 font-mono tracking-tighter">TR-PAY-${selectedRecord.id.substring(0, 5).toUpperCase()}</span></div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-0 border-4 border-gray-900 rounded-xl overflow-hidden mb-12 shadow-2xl">
                                <div className="border-r border-gray-900">
                                    <div className="bg-gray-900 text-white px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.3em] flex items-center justify-between">Earnings <ArrowUpRight className="w-4 h-4 opacity-50" /></div>
                                    <div className="p-8 space-y-4 min-h-[340px]">
                                        <div className="flex justify-between items-center"><span className="text-[11px] font-semibold text-gray-400 uppercase">Basic Monthly Salary</span><span className="text-sm font-semibold font-mono tracking-tight">${Number(selectedRecord.basic_salary).toLocaleString()}</span></div>
                                        { ( (salaryConfigs[selectedRecord.user_id]?.housing_allowance || 0) > 0 ) && <div className="flex justify-between items-center"><span className="text-[11px] font-semibold text-gray-400 uppercase">Housing Allowance</span><span className="text-sm font-semibold font-mono tracking-tight">${Number(salaryConfigs[selectedRecord.user_id].housing_allowance).toLocaleString()}</span></div>}
                                        { ( (salaryConfigs[selectedRecord.user_id]?.transport_allowance || 0) > 0 ) && <div className="flex justify-between items-center"><span className="text-[11px] font-semibold text-gray-400 uppercase">Transport Allowance</span><span className="text-sm font-semibold font-mono tracking-tight">${Number(salaryConfigs[selectedRecord.user_id].transport_allowance).toLocaleString()}</span></div>}
                                    </div>
                                    <div className="border-t border-gray-200 p-6 bg-gray-50 flex justify-between items-center">
                                        <span className="text-xs font-semibold uppercase tracking-widest underline decoration-2 decoration-indigo-200">Total Gross Pay</span>
                                        <span className="text-2xl font-semibold text-indigo-700 tracking-tighter">${Number(selectedRecord.gross_salary).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div>
                                    <div className="bg-gray-900 text-white px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.3em] flex items-center justify-between">Deductions <ArrowDownLeft className="w-4 h-4 opacity-50" /></div>
                                    <div className="p-8 space-y-4 min-h-[340px]">
                                        { selectedRecord.paye > 0 && <div className="flex justify-between items-center"><div className="min-w-0"><p className="text-[11px] font-semibold text-rose-600 uppercase">PAYE Income Tax</p><p className="text-[8px] text-gray-300 italic opacity-80 uppercase tracking-tighter">Statutory Compliance</p></div><span className="text-sm font-semibold text-rose-600 font-mono tracking-tight">-${Number(selectedRecord.paye).toLocaleString()}</span></div>}
                                        { selectedRecord.nssa > 0 && <div className="flex justify-between items-center"><span className="text-[11px] font-semibold text-rose-400 uppercase">NSSA Social Security</span><span className="text-sm font-semibold text-rose-400 font-mono tracking-tight">-${Number(selectedRecord.nssa).toLocaleString()}</span></div>}
                                        { selectedRecord.aids_levy > 0 && <div className="flex justify-between items-center"><span className="text-[11px] font-semibold text-rose-400 uppercase">AIDS Levy Contribution</span><span className="text-sm font-semibold text-rose-400 font-mono tracking-tight">-${Number(selectedRecord.aids_levy).toLocaleString()}</span></div>}
                                        { salaryConfigs[selectedRecord.user_id]?.custom_deductions?.map((d, idx) => (
                                            <div key={idx} className="flex justify-between items-center"><span className="text-[11px] font-semibold text-rose-500/80 uppercase italic">{d.label}</span><span className="text-sm font-semibold text-rose-500/80 font-mono tracking-tight">-${Number(d.amount).toLocaleString()}</span></div>
                                        ))}
                                    </div>
                                    <div className="border-t border-gray-200 p-6 bg-gray-50 flex justify-between items-center">
                                        <span className="text-xs font-semibold uppercase tracking-widest underline decoration-2 decoration-rose-200">Total Deductions</span>
                                        <span className="text-2xl font-semibold text-rose-600 tracking-tighter">${Number(selectedRecord.deductions).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 p-8 rounded-lg flex justify-between items-center text-white shadow-xl relative overflow-hidden group">
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                <div className="relative z-10 space-y-1">
                                    <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-100">Final Net Disbursement</h4>
                                    <p className="text-[10px] text-indigo-300 font-medium max-w-[200px] leading-relaxed italic">Guaranteed Electronic Funds Transfer issued for the period ending {months[selectedRecord.period_month-1]} {selectedRecord.period_year}.</p>
                                </div>
                                <div className="relative z-10 text-right space-y-1">
                                    <div className="text-5xl font-bold tracking-tighter flex items-center gap-1 justify-end"><span className="text-2xl text-indigo-300 font-medium">$</span>{Number(selectedRecord.net_salary).toLocaleString()}</div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest bg-white/10 px-4 py-1.5 rounded-full inline-block mt-2 border border-white/20">Authorized & Verified</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


