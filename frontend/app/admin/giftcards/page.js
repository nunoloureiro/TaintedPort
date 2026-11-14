'use client';

import { useState, useEffect } from 'react';
import { adminAPI } from '@/lib/api';
import Button from '@/components/Button';
import Input from '@/components/Input';

export default function AdminGiftCardsPage() {
  const [cards, setCards] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ user_id: '', amount: '' });
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState(null);

  const fetchCards = async () => {
    try {
      const res = await adminAPI.getGiftCards();
      setCards(res.data.gift_cards || []);
    } catch {
      setError('Failed to load gift cards.');
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await adminAPI.getUsers();
        setUsers(res.data.users || []);
      } catch {
        setError('Failed to load users.');
      }
      await fetchCards();
      setLoading(false);
    };
    load();
  }, []);

  const handleIssue = async (e) => {
    e.preventDefault();
    setError('');
    setIssued(null);
    const amount = Number(form.amount);
    if (!form.user_id) { setError('Select a customer.'); return; }
    if (!(amount >= 1 && amount <= 500)) { setError('Amount must be between €1 and €500.'); return; }
    setSaving(true);
    try {
      const res = await adminAPI.issueGiftCard(Number(form.user_id), amount);
      setIssued(res.data.gift_card);
      setForm({ user_id: '', amount: '' });
      await fetchCards();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to issue gift card.');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-1">
        Gift <span className="gradient-text">Cards</span>
      </h1>
      <p className="text-zinc-400 mb-6">Issue gift cards to customers and review every card in circulation</p>

      {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}

      <div className="bg-dark-card border border-dark-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Issue a Gift Card</h2>
        <form onSubmit={handleIssue} className="grid sm:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Customer</label>
            <select
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              className="w-full px-4 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-accent-purple"
            >
              <option value="">Select a customer…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <Input
            label="Amount (€)"
            type="number"
            min="1"
            max="500"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          <div>
            <Button type="submit" loading={saving}>Issue Card</Button>
          </div>
        </form>

        {issued && (
          <div className="mt-4 p-4 bg-dark-lighter border border-dark-border rounded-lg">
            <p className="text-zinc-400 text-xs uppercase tracking-wider mb-2">
              Issued €{Number(issued.amount).toFixed(2)} gift card
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-accent-cyan text-sm break-all select-all font-mono">{issued.token}</code>
              <button
                onClick={() => copyToClipboard(issued.token)}
                className="px-3 py-1.5 text-xs bg-dark-card border border-dark-border rounded-lg text-zinc-300 hover:text-white transition-colors flex-shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">All Gift Cards</h2>
        {loading ? (
          <p className="text-zinc-400 text-sm">Loading...</p>
        ) : cards.length === 0 ? (
          <p className="text-zinc-500 text-sm">No gift cards yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-dark-border">
                  <th className="py-2 pr-4 font-medium">Card</th>
                  <th className="py-2 pr-4 font-medium">Owner</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Source</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr key={card.id} className="border-b border-dark-border last:border-0">
                    <td className="py-3 pr-4 font-mono text-zinc-300">{card.card_id}</td>
                    <td className="py-3 pr-4">
                      <p className="text-white">{card.owner_name}</p>
                      <p className="text-zinc-500 text-xs">{card.owner_email}</p>
                    </td>
                    <td className="py-3 pr-4 text-white">€{Number(card.amount).toFixed(2)}</td>
                    <td className="py-3 pr-4 text-zinc-400">
                      {card.source === 'admin' ? `Issued${card.issued_by_name ? ` by ${card.issued_by_name}` : ''}` : 'Purchased'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${card.redeemed ? 'text-zinc-500 border-dark-border' : 'text-green-400 border-green-500/30 bg-green-500/10'}`}>
                        {card.redeemed ? 'Redeemed' : 'Active'}
                      </span>
                    </td>
                    <td className="py-3 text-zinc-500">{card.created_at ? new Date(card.created_at).toLocaleDateString() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
