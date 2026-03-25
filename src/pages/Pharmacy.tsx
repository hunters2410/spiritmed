import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Pill, Search, ClipboardList, X, Package, ArrowRight, AlertCircle } from 'lucide-react';

interface Prescription {
    id: string;
    patient_id: string;
    doctor_id: string;
    medication_name: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    created_at: string;
    patient: {
        full_name: string;
        patient_number: string;
    };
    doctor: {
        full_name: string;
    };
    status?: string; // We'll handle this locally or via a meta check
}

export function Pharmacy() {
    const { profile } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDispenseModal, setShowDispenseModal] = useState(false);
    const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [dispenseData, setDispenseData] = useState({
        item_id: '',
        quantity: 1,
        notes: ''
    });

    useEffect(() => {
        loadPrescriptions();
        loadInventory();
    }, [profile]);

    const loadPrescriptions = async () => {
        try {
            const { data, error } = await supabase
                .from('prescriptions')
                .select(`
          *,
          patient:patients(full_name, patient_number),
          doctor:users!doctor_id(full_name)
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPrescriptions(data || []);
        } catch (error) {
            console.error('Error loading prescriptions:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadInventory = async () => {
        try {
            const { data, error } = await supabase
                .from('inventory_items')
                .select('id, name, quantity, unit, category')
                .eq('category', 'Medicine')
                .gt('quantity', 0);
            if (error) throw error;
            setInventory(data || []);
        } catch (error) {
            console.error('Error loading inventory:', error);
        }
    };

    const handleDispense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPrescription) return;

        try {
            setLoading(true);

            // 1. Check stock availability
            const item = inventory.find(i => i.id === dispenseData.item_id);
            if (!item || item.quantity < dispenseData.quantity) {
                alert('Insufficient stock available');
                return;
            }

            // 2. Record Inventory Transaction (Stock Out)
            const { error: txError } = await supabase
                .from('inventory_transactions')
                .insert([{
                    item_id: dispenseData.item_id,
                    branch_id: profile?.branch_id,
                    transaction_type: 'out',
                    quantity: dispenseData.quantity,
                    reference: `Dispensed for Rx: ${selectedPrescription.id.slice(0, 8)}`,
                    notes: dispenseData.notes,
                    created_by: profile?.id
                }]);

            if (txError) throw txError;

            // 3. Update Inventory Quantity
            const { error: itemError } = await supabase
                .from('inventory_items')
                .update({
                    quantity: item.quantity - dispenseData.quantity,
                    updated_at: new Date().toISOString()
                })
                .eq('id', dispenseData.item_id);

            if (itemError) throw itemError;

            // 4. (Optional) Mark prescription as dispensed 
            // Since we don't have a status column yet, we could record this in a 
            // 'dispensing_records' table or just show it via transactions.
            // For this MVP, we'll assume the transaction is the record.

            setShowDispenseModal(false);
            setSelectedPrescription(null);
            setDispenseData({ item_id: '', quantity: 1, notes: '' });
            loadPrescriptions();
            loadInventory();
            alert('Medication dispensed successfully!');
        } catch (error) {
            console.error('Error dispensing medication:', error);
            alert('Failed to dispense medication');
        } finally {
            setLoading(false);
        }
    };

    const filteredRx = prescriptions.filter(rx =>
        rx.patient?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rx.medication_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Pill className="w-8 h-8 text-pink-600" />
                        Pharmacy Portal
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Dispense medications and manage prescriptions</p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search by patient name or medication..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading && prescriptions.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600" />
                    </div>
                ) : filteredRx.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">No prescriptions found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredRx.map((rx) => (
                            <div key={rx.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white">{rx.patient?.full_name}</h3>
                                        <p className="text-xs text-gray-500">{rx.patient?.patient_number}</p>
                                    </div>
                                    <div className="p-2 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                                        <Pill className="w-5 h-5 text-pink-600" />
                                    </div>
                                </div>

                                <div className="space-y-3 mb-6">
                                    <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Medication</p>
                                        <p className="text-sm font-bold text-pink-700 dark:text-pink-400">{rx.medication_name}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <p className="text-gray-400 uppercase font-bold text-[8px]">Dosage</p>
                                            <p className="text-gray-700 dark:text-gray-300">{rx.dosage}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 uppercase font-bold text-[8px]">Frequency</p>
                                            <p className="text-gray-700 dark:text-gray-300">{rx.frequency}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400 uppercase font-bold text-[8px]">Duration</p>
                                            <p className="text-gray-700 dark:text-gray-300">{rx.duration}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                    <div className="text-[10px] text-gray-500">
                                        Dr. {rx.doctor?.full_name} • {new Date(rx.created_at).toLocaleDateString()}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSelectedPrescription(rx);
                                            setShowDispenseModal(true);
                                        }}
                                        className="flex items-center gap-1 text-xs font-bold text-pink-600 hover:text-pink-700 transition"
                                    >
                                        DISPENSE <ArrowRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showDispenseModal && selectedPrescription && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <Package className="w-6 h-6 text-pink-600" />
                                Dispense Medication
                            </h2>
                            <button onClick={() => setShowDispenseModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="bg-pink-50 dark:bg-pink-900/10 p-4 rounded-lg mb-6 border border-pink-100 dark:border-pink-900/30">
                            <p className="text-xs text-pink-600 font-bold uppercase mb-1">Prescribed</p>
                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">{selectedPrescription.medication_name}</h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {selectedPrescription.dosage} • {selectedPrescription.frequency} for {selectedPrescription.duration}
                            </p>
                        </div>

                        <form onSubmit={handleDispense} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Link to Inventory Item *</label>
                                <select
                                    value={dispenseData.item_id}
                                    onChange={(e) => setDispenseData({ ...dispenseData, item_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                >
                                    <option value="">Select Stock Item</option>
                                    {inventory.map(i => (
                                        <option key={i.id} value={i.id}>{i.name} (Available: {i.quantity} {i.unit})</option>
                                    ))}
                                </select>
                                {dispenseData.item_id === '' && inventory.length === 0 && (
                                    <p className="text-[10px] text-rose-500 mt-1 flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> No items matching 'Medicine' category in stock
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity to Dispense *</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={dispenseData.quantity}
                                    onChange={(e) => setDispenseData({ ...dispenseData, quantity: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pharmacist Notes</label>
                                <textarea
                                    value={dispenseData.notes}
                                    onChange={(e) => setDispenseData({ ...dispenseData, notes: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-pink-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    rows={2}
                                    placeholder="e.g., Substitute brand used, patient informed..."
                                />
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowDispenseModal(false)}
                                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || dispenseData.item_id === ''}
                                    className="flex-1 py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Processing...' : 'Confirm Dispensing'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
