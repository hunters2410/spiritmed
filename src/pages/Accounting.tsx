import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
    Calculator, DollarSign, ArrowUpRight, ArrowDownRight, 
    Search, Filter, FileSpreadsheet, FileJson,
    ChevronLeft, ChevronRight, Activity, Plus, Trash2,
    History, Building2, Stethoscope, RefreshCw, BarChart3,
    BookOpen, Percent, ClipboardList, Briefcase, Info, AlertTriangle, CheckCircle, PieChart, Layers
} from 'lucide-react';
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { useToast } from '../contexts/ToastContext';
import { accountingSync } from '../utils/accountingSync';

interface Account {
    id: string;
    code: string;
    name: string;
    type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    sub_type?: string;
    description?: string;
    is_active: boolean;
}

interface JournalLine {
    id?: string;
    account_id: string;
    description?: string;
    debit: number;
    credit: number;
    account?: { name: string; code: string; type: string };
}

interface JournalEntry {
    id: string;
    entry_number: string;
    entry_date: string;
    description: string;
    reference_type: string;
    reference_id: string;
    is_posted: boolean;
    journal_lines: JournalLine[];
}

interface ARRecord {
    id: string;
    type: 'patient' | 'medical_aid';
    name: string;
    total: number;
    paid: number;
    balance: number;
    age_0_30: number;
    age_31_60: number;
    age_61_90: number;
    age_90_plus: number;
    date: string;
}

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm transition-all";
const labelCls = "block text-xs uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mb-1";

