'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import Button from '@/components/Button';

export default function CartPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { items, total, loading, updateItem, removeItem } = useCart();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-5xl mb-4">🛒</div>
          <p className="text-zinc-400">Loading cart...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const vat = total * 0.23;
  const grandTotal = total + vat;

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-white mb-8">
          Shopping <span className="gradient-text">Cart</span>
        </h1>

        {items.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🛒</div>
            <h3 className="text-xl font-semibold text-white mb-2">Your cart is empty</h3>
            <p className="text-zinc-400 mb-6">Start adding some amazing Portuguese wines!</p>
            <Link href="/wines">
              <Button>Browse Wines</Button>
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
                >
                  {/* Wine thumbnail */}
                  <div className="w-16 h-16 bg-dark-lighter rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                    🍷
                  </div>

                  {/* Wine info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">{item.wine_name}</h3>
                    <p className="text-zinc-400 text-sm">€{item.price.toFixed(2)} each</p>
                  </div>

                  {/* Quantity */}
                  <div className="flex items-center border border-dark-border rounded-lg">
                    <button
                      onClick={() => updateItem(item.wine_id, item.quantity - 1)}
                      className="px-3 py-1.5 text-zinc-400 hover:text-white transition-colors"
                    >
                      −
                    </button>
                    <span className="px-3 py-1.5 text-white font-medium min-w-[2.5rem] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateItem(item.wine_id, Math.min(12, item.quantity + 1))}
                      className="px-3 py-1.5 text-zinc-400 hover:text-white transition-colors"
                    >
                      +
                    </button>
                  </div>

                  {/* Subtotal */}
                  <div className="text-right min-w-[5rem]">
                    <p className="text-white font-semibold">€{item.subtotal.toFixed(2)}</p>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item.wine_id)}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove item"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-dark-card border border-dark-border rounded-xl p-6 sticky top-24">
                <h3 className="text-lg font-semibold text-white mb-4">Order Summary</h3>

                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-zinc-400">
                    <span>Subtotal</span>
                    <span>€{total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>VAT (23%)</span>
                    <span>€{vat.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-dark-border pt-3 flex justify-between text-white font-semibold text-lg">
                    <span>Total</span>
                    <span>€{grandTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Link href="/checkout" className="block">
                    <Button className="w-full" size="lg">
                      Proceed to Checkout
                    </Button>
                  </Link>
                  <Link href="/wines" className="block">
                    <Button variant="secondary" className="w-full" size="lg">
                      Continue Shopping
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
