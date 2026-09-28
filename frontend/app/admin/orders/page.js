'use client';

import { useState, useEffect, Fragment } from 'react';
import { adminAPI } from '@/lib/api';

const statusColors = {
  pending: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  processing: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  shipped: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  delivered: 'text-green-400 border-green-500/30 bg-green-500/10',
  cancelled: 'text-red-400 border-red-500/30 bg-red-500/10',
};

const allStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingOrder, setUpdatingOrder] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [trackingForm, setTrackingForm] = useState({ tracking_number: '', carrier: '' });

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await adminAPI.getOrders();
      setOrders(res.data.orders || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingOrder(orderId);
    setSuccessMessage('');
    try {
      await adminAPI.updateOrderStatus(orderId, newStatus);
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      setSuccessMessage(`Order #${orderId} updated to ${newStatus}`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update order.');
    } finally {
      setUpdatingOrder(null);
    }
  };

  const handleSaveTracking = async (orderId) => {
    setUpdatingOrder(orderId);
    try {
      const order = orders.find(o => o.id === orderId);
      await adminAPI.updateOrderStatus(orderId, order.status, trackingForm);
      setSuccessMessage(`Tracking info saved for order #${orderId}`);
      setTimeout(() => setSuccessMessage(''), 3000);
      if (orderDetail && orderDetail.id === orderId) {
        setOrderDetail({ ...orderDetail, ...trackingForm });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save tracking info.');
    } finally {
      setUpdatingOrder(null);
    }
  };

  const toggleOrderDetail = async (orderId) => {
    if (expandedOrder === orderId) {
      setExpandedOrder(null);
      setOrderDetail(null);
      return;
    }
    setExpandedOrder(orderId);
    setLoadingDetail(true);
    try {
      const res = await adminAPI.getOrder(orderId);
      setOrderDetail(res.data.order);
      setTrackingForm({
        tracking_number: res.data.order.tracking_number || '',
        carrier: res.data.order.carrier || '',
      });
    } catch (err) {
      setError('Failed to load order details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return <p className="text-zinc-400">Loading orders...</p>;
  }

  const ordersByStatus = {
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    shipped: orders.filter(o => o.status === 'shipped').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Order <span className="gradient-text">Management</span>
          </h1>
          <p className="text-zinc-400 mt-1">Manage all orders, statuses and shipment tracking</p>
        </div>
        <div className="text-right">
          <p className="text-zinc-500 text-sm">Total orders: {orders.length}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-300 hover:text-white">✕</button>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
          {successMessage}
        </div>
      )}

      {/* Status summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {allStatuses.map(status => (
          <div key={status} className={`rounded-lg border p-4 text-center ${statusColors[status]}`}>
            <p className="text-2xl font-bold">{ordersByStatus[status]}</p>
            <p className="text-xs capitalize mt-1">{status}</p>
          </div>
        ))}
      </div>

      {/* Orders table */}
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-border">
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Order</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Items</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {orders.map(order => (
                <Fragment key={order.id}>
                  <tr className="hover:bg-dark-lighter/50 transition-colors">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleOrderDetail(order.id)}
                        className="text-accent-purple hover:text-accent-purple-light font-mono text-sm transition-colors"
                      >
                        #{order.id} {expandedOrder === order.id ? '▼' : '▶'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white text-sm">{order.user_name}</p>
                      <p className="text-zinc-500 text-xs">{order.user_email}</p>
                    </td>
                    <td className="px-6 py-4 text-zinc-300 text-sm">{order.items_count}</td>
                    <td className="px-6 py-4 text-white text-sm font-medium">€{order.total.toFixed(2)}</td>
                    <td className="px-6 py-4 text-zinc-400 text-sm">
                      {new Date(order.order_date).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full border ${statusColors[order.status] || statusColors.pending}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        disabled={updatingOrder === order.id}
                        className="bg-dark-lighter border border-dark-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-accent-purple cursor-pointer disabled:opacity-50"
                      >
                        {allStatuses.map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                  {expandedOrder === order.id && (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 bg-dark-lighter/30">
                        {loadingDetail ? (
                          <p className="text-zinc-400 text-sm">Loading details...</p>
                        ) : orderDetail ? (
                          <div className="grid md:grid-cols-3 gap-6">
                            <div>
                              <h4 className="text-zinc-300 font-medium text-sm mb-2">Shipping</h4>
                              <div className="text-zinc-400 text-sm space-y-1">
                                <p>{orderDetail.shipping_name}</p>
                                <p>{orderDetail.shipping_street}</p>
                                <p>{orderDetail.shipping_city} {orderDetail.shipping_postal_code}</p>
                                <p>{orderDetail.shipping_phone}</p>
                                {orderDetail.delivery_notes && (
                                  <p className="text-zinc-500 italic">Note: {orderDetail.delivery_notes}</p>
                                )}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-zinc-300 font-medium text-sm mb-2">Items</h4>
                              <div className="space-y-1">
                                {orderDetail.items?.map((item, i) => (
                                  <div key={i} className="flex justify-between text-sm">
                                    <span className="text-zinc-400">{item.wine_name} × {item.quantity}</span>
                                    <span className="text-zinc-300">€{item.subtotal.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-zinc-300 font-medium text-sm mb-2">Shipment Tracking</h4>
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Carrier (e.g. CTT Expresso)"
                                  value={trackingForm.carrier}
                                  onChange={(e) => setTrackingForm({ ...trackingForm, carrier: e.target.value })}
                                  className="w-full px-3 py-1.5 bg-dark-lighter border border-dark-border rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-accent-purple"
                                />
                                <input
                                  type="text"
                                  placeholder="Tracking number"
                                  value={trackingForm.tracking_number}
                                  onChange={(e) => setTrackingForm({ ...trackingForm, tracking_number: e.target.value })}
                                  className="w-full px-3 py-1.5 bg-dark-lighter border border-dark-border rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-accent-purple"
                                />
                                <button
                                  onClick={() => handleSaveTracking(order.id)}
                                  disabled={updatingOrder === order.id}
                                  className="px-3 py-1.5 bg-accent-purple text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                                >
                                  Save Tracking Info
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-zinc-500 text-sm">Failed to load details.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {orders.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-zinc-400">No orders yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
