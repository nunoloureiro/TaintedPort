'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { orderAPI } from '@/lib/api';

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, loading: authLoading } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && params.id) {
      const fetchOrder = async () => {
        try {
          const res = await orderAPI.getById(params.id);
          setOrder(res.data.order);
        } catch (err) {
          setError('Order not found.');
        } finally {
          setLoading(false);
        }
      };
      fetchOrder();
    }
  }, [user, params.id]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-5xl mb-4">📦</div>
          <p className="text-zinc-400">Loading order...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">😔</div>
          <h3 className="text-xl font-semibold text-white mb-2">Order Not Found</h3>
          <p className="text-zinc-400 mb-6">{error || 'This order does not exist.'}</p>
          <Link href="/account" className="text-accent-purple hover:text-accent-purple-light transition-colors">
            ← Back to Account
          </Link>
        </div>
      </div>
    );
  }

  const statusColors = {
    pending: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
    processing: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    shipped: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    delivered: 'text-green-400 border-green-500/30 bg-green-500/10',
  };

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/account" className="text-accent-purple hover:text-accent-purple-light transition-colors text-sm mb-6 inline-block">
          ← Back to Account
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <h1 className="text-3xl font-bold text-white">
            Order <span className="gradient-text">#{order.id}</span>
          </h1>
          <span className={`text-xs px-3 py-1 rounded-full border ${statusColors[order.status] || statusColors.pending}`}>
            {order.status}
          </span>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Shipping Info */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Shipping Details</h2>
            <div className="space-y-2 text-sm">
              {/* VULN: Stored XSS - shipping name rendered as raw HTML */}
              <p className="text-zinc-300">
                <span className="text-zinc-500">Name:</span>{' '}
                <span dangerouslySetInnerHTML={{ __html: order.shipping_name }} />
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Address:</span> {order.shipping_street}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">City:</span> {order.shipping_city} {order.shipping_postal_code}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Phone:</span> {order.shipping_phone}
              </p>
              {order.delivery_notes && (
                <p className="text-zinc-300">
                  <span className="text-zinc-500">Notes:</span> {order.delivery_notes}
                </p>
              )}
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Order Summary</h2>
            <div className="space-y-2 text-sm">
              <p className="text-zinc-300">
                <span className="text-zinc-500">Date:</span>{' '}
                {new Date(order.created_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Items:</span> {order.items?.length || 0}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">Subtotal:</span> €{order.total.toFixed(2)}
              </p>
              <p className="text-zinc-300">
                <span className="text-zinc-500">VAT (23%):</span> €{(order.total * 0.23).toFixed(2)}
              </p>
              <p className="text-white font-semibold text-lg mt-3">
                Total: €{(order.total * 1.23).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Items</h2>
          <div className="space-y-3">
            {order.items?.map((item, i) => (
              <div key={i} className="flex justify-between items-center py-3 border-b border-dark-border last:border-0">
                <div>
                  <p className="text-white font-medium">{item.wine_name}</p>
                  <p className="text-zinc-500 text-sm">Qty: {item.quantity} × €{item.price.toFixed(2)}</p>
                </div>
                <p className="text-zinc-300 font-medium">€{item.subtotal.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
