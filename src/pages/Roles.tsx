import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Shield, X, Lock, LayoutGrid, List } from 'lucide-react';
import { PermissionGrid, Permissions, MODULES } from '../components/PermissionGrid';

interface Role {
  id: string;
  name: string;
  description: string;
  base_role: string;
  permissions: Permissions;
  is_active: boolean;
  created_at: string;
}

const DEFAULT_PERMISSIONS: Permissions = MODULES.reduce((acc, mod) => {
  acc[mod.id] = { view: mod.id === 'dashboard', add: false, edit: false, delete: false };
  return acc;
}, {} as Permissions);

export function Roles() {
  const { profile, hasPermission } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    base_role: 'doctor',
    permissions: DEFAULT_PERMISSIONS
  });

  useEffect(() => {
    loadRoles();
  }, [profile]);

  const loadRoles = async () => {
    try {
      let query = supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profile?.role !== 'super_admin' && profile?.branch_id) {
        query = query.or(`branch_id.eq.${profile.branch_id},branch_id.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      let finalData = data || [];
      if (profile?.role !== 'super_admin') {
        finalData = finalData.filter(role => role.name !== 'Super Admin');
      }
      
      setRoles(finalData);
    } catch (error) {
      console.error('Error loading roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description || '',
      base_role: role.base_role,
      permissions: role.permissions || DEFAULT_PERMISSIONS
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        const { error } = await supabase
          .from('roles')
          .update({
            name: formData.name,
            description: formData.description,
            base_role: formData.base_role,
            permissions: formData.permissions,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingRole.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('roles')
          .insert([{
            name: formData.name,
            description: formData.description,
            base_role: formData.base_role,
            permissions: formData.permissions,
            branch_id: profile?.branch_id,
            created_by: profile?.id,
            is_active: true
          }]);

        if (error) throw error;
      }

      setShowModal(false);
      resetForm();
      loadRoles();
    } catch (error) {
      console.error('Error saving role:', error);
      alert('Failed to save role');
    }
  };

  const handleToggleActive = async (role: Role) => {
    try {
      const { error } = await supabase
        .from('roles')
        .update({ is_active: !role.is_active })
        .eq('id', role.id);

      if (error) throw error;
      loadRoles();
    } catch (error) {
      console.error('Error updating role status:', error);
      alert('Failed to update role status');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      base_role: 'doctor',
      permissions: DEFAULT_PERMISSIONS
    });
    setEditingRole(null);
  };

  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roles Management</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Configure custom roles and granular module permissions</p>
        </div>
        {hasPermission('roles', 'add') && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span>Add Role</span>
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search roles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-center bg-gray-100 dark:bg-gray-700 p-1 rounded-lg border border-gray-200 dark:border-gray-600">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white dark:bg-gray-600 shadow-sm text-green-600 dark:text-green-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              title="List View"
            >
              <List className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white dark:bg-gray-600 shadow-sm text-green-600 dark:text-green-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              title="Grid View"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {filteredRoles.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          <Shield className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No roles found matching your search</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRoles.map((role) => (
            <div
              key={role.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                    <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <button
                    onClick={() => hasPermission('roles', 'edit') && handleToggleActive(role)}
                    disabled={!hasPermission('roles', 'edit')}
                    className={`px-3 py-1 text-xs font-bold rounded-full border ${!hasPermission('roles', 'edit') ? 'cursor-default opacity-80 ' : ''}${
                      role.is_active
                        ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                        : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                    }`}
                  >
                    {role.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{role.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 min-h-[2.5rem]">
                  {role.description || 'No description provided'}
                </p>
                {hasPermission('roles', 'edit') && (
                  <div className="flex items-center justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
                    <button 
                      onClick={() => handleEdit(role)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 hover:bg-green-50 dark:hover:bg-green-900/20 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 rounded-lg transition font-bold text-xs"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      Permissions
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role Name</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredRoles.map((role) => (
                  <tr key={role.id} className="hover:bg-gray-100 dark:hover:bg-gray-900/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded flex items-center justify-center">
                          <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
                        </div>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{role.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 truncate max-w-xs">
                        {role.description || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => hasPermission('roles', 'edit') && handleToggleActive(role)}
                        disabled={!hasPermission('roles', 'edit')}
                        className={`inline-flex px-2 py-1 text-[10px] font-black uppercase tracking-tighter rounded border ${!hasPermission('roles', 'edit') ? 'cursor-default opacity-80 ' : ''}${
                          role.is_active
                            ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                            : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                        }`}
                      >
                        {role.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {hasPermission('roles', 'edit') && (
                        <button 
                          onClick={() => handleEdit(role)}
                          className="p-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition"
                          title="Edit Permissions"
                        >
                          <Lock className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-gray-900 dark:text-white">
                    {editingRole ? 'Edit Role Permissions' : 'Create New Role'}
                  </h2>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                    {editingRole ? `Configuring: ${editingRole.name}` : 'Setup custom role and permissions'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-xl transition text-gray-400 hover:text-red-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Role Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Senior Medical Officer"
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-semibold transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Briefly describe the responsibilities..."
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-semibold transition resize-none"
                    rows={2}
                  />
                </div>
              </div>

              <div>
                <div className="mb-4">
                  <h3 className="text-lg font-black text-gray-900 dark:text-white">Module Access Matrix</h3>
                  <p className="text-sm text-gray-500 font-bold">Explicitly grant View, Add, Edit, and Delete permissions per module.</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/30 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                  <PermissionGrid 
                    permissions={formData.permissions} 
                    onChange={(newPerms) => setFormData({ ...formData, permissions: newPerms })} 
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex gap-4">
              <button
                type="button"
                onClick={() => { setShowModal(false); resetForm(); }}
                className="flex-1 px-4 py-3 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-white dark:hover:bg-gray-700 transition font-black uppercase text-xs tracking-widest"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-2 px-8 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition shadow-lg shadow-green-600/20 font-black uppercase text-xs tracking-widest"
              >
                {editingRole ? 'Update Profile & Permissions' : 'Create Custom Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
