import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Building2, UserCheck, X, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  branch_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface Branch {
  id: string;
  name: string;
}

export function Users() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'admin',
    branch_id: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersResponse, branchesResponse] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase.from('branches').select('id, name').eq('is_active', true).order('name')
      ]);

      if (usersResponse.error) throw usersResponse.error;
      if (branchesResponse.error) throw branchesResponse.error;

      setUsers(usersResponse.data || []);
      setBranches(branchesResponse.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: createFormData.email,
        password: createFormData.password,
      });

      if (authError) throw authError;

      if (authData.user) {
        const { error: profileError } = await supabase.rpc('create_user_profile', {
          p_user_id: authData.user.id,
          p_email: createFormData.email,
          p_full_name: createFormData.full_name,
          p_phone: createFormData.phone || null,
          p_role: createFormData.role,
          p_branch_id: createFormData.branch_id || null
        });

        if (profileError) throw profileError;

        alert('User created successfully!');
        setShowCreateModal(false);
        setCreateFormData({
          full_name: '',
          email: '',
          password: '',
          phone: '',
          role: 'admin',
          branch_id: ''
        });
        loadData();
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      alert(error.message || 'Failed to create user');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAssignBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !selectedBranchId) return;

    setSubmitLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ branch_id: selectedBranchId })
        .eq('id', selectedUser.id);

      if (error) throw error;

      alert('Branch assigned successfully!');
      setShowAssignModal(false);
      setSelectedUser(null);
      setSelectedBranchId('');
      loadData();
    } catch (error: any) {
      console.error('Error assigning branch:', error);
      alert(error.message || 'Failed to assign branch');
    } finally {
      setSubmitLoading(false);
    }
  };

  const getBranchName = (branchId: string | null) => {
    if (!branchId) return '-';
    const branch = branches.find(b => b.id === branchId);
    return branch ? branch.name : 'Unknown';
  };

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (profile?.role !== 'super_admin') {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">You don't have permission to view this page</p>
      </div>
    );
  }

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
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Manage users and assign branches</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-1.5 rounded-md hover:from-green-700 hover:to-emerald-700 transition shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          <span>Create User</span>
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 p-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Name</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Email</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Role</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Branch</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-white">Status</th>
              <th className="px-3 py-2 text-center font-semibold text-gray-900 dark:text-white">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
                <td className="px-3 py-2.5 text-gray-900 dark:text-white font-medium">{user.full_name}</td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{user.email}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 capitalize">
                    {user.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">
                  {user.branch_id ? (
                    <span className="flex items-center space-x-1">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>{getBranchName(user.branch_id)}</span>
                    </span>
                  ) : (
                    <span className="text-orange-600 dark:text-orange-400 font-medium">Not Assigned</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${user.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'}`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center">
                    {(user.role === 'admin' || user.role === 'doctor' || user.role === 'nurse' || user.role === 'receptionist' || user.role === 'accountant') && (
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setSelectedBranchId(user.branch_id || '');
                          setShowAssignModal(true);
                        }}
                        className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition"
                        title={user.branch_id ? 'Change Branch' : 'Assign Branch'}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No users found
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-md max-w-md w-full p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Create New User</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateFormData({
                    full_name: '',
                    email: '',
                    password: '',
                    phone: '',
                    role: 'admin',
                    branch_id: ''
                  });
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Create a new user account with branch assignment
            </p>

            <form onSubmit={handleCreateUser} className="space-y-2.5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={createFormData.full_name}
                  onChange={(e) => setCreateFormData({ ...createFormData, full_name: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={createFormData.email}
                  onChange={(e) => setCreateFormData({ ...createFormData, email: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  value={createFormData.password}
                  onChange={(e) => setCreateFormData({ ...createFormData, password: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                  minLength={6}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Minimum 6 characters</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone (Optional)</label>
                <input
                  type="tel"
                  value={createFormData.phone}
                  onChange={(e) => setCreateFormData({ ...createFormData, phone: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                <select
                  value={createFormData.role}
                  onChange={(e) => setCreateFormData({ ...createFormData, role: e.target.value })}
                  className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="admin">Admin</option>
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                  <option value="receptionist">Receptionist</option>
                  <option value="accountant">Accountant</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch</label>
                <select
                  value={createFormData.branch_id}
                  onChange={(e) => setCreateFormData({ ...createFormData, branch_id: e.target.value })}
                  className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">-- Select a branch --</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateFormData({
                      full_name: '',
                      email: '',
                      password: '',
                      phone: '',
                      role: 'admin',
                      branch_id: ''
                    });
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
                  {submitLoading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssignModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-md max-w-md w-full p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {selectedUser.branch_id ? 'Change Branch' : 'Assign Branch'}
              </h2>
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedUser(null);
                  setSelectedBranchId('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              {selectedUser.branch_id ? 'Change' : 'Assign'} branch for <span className="font-semibold">{selectedUser.full_name}</span>
            </p>

            <form onSubmit={handleAssignBranch} className="space-y-3">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Select Branch</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">-- Select a branch --</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedUser.branch_id && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-2.5">
                  <p className="text-xs text-blue-800 dark:text-blue-300">
                    <strong>Current Branch:</strong> {getBranchName(selectedUser.branch_id)}
                  </p>
                </div>
              )}

              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedUser(null);
                    setSelectedBranchId('');
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
                  {submitLoading ? 'Saving...' : (selectedUser.branch_id ? 'Change Branch' : 'Assign Branch')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
