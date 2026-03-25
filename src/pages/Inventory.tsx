import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Package, AlertTriangle, ArrowUpRight, ArrowDownLeft, Filter, X, Edit2, History, ShoppingCart, Clock } from 'lucide-react';

interface InventoryItem {
    id: string;
    name: string;
    category: string;
    sku: string;
    quantity: number;
    unit: string;
    reorder_level: number;
    unit_price: number;
    expiry_date: string;
}

interface Transaction {
    id: string;
    item_id: string;
    transaction_type: 'in' | 'out' | 'adjustment';
    quantity: number;
    reference: string;
    created_at: string;
    item: {
        name: string;
    };
}

export function Inventory() {
    const { profile } = useAuth();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showTxModal, setShowTxModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        category: 'Medicine',
        sku: '',
        unit: 'Bottle',
        quantity: 0,
        reorder_level: 10,
        unit_price: 0,
        expiry_date: ''
    });

    const [txData, setTxData] = useState({
        item_id: '',
        transaction_type: 'in' as 'in' | 'out' | 'adjustment',
        quantity: 0,
        reference: '',
        notes: ''
    });

    useEffect(() => {
        loadInventory();
        loadTransactions();
    }, [profile]);

    const loadInventory = async () => {
        try {
            const { data, error } = await supabase
                .from('inventory_items')
                .select('*')
                .order('name');
            if (error) throw error;
            setItems(data || []);
        } catch (error) {
            console.error('Error loading inventory:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadTransactions = async () => {
        try {
            const { data, error } = await supabase
                .from('inventory_transactions')
                .select('*, item:inventory_items(name)')
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) throw error;
            setTransactions(data || []);
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const { error } = await supabase
                .from('inventory_items')
                .insert([{
                    ...formData,
                    branch_id: profile?.branch_id,
                    updated_at: new Date().toISOString()
                }]);

            if (error) throw error;
            setShowModal(false);
            resetForm();
            loadInventory();
            alert('Item added to inventory!');
        } catch (error) {
            console.error('Error adding item:', error);
            alert('Failed to add item');
        } finally {
            setLoading(false);
        }
    };

    const handleTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);

            // 1. Record Transaction
            const { error: txError } = await supabase
                .from('inventory_transactions')
                .insert([{
                    ...txData,
                    branch_id: profile?.branch_id,
                    created_by: profile?.id
                }]);

            if (txError) throw txError;

            // 2. Update Inventory Quantity
            const item = items.find(i => i.id === txData.item_id);
            if (!item) return;

            let newQuantity = item.quantity;
            if (txData.transaction_type === 'in') newQuantity += txData.quantity;
            else if (txData.transaction_type === 'out') newQuantity -= txData.quantity;
            else newQuantity = txData.quantity; // adjustment

            const { error: itemError } = await supabase
                .from('inventory_items')
                .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
                .eq('id', txData.item_id);

            if (itemError) throw itemError;

            setShowTxModal(false);
            setTxData({ item_id: '', transaction_type: 'in', quantity: 0, reference: '', notes: '' });
            loadInventory();
            loadTransactions();
            alert('Transaction recorded successfully!');
        } catch (error) {
            console.error('Error recording transaction:', error);
            alert('Failed to record transaction');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            category: 'Medicine',
            sku: '',
            unit: 'Bottle',
            quantity: 0,
            reorder_level: 10,
            unit_price: 0,
            expiry_date: ''
        });
    };

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Package className="w-8 h-8 text-indigo-600" />
                        Inventory & Stock
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage medicines, supplies, and hospital stock</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowTxModal(true)}
                        className="flex items-center space-x-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                        <History className="w-5 h-5 text-gray-500" />
                        <span>Stock Adjustment</span>
                    </button>
                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-md"
                    >
                        <Plus className="w-5 h-5" />
                        <span>Add New Item</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold">Total Items</p>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{items.length}</h2>
                        </div>
                        <Package className="w-5 h-5 text-indigo-500" />
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold text-rose-500">Low Stock</p>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                                {items.filter(i => i.quantity <= i.reorder_level).length}
                            </h2>
                        </div>
                        <AlertTriangle className="w-5 h-5 text-rose-500" />
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold">Total Value</p>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                                ${items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0).toLocaleString()}
                            </h2>
                        </div>
                        <ShoppingCart className="w-5 h-5 text-emerald-500" />
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs text-gray-400 uppercase font-bold">Recent Expiry</p>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                                {items.filter(i => i.expiry_date && new Date(i.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).length}
                            </h2>
                        </div>
                        <Clock className="w-5 h-5 text-amber-500" />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search inventory by item name or SKU..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="lg:col-span-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item Details</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">SKU/Category</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Stock</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Price/Expiry</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-gray-900 dark:text-white">{item.name}</div>
                                            <div className="text-xs text-gray-500">{item.unit}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-mono text-gray-500">{item.sku}</div>
                                            <div className="text-[10px] uppercase font-bold text-indigo-600">{item.category}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={`text-sm font-bold ${item.quantity <= item.reorder_level ? 'text-rose-600' : 'text-gray-900 dark:text-white'}`}>
                                                {item.quantity}
                                            </div>
                                            <div className="text-[10px] text-gray-400">Min: {item.reorder_level}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900 dark:text-white">${item.unit_price}</div>
                                            <div className="text-xs text-gray-500">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'No Expiry'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button className="text-gray-400 hover:text-indigo-600 transition" title="Edit Item">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-4">
                            <History className="w-4 h-4" />
                            Recent Activity
                        </h3>
                        <div className="space-y-4">
                            {transactions.map((tx) => (
                                <div key={tx.id} className="flex gap-3 items-start relative group">
                                    <div className={`p-1.5 rounded-full ${tx.transaction_type === 'in' ? 'bg-emerald-100 text-emerald-600' :
                                        tx.transaction_type === 'out' ? 'bg-rose-100 text-rose-600' :
                                            'bg-blue-100 text-blue-600'
                                        }`}>
                                        {tx.transaction_type === 'in' ? <ArrowUpRight className="w-3 h-3" /> :
                                            tx.transaction_type === 'out' ? <ArrowDownLeft className="w-3 h-3" /> :
                                                <Filter className="w-3 h-3" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{tx.item?.name}</p>
                                        <p className="text-[10px] text-gray-500">
                                            {tx.transaction_type.toUpperCase()} {tx.quantity} units • {tx.reference}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-gray-400">{new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            ))}
                            {transactions.length === 0 && (
                                <p className="text-xs text-gray-500 italic text-center py-4">No recent stock activity</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Plus className="w-6 h-6 text-indigo-600" />
                                Add New Inventory Item
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Item Name *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="Medicine">Medicine</option>
                                        <option value="Surgical">Surgical</option>
                                        <option value="Consumable">Consumable</option>
                                        <option value="Equipment">Equipment</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SKU / Code</label>
                                    <input
                                        type="text"
                                        value={formData.sku}
                                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit</label>
                                    <select
                                        value={formData.unit}
                                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="Bottle">Bottle</option>
                                        <option value="Pack">Pack</option>
                                        <option value="Piece">Piece</option>
                                        <option value="Box">Box</option>
                                        <option value="Strip">Strip</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Initial Quantity</label>
                                    <input
                                        type="number"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-rose-600 mb-1">Reorder Level</label>
                                    <input
                                        type="number"
                                        value={formData.reorder_level}
                                        onChange={(e) => setFormData({ ...formData, reorder_level: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Price ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.unit_price}
                                        onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-amber-600 mb-1">Expiry Date</label>
                                    <input
                                        type="date"
                                        value={formData.expiry_date}
                                        onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
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
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Add to Stock'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showTxModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <History className="w-6 h-6 text-indigo-600" />
                                Stock Adjustment
                            </h2>
                            <button onClick={() => setShowTxModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleTransaction} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Item *</label>
                                <select
                                    value={txData.item_id}
                                    onChange={(e) => setTxData({ ...txData, item_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                >
                                    <option value="">Select Item</option>
                                    {items.map(i => (
                                        <option key={i.id} value={i.id}>{i.name} (Qty: {i.quantity})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Action *</label>
                                    <select
                                        value={txData.transaction_type}
                                        onChange={(e) => setTxData({ ...txData, transaction_type: e.target.value as any })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    >
                                        <option value="in">Stock In</option>
                                        <option value="out">Stock Out</option>
                                        <option value="adjustment">Direct Adjustment</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={txData.quantity}
                                        onChange={(e) => setTxData({ ...txData, quantity: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference / Reason</label>
                                <input
                                    type="text"
                                    value={txData.reference}
                                    onChange={(e) => setTxData({ ...txData, reference: e.target.value })}
                                    placeholder="e.g., PO-123, Damaged, Correction"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowTxModal(false)}
                                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Processing...' : 'Confirm Action'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
