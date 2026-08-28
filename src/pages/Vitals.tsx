import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllPatients } from '../utils/patientUtils';
import { Plus, Search, Activity, HeartPulse, Thermometer, Wind, Scale, Ruler, Droplets, History, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { SearchablePatientSelect } from '../components/SearchablePatientSelect';
import { useToast } from '../contexts/ToastContext';

interface VitalSigns {
    id: string;
    patient_id: string;
    recorded_by: string;
    temperature: number;
    blood_pressure_systolic: number;
    blood_pressure_diastolic: number;
    pulse_rate: number;
    respiratory_rate: number;
    weight: number;
    height: number;
    oxygen_saturation: number;
    recorded_at: string;
    patient: {
        full_name: string;
        patient_number: string;
    };
    recorder: {
        full_name: string;
    };
}

export function Vitals() {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const [vitalsList, setVitalsList] = useState<VitalSigns[]>([]);
    const [patients, setPatients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [formData, setFormData] = useState({
        patient_id: '',
        temperature: '',
        blood_pressure_systolic: '',
        blood_pressure_diastolic: '',
        pulse_rate: '',
        respiratory_rate: '',
        weight: '',
        height: '',
        oxygen_saturation: ''
    });

    useEffect(() => {
        loadVitals();
        loadPatients();

        // Check for patientId in URL
        const params = new URLSearchParams(window.location.search);
        const patientId = params.get('patientId');
        if (patientId) {
            setFormData(prev => ({ ...prev, patient_id: patientId }));
            setShowModal(true);
        }
    }, [profile]);

    const loadVitals = async () => {
        try {
            let allVitals: any[] = [];
            let from = 0;
            const pageSize = 1000;
            while (true) {
                let query = supabase
                    .from('vital_signs')
                    .select(`
                      *,
                      patient:patients(full_name, patient_number),
                      recorder:users!recorded_by(full_name)
                    `)
                    .order('recorded_at', { ascending: false })
                    .range(from, from + pageSize - 1);

                if (profile?.role !== 'super_admin' && profile?.branch_id) {
                    query = query.eq('branch_id', profile.branch_id);
                }

                const { data, error } = await query;
                if (error) throw error;
                if (!data || data.length === 0) break;
                allVitals = allVitals.concat(data);
                if (data.length < pageSize) break;
                from += pageSize;
            }
            setVitalsList(allVitals);
        } catch (error) {
            console.error('Error loading vitals:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPatients = async () => {
        try {
            const activeBranchId = profile?.role !== 'super_admin' ? profile?.branch_id : undefined;
            const data = await fetchAllPatients({
                branchId: activeBranchId,
                select: 'id, full_name, patient_number',
                activeOnly: true
            });
            setPatients(data || []);
        } catch (error) {
            console.error('Error loading patients:', error);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const { error } = await supabase
                .from('vital_signs')
                .insert([{
                    ...formData,
                    branch_id: profile?.branch_id,
                    recorded_by: profile?.id,
                    recorded_at: new Date().toISOString()
                }]);

            if (error) throw error;

            setShowModal(false);
            resetForm();
            loadVitals();
            showToast('Vital signs recorded successfully!');
        } catch (error: any) {
            console.error('Error recording vitals:', error);
            showToast(error.message || 'Failed to record vitals', 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            patient_id: '',
            temperature: '',
            blood_pressure_systolic: '',
            blood_pressure_diastolic: '',
            pulse_rate: '',
            respiratory_rate: '',
            weight: '',
            height: '',
            oxygen_saturation: ''
        });
    };

    const filteredVitals = vitalsList.filter(v =>
        v.patient?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.patient?.patient_number.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <HeartPulse className="w-8 h-8 text-rose-600" />
                        Vital Signs
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Record and monitor patient health metrics</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center space-x-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition shadow-md"
                >
                    <Plus className="w-5 h-5" />
                    <span>Record Vitals</span>
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search vitals by patient name or number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {loading && vitalsList.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600" />
                    </div>
                ) : filteredVitals.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-gray-200 dark:border-gray-700">
                        <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">No vitals records found</p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Patient</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">BP (mmHg)</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pulse/Resp</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Temp/SpO2</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Weight/Height</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recorded By</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredVitals.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((v) => (
                                        <tr key={v.id} className="hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{v.patient?.full_name}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{v.patient?.patient_number}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 dark:text-white font-bold">
                                                    {v.blood_pressure_systolic}/{v.blood_pressure_diastolic}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                                                    <Activity className="w-3 h-3 text-rose-500" /> {v.pulse_rate} bpm
                                                </div>
                                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Wind className="w-3 h-3 text-blue-500" /> {v.respiratory_rate} rpm
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                                                    <Thermometer className="w-3 h-3 text-orange-500" /> {v.temperature}°C
                                                </div>
                                                <div className="text-xs text-blue-600 flex items-center gap-1 font-medium">
                                                    <Droplets className="w-3 h-3" /> {v.oxygen_saturation}% SpO2
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 dark:text-white flex items-center gap-1">
                                                    <Scale className="w-3 h-3 text-gray-400" /> {v.weight} kg
                                                </div>
                                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                                    <Ruler className="w-3 h-3 text-gray-400" /> {v.height} cm
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                <div className="flex items-center gap-1">
                                                    <User className="w-3 h-3" /> {v.recorder?.full_name}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs text-gray-500">
                                                {new Date(v.recorded_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination Controls */}
                        {filteredVitals.length > 0 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/10">
                                <div className="flex items-center gap-4">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Showing <span className="font-bold text-gray-900 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900 dark:text-white">{Math.min(currentPage * itemsPerPage, filteredVitals.length)}</span> of <span className="font-bold text-gray-900 dark:text-white">{filteredVitals.length}</span> records
                                    </p>
                                    <div className="flex items-center gap-1.5 border-l pl-4 border-gray-200 dark:border-gray-700">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Show</span>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => {
                                                setItemsPerPage(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                </div>
                                {Math.ceil(filteredVitals.length / itemsPerPage) > 1 && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                            disabled={currentPage === 1}
                                            className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent transition text-gray-600 dark:text-gray-400"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <div className="flex gap-1">
                                            {Array.from({ length: Math.ceil(filteredVitals.length / itemsPerPage) }, (_, i) => i + 1).map(page => (
                                                <button
                                                    key={page}
                                                    onClick={() => setCurrentPage(page)}
                                                    className={`w-8 h-8 rounded-lg font-bold transition text-xs ${currentPage === page ? 'bg-rose-600 text-white shadow-md' : 'hover:bg-white dark:hover:bg-gray-700 border border-transparent text-gray-600 dark:text-gray-400'}`}
                                                >
                                                    {page}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredVitals.length / itemsPerPage)))}
                                            disabled={currentPage === Math.ceil(filteredVitals.length / itemsPerPage)}
                                            className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:hover:bg-transparent transition text-gray-600 dark:text-gray-400"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Record New Vital Signs</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <Plus className="w-6 h-6 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Patient *</label>
                                    <SearchablePatientSelect
                                        patients={patients}
                                        value={formData.patient_id}
                                        onChange={(patientId) => setFormData({ ...formData, patient_id: patientId })}
                                        placeholder="Search or select patient by name or ID..."
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Temperature (°C) *</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.temperature}
                                        onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pulse Rate (bpm) *</label>
                                    <input
                                        type="number"
                                        value={formData.pulse_rate}
                                        onChange={(e) => setFormData({ ...formData, pulse_rate: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">BP - Systolic (mmHg) *</label>
                                    <input
                                        type="number"
                                        value={formData.blood_pressure_systolic}
                                        onChange={(e) => setFormData({ ...formData, blood_pressure_systolic: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">BP - Diastolic (mmHg) *</label>
                                    <input
                                        type="number"
                                        value={formData.blood_pressure_diastolic}
                                        onChange={(e) => setFormData({ ...formData, blood_pressure_diastolic: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Respiratory Rate (rpm) *</label>
                                    <input
                                        type="number"
                                        value={formData.respiratory_rate}
                                        onChange={(e) => setFormData({ ...formData, respiratory_rate: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Oxygen Saturation (%) *</label>
                                    <input
                                        type="number"
                                        value={formData.oxygen_saturation}
                                        onChange={(e) => setFormData({ ...formData, oxygen_saturation: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Weight (kg) *</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.weight}
                                        onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Height (cm) *</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.height}
                                        onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-1 py-3 bg-rose-600 text-white rounded-lg hover:bg-rose-700 shadow-lg font-bold disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Save Vitals'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
