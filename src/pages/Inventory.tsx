import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Package, AlertTriangle, ArrowUpRight, ArrowDownLeft, Filter, X, Edit2, History, ShoppingCart, Clock, Trash2, Building2, Layers, Ruler, ChevronDown } from 'lucide-react';
import { logActivity } from '../utils/auditLogger';

const inputCls = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const labelCls = "block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1";

/* ─── reusable dropdown component ─── */
function SearchDropdown({ label, placeholder, items, selectedId, onSelect, onAddNew, icon: Icon }: any) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selectedItem = items.find((i: any) => i.id === selectedId);
    const filtered = items.filter((i: any) => i.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="relative" ref={dropdownRef}>
            <label className={labelCls}>{label}</label>
            <button type="button" onClick={() => setIsOpen(!isOpen)}
                className={`${inputCls} flex items-center justify-between text-left`}>
                <div className="flex items-center gap-2 truncate">
                    {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
                    <span className={selectedItem ? 'text-gray-900 dark:text-white' : 'text-gray-400'}>
                        {selectedItem ? selectedItem.name : placeholder}
                    </span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in duration-100">
                    <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20">
                        <button type="button" onClick={() => { onAddNew(); setIsOpen(false); }}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 rounded-md hover:bg-indigo-100 transition mb-2">
                            <Plus className="w-3" /> Add New
                        </button>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search..." className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md outline-none" autoFocus />
                        </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="p-3 text-xs text-gray-500 text-center">No results found</div>
                        ) : filtered.map((item: any) => (
                            <button key={item.id} type="button"
                                onClick={() => { onSelect(item.id); setIsOpen(false); setSearch(''); }}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition ${selectedId === item.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {item.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

interface InventoryItem {
    id: string;
    branch_id: string;
    name: string;
    category_id: string;
    unit_id: string;
    supplier_id: string;
    sku: string;
    quantity: number;
    reorder_level: number;
    unit_price: number;
    expiry_date: string;
    category?: { name: string };
    unit?: { name: string };
    supplier?: { name: string };
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
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showTxModal, setShowTxModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    /* ─── related data state ─── */
    const [categories, setCategories] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);

    /* ─── quick add modals ─── */
    const [showAddCat, setShowAddCat] = useState(false);
    const [showAddUnit, setShowAddUnit] = useState(false);
    const [showAddSupplier, setShowAddSupplier] = useState(false);
    const [quickAddName, setQuickAddName] = useState('');
    const [submittingMeta, setSubmittingMeta] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        category_id: '',
        sku: '',
        unit_id: '',
        quantity: 0,
        reorder_level: 10,
        unit_price: 0,
        expiry_date: '',
        supplier_id: ''
    });

    const [txData, setTxData] = useState({
        item_id: '',
        transaction_type: 'in' as 'in' | 'out' | 'adjustment',
        quantity: 0,
        reference: '',
        notes: ''
    });

    useEffect(() => {
        loadData();
    }, [profile?.branch_id]);

    const loadData = async () => {
        setLoading(true);
        await Promise.all([
            loadInventory(),
            loadTransactions(),
            loadMeta()
        ]);
        setLoading(false);
    };

    const loadMeta = async () => {
        if (!profile?.branch_id) return;
        const [catRes, unitRes, supRes] = await Promise.all([
            supabase.from('inventory_categories').select('id, name').eq('branch_id', profile.branch_id).order('name'),
            supabase.from('inventory_units').select('id, name').eq('branch_id', profile.branch_id).order('name'),
            supabase.from('suppliers').select('id, name').eq('branch_id', profile.branch_id).order('name')
        ]);
        if (!catRes.error) setCategories(catRes.data || []);
        if (!unitRes.error) setUnits(unitRes.data || []);
        if (!supRes.error) setSuppliers(supRes.data || []);
    };

    const loadInventory = async () => {
        if (!profile?.branch_id) return;
        try {
            const { data, error } = await supabase
                .from('inventory_items')
                .select('*, category:inventory_categories(name), unit:inventory_units(name), supplier:suppliers(name)')
                .eq('branch_id', profile.branch_id)
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
        if (!profile?.branch_id) return;
        try {
            const { data, error } = await supabase
                .from('inventory_transactions')
                .select('*, item:inventory_items(name)')
                .eq('branch_id', profile.branch_id)
                .order('created_at', { ascending: false })
                .limit(10);
            if (error) throw error;
            setTransactions(data || []);
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    };

    const loadAllTransactions = async () => {
        if (!profile?.branch_id) return;
        try {
            const { data, error } = await supabase
                .from('inventory_transactions')
                .select('*, item:inventory_items(name)')
                .eq('branch_id', profile.branch_id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setAllTransactions(data || []);
            setShowHistoryModal(true);
        } catch (error) {
            console.error('Error loading all transactions:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const payload = {
                ...formData,
                branch_id: profile?.branch_id,
                updated_at: new Date().toISOString()
            };

            if (editingItem) {
                const { error } = await supabase
                    .from('inventory_items')
                    .update(payload)
                    .eq('id', editingItem.id);
                if (error) throw error;
                
                if (profile?.id && profile?.branch_id) {
                    await logActivity(supabase, {
                        userId: profile.id,
                        branchId: profile.branch_id,
                        action: 'UPDATE',
                        tableName: 'inventory_items',
                        recordId: editingItem.id,
                        details: `Updated inventory item: ${formData.name}`,
                        newValues: payload
                    });
                }
                alert('Item updated successfully!');
            } else {
                const { error, data } = await supabase
                    .from('inventory_items')
                    .insert([payload])
                    .select()
                    .single();
                if (error) throw error;

                if (profile?.id && profile?.branch_id && data) {
                    await logActivity(supabase, {
                        userId: profile.id,
                        branchId: profile.branch_id,
                        action: 'CREATE',
                        tableName: 'inventory_items',
                        recordId: data.id,
                        details: `Added new inventory item: ${formData.name}`,
                        newValues: payload
                    });
                }
                alert('Item added to inventory!');
            }

            setShowModal(false);
            resetForm();
            loadInventory();
        } catch (error) {
            console.error('Error saving item:', error);
            alert('Failed to save item');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this item? This action cannot be undone and may affect transaction history.')) return;
        try {
            setLoading(true);
            const { error } = await supabase
                .from('inventory_items')
                .delete()
                .eq('id', id);
            if (error) throw error;

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: 'DELETE',
                    tableName: 'inventory_items',
                    recordId: id,
                    details: `Deleted inventory item (ID: ${id})`,
                });
            }
            loadInventory();
            alert('Item deleted successfully');
        } catch (error) {
            console.error('Error deleting item:', error);
            alert('Failed to delete item');
        } finally {
            setLoading(false);
        }
    };

    const openEdit = (item: InventoryItem) => {
        setEditingItem(item);
        setFormData({
            name: item.name,
            category_id: item.category_id || '',
            sku: item.sku,
            unit_id: item.unit_id || '',
            quantity: item.quantity,
            reorder_level: item.reorder_level,
            unit_price: item.unit_price,
            expiry_date: item.expiry_date || '',
            supplier_id: item.supplier_id || ''
        });
        setShowModal(true);
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
            else if (txData.transaction_type === 'out') {
                if (item.quantity < txData.quantity) {
                    alert('Insufficient stock available for this transaction.');
                    setLoading(false);
                    return;
                }
                newQuantity -= txData.quantity;
            }
            else newQuantity = txData.quantity; // adjustment

            const { error: itemError } = await supabase
                .from('inventory_items')
                .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
                .eq('id', txData.item_id);

            if (itemError) throw itemError;

            if (profile?.id && profile?.branch_id) {
                await logActivity(supabase, {
                    userId: profile.id,
                    branchId: profile.branch_id,
                    action: txData.transaction_type.toUpperCase() as any,
                    tableName: 'inventory_transactions',
                    details: `Stock ${txData.transaction_type}: ${txData.quantity} units for ${item.name}. Ref: ${txData.reference}`,
                    newValues: { ...txData, newTotalQuantity: newQuantity }
                });
            }

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
        setEditingItem(null);
        setFormData({
            name: '',
            category_id: '',
            sku: '',
            unit_id: '',
            quantity: 0,
            reorder_level: 10,
            unit_price: 0,
            expiry_date: '',
            supplier_id: ''
        });
    };

    const handleQuickAdd = async (table: string, name: string) => {
        if (!profile?.branch_id || !name) return;
        setSubmittingMeta(true);
        const { data, error } = await supabase.from(table).insert([{ name, branch_id: profile.branch_id }]).select().single();
        if (!error && data) {
            await loadMeta();
            if (table === 'inventory_categories') setFormData(prev => ({ ...prev, category_id: data.id }));
            if (table === 'inventory_units') setFormData(prev => ({ ...prev, unit_id: data.id }));
            if (table === 'suppliers') setFormData(prev => ({ ...prev, supplier_id: data.id }));
            setShowAddCat(false); setShowAddUnit(false); setShowAddSupplier(false);
            setQuickAddName('');
        }
        setSubmittingMeta(false);
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
                                            <div className="text-xs text-gray-500">{item.unit?.name || 'No Unit'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-mono text-gray-500">{item.sku}</div>
                                            <div className="text-[10px] uppercase font-bold text-indigo-600">{item.category?.name || 'Uncategorized'}</div>
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
                                            <div className={`px-2 py-1 rounded-full text-[10px] font-bold w-fit uppercase ${item.quantity === 0 ? 'bg-rose-100 text-rose-600' :
                                                item.quantity <= item.reorder_level ? 'bg-amber-100 text-amber-600' :
                                                    'bg-emerald-100 text-emerald-600'
                                                }`}>
                                                {item.quantity === 0 ? 'Out of Stock' :
                                                    item.quantity <= item.reorder_level ? 'Low Stock' :
                                                        'In Stock'}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-1 truncate max-w-[120px]">{item.supplier?.name || 'No Supplier'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-2">
                                                <button onClick={() => openEdit(item)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition" title="Edit Item">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition" title="Delete Item">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <History className="w-4 h-4" />
                                Recent Activity
                            </h3>
                            <button onClick={loadAllTransactions} className="text-[10px] font-bold text-indigo-600 hover:underline">View All</button>
                        </div>
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
                                {editingItem ? <Edit2 className="w-6 h-6 text-indigo-600" /> : <Plus className="w-6 h-6 text-indigo-600" />}
                                {editingItem ? 'Edit Inventory Item' : 'Add New Inventory Item'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                <SearchDropdown
                                    label="Category"
                                    placeholder="Select Category"
                                    items={categories}
                                    selectedId={formData.category_id}
                                    onSelect={(id: string) => setFormData(d => ({ ...d, category_id: id }))}
                                    onAddNew={() => setShowAddCat(true)}
                                    icon={Layers}
                                />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SKU / Code</label>
                                    <input
                                        type="text"
                                        value={formData.sku}
                                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <SearchDropdown
                                    label="Unit of Measure"
                                    placeholder="Select Unit"
                                    items={units}
                                    selectedId={formData.unit_id}
                                    onSelect={(id: string) => setFormData(d => ({ ...d, unit_id: id }))}
                                    onAddNew={() => setShowAddUnit(true)}
                                    icon={Ruler}
                                />
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
                                <div className="">
                                    <label className="block text-sm font-medium text-amber-600 mb-1">Expiry Date</label>
                                    <input
                                        type="date"
                                        value={formData.expiry_date}
                                        onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>
                                <SearchDropdown
                                    label="Supplier"
                                    placeholder="Select Supplier"
                                    items={suppliers}
                                    selectedId={formData.supplier_id}
                                    onSelect={(id: string) => setFormData(d => ({ ...d, supplier_id: id }))}
                                    onAddNew={() => setShowAddSupplier(true)}
                                    icon={Building2}
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
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : (editingItem ? 'Update Item' : 'Add to Stock')}
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            {showHistoryModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6 flex-shrink-0">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <History className="w-6 h-6 text-indigo-600" />
                                Full Transaction History
                            </h2>
                            <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 border border-gray-100 dark:border-gray-700 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">Date</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">Item</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">Type</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">Qty</th>
                                        <th className="px-4 py-3 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">Reference</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {allTransactions.map((tx) => (
                                        <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                                            <td className="px-4 py-3 text-gray-500 text-[11px] whitespace-nowrap">
                                                {new Date(tx.created_at).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{tx.item?.name}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${tx.transaction_type === 'in' ? 'bg-emerald-100 text-emerald-600' :
                                                    tx.transaction_type === 'out' ? 'bg-rose-100 text-rose-600' :
                                                        'bg-blue-100 text-blue-600'
                                                    }`}>
                                                    {tx.transaction_type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono font-bold text-gray-700 dark:text-gray-300">{tx.quantity}</td>
                                            <td className="px-4 py-3 text-gray-500 text-[11px]">{tx.reference || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            {/* ─── quick add modals ─── */}
            {(showAddCat || showAddUnit || showAddSupplier) && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-sm shadow-2xl animate-in zoom-in duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                {showAddCat ? <Layers className="text-indigo-600 w-5 h-5" /> :
                                    showAddUnit ? <Ruler className="text-indigo-600 w-5 h-5" /> :
                                        <Building2 className="text-indigo-600 w-5 h-5" />}
                                Quick Add {showAddCat ? 'Category' : showAddUnit ? 'Unit' : 'Supplier'}
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className={labelCls}>Name</label>
                                    <input type="text" value={quickAddName} onChange={e => setQuickAddName(e.target.value)}
                                        className={inputCls} placeholder="Enter name..." autoFocus />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button type="button" onClick={() => { setShowAddCat(false); setShowAddUnit(false); setShowAddSupplier(false); setQuickAddName(''); }}
                                        className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-500 hover:bg-gray-50 transition">
                                        Cancel
                                    </button>
                                    <button type="button" disabled={submittingMeta || !quickAddName}
                                        onClick={() => handleQuickAdd(showAddCat ? 'inventory_categories' : showAddUnit ? 'inventory_units' : 'suppliers', quickAddName)}
                                        className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition shadow-md disabled:opacity-50">
                                        {submittingMeta ? '...' : 'Add'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
