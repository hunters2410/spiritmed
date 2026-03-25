import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, DollarSign, CreditCard, Banknote, Wallet, X } from 'lucide-react';

interface Payment {
    id: string;
    invoice_id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    notes: string;
    invoice: {
        invoice_number: string;
        patient: {
            full_name: string;
        };
    };
}

export function Payments() {
    const { profile } = useAuth();
    const [payments, setPayments] = useState<Payment[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        invoice_id: '',
        amount: '',
        payment_method: 'cash',
        notes: ''
    });

    useEffect(() => {
        loadPayments();
        loadUnpaidInvoices();

        // Check for invoiceId in URL
        const params = new URLSearchParams(window.location.search);
        const invoiceId = params.get('invoiceId');
        if (invoiceId) {
            setFormData(prev => ({ ...prev, invoice_id: invoiceId }));
            setShowModal(true);
        }
    }, [profile]);

    const loadPayments = async () => {
        try {
            let query = supabase
                .from('payments')
                .select(`
          *,
          invoice:invoices(
            invoice_number,
            patient:patients(full_name)
          )
        `)
                .order('payment_date', { ascending: false });

            if (profile?.role !== 'super_admin' && profile?.branch_id) {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setPayments(data || []);
        } catch (error) {
            console.error('Error loading payments:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadUnpaidInvoices = async () => {
        try {
            let query = supabase
                .from('invoices')
                .select(`
          id, 
          invoice_number, 
          total_amount, 
          status,
          patient:patients(full_name)
        `)
                .in('status', ['unpaid', 'partially_paid']);

            if (profile?.role !== 'super_admin' && profile?.branch_id) {
                query = query.eq('branch_id', profile.branch_id);
            }

            const { data, error } = await query;
            if (error) throw error;
            setInvoices(data || []);
        } catch (error) {
            console.error('Error loading invoices:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const amount = parseFloat(formData.amount);

            // 1. Record Payment
            const { error: paymentError } = await supabase
                .from('payments')
                .insert([{
                    ...formData,
                    amount,
                    payment_date: new Date().toISOString(),
                    branch_id: profile?.branch_id,
                    created_by: profile?.id
                }]);

            if (paymentError) throw paymentError;

            // 2. Update Invoice Status
            // Fetch current invoice to calculate new status
            const { data: invoice } = await supabase
                .from('invoices')
                .select('total_amount, id')
                .eq('id', formData.invoice_id)
                .single();

            const { data: totalPaidResult } = await supabase
                .from('payments')
                .select('amount')
                .eq('invoice_id', formData.invoice_id);

            const totalPaid = totalPaidResult?.reduce((sum, p) => sum + p.amount, 0) || 0;

            let newStatus = 'partially_paid';
            if (totalPaid >= (invoice?.total_amount || 0)) {
                newStatus = 'paid';
            }

            await supabase
                .from('invoices')
                .update({ status: newStatus })
                .eq('id', formData.invoice_id);

            setShowModal(false);
            resetForm();
            loadPayments();
            loadUnpaidInvoices();
            alert('Payment recorded successfully!');
        } catch (error) {
            console.error('Error recording payment:', error);
            alert('Failed to record payment');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            invoice_id: '',
            amount: '',
            payment_method: 'cash',
            notes: ''
        });
    };

    const filteredPayments = payments.filter(p =>
        p.invoice?.patient?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.invoice?.invoice_number.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <DollarSign className="w-8 h-8 text-cyan-600" />
                        Revenue & Payments
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Track payments and financial transactions</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center space-x-2 bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 transition shadow-md"
                >
                    <Plus className="w-5 h-5" />
                    <span>Record Payment</span>
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search by patient or invoice number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Invoice #</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Method</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredPayments.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No payments found</td>
                                </tr>
                            ) : (
                                filteredPayments.map((p) => (
                                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                        <td className="px-6 py-4 text-xs text-gray-500">
                                            {new Date(p.payment_date).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">{p.invoice?.patient?.full_name}</div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm text-gray-600">
                                            {p.invoice?.invoice_number}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-gray-900 dark:text-white">${p.amount.toLocaleString()}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                                                {p.payment_method === 'cash' ? <Banknote className="w-3 h-3 text-green-600" /> :
                                                    p.payment_method === 'card' ? <CreditCard className="w-3 h-3 text-blue-600" /> :
                                                        <Wallet className="w-3 h-3 text-purple-600" />}
                                                {p.payment_method.toUpperCase()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 italic max-w-xs truncate">
                                            {p.notes || '-'}
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
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-6 h-6 text-cyan-600" />
                                Record Payment
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invoice *</label>
                                <select
                                    value={formData.invoice_id}
                                    onChange={(e) => setFormData({ ...formData, invoice_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                >
                                    <option value="">Select Invoice</option>
                                    {invoices.map(inv => (
                                        <option key={inv.id} value={inv.id}>
                                            {inv.invoice_number} - {inv.patient?.full_name} (${inv.total_amount})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Amount *</label>
                                <div className="relative">
                                    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</div>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        className="w-full pl-8 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Method *</label>
                                <select
                                    value={formData.payment_method}
                                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                >
                                    <option value="cash">Cash</option>
                                    <option value="card">Card</option>
                                    <option value="eft">EFT / Bank Transfer</option>
                                    <option value="medical_aid">Medical Aid</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={2}
                                    placeholder="e.g., Reference number, partial payment reason..."
                                />
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Processing...' : 'Record Payment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
