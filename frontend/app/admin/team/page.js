'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { adminAPI } from '@/lib/api';

const roleColors = {
  admin: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  support: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  user: 'text-zinc-400 border-dark-border bg-dark-lighter',
};

export default function AdminTeamPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await adminAPI.getUsers();
      setUsers(res.data.users || []);
    } catch (err) {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (userId, role) => {
    setUpdatingId(userId);
    setError('');
    try {
      await adminAPI.updateUserRole(userId, role);
      setUsers(users.map(u => u.id === userId ? { ...u, role, is_admin: role === 'admin' } : u));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update role.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-1">
        Team <span className="gradient-text">&amp; Roles</span>
      </h1>
      <p className="text-zinc-400 mb-8">
        <span className="text-yellow-400">Admin</span> has full access ·{' '}
        <span className="text-blue-400">Support</span> can manage orders and tickets ·{' '}
        <span className="text-zinc-400">User</span> is a regular customer
      </p>

      {error && <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      {loading ? (
        <p className="text-zinc-400">Loading team...</p>
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-xl divide-y divide-dark-border">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between p-5">
              <div>
                <p className="text-white font-medium" dangerouslySetInnerHTML={{ __html: u.name }} />
                <p className="text-zinc-500 text-sm">{u.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full border capitalize ${roleColors[u.role] || roleColors.user}`}>
                  {u.role}
                </span>
                {u.id === currentUser?.id ? (
                  <span className="text-zinc-600 text-xs">(you)</span>
                ) : (
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    disabled={updatingId === u.id}
                    className="bg-dark-lighter border border-dark-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent-purple cursor-pointer disabled:opacity-50"
                  >
                    <option value="user">User</option>
                    <option value="support">Support</option>
                    <option value="admin">Admin</option>
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
