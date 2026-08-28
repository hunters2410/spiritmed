import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Building2, UserCheck, X, UserPlus, Trash2, ShieldCheck, UserMinus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { createStaffUserAccount } from '../utils/userCreation';
import { logActivity } from '../utils/auditLogger';

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

interface Role {
  id: string;
  name: string;
  base_role: string;
}

export function Users() {
  const { profile, hasPermission } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [createFormData, setCreateFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: '', // base_role
    role_id: '',
    branch_id: ''
  });

  useEffect(() => {
    loadData();
    if (profile?.role !== 'super_admin' && profile?.branch_id) {
        setCreateFormData(prev => ({ ...prev, branch_id: profile.branch_id || '' }));
    }
  }, [profile]);

  const loadData = async () => {
    try {
      let usersQuery = supabase.from('users').select('*, roles:users_role_id_fkey(name)').order('created_at', { ascending: false });
      let branchesQuery = supabase.from('branches').select('id, name').eq('is_active', true).order('name');
      let rolesQuery = supabase.from('roles').select('id, name, base_role').eq('is_active', true).order('name');

      // Filter by branch for non-superadmins
      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        usersQuery = usersQuery.eq('branch_id', profile.branch_id);
        branchesQuery = branchesQuery.eq('id', profile.branch_id);
        rolesQuery = rolesQuery.or(`branch_id.eq.${profile.branch_id},branch_id.is.null`);
      }

      const [usersResponse, branchesResponse, rolesResponse] = await Promise.all([
        usersQuery,
        branchesQuery,
        rolesQuery
      ]);

      if (usersResponse.error) throw usersResponse.error;
      if (branchesResponse.error) throw branchesResponse.error;
      if (rolesResponse.error) throw rolesResponse.error;

      setUsers(usersResponse.data || []);
      setBranches(branchesResponse.data || []);
      setRoles(rolesResponse.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetCreateForm = () => {
    setCreateFormData({
      full_name: '',
      email: '',
      password: '',
      phone: '',
      role: '',
      role_id: '',
      branch_id: ''
    });
  };

  const loadUsers = loadData;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);

    try {
      const { user: createdUser } = await createStaffUserAccount({
        email: createFormData.email,
        password: createFormData.password,
        full_name: createFormData.full_name,
        phone: createFormData.phone || '',
        role: createFormData.role,
        role_id: createFormData.role_id,
        branch_id: profile?.role === 'super_admin' ? (createFormData.branch_id || null) : (profile?.branch_id || null)
      });

      if (profile?.id) {
          await logActivity(supabase, {
              userId: profile.id,
              branchId: createFormData.branch_id || profile.branch_id || '',
              action: 'CREATE',
              tableName: 'users',
              recordId: createdUser.id,
              details: `Created new staff member: ${createFormData.full_name} (${createFormData.role})`,
              newValues: { email: createFormData.email, role: createFormData.role, branch_id: createFormData.branch_id }
          });
      }

      alert('User created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      loadUsers();
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

      if (profile?.id) {
          await logActivity(supabase, {
              userId: profile.id,
              branchId: selectedBranchId || profile.branch_id || '',
              action: 'UPDATE',
              tableName: 'users',
              recordId: selectedUser.id,
              details: `Assigned user ${selectedUser.full_name} to branch ${getBranchName(selectedBranchId)}`,
              newValues: { branch_id: selectedBranchId }
          });
      }

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

  const handleDeleteUser = async (user: User) => {
    if (user.id === profile?.id) {
      alert('You cannot delete your own account.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete ${user.full_name}? This action cannot be undone.`)) {
      return;
    }

    setSubmitLoading(true);
    try {
      const { data, error } = await supabase.rpc('delete_user_account', {
        p_user_id: user.id
      });

      if (error) throw error;
      
      const result = data as { success: boolean; message: string };
      if (!result.success) {
        throw new Error(result.message);
      }

      if (profile?.id) {
        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id || '',
          action: 'DELETE',
          tableName: 'users',
          recordId: user.id,
          details: `Deleted user: ${user.full_name} (${user.email})`,
        });
      }

      alert('User deleted successfully');
      loadData();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      alert(error.message || 'Failed to delete user');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !selectedRoleId) return;

    setSubmitLoading(true);
    try {
      const selectedRole = roles.find(r => r.id === selectedRoleId);
      if (!selectedRole) throw new Error('Selected role not found');

      const { error } = await supabase
        .from('users')
        .update({ 
          role_id: selectedRoleId,
          role: selectedRole.base_role 
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      if (profile?.id) {
          await logActivity(supabase, {
              userId: profile.id,
              branchId: profile.branch_id || '',
              action: 'UPDATE',
              tableName: 'users',
              recordId: selectedUser.id,
              details: `Updated role for ${selectedUser.full_name} to ${selectedRole.name}`,
              newValues: { role_id: selectedRoleId, role: selectedRole.base_role }
          });
      }

      alert('Role updated successfully!');
      setShowRoleModal(false);
      setSelectedUser(null);
      setSelectedRoleId('');
      loadData();
    } catch (error: any) {
      console.error('Error updating role:', error);
      alert(error.message || 'Failed to update role');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      setSubmitLoading(true);
      const newStatus = !user.is_active;
      
      const { error } = await supabase
        .from('users')
        .update({ is_active: newStatus })
        .eq('id', user.id);

      if (error) throw error;

      if (profile?.id) {
        await logActivity(supabase, {
          userId: profile.id,
          branchId: profile.branch_id || '',
          action: 'UPDATE',
          tableName: 'users',
          recordId: user.id,
          details: `${newStatus ? 'Activated' : 'Deactivated'} user: ${user.full_name}`,
          newValues: { is_active: newStatus }
        });
      }

      alert(`User ${newStatus ? 'activated' : 'deactivated'} successfully`);
      loadData();
    } catch (error: any) {
      console.error('Error toggling user status:', error);
      alert(error.message || 'Failed to update user status');
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
    (user as any).roles?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage) || 1;
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (!hasPermission('staff', 'view')) {
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
        {(hasPermission('users', 'add') || hasPermission('staff', 'add')) && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-1.5 rounded-md hover:from-green-700 hover:to-emerald-700 transition shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 p-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">Role</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">Branch</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">Status</th>
              <th className="px-4 py-3 text-center text-xs font-black uppercase text-gray-600 dark:text-gray-300 tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {paginatedUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400 font-medium">
                  No users found
                </td>
              </tr>
            ) : (
              paginatedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition">
                  <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white">{user.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block px-2.5 py-1 text-xs font-bold rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 capitalize">
                      {(user as any).roles?.name || user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {user.branch_id ? (
                      <span className="flex items-center space-x-1.5">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span>{getBranchName(user.branch_id)}</span>
                      </span>
                    ) : (
                      <span className="text-orange-600 dark:text-orange-400 font-bold">Not Assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-full border ${user.is_active ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400 border-gray-200'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {(user.role === 'admin' || user.role === 'doctor' || user.role === 'nurse' || user.role === 'receptionist' || user.role === 'accountant') && (
                        <>
                          {profile?.role === 'super_admin' && (hasPermission('users', 'edit') || hasPermission('staff', 'edit')) && (
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setSelectedBranchId(user.branch_id || '');
                                setShowAssignModal(true);
                              }}
                              className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition"
                              title={user.branch_id ? 'Change Branch' : 'Assign Branch'}
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                          {(hasPermission('users', 'edit') || hasPermission('staff', 'edit') || hasPermission('roles', 'edit')) && (
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setSelectedRoleId((user as any).role_id || '');
                                setShowRoleModal(true);
                              }}
                              className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition"
                              title="Manage Role"
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          )}
                          {(hasPermission('users', 'edit') || hasPermission('staff', 'edit')) && (
                            <button
                              onClick={() => handleToggleStatus(user)}
                              className={`p-1.5 rounded transition ${user.is_active ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20' : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'}`}
                              title={user.is_active ? 'Deactivate User' : 'Activate User'}
                              disabled={submitLoading}
                            >
                              {user.is_active ? <UserMinus className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </button>
                          )}
                          {(hasPermission('users', 'delete') || hasPermission('staff', 'delete')) && (
                            <button
                              onClick={() => handleDeleteUser(user)}
                              className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {filteredUsers.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-4 font-sans">
            <div className="flex items-center space-x-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length}
              </p>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400 font-bold uppercase">Rows:</span>
                <select
                  value={itemsPerPage === filteredUsers.length ? 'all' : itemsPerPage}
                  onChange={(e) => {
                    const val = e.target.value;
                    setItemsPerPage(val === 'all' ? filteredUsers.length || 1 : Number(val));
                    setCurrentPage(1);
                  }}
                  className="text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 outline-none text-gray-700 dark:text-gray-200"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value="all">ALL</option>
                </select>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                >
                  <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                {[...Array(Math.min(totalPages, 7))].map((_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition ${currentPage === i + 1 ? 'bg-green-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
                  >
                    {i + 1}
                  </button>
                ))}
                {totalPages > 7 && <span className="text-xs text-gray-400 px-1">... {totalPages}</span>}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-30 hover:bg-white dark:hover:bg-gray-700 transition"
                >
                  <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
            )}
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
                    role: '',
                    role_id: '',
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
                  value={createFormData.role_id}
                  onChange={(e) => {
                    const selectedRole = roles.find(r => r.id === e.target.value);
                    setCreateFormData({ 
                      ...createFormData, 
                      role_id: e.target.value,
                      role: selectedRole?.base_role || ''
                    });
                  }}
                  className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">-- Select a role --</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              {profile?.role === 'super_admin' && (
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
              )}

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
                      role: '',
                      role_id: '',
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

      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-md max-w-md w-full p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Manage User Role
              </h2>
              <button
                onClick={() => {
                  setShowRoleModal(false);
                  setSelectedUser(null);
                  setSelectedRoleId('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              Update permissions role for <span className="font-semibold">{selectedUser.full_name}</span>
            </p>

            <form onSubmit={handleUpdateRole} className="space-y-3">
              <div>
                <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Select New Role</label>
                <select
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  className="w-full px-2.5 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">-- Select a role --</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-2 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowRoleModal(false);
                    setSelectedUser(null);
                    setSelectedRoleId('');
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
                  {submitLoading ? 'Updating...' : 'Update Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
