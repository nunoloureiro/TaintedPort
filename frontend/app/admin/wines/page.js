'use client';

import { useState, useEffect } from 'react';
import { wineAPI, adminAPI } from '@/lib/api';
import Button from '@/components/Button';
import Input from '@/components/Input';
import WineBottle from '@/components/WineBottle';

const emptyForm = {
  name: '', region: '', type: '', vintage: '', price: '',
  stock_quantity: '', low_stock_threshold: '5', producer: '',
  description_short: '', description: '', grapes: '', alcohol: '',
  bottle_size: '750ml', food_pairing: '',
};

function WineThumbnail({ wine }) {
  // Remembers the URL that failed rather than a flag, so a newly uploaded image is tried again
  const [failedSrc, setFailedSrc] = useState(null);

  if (!wine.image_url || failedSrc === wine.image_url) {
    return <WineBottle type={wine.type} name={wine.name} size="sm" className="h-10 w-auto" />;
  }
  return (
    <img
      src={wine.image_url}
      alt={wine.name}
      className="w-full h-full object-cover"
      onError={() => setFailedSrc(wine.image_url)}
    />
  );
}

export default function AdminWinesPage() {
  const [wines, setWines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);

  const fetchWines = async () => {
    setLoading(true);
    try {
      const res = await wineAPI.getAll({ sort: 'name_asc' });
      setWines(res.data.wines || []);
    } catch (err) {
      setError('Failed to load wines.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWines(); }, []);

  const flash = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const startCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (wine) => {
    setForm({
      name: wine.name || '', region: wine.region || '', type: wine.type || '',
      vintage: wine.vintage || '', price: wine.price || '',
      stock_quantity: wine.stock_quantity ?? 0, low_stock_threshold: wine.low_stock_threshold ?? 5,
      producer: wine.producer || '', description_short: wine.description_short || '',
      description: wine.description || '', grapes: wine.grapes || '',
      alcohol: wine.alcohol || '', bottle_size: wine.bottle_size || '750ml',
      food_pairing: wine.food_pairing || '',
    });
    setEditingId(wine.id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await adminAPI.updateWine(editingId, form);
        flash('Wine updated.');
      } else {
        await adminAPI.createWine(form);
        flash('Wine created.');
      }
      setShowForm(false);
      await fetchWines();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save wine.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (wine) => {
    if (!confirm(`Delete "${wine.name}"? This cannot be undone.`)) return;
    try {
      await adminAPI.deleteWine(wine.id);
      flash('Wine deleted.');
      await fetchWines();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete wine.');
    }
  };

  const handleAdjustStock = async (wine, delta) => {
    try {
      const res = await adminAPI.adjustStock(wine.id, delta);
      setWines(wines.map(w => w.id === wine.id ? { ...w, stock_quantity: res.data.stock_quantity } : w));
    } catch (err) {
      setError('Failed to adjust stock.');
    }
  };

  const handleImageUpload = async (wine, file) => {
    if (!file) return;
    setUploadingId(wine.id);
    try {
      const res = await adminAPI.uploadWineImage(wine.id, file);
      setWines(wines.map(w => w.id === wine.id ? { ...w, image_url: res.data.image_url } : w));
      flash('Image uploaded.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload image.');
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Wine <span className="gradient-text">Inventory</span>
          </h1>
          <p className="text-zinc-400 mt-1">Manage the catalog, stock levels and photos</p>
        </div>
        <Button onClick={startCreate}>+ Add Wine</Button>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-300 hover:text-white">✕</button>
        </div>
      )}
      {success && (
        <div className="mb-6 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
          {success}
        </div>
      )}

      {showForm && (
        <div className="mb-8 bg-dark-card border border-dark-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            {editingId ? `Edit Wine #${editingId}` : 'New Wine'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label="Producer" value={form.producer} onChange={(e) => setForm({ ...form, producer: e.target.value })} />
              <Input label="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} required />
              <Input label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} required />
              <Input label="Vintage" type="number" value={form.vintage} onChange={(e) => setForm({ ...form, vintage: e.target.value })} required />
              <Input label="Price (€)" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              <Input label="Stock Quantity" type="number" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
              <Input label="Low Stock Threshold" type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
              <Input label="Alcohol %" type="number" step="0.1" value={form.alcohol} onChange={(e) => setForm({ ...form, alcohol: e.target.value })} />
              <Input label="Bottle Size" value={form.bottle_size} onChange={(e) => setForm({ ...form, bottle_size: e.target.value })} />
              <Input label="Grapes" value={form.grapes} onChange={(e) => setForm({ ...form, grapes: e.target.value })} />
              <Input label="Food Pairing" value={form.food_pairing} onChange={(e) => setForm({ ...form, food_pairing: e.target.value })} />
            </div>
            <Input label="Short Description" value={form.description_short} onChange={(e) => setForm({ ...form, description_short: e.target.value })} />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple transition-colors resize-none"
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>{editingId ? 'Save Changes' : 'Create Wine'}</Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-zinc-400">Loading wines...</p>
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Photo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Wine</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {wines.map((wine) => (
                  <tr key={wine.id} className="hover:bg-dark-lighter/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-dark-lighter border border-dark-border flex items-center justify-center">
                        <WineThumbnail wine={wine} />
                        <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 hover:opacity-100 cursor-pointer transition-opacity">
                          <span className="text-white text-xs">{uploadingId === wine.id ? '…' : '↑'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => handleImageUpload(wine, e.target.files[0])}
                          />
                        </label>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white text-sm font-medium">{wine.name}</p>
                      <p className="text-zinc-500 text-xs">{wine.region} · {wine.type} · {wine.vintage}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-sm">€{wine.price.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAdjustStock(wine, -1)}
                          className="w-6 h-6 flex items-center justify-center rounded bg-dark-lighter border border-dark-border text-zinc-400 hover:text-white"
                        >
                          −
                        </button>
                        <span className={`text-sm w-8 text-center ${wine.stock_quantity <= (wine.low_stock_threshold ?? 5) ? 'text-yellow-400' : 'text-white'}`}>
                          {wine.stock_quantity}
                        </span>
                        <button
                          onClick={() => handleAdjustStock(wine, 1)}
                          className="w-6 h-6 flex items-center justify-center rounded bg-dark-lighter border border-dark-border text-zinc-400 hover:text-white"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(wine)} className="text-accent-purple hover:text-accent-purple-light text-sm transition-colors">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(wine)} className="text-red-400 hover:text-red-300 text-sm transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
