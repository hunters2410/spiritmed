import { useEffect, useState, FormEvent } from 'react';
import { supabase, Branch } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { createStaffUserAccount } from '../utils/userCreation';
import { Plus, Search, Edit2, Trash2, Users, Power } from 'lucide-react';

export function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: ''
  });
  const [adminFormData, setAdminFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: ''
  });
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBranches(data || []);
    } catch (error) {
      console.error('Error loading branches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      if (isEditing && selectedBranch) {
        const { error } = await supabase
          .from('branches')
          .update(formData)
          .eq('id', selectedBranch.id);

        if (error) throw error;
        alert('Branch updated successfully!');
      } else {
        const { error } = await supabase
          .from('branches')
          .insert([formData]);

        if (error) throw error;
        alert('Branch created successfully!');
      }

      setShowModal(false);
      setIsEditing(false);
      setSelectedBranch(null);
      setFormData({ name: '', email: '', phone: '', address: '', city: '', country: '' });
      loadBranches();
    } catch (error) {
      console.error('Error saving branch:', error);
      alert('Failed to save branch');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEdit = (branch: Branch) => {
    setSelectedBranch(branch);
    setFormData({
      name: branch.name,
      email: branch.email || '',
      phone: branch.phone || '',
      address: branch.address || '',
      city: branch.city || '',
      country: branch.country || ''
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleDelete = async (branch: Branch) => {
    if (!confirm(`Are you sure you want to delete ${branch.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', branch.id);

      if (error) throw error;

      alert('Branch deleted successfully!');
      loadBranches();
    } catch (error: any) {
      console.error('Error deleting branch:', error);
      alert(error.message || 'Failed to delete branch');
    }
  };

  const handleToggleStatus = async (branch: Branch) => {
    if (!confirm(`Are you sure you want to ${branch.is_active ? 'deactivate' : 'activate'} ${branch.name}?`)) {
      return;
    }

    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('branches')
        .update({ is_active: !branch.is_active })
        .eq('id', branch.id);

      if (error) throw error;
      alert(`Branch ${branch.is_active ? 'deactivated' : 'activated'} successfully!`);
      loadBranches();
    } catch (error: any) {
      console.error('Error toggling branch status:', error);
      alert(error.message || 'Failed to update branch status');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCreateAdmin = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    setSubmitLoading(true);
    try {
      await createStaffUserAccount({
        email: adminFormData.email,
        password: adminFormData.password,
        full_name: adminFormData.full_name,
        phone: adminFormData.phone || '',
        role: 'admin',
        branch_id: selectedBranch.id
      });

      alert('Branch Admin created successfully!');
      setShowAdminModal(false);
      setAdminFormData({
        full_name: '',
        email: '',
        password: '',
        phone: ''
      });
      loadBranches();
    } catch (error: any) {
      console.error('Error creating branch admin:', error);
      alert(error.message || 'Failed to create branch admin');
    } finally {
      setSubmitLoading(false);
    }
  };

  const filteredBranches = branches.filter(branch =>
    branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    branch.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Branch Management</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Manage all hospital branches</p>
        </div>
        <button
          onClick={() => {
            setIsEditing(false);
            setSelectedBranch(null);
            setFormData({ name: '', email: '', phone: '', address: '', city: '', country: '' });
            setShowModal(true);
          }}
          className="flex items-center space-x-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-1.5 rounded-md hover:from-green-700 hover:to-emerald-700 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Branch</span>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 p-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search branches..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Branch Name</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Email</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Phone</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Location</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Status</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-900 dark:text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredBranches.map((branch) => (
                <tr key={branch.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/30 transition">
                  <td className="px-3 py-2.5 text-gray-900 dark:text-white font-medium">{branch.name}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{branch.email || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{branch.phone || '-'}</td>
                  <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                    {branch.city && branch.country ? `${branch.city}, ${branch.country}` : '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${branch.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'}`}>
                      {branch.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => {
                          setSelectedBranch(branch);
                          setShowAdminModal(true);
                        }}
                        className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition"
                        title="Create Admin"
                      >
                        <Users className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(branch)}
                        className={`p-1.5 rounded transition ${branch.is_active ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20' : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'}`}
                        title={branch.is_active ? 'Deactivate Branch' : 'Activate Branch'}
                        disabled={submitLoading}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleEdit(branch)}
                        className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(branch)}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredBranches.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No branches found
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-md max-w-md w-full p-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
              {isEditing ? 'Edit Branch' : 'Add New Branch'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Branch Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Country</label>
                  <input
                    type="text"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setIsEditing(false);
                    setSelectedBranch(null);
                  }}
                  className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-md hover:from-green-700 hover:to-emerald-700 transition shadow-sm disabled:opacity-50"
                  disabled={submitLoading}
                >
                  {submitLoading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Branch' : 'Create Branch')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdminModal && selectedBranch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-md max-w-md w-full p-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Create Branch Admin</h2>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Create an admin user for <span className="font-semibold">{selectedBranch.name}</span>
            </p>
            <form onSubmit={handleCreateAdmin} className="space-y-2.5">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={adminFormData.full_name}
                  onChange={(e) => setAdminFormData({ ...adminFormData, full_name: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={adminFormData.email}
                  onChange={(e) => setAdminFormData({ ...adminFormData, email: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  value={adminFormData.password}
                  onChange={(e) => setAdminFormData({ ...adminFormData, password: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                  minLength={6}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Minimum 6 characters</p>
              </div>
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={adminFormData.phone}
                  onChange={(e) => setAdminFormData({ ...adminFormData, phone: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminModal(false);
                    setSelectedBranch(null);
                    setAdminFormData({ email: '', password: '', full_name: '', phone: '' });
                  }}
                  className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  disabled={submitLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-md hover:from-green-700 hover:to-emerald-700 transition shadow-sm disabled:opacity-50"
                  disabled={submitLoading}
                >
                  {submitLoading ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