export function Accounting() {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [branchId, setBranchId] = useState<string>(profile?.branch_id || '');
    const [branches, setBranches] = useState<any[]>([]);

    // Double-entry state
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
    const [isSeeded, setIsSeeded] = useState(false);
    const [syncingHistory, setSyncingHistory] = useState(false);
    
    // Tab Controller
    const [activeTab, setActiveTab] = useState<'overview' | 'coa' | 'je' | 'gl' | 'tb' | 'bs' | 'is' | 'cf' | 'ar' | 'ratios'>('overview');

    // UI state
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showJournalModal, setShowJournalModal] = useState(false);
    const [loadingAction, setLoadingAction] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedGLAccount, setSelectedGLAccount] = useState<string>('all');

    // Chart Data
    const [chartData, setChartData] = useState<any[]>([]);

    // Form states
    const [accountForm, setAccountForm] = useState({
        code: '',
        name: '',
        type: 'asset' as Account['type'],
        description: '',
        sub_type: ''
    });

    const [journalForm, setJournalForm] = useState({
        entry_date: new Date().toISOString().split('T')[0],
        description: '',
        lines: [
            { account_id: '', description: '', debit: 0, credit: 0 },
            { account_id: '', description: '', debit: 0, credit: 0 }
        ] as JournalLine[]
    });

    // Aging receivables state
    const [agingAR, setAgingAR] = useState<ARRecord[]>([]);

    useEffect(() => {
        if (profile?.role === 'super_admin') {
            loadBranches();
        }
    }, [profile]);

    useEffect(() => {
        if (branchId) {
            initLedgerData();
        }
    }, [branchId]);

    // Pre-populate filters for P&L or Ledger
    useEffect(() => {
        if (!startDate && !endDate) {
            const today = new Date();
            const firstDay = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]; // Year-start
            const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]; // Month-end
            setStartDate(firstDay);
            setEndDate(lastDay);
        }
    }, []);

    async function loadBranches() {
        const { data } = await supabase.from('branches').select('*').order('name');
        setBranches(data || []);
    }

    async function initLedgerData() {
        setLoading(true);
        try {
            // 1. Fetch Accounts
            const { data: accountsData } = await supabase
                .from('accounts')
                .select('*')
                .eq('branch_id', branchId)
                .order('code', { ascending: true });

            const loadedAccounts = accountsData || [];
            setAccounts(loadedAccounts);
            setIsSeeded(loadedAccounts.length > 0);

            // 2. Fetch Journal Entries with lines
            const { data: entriesData } = await supabase
                .from('journal_entries')
                .select(`
                    *,
                    journal_lines (
                        id,
                        account_id,
                        description,
                        debit,
                        credit,
                        account:accounts(name, code, type)
                    )
                `)
                .eq('branch_id', branchId)
                .order('entry_date', { ascending: false });

            const loadedEntries = (entriesData || []) as JournalEntry[];
            setJournalEntries(loadedEntries);

            // 3. Process overview KPI metrics & trends
            processFinancialTrends(loadedEntries);

            // 4. Load Accounts Receivable Aging from real Invoices
            await loadReceivablesAging();

        } catch (err) {
            console.error('Error loading ledger data:', err);
            showToast('Failed to load accounting data', 'error');
        } finally {
            setLoading(false);
        }
    }

    // Process Recharts Financial trends
    function processFinancialTrends(entries: JournalEntry[]) {
        const last6Months: any[] = [];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            last6Months.push({
                name: `${months[d.getMonth()]} ${d.getFullYear()}`,
                revenue: 0,
                expenses: 0,
                profit: 0,
                month: d.getMonth(),
                year: d.getFullYear()
            });
        }

        entries.forEach(entry => {
            const d = new Date(entry.entry_date);
            const monthData = last6Months.find(m => m.month === d.getMonth() && m.year === d.getFullYear());
            if (monthData) {
                entry.journal_lines.forEach(line => {
                    const accType = line.account?.type;
                    const val = Number(line.debit) || Number(line.credit);
                    if (accType === 'revenue') {
                        // Credit normal balance increase for revenue
                        monthData.revenue += line.credit - line.debit;
                    } else if (accType === 'expense') {
                        // Debit normal balance increase for expenses
                        monthData.expenses += line.debit - line.credit;
                    }
                });
                monthData.profit = monthData.revenue - monthData.expenses;
            }
        });

        setChartData(last6Months);
    }

    // Real Aging Accounts Receivable calculations based on unpaid/partially paid bills
    async function loadReceivablesAging() {
        try {
            const { data: billsData, error } = await supabase
                .from('bills')
                .select(`
                    id,
                    bill_number,
                    bill_date,
                    total_amount,
                    paid_amount,
                    balance,
                    shortfall_balance,
                    medical_aid_balance,
                    payment_method,
                    patient:patients(full_name),
                    medical_aid:medical_aids(name)
                `)
                .eq('branch_id', branchId)
                .neq('status', 'paid');

            if (error) throw error;

            const today = new Date();
            const agingList: ARRecord[] = [];

            (billsData || []).forEach(bill => {
                const billDate = new Date(bill.bill_date);
                const diffTime = Math.abs(today.getTime() - billDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                const patientName = bill.patient?.full_name || 'Generic Patient';
                const medAidName = bill.medical_aid?.name || 'Unknown Medical Aid';

                // Shortfall balance represents Patient Receivable
                const ptDue = Number(bill.shortfall_balance ?? 0);
                // Medical aid balance represents Corporate Receivable
                const maDue = Number(bill.medical_aid_balance ?? 0);

                if (ptDue > 0) {
                    agingList.push({
                        id: `${bill.id}-pt`,
                        type: 'patient',
                        name: `${patientName} (SF - INV ${bill.bill_number})`,
                        total: bill.total_amount,
                        paid: bill.paid_amount,
                        balance: ptDue,
                        age_0_30: diffDays <= 30 ? ptDue : 0,
                        age_31_60: diffDays > 30 && diffDays <= 60 ? ptDue : 0,
                        age_61_90: diffDays > 60 && diffDays <= 90 ? ptDue : 0,
                        age_90_plus: diffDays > 90 ? ptDue : 0,
                        date: bill.bill_date
                    });
                }

                if (maDue > 0) {
                    agingList.push({
                        id: `${bill.id}-ma`,
                        type: 'medical_aid',
                        name: `${medAidName} (MA - Claims INV ${bill.bill_number})`,
                        total: bill.total_amount,
                        paid: bill.paid_amount,
                        balance: maDue,
                        age_0_30: diffDays <= 30 ? maDue : 0,
                        age_31_60: diffDays > 30 && diffDays <= 60 ? maDue : 0,
                        age_61_90: diffDays > 60 && diffDays <= 90 ? maDue : 0,
                        age_90_plus: diffDays > 90 ? maDue : 0,
                        date: bill.bill_date
                    });
                }
            });

            setAgingAR(agingList);
        } catch (err) {
            console.error('Aging receivables error:', err);
        }
    }

    // Manual setup & sync retroactively
    async function handleSetupChartOfAccounts() {
        setSyncingHistory(true);
        try {
            showToast('Creating system Chart of Accounts...', 'info');
            const accountsMap = await accountingSync.ensureDefaultAccounts(branchId);
            
            showToast('Syncing historical bills & invoices to General Ledger...', 'info');
            
            // Fetch existing bills
            const { data: bills } = await supabase
                .from('bills')
                .select('*, patient:patients(full_name)')
                .eq('branch_id', branchId);

            if (bills && bills.length > 0) {
                for (const bill of bills) {
                    await accountingSync.postBillJournalEntry(bill, bill.patient?.full_name || 'Patient');
                }
            }

            // Fetch existing payments
            const { data: payments } = await supabase
                .from('payments')
                .select(`
                    *,
                    bill:bills(
                        bill_number,
                        patient:patients(full_name)
                    )
                `)
                .eq('branch_id', branchId);

            if (payments && payments.length > 0) {
                for (const pay of payments) {
                    await accountingSync.postPaymentJournalEntry(pay as any);
                }
            }

            // Fetch existing expenses
            const { data: expenses } = await supabase
                .from('expenses')
                .select('*, category:expense_categories(name)')
                .eq('branch_id', branchId);

            if (expenses && expenses.length > 0) {
                for (const exp of expenses) {
                    await accountingSync.postExpenseJournalEntry(exp);
                }
            }

            showToast('Double-entry ledger generated successfully!', 'success');
            initLedgerData();
        } catch (err: any) {
            console.error('Accounting migration error:', err);
            showToast(err.message || 'Setup error', 'error');
        } finally {
            setSyncingHistory(false);
        }
    }

    // Create Account Handler
    async function handleCreateAccount(e: React.FormEvent) {
        e.preventDefault();
        setLoadingAction(true);
        try {
            const { error } = await supabase
                .from('accounts')
                .insert([{
                    ...accountForm,
                    branch_id: branchId,
                    is_active: true
                }]);

            if (error) throw error;
            showToast('Account added successfully');
            setShowAccountModal(false);
            setAccountForm({ code: '', name: '', type: 'asset', description: '', sub_type: '' });
            initLedgerData();
        } catch (err: any) {
            showToast(err.message || 'Failed to create account', 'error');
        } finally {
            setLoadingAction(false);
        }
    }

    // Manual Journal Entry Submission
    const addJournalFormLine = () => {
        setJournalForm(prev => ({
            ...prev,
            lines: [...prev.lines, { account_id: '', description: '', debit: 0, credit: 0 }]
        }));
    };

    const removeJournalFormLine = (index: number) => {
        if (journalForm.lines.length <= 2) {
            showToast('A journal entry requires at least 2 lines.', 'warning');
            return;
        }
        setJournalForm(prev => ({
            ...prev,
            lines: prev.lines.filter((_, idx) => idx !== index)
        }));
    };

    const updateJournalLine = (index: number, key: keyof JournalLine, val: any) => {
        setJournalForm(prev => {
            const lines = [...prev.lines];
            lines[index] = { ...lines[index], [key]: val };
            
            // Adjust the balance incredits/debits if appropriate
            if (key === 'debit' && val > 0) {
                lines[index].credit = 0;
            } else if (key === 'credit' && val > 0) {
                lines[index].debit = 0;
            }
            return { ...prev, lines };
        });
    };

    async function handlePostJournalEntry(e: React.FormEvent) {
        e.preventDefault();
        
        // 1. Validation - Double-entry rule: debits must equal credits
        const totalDebits = journalForm.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
        const totalCredits = journalForm.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

        if (totalDebits <= 0) {
            showToast('Journal Entry cannot be empty.', 'warning');
            return;
        }

        if (Math.abs(totalDebits - totalCredits) > 0.001) {
            showToast(`Debits ($${totalDebits.toLocaleString()}) must equal Credits ($${totalCredits.toLocaleString()}). Unbalanced by $${Math.abs(totalDebits - totalCredits).toLocaleString()}`, 'error');
            return;
        }

        // Validate all lines have an account selected
        if (journalForm.lines.some(l => !l.account_id)) {
            showToast('All journal lines must have a valid account selected.', 'warning');
            return;
        }

        setLoadingAction(true);
        try {
            // Create Entry Header
            const entryNumber = `JE-MAN-${Date.now().toString().slice(-6)}`;
            const { data: header, error: headerErr } = await supabase
                .from('journal_entries')
                .insert([{
                    branch_id: branchId,
                    entry_number: entryNumber,
                    entry_date: journalForm.entry_date,
                    description: journalForm.description,
                    reference_type: 'manual',
                    is_posted: true,
                    created_by: profile?.id,
                    posted_by: profile?.id,
                    posted_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (headerErr) throw headerErr;

            // Create Entry Lines
            const { error: linesErr } = await supabase
                .from('journal_lines')
                .insert(journalForm.lines.map(line => ({
                    journal_entry_id: header.id,
                    account_id: line.account_id,
                    description: line.description || journalForm.description,
                    debit: Number(line.debit) || 0,
                    credit: Number(line.credit) || 0
                })));

            if (linesErr) throw linesErr;

            showToast('Journal entry posted successfully!');
            setShowJournalModal(false);
            setJournalForm({
                entry_date: new Date().toISOString().split('T')[0],
                description: '',
                lines: [
                    { account_id: '', description: '', debit: 0, credit: 0 },
                    { account_id: '', description: '', debit: 0, credit: 0 }
                ]
            });
            initLedgerData();
        } catch (err: any) {
            showToast(err.message || 'Post failed', 'error');
        } finally {
            setLoadingAction(false);
        }
    }

    async function handleDeleteJournal(id: string, refType: string) {
        if (refType !== 'manual') {
            showToast('Auto-posted journal entries cannot be deleted manually. Please delete the matching Bill/Payment/Expense instead.', 'warning');
            return;
        }

        if (!confirm('Are you sure you want to delete this journal entry?')) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('journal_entries')
                .delete()
                .eq('id', id);

            if (error) throw error;
            showToast('Journal Entry deleted successfully');
            initLedgerData();
        } catch (err: any) {
            showToast(err.message || 'Delete failed', 'error');
            setLoading(false);
        }
    }

    // ACCOUNT BALANCES CALCULATION
    const calculateAccountBalances = () => {
        const balances: Record<string, { debitSum: number; creditSum: number; balance: number }> = {};
        
        // Initialize
        accounts.forEach(acc => {
            balances[acc.id] = { debitSum: 0, creditSum: 0, balance: 0 };
        });

        // Loop journal lines
        journalEntries.forEach(entry => {
            const entryDate = new Date(entry.entry_date);
            const matchesStart = !startDate || entryDate >= new Date(startDate);
            const matchesEnd = !endDate || entryDate <= new Date(endDate);
            if (!matchesStart || !matchesEnd) return;

            entry.journal_lines.forEach(line => {
                if (!balances[line.account_id]) {
                    balances[line.account_id] = { debitSum: 0, creditSum: 0, balance: 0 };
                }
                const d = Number(line.debit) || 0;
                const c = Number(line.credit) || 0;
                balances[line.account_id].debitSum += d;
                balances[line.account_id].creditSum += c;
            });
        });

        // Compute balances based on account types
        accounts.forEach(acc => {
            const entry = balances[acc.id];
            if (!entry) return;
            
            // Assets and Expenses increase with Debits (Debit - Credit)
            // Liabilities, Equity and Revenue increase with Credits (Credit - Debit)
            if (acc.type === 'asset' || acc.type === 'expense') {
                entry.balance = entry.debitSum - entry.creditSum;
            } else {
                entry.balance = entry.creditSum - entry.debitSum;
            }
        });

        return balances;
    };

    const accountBalances = calculateAccountBalances();

    // 1. GENERAL LEDGER CALCULATION (Per Account running balance details)
    const glLines = () => {
        const lines: {
            id: string;
            date: string;
            jeNumber: string;
            desc: string;
            debit: number;
            credit: number;
            runningBalance: number;
        }[] = [];

        let currentBalance = 0;
        const selectedAcc = accounts.find(a => a.id === selectedGLAccount);
        if (!selectedAcc) return [];

        // Sort journal entries ascending to compute proper running balance
        const sortedAsc = [...journalEntries].sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());

        sortedAsc.forEach(entry => {
            entry.journal_lines.forEach(line => {
                if (line.account_id === selectedGLAccount) {
                    const d = Number(line.debit) || 0;
                    const c = Number(line.credit) || 0;

                    if (selectedAcc.type === 'asset' || selectedAcc.type === 'expense') {
                        currentBalance += (d - c);
                    } else {
                        currentBalance += (c - d);
                    }

                    const entryDate = new Date(entry.entry_date);
                    const matchesStart = !startDate || entryDate >= new Date(startDate);
                    const matchesEnd = !endDate || entryDate <= new Date(endDate);
                    if (!matchesStart || !matchesEnd) return;

                    lines.push({
                        id: line.id || entry.id,
                        date: entry.entry_date,
                        jeNumber: entry.entry_number,
                        desc: line.description || entry.description,
                        debit: d,
                        credit: c,
                        runningBalance: currentBalance
                    });
                }
            });
        });

        // return sorted descending for tabular display
        return lines.reverse();
    };

    // 2. TRIAL BALANCE CALCULATION
    const trialBalanceRows = accounts.map(acc => {
        const bal = accountBalances[acc.id] || { debitSum: 0, creditSum: 0, balance: 0 };
        return {
            ...acc,
            debitSum: bal.debitSum,
            creditSum: bal.creditSum,
            netDebit: acc.type === 'asset' || acc.type === 'expense' ? Math.max(0, bal.balance) : Math.max(0, -bal.balance),
            netCredit: acc.type === 'liability' || acc.type === 'equity' || acc.type === 'revenue' ? Math.max(0, bal.balance) : Math.max(0, -bal.balance)
        };
    });

    const tbTotals = trialBalanceRows.reduce((sums, row) => ({
        debit: sums.debit + row.netDebit,
        credit: sums.credit + row.netCredit
    }), { debit: 0, credit: 0 });

    // 3. BALANCE SHEET GROUPS (Assets = Liabilities + Equity)
    const bsAssets = accounts.filter(a => a.type === 'asset');
    const bsLiabilities = accounts.filter(a => a.type === 'liability');
    const bsEquity = accounts.filter(a => a.type === 'equity');

    const totalAssetsVal = bsAssets.reduce((sum, a) => sum + (accountBalances[a.id]?.balance || 0), 0);
    const totalLiabilitiesVal = bsLiabilities.reduce((sum, a) => sum + (accountBalances[a.id]?.balance || 0), 0);
    const totalEquityVal = bsEquity.reduce((sum, a) => sum + (accountBalances[a.id]?.balance || 0), 0);

    // Dynamic Retained Earnings from current profit (Revenue - Expenses) if not posted to equity yet
    const revenueSum = accounts.filter(a => a.type === 'revenue').reduce((sum, a) => sum + (accountBalances[a.id]?.balance || 0), 0);
    const expensesSum = accounts.filter(a => a.type === 'expense').reduce((sum, a) => sum + (accountBalances[a.id]?.balance || 0), 0);
    const calculatedNetProfit = revenueSum - expensesSum;

    // 4. INCOME STATEMENT GROUPS
    const isRevenues = accounts.filter(a => a.type === 'revenue');
    const isExpenses = accounts.filter(a => a.type === 'expense');

    // 5. FINANCIAL RATIOS CALCULATIONS
    const currentAssets = bsAssets.filter(a => ['1000', '1100', '1110', '1200'].includes(a.code)).reduce((sum, a) => sum + (accountBalances[a.id]?.balance || 0), 0);
    const currentLiabilities = bsLiabilities.filter(a => ['2000', '2100'].includes(a.code)).reduce((sum, a) => sum + (accountBalances[a.id]?.balance || 0), 0);

    const currentRatio = currentLiabilities > 0 ? (currentAssets / currentLiabilities) : 0;
    const profitMargin = revenueSum > 0 ? (calculatedNetProfit / revenueSum) * 100 : 0;
    const debtToEquity = (totalEquityVal + calculatedNetProfit) > 0 ? (totalLiabilitiesVal / (totalEquityVal + calculatedNetProfit)) : 0;

    // 6. EXPORTS
    const handleExportExcel = () => {
        if (activeTab === 'tb') {
            const data = trialBalanceRows.map(r => ({
                'Account Code': r.code,
                'Account Name': r.name.toUpperCase(),
                'Account Type': r.type.toUpperCase(),
                'Debit Balance ($)': r.netDebit,
                'Credit Balance ($)': r.netCredit
            }));
            exportToExcel(data, `trial_balance_${startDate}_to_${endDate}`);
        } else if (activeTab === 'je') {
            const data = journalEntries.map(e => ({
                'Date': e.entry_date,
                'JE Number': e.entry_number,
                'Description': e.description,
                'Reference Type': e.reference_type,
                'Posted': e.is_posted ? 'YES' : 'NO'
            }));
            exportToExcel(data, 'general_journal_entries');
        } else {
            showToast('Excel export supported on Trial Balance and Journal Entries tabs', 'info');
        }
    };

    const handleExportPDF = () => {
        if (activeTab === 'is') {
            const headers = ['Category', 'Account Details', 'Balance ($)'];
            const data = [
                ['REVENUES', '', ''],
                ...isRevenues.map(r => ['', `${r.code} - ${r.name}`, `$${(accountBalances[r.id]?.balance || 0).toLocaleString()}`]),
                ['TOTAL REVENUES', '', `$${revenueSum.toLocaleString()}`],
                ['', '', ''],
                ['EXPENSES', '', ''],
                ...isExpenses.map(e => ['', `${e.code} - ${e.name}`, `$${(accountBalances[e.id]?.balance || 0).toLocaleString()}`]),
                ['TOTAL EXPENSES', '', `$${expensesSum.toLocaleString()}`],
                ['', '', ''],
                ['NET OPERATING SURPLUS / PROFIT', '', `$${calculatedNetProfit.toLocaleString()}`]
            ];
            exportToPDF(headers, data, `Income Statement Period: ${startDate} to ${endDate}`, 'income_statement');
        } else if (activeTab === 'bs') {
            const headers = ['Category', 'Account Details', 'Balance ($)'];
            const data = [
                ['ASSETS', '', ''],
                ...bsAssets.map(r => ['', `${r.code} - ${r.name}`, `$${(accountBalances[r.id]?.balance || 0).toLocaleString()}`]),
                ['TOTAL ASSETS', '', `$${totalAssetsVal.toLocaleString()}`],
                ['', '', ''],
                ['LIABILITIES', '', ''],
                ...bsLiabilities.map(e => ['', `${e.code} - ${e.name}`, `$${(accountBalances[e.id]?.balance || 0).toLocaleString()}`]),
                ['TOTAL LIABILITIES', '', `$${totalLiabilitiesVal.toLocaleString()}`],
                ['', '', ''],
                ['EQUITY', '', ''],
                ...bsEquity.map(q => ['', `${q.code} - ${q.name}`, `$${(accountBalances[q.id]?.balance || 0).toLocaleString()}`]),
                ['RETAINED SURPLUS (PERIOD PROFIT)', '', `$${calculatedNetProfit.toLocaleString()}`],
                ['TOTAL EQUITY & SURPLUS', '', `$${(totalEquityVal + calculatedNetProfit).toLocaleString()}`],
                ['', '', ''],
                ['TOTAL LIABILITIES & EQUITY', '', `$${(totalLiabilitiesVal + totalEquityVal + calculatedNetProfit).toLocaleString()}`]
            ];
            exportToPDF(headers, data, `Balance Sheet Snapshop: ${endDate}`, 'balance_sheet');
        } else {
            showToast('PDF export optimized for Financial Statements (Balance Sheet & Income Statement)', 'info');
        }
    };

    return (
        <div className="space-y-6 font-sans pb-10">
            {/* Global Title Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Calculator className="w-8 h-8 text-indigo-600" /> Professional Double-Entry Accounting
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">GAAP & IFRS Compliant Financial Management Module</p>
                </div>
                
                {profile?.role === 'super_admin' && (
                    <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-gray-400" />
                        <select 
                            value={branchId} 
                            onChange={(e) => setBranchId(e.target.value)} 
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Select Branch...</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Non-Seeded Setup prompt */}
            {!isSeeded && !loading && branchId && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-200 dark:border-indigo-800/40 rounded-xl p-8 text-center space-y-4">
                    <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400">
                        <BookOpen className="w-8 h-8" />
                    </div>
                    <div className="max-w-md mx-auto space-y-2">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Initialize Double-Entry General Ledger</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            This branch currently does not have any active Chart of Accounts. Initialize the system to pre-seed standard hospital accounts (Assets, Liabilities, Equity, Revenues, Expenses) and automatically match existing invoices, receipts, and cash payouts to double-entry ledger lines!
                        </p>
                    </div>
                    <button
                        onClick={handleSetupChartOfAccounts}
                        disabled={syncingHistory}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm shadow-md transition flex items-center gap-2 mx-auto disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncingHistory ? 'animate-spin' : ''}`} />
                        {syncingHistory ? 'Syncing Historical Financials...' : 'Initialize Accounting Module'}
                    </button>
                </div>
            )}

            {isSeeded && branchId && (
                <div className="space-y-6">
                    {/* Tab Navigation Menu */}
                    <div className="overflow-x-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 shadow-sm flex flex-nowrap md:grid md:grid-cols-10 gap-1">
                        {[
                            { id: 'overview', label: 'Overview', icon: BarChart3 },
                            { id: 'coa', label: 'Accounts', icon: BookOpen },
                            { id: 'je', label: 'Journals', icon: ClipboardList },
                            { id: 'gl', label: 'Ledger', icon: Briefcase },
                            { id: 'tb', label: 'Trial Bal', icon: Layers },
                            { id: 'bs', label: 'Balance Sh', icon: PieChart },
                            { id: 'is', label: 'Income St', icon: DollarSign },
                            { id: 'cf', label: 'Cash Flow', icon: RefreshCw },
                            { id: 'ar', label: 'Receivables', icon: History },
                            { id: 'ratios', label: 'Ratios', icon: Percent }
                        ].map(tab => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                                        activeTab === tab.id
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-900/50 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    <Icon className="w-4 h-4 flex-shrink-0" />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Common Statement Header Control - Filter Bar */}
                    {['gl', 'tb', 'bs', 'is', 'cf'].includes(activeTab) && (
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center gap-4">
                            <div className="flex items-center gap-2 text-sm text-gray-500 font-bold uppercase tracking-wider">
                                <Filter className="w-4 h-4 text-indigo-500" /> Statement Period
                            </div>
                            <div className="w-full md:w-auto grid grid-cols-2 gap-2">
                                <div>
                                    <label className={labelCls}>Start Date</label>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-700 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label className={labelCls}>End Date</label>
                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-700 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500" />
                                </div>
                            </div>

                            {activeTab === 'gl' && (
                                <div className="w-full md:w-64">
                                    <label className={labelCls}>Account Ledger Allocation</label>
                                    <select
                                        value={selectedGLAccount}
                                        onChange={e => setSelectedGLAccount(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                                    >
                                        <option value="all">Select Account...</option>
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>{acc.code} - {acc.name.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="md:ml-auto flex items-center gap-2 w-full md:w-auto pt-4 md:pt-0">
                                <button onClick={handleExportExcel} className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-sm font-semibold text-xs">
                                    <FileSpreadsheet className="w-4 h-4" /> <span>Export Excel</span>
                                </button>
                                <button onClick={handleExportPDF} className="flex-1 md:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition shadow-sm font-semibold text-xs">
                                    <FileJson className="w-4 h-4" /> <span>Print Statement</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* TAB CONTENT SPACES */}
                    
                    {/* TAB 1: OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            {/* KPI Metrics row */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs uppercase font-bold text-gray-400">Main Cash & Bank</span>
                                        <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                                            <Briefcase className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                            ${(accountBalances[accounts.find(a=>a.code==='1000')?.id || '']?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                        </span>
                                        <span className="block text-xs text-gray-400 mt-1">Operational liquidity drawer</span>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs uppercase font-bold text-gray-400">Total Patient Receivables</span>
                                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                                            <ArrowUpRight className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                            ${(accountBalances[accounts.find(a=>a.code==='1100')?.id || '']?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                        </span>
                                        <span className="block text-xs text-emerald-500 font-semibold mt-1">Outstanding patient fees</span>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs uppercase font-bold text-gray-400">Medical Aid Claims Receivable</span>
                                        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                            <History className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <span className="text-2xl font-bold text-gray-900 dark:text-white">
                                            ${(accountBalances[accounts.find(a=>a.code==='1110')?.id || '']?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                        </span>
                                        <span className="block text-xs text-blue-500 font-semibold mt-1">Pending insurance claims</span>
                                    </div>
                                </div>

                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs uppercase font-bold text-gray-400">Fiscal Period Profit (P&L)</span>
                                        <div className={`p-2 rounded-lg ${calculatedNetProfit >= 0 ? 'bg-green-50 dark:bg-green-900/30 text-green-600' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600'}`}>
                                            {calculatedNetProfit >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <span className={`text-2xl font-bold ${calculatedNetProfit >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                                            ${calculatedNetProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}
                                        </span>
                                        <span className="block text-xs text-gray-400 mt-1">Net revenue minus expenses</span>
                                    </div>
                                </div>
                            </div>

                            {/* Chart area */}
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm">
                                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">6-Month Income & Expenses Trend</h3>
                                <div className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-800" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                                            <Legend />
                                            <Bar dataKey="revenue" name="Total Revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="expenses" name="Operational Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                            <Line type="monotone" dataKey="profit" name="Net Operating Profit" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: CHART OF ACCOUNTS */}
                    {activeTab === 'coa' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                                <div className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider text-sm flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-indigo-500" /> Active Chart of Accounts
                                </div>
                                <button
                                    onClick={() => setShowAccountModal(true)}
                                    className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm"
                                >
                                    <Plus className="w-4 h-4" /> <span>Add New Account</span>
                                </button>
                            </div>

                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Code</th>
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Account Name</th>
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Type</th>
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Description</th>
                                                <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">Total Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 font-semibold">
                                            {accounts.map(acc => {
                                                const bal = accountBalances[acc.id]?.balance || 0;
                                                return (
                                                    <tr key={acc.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/30 transition-colors">
                                                        <td className="px-6 py-4 text-xs font-bold text-indigo-600 dark:text-indigo-400">{acc.code}</td>
                                                        <td className="px-6 py-4 uppercase text-gray-900 dark:text-white">{acc.name}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                                acc.type === 'asset' ? 'bg-green-50 text-green-700 dark:bg-green-950/20' :
                                                                acc.type === 'liability' ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/20' :
                                                                acc.type === 'equity' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20' :
                                                                acc.type === 'revenue' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/20' :
                                                                'bg-rose-50 text-rose-700 dark:bg-rose-950/20'
                                                            }`}>
                                                                {acc.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-xs text-gray-500 font-medium">{acc.description || 'N/A'}</td>
                                                        <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                                                            ${bal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: JOURNAL ENTRIES */}
                    {activeTab === 'je' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                                <div className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider text-sm flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-indigo-500" /> Double-Entry General Journal
                                </div>
                                <button
                                    onClick={() => setShowJournalModal(true)}
                                    className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm"
                                >
                                    <Plus className="w-4 h-4" /> <span>Post Manual Journal</span>
                                </button>
                            </div>

                            <div className="space-y-4">
                                {journalEntries.map(entry => (
                                    <div key={entry.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
                                        {/* Entry Header */}
                                        <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">{entry.entry_number}</span>
                                                    <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-800 font-bold uppercase rounded tracking-wider text-[9px]">{entry.reference_type}</span>
                                                </div>
                                                <div className="text-gray-500 font-semibold">{entry.description}</div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="font-bold text-gray-700 dark:text-gray-300">{new Date(entry.entry_date).toLocaleDateString()}</span>
                                                {entry.reference_type === 'manual' && (
                                                    <button
                                                        onClick={() => handleDeleteJournal(entry.id, entry.reference_type)}
                                                        className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded transition"
                                                        title="Delete Entry"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Entry Lines */}
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-100/40 dark:bg-gray-800/30 text-gray-400 font-bold uppercase tracking-wider">
                                                        <th className="px-6 py-2 text-left border-b border-gray-200 dark:border-gray-700">Account</th>
                                                        <th className="px-6 py-2 text-left border-b border-gray-200 dark:border-gray-700">Line Description</th>
                                                        <th className="px-6 py-2 text-right border-b border-gray-200 dark:border-gray-700 w-32">Debit ($)</th>
                                                        <th className="px-6 py-2 text-right border-b border-gray-200 dark:border-gray-700 w-32">Credit ($)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 font-medium">
                                                    {entry.journal_lines.map(line => (
                                                        <tr key={line.id} className="hover:bg-gray-100/50 dark:hover:bg-gray-900/10">
                                                            <td className="px-6 py-3 font-semibold text-gray-800 dark:text-gray-200">
                                                                {line.account?.code} - {line.account?.name.toUpperCase()}
                                                            </td>
                                                            <td className="px-6 py-3 text-gray-500">{line.description || entry.description}</td>
                                                            <td className="px-6 py-3 text-right font-bold text-indigo-600">
                                                                {line.debit > 0 ? `$${line.debit.toLocaleString(undefined, {minimumFractionDigits: 2})}` : ''}
                                                            </td>
                                                            <td className="px-6 py-3 text-right font-bold text-emerald-600">
                                                                {line.credit > 0 ? `$${line.credit.toLocaleString(undefined, {minimumFractionDigits: 2})}` : ''}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB 4: GENERAL LEDGER */}
                    {activeTab === 'gl' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            {selectedGLAccount === 'all' ? (
                                <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm font-semibold">
                                    <Info className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                                    Please select an Account Ledger Allocation from the filter bar above to see audit history.
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">
                                                    <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Date</th>
                                                    <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">JE Reference</th>
                                                    <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Line Detail</th>
                                                    <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">Debit</th>
                                                    <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">Credit</th>
                                                    <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">Running Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 font-semibold">
                                                {glLines().map(line => (
                                                    <tr key={line.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/30 transition-colors">
                                                        <td className="px-6 py-4 text-xs font-bold">{new Date(line.date).toLocaleDateString()}</td>
                                                        <td className="px-6 py-4 text-xs text-indigo-600 dark:text-indigo-400 font-bold">{line.jeNumber}</td>
                                                        <td className="px-6 py-4 text-gray-500 font-medium">{line.desc}</td>
                                                        <td className="px-6 py-4 text-right font-bold text-indigo-600">
                                                            {line.debit > 0 ? `$${line.debit.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-bold text-emerald-600">
                                                            {line.credit > 0 ? `$${line.credit.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                                                            ${line.runningBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 5: TRIAL BALANCE */}
                    {activeTab === 'tb' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Code</th>
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Account Name</th>
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Type</th>
                                                <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">Debit ($)</th>
                                                <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">Credit ($)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 font-semibold">
                                            {trialBalanceRows.map(row => (
                                                <tr key={row.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/30 transition-colors">
                                                    <td className="px-6 py-4 text-xs font-bold text-indigo-600 dark:text-indigo-400">{row.code}</td>
                                                    <td className="px-6 py-4 uppercase text-gray-900 dark:text-white">{row.name}</td>
                                                    <td className="px-6 py-4 uppercase text-xs text-gray-400 font-bold">{row.type}</td>
                                                    <td className="px-6 py-4 text-right font-bold text-indigo-600">
                                                        {row.netDebit > 0 ? `$${row.netDebit.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-emerald-600">
                                                        {row.netCredit > 0 ? `$${row.netCredit.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* Totals row */}
                                            <tr className="bg-indigo-50/50 dark:bg-indigo-950/20 font-bold border-t-2 border-indigo-200 dark:border-indigo-800">
                                                <td colSpan={3} className="px-6 py-4 uppercase text-gray-900 dark:text-white">AGGREGATE SUM</td>
                                                <td className="px-6 py-4 text-right text-indigo-600 text-base">
                                                    ${tbTotals.debit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                </td>
                                                <td className="px-6 py-4 text-right text-emerald-600 text-base">
                                                    ${tbTotals.credit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Verification Badge */}
                            {Math.abs(tbTotals.debit - tbTotals.credit) < 0.01 ? (
                                <div className="p-4 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/40 rounded-xl flex items-center gap-2 text-sm font-bold shadow-sm">
                                    <CheckCircle className="w-5 h-5 flex-shrink-0" /> General Ledger verification passed: All transactions are completely balanced.
                                </div>
                            ) : (
                                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-xl flex items-center gap-2 text-sm font-bold shadow-sm">
                                    <AlertTriangle className="w-5 h-5 flex-shrink-0" /> Balance Error: Ledger is unbalanced by ${(tbTotals.debit - tbTotals.credit).toLocaleString()}.
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 6: BALANCE SHEET */}
                    {activeTab === 'bs' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 space-y-6">
                                <div className="text-center space-y-1">
                                    <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900 dark:text-white">BALANCE SHEET REPORT</h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase">AS OF {endDate || new Date().toISOString().split('T')[0]}</p>
                                </div>

                                <div className="space-y-4">
                                    {/* 1. ASSETS */}
                                    <div className="space-y-2">
                                        <h3 className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 text-gray-900 dark:text-white uppercase tracking-wider text-sm">ASSETS</h3>
                                        <div className="pl-4 space-y-1.5 text-sm font-semibold">
                                            {bsAssets.map(a => (
                                                <div key={a.id} className="flex justify-between hover:bg-gray-50 dark:hover:bg-gray-900/30 py-0.5 rounded px-1">
                                                    <span className="text-gray-500 font-medium">{a.code} - {a.name.toUpperCase()}</span>
                                                    <span className="text-gray-900 dark:text-white">${(accountBalances[a.id]?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between font-bold border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 text-indigo-600 text-sm">
                                                <span>TOTAL ACTIVE ASSETS</span>
                                                <span>${totalAssetsVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. LIABILITIES */}
                                    <div className="space-y-2 pt-4">
                                        <h3 className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 text-gray-900 dark:text-white uppercase tracking-wider text-sm">LIABILITIES</h3>
                                        <div className="pl-4 space-y-1.5 text-sm font-semibold">
                                            {bsLiabilities.map(a => (
                                                <div key={a.id} className="flex justify-between hover:bg-gray-50 dark:hover:bg-gray-900/30 py-0.5 rounded px-1">
                                                    <span className="text-gray-500 font-medium">{a.code} - {a.name.toUpperCase()}</span>
                                                    <span className="text-gray-900 dark:text-white">${(accountBalances[a.id]?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between font-bold border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 text-orange-600 text-sm">
                                                <span>TOTAL ACTIVE LIABILITIES</span>
                                                <span>${totalLiabilitiesVal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. EQUITY & SURPLUS */}
                                    <div className="space-y-2 pt-4">
                                        <h3 className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 text-gray-900 dark:text-white uppercase tracking-wider text-sm">EQUITY & RETAINED SURPLUS</h3>
                                        <div className="pl-4 space-y-1.5 text-sm font-semibold">
                                            {bsEquity.map(a => (
                                                <div key={a.id} className="flex justify-between hover:bg-gray-50 dark:hover:bg-gray-900/30 py-0.5 rounded px-1">
                                                    <span className="text-gray-500 font-medium">{a.code} - {a.name.toUpperCase()}</span>
                                                    <span className="text-gray-900 dark:text-white">${(accountBalances[a.id]?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between hover:bg-gray-50 dark:hover:bg-gray-900/30 py-0.5 rounded px-1 text-emerald-600 font-semibold">
                                                <span className="font-medium">RETAINED SURPLUS (CURRENT PERIOD PROFIT)</span>
                                                <span>${calculatedNetProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            </div>
                                            <div className="flex justify-between font-bold border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 text-blue-600 text-sm">
                                                <span>TOTAL SHAREHOLDER EQUITY</span>
                                                <span>${(totalEquityVal + calculatedNetProfit).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Verification Aggregate row */}
                                    <div className="pt-6 border-t-2 border-indigo-200 dark:border-indigo-800 grid grid-cols-2 gap-4 text-center">
                                        <div className="bg-indigo-50/30 dark:bg-indigo-950/10 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900">
                                            <span className={labelCls}>TOTAL GENERAL ASSETS</span>
                                            <span className="block text-xl font-extrabold text-indigo-600 mt-1">${totalAssetsVal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                        </div>
                                        <div className="bg-purple-50/30 dark:bg-purple-950/10 p-3 rounded-lg border border-purple-100 dark:border-purple-900">
                                            <span className={labelCls}>TOTAL LIABILITIES & EQUITY</span>
                                            <span className="block text-xl font-extrabold text-purple-600 mt-1">${(totalLiabilitiesVal + totalEquityVal + calculatedNetProfit).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 7: INCOME STATEMENT */}
                    {activeTab === 'is' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 space-y-6">
                                <div className="text-center space-y-1">
                                    <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900 dark:text-white">INCOME STATEMENT (P&L)</h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase">PERIOD: {startDate || 'INCEPTION'} TO {endDate || 'TODAY'}</p>
                                </div>

                                <div className="space-y-4">
                                    {/* REVENUE */}
                                    <div className="space-y-2">
                                        <h3 className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 text-gray-900 dark:text-white uppercase tracking-wider text-sm flex items-center justify-between">
                                            <span>OPERATING REVENUES</span>
                                            <span className="text-indigo-600">${revenueSum.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                        </h3>
                                        <div className="pl-4 space-y-1.5 text-sm font-semibold">
                                            {isRevenues.map(r => (
                                                <div key={r.id} className="flex justify-between hover:bg-gray-50 dark:hover:bg-gray-900/30 py-0.5 rounded px-1">
                                                    <span className="text-gray-500 font-medium">{r.code} - {r.name.toUpperCase()}</span>
                                                    <span className="text-gray-900 dark:text-white">${(accountBalances[r.id]?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* EXPENSES */}
                                    <div className="space-y-2 pt-4">
                                        <h3 className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 text-gray-900 dark:text-white uppercase tracking-wider text-sm flex items-center justify-between">
                                            <span>OPERATIONAL EXPENSES</span>
                                            <span className="text-rose-600">${expensesSum.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                        </h3>
                                        <div className="pl-4 space-y-1.5 text-sm font-semibold">
                                            {isExpenses.map(e => (
                                                <div key={e.id} className="flex justify-between hover:bg-gray-50 dark:hover:bg-gray-900/30 py-0.5 rounded px-1">
                                                    <span className="text-gray-500 font-medium">{e.code} - {e.name.toUpperCase()}</span>
                                                    <span className="text-gray-900 dark:text-white">${(accountBalances[e.id]?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* NET PROFIT SUMMARY */}
                                    <div className="pt-6 border-t-2 border-indigo-200 dark:border-indigo-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                                        <span className="font-bold uppercase tracking-wider text-sm text-gray-700 dark:text-gray-300">NET SURPLUS / PERIOD INCOME</span>
                                        <span className={`text-xl font-extrabold ${calculatedNetProfit >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                                            ${calculatedNetProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 8: CASH FLOW STATEMENT */}
                    {activeTab === 'cf' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 space-y-6">
                                <div className="text-center space-y-1">
                                    <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900 dark:text-white">CASH FLOW STATEMENT</h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase">PERIOD: {startDate || 'INCEPTION'} TO {endDate || 'TODAY'}</p>
                                </div>

                                <div className="space-y-4 text-sm font-semibold">
                                    {/* 1. OPERATING ACTIVITIES */}
                                    <div className="space-y-2">
                                        <h3 className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 text-gray-900 dark:text-white uppercase tracking-wider text-sm">OPERATING CASH FLOWS</h3>
                                        <div className="pl-4 space-y-1.5">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 font-medium">Surplus from operations (Net Income)</span>
                                                <span>${calculatedNetProfit.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            </div>
                                            
                                            {/* Adjustments for non-cash working capital change */}
                                            {/* Accounts Receivable changes increase/decrease cash flow */}
                                            {(() => {
                                                const ptAR = accountBalances[accounts.find(a=>a.code==='1100')?.id || '']?.balance || 0;
                                                const maAR = accountBalances[accounts.find(a=>a.code==='1110')?.id || '']?.balance || 0;
                                                const totalAR = ptAR + maAR;
                                                
                                                return (
                                                    <div className="flex justify-between text-gray-500">
                                                        <span className="font-medium">Increase in Accounts Receivables (Less non-cash revenue)</span>
                                                        <span className="text-rose-500">-${totalAR.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                                    </div>
                                                );
                                            })()}

                                            <div className="flex justify-between font-bold border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 text-indigo-600">
                                                <span>NET CASH FROM OPERATING ACTIVITIES</span>
                                                <span>
                                                    ${(() => {
                                                        const ptAR = accountBalances[accounts.find(a=>a.code==='1100')?.id || '']?.balance || 0;
                                                        const maAR = accountBalances[accounts.find(a=>a.code==='1110')?.id || '']?.balance || 0;
                                                        const totalAR = ptAR + maAR;
                                                        return (calculatedNetProfit - totalAR).toLocaleString(undefined, {minimumFractionDigits: 2});
                                                    })()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. INVESTING ACTIVITIES */}
                                    <div className="space-y-2 pt-4">
                                        <h3 className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 text-gray-900 dark:text-white uppercase tracking-wider text-sm">INVESTING CASH FLOWS</h3>
                                        <div className="pl-4 space-y-1.5">
                                            <div className="flex justify-between text-gray-500">
                                                <span className="font-medium">Capital expenditures / Medical Equipment acquisitions</span>
                                                <span>-${(accountBalances[accounts.find(a=>a.code==='1500')?.id || '']?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            </div>
                                            <div className="flex justify-between font-bold border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 text-orange-600">
                                                <span>NET CASH FOR INVESTING ACTIVITIES</span>
                                                <span>-${(accountBalances[accounts.find(a=>a.code==='1500')?.id || '']?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. FINANCING ACTIVITIES */}
                                    <div className="space-y-2 pt-4">
                                        <h3 className="font-bold border-b border-gray-200 dark:border-gray-700 pb-1 text-gray-900 dark:text-white uppercase tracking-wider text-sm">FINANCING CASH FLOWS</h3>
                                        <div className="pl-4 space-y-1.5">
                                            <div className="flex justify-between text-gray-500">
                                                <span className="font-medium">Shareholder initial capital contribution</span>
                                                <span>+${(accountBalances[accounts.find(a=>a.code==='3000')?.id || '']?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            </div>
                                            <div className="flex justify-between font-bold border-t border-dashed border-gray-300 dark:border-gray-600 pt-2 text-emerald-600">
                                                <span>NET CASH FROM FINANCING ACTIVITIES</span>
                                                <span>+${(accountBalances[accounts.find(a=>a.code==='3000')?.id || '']?.balance || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* CASH BALANCE SUMMARY */}
                                    <div className="pt-6 border-t-2 border-indigo-200 dark:border-indigo-800 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl">
                                        <span className="font-bold uppercase tracking-wider text-sm text-gray-700 dark:text-gray-300">NET CASH MOVEMENT IN PERIOD</span>
                                        <span className="text-xl font-extrabold text-indigo-600">
                                            ${(() => {
                                                const ptAR = accountBalances[accounts.find(a=>a.code==='1100')?.id || '']?.balance || 0;
                                                const maAR = accountBalances[accounts.find(a=>a.code==='1110')?.id || '']?.balance || 0;
                                                const totalAR = ptAR + maAR;
                                                const capEx = accountBalances[accounts.find(a=>a.code==='1500')?.id || '']?.balance || 0;
                                                const finCap = accountBalances[accounts.find(a=>a.code==='3000')?.id || '']?.balance || 0;
                                                return (calculatedNetProfit - totalAR - capEx + finCap).toLocaleString(undefined, {minimumFractionDigits: 2});
                                            })()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 9: AGING RECEIVABLES */}
                    {activeTab === 'ar' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider text-sm flex items-center gap-2">
                                    <History className="w-5 h-5 text-indigo-500" /> Accounts Receivable aging schedules (medical aids & patients)
                                </div>
                                <div className="text-xs text-gray-500 font-semibold italic">Aging calculated dynamically relative to today</div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Receivable entity</th>
                                                <th className="px-6 py-3 text-left border-b border-gray-200 dark:border-gray-700">Type</th>
                                                <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">0 - 30 Days</th>
                                                <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">31 - 60 Days</th>
                                                <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">61 - 90 Days</th>
                                                <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">90+ Days</th>
                                                <th className="px-6 py-3 text-right border-b border-gray-200 dark:border-gray-700">Total Owed</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700 font-semibold">
                                            {agingAR.length === 0 ? (
                                                <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-500 font-medium">No outstanding balances/debtors found!</td></tr>
                                            ) : (
                                                <>
                                                    {agingAR.map(row => (
                                                        <tr key={row.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/30 transition-colors">
                                                            <td className="px-6 py-4 text-gray-900 dark:text-white uppercase text-xs">{row.name}</td>
                                                            <td className="px-6 py-4">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                                                    row.type === 'medical_aid' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20'
                                                                }`}>
                                                                    {row.type.replace('_', ' ')}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">{row.age_0_30 > 0 ? `$${row.age_0_30.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}</td>
                                                            <td className="px-6 py-4 text-right">{row.age_31_60 > 0 ? `$${row.age_31_60.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}</td>
                                                            <td className="px-6 py-4 text-right">{row.age_61_90 > 0 ? `$${row.age_61_90.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}</td>
                                                            <td className="px-6 py-4 text-right text-rose-500">{row.age_90_plus > 0 ? `$${row.age_90_plus.toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-'}</td>
                                                            <td className="px-6 py-4 text-right text-indigo-600 font-bold">${row.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                        </tr>
                                                    ))}
                                                    {/* Aging aggregate total */}
                                                    <tr className="bg-indigo-50/50 dark:bg-indigo-950/15 font-bold border-t border-indigo-200 dark:border-indigo-800">
                                                        <td colSpan={2} className="px-6 py-4 uppercase">RECEIVABLE TOTALS</td>
                                                        <td className="px-6 py-4 text-right">${agingAR.reduce((s,r)=>s+r.age_0_30, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                        <td className="px-6 py-4 text-right">${agingAR.reduce((s,r)=>s+r.age_31_60, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                        <td className="px-6 py-4 text-right">${agingAR.reduce((s,r)=>s+r.age_61_90, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                        <td className="px-6 py-4 text-right text-rose-500">${agingAR.reduce((s,r)=>s+r.age_90_plus, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                        <td className="px-6 py-4 text-right text-indigo-600 font-extrabold text-base">${agingAR.reduce((s,r)=>s+r.balance, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                    </tr>
                                                </>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 10: RATIOS */}
                    {activeTab === 'ratios' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900 dark:text-white uppercase tracking-wider text-sm">CURRENT RATIO</h3>
                                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 rounded font-bold text-xs">Liquidity</span>
                                    </div>
                                    <div className="text-center py-6">
                                        <span className="block text-4xl font-extrabold text-indigo-600">{currentRatio.toFixed(2)}x</span>
                                        <span className="text-xs text-gray-400 mt-2 block font-medium">Standard: 1.5x - 2.0x</span>
                                    </div>
                                    <p className="text-xs text-gray-500 text-center font-medium">
                                        Measures the hospital's ability to cover short-term liabilities (outstanding supplier accounts) with short-term assets (cash bank + claims receivables).
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900 dark:text-white uppercase tracking-wider text-sm">PROFIT MARGIN</h3>
                                        <span className="px-2 py-0.5 bg-green-50 text-green-700 dark:bg-green-950/20 rounded font-bold text-xs">Profitability</span>
                                    </div>
                                    <div className="text-center py-6">
                                        <span className="block text-4xl font-extrabold text-green-600">{profitMargin.toFixed(1)}%</span>
                                        <span className="text-xs text-gray-400 mt-2 block font-medium">Net profit margin percentage</span>
                                    </div>
                                    <p className="text-xs text-gray-500 text-center font-medium">
                                        Indicates what percentage of total billing patient revenue remains as clean operational net surplus after deducting utility bills, administrative rent and clinical payouts.
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900 dark:text-white uppercase tracking-wider text-sm">DEBT-TO-EQUITY</h3>
                                        <span className="px-2 py-0.5 bg-orange-50 text-orange-700 dark:bg-orange-950/20 rounded font-bold text-xs">Solvency</span>
                                    </div>
                                    <div className="text-center py-6">
                                        <span className="block text-4xl font-extrabold text-orange-600">{debtToEquity.toFixed(2)}x</span>
                                        <span className="text-xs text-gray-400 mt-2 block font-medium">Leverage capitalization</span>
                                    </div>
                                    <p className="text-xs text-gray-500 text-center font-medium">
                                        Compares total hospital liabilities to patient owner equity. Lower values indicate lower financial risk and greater long-term self-sufficiency.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MODALS */}

            {/* MODAL 1: ADD ACCOUNT */}
            {showAccountModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-600" /> Add Chart of Accounts line
                            </h2>
                            <button onClick={() => setShowAccountModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Account Code</label>
                                    <input type="text" required value={accountForm.code} onChange={e => setAccountForm(d => ({ ...d, code: e.target.value }))} className={inputCls} placeholder="e.g. 1120" />
                                </div>
                                <div>
                                    <label className={labelCls}>Account Type</label>
                                    <select required value={accountForm.type} onChange={e => setAccountForm(d => ({ ...d, type: e.target.value as any }))} className={inputCls}>
                                        <option value="asset">Asset</option>
                                        <option value="liability">Liability</option>
                                        <option value="equity">Equity</option>
                                        <option value="revenue">Revenue</option>
                                        <option value="expense">Expense</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Account Name</label>
                                <input type="text" required value={accountForm.name} onChange={e => setAccountForm(d => ({ ...d, name: e.target.value }))} className={inputCls} placeholder="e.g. Bank Account ZWG" />
                            </div>

                            <div>
                                <label className={labelCls}>Sub-Type / Category</label>
                                <input type="text" value={accountForm.sub_type} onChange={e => setAccountForm(d => ({ ...d, sub_type: e.target.value }))} className={inputCls} placeholder="e.g. Current Asset" />
                            </div>

                            <div>
                                <label className={labelCls}>Description / Notes</label>
                                <textarea value={accountForm.description} onChange={e => setAccountForm(d => ({ ...d, description: e.target.value }))} className={`${inputCls} h-20 resize-none`} placeholder="Usage and audit context..." />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowAccountModal(false)} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancel</button>
                                <button type="submit" disabled={loadingAction} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700 transition disabled:opacity-50">
                                    {loadingAction ? 'Adding...' : 'Create Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 2: MANUAL JOURNAL ENTRY */}
            {showJournalModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <ClipboardList className="w-5 h-5 text-indigo-600" /> Post Balanced Journal Entry
                            </h2>
                            <button onClick={() => setShowJournalModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handlePostJournalEntry} className="p-6 space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1">
                                    <label className={labelCls}>Entry Date</label>
                                    <input type="date" required value={journalForm.entry_date} onChange={e => setJournalForm(d => ({ ...d, entry_date: e.target.value }))} className={inputCls} />
                                </div>
                                <div className="col-span-2">
                                    <label className={labelCls}>Entry Narration / Reference</label>
                                    <input type="text" required value={journalForm.description} onChange={e => setJournalForm(d => ({ ...d, description: e.target.value }))} className={inputCls} placeholder="e.g. Month-end depreciation adjustment" />
                                </div>
                            </div>

                            {/* Lines Table */}
                            <div className="space-y-2 border border-gray-150 dark:border-gray-700 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Journal Lines</span>
                                    <button
                                        type="button"
                                        onClick={addJournalFormLine}
                                        className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Add line
                                    </button>
                                </div>

                                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                                    {journalForm.lines.map((line, index) => (
                                        <div key={index} className="grid grid-cols-12 gap-2 items-center">
                                            <div className="col-span-4">
                                                <select
                                                    required
                                                    value={line.account_id}
                                                    onChange={e => updateJournalLine(index, 'account_id', e.target.value)}
                                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                                                >
                                                    <option value="">Select Account...</option>
                                                    {accounts.map(a => (
                                                        <option key={a.id} value={a.id}>{a.code} - {a.name.toUpperCase()}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-4">
                                                <input
                                                    type="text"
                                                    value={line.description || ''}
                                                    onChange={e => updateJournalLine(index, 'description', e.target.value)}
                                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                                                    placeholder="Optional line description..."
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={line.debit || ''}
                                                    onChange={e => updateJournalLine(index, 'debit', parseFloat(e.target.value) || 0)}
                                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs text-right outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                                                    placeholder="Debit"
                                                />
                                            </div>
                                            <div className="col-span-2 flex items-center gap-1">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={line.credit || ''}
                                                    onChange={e => updateJournalLine(index, 'credit', parseFloat(e.target.value) || 0)}
                                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs text-right outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                                                    placeholder="Credit"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeJournalFormLine(index)}
                                                    className="text-gray-400 hover:text-rose-600 transition"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Summary totals */}
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg flex justify-between items-center text-xs font-bold border border-gray-100 dark:border-gray-800">
                                <span className="uppercase text-gray-400">Balancing validation</span>
                                <div className="space-x-4">
                                    <span>Debits: <span className="text-indigo-600 text-sm font-extrabold">${journalForm.lines.reduce((s,l)=>s+(Number(l.debit)||0), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></span>
                                    <span>Credits: <span className="text-emerald-600 text-sm font-extrabold">${journalForm.lines.reduce((s,l)=>s+(Number(l.credit)||0), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></span>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowJournalModal(false)} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition">Cancel</button>
                                <button type="submit" disabled={loadingAction} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700 transition disabled:opacity-50">
                                    {loadingAction ? 'Posting...' : 'Post Entry'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
