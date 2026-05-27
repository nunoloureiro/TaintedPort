'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { orderAPI } from '@/lib/api';
import Input from '@/components/Input';
import Button from '@/components/Button';

export default function CheckoutPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { items, total, clearCart } = useCart();
  const [form, setForm] = useState({
    name: '',
    street: '',
    city: '',
    postal_code: '',
    phone: '',
    delivery_notes: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      setForm((f) => ({ ...f, name: f.name || user.name || '' }));
    }
  }, [user]);

  if (authLoading) return null;
  if (!user) return null;

  const vat = total * 0.23;
  const grandTotal = total + vat;

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.street.trim()) e.street = 'Street address is required';
    if (!form.city.trim()) e.city = 'City is required';
    if (!form.postal_code.trim()) e.postal_code = 'Postal code is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await orderAPI.create({
        shipping_address: {
          name: form.name,
          street: form.street,
          city: form.city,
          postal_code: form.postal_code,
          phone: form.phone,
        },
        delivery_notes: form.delivery_notes,
      });
      setSuccess(res.data.order_id);
      clearCart();
    } catch (err) {
      setErrors({ server: err.response?.data?.message || 'Failed to place order. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-3xl font-bold text-white mb-3">Order Confirmed!</h1>
          <p className="text-zinc-400 mb-2">
            Your order <span className="text-accent-purple font-mono">#{success}</span> has been placed successfully.
          </p>
          <p className="text-zinc-500 text-sm mb-8">
            Payment will be collected on delivery. Thank you for your purchase!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/account">
              <Button>View Orders</Button>
            </Link>
            <Link href="/wines">
              <Button variant="secondary">Continue Shopping</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🛒</div>
          <h3 className="text-xl font-semibold text-white mb-2">Your cart is empty</h3>
          <p className="text-zinc-400 mb-6">Add some wines before checking out</p>
          <Link href="/wines">
            <Button>Browse Wines</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">
          <span className="gradient-text">Checkout</span>
        </h1>

        {errors.server && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {errors.server}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Shipping Form */}
          <div className="lg:col-span-2">
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-6">Shipping Address</h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                <Input
                  label="Full Name"
                  placeholder="Joe Silva"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  error={errors.name}
                />

                <Input
                  label="Street Address"
                  placeholder="Rua das Flores, 123"
                  value={form.street}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                  error={errors.street}
                />

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="City"
                    placeholder="Lisboa"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    error={errors.city}
                  />
                  <Input
                    label="Postal Code"
                    placeholder="1200-123"
                    value={form.postal_code}
                    onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                    error={errors.postal_code}
                  />
                </div>

                <Input
                  label="Phone Number"
                  placeholder="+351 912 345 678"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  error={errors.phone}
                />

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-zinc-300">Delivery Notes (optional)</label>
                  <textarea
                    placeholder="Please ring the doorbell"
                    value={form.delivery_notes}
                    onChange={(e) => setForm({ ...form, delivery_notes: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-accent-purple focus:ring-1 focus:ring-accent-purple transition-colors resize-none"
                  />
                </div>

                {/* Payment Method */}
                <div className="bg-dark-lighter border border-dark-border rounded-lg p-4">
                  <h3 className="text-sm font-medium text-zinc-300 mb-2">Payment Method</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-accent-purple flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-accent-purple" />
                    </div>
                    <span className="text-white">Payment on Delivery (Cash)</span>
                  </div>
                </div>

                <Button type="submit" loading={loading} className="w-full" size="lg">
                  Place Order
                </Button>
              </form>
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 sticky top-24">
              <h3 className="text-lg font-semibold text-white mb-4">Order Summary</h3>

              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-zinc-400 truncate mr-2">
                      {item.wine_name} × {item.quantity}
                    </span>
                    <span className="text-zinc-300 flex-shrink-0">€{item.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dark-border pt-3 space-y-2">
                <div className="flex justify-between text-zinc-400 text-sm">
                  <span>Subtotal</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400 text-sm">
                  <span>VAT (23%)</span>
                  <span>€{vat.toFixed(2)}</span>
                </div>
                <div className="border-t border-dark-border pt-2 flex justify-between text-white font-semibold text-lg">
                  <span>Total</span>
                  <span>€{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
