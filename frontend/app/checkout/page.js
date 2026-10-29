'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { orderAPI, discountAPI, paymentAPI } from '@/lib/api';
import Input from '@/components/Input';
import Button from '@/components/Button';

const STRIPE_PK =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  'pk_test_51UFzKeFjrKiRZbyXSpCq8zcBCi5ipwMX9pTVxFZdJ218xvv1YPypyyklo1vCd4hnECpsnot8fbXUN5V8gTvYoRzx008xoUNp7J';
// developerTools.assistant: 'never' suppresses Stripe.js's floating dev-tools
// widget that otherwise appears in test/sandbox mode.
const stripePromise = loadStripe(STRIPE_PK, { developerTools: { assistant: { enabled: false } } });

const stripeAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#a855f7',
    colorBackground: '#18181b',
    colorText: '#e4e4e7',
    borderRadius: '8px',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
};

// Card form — lives inside <Elements> so it can use the Stripe hooks.
function PaymentForm({ grandTotal, onPay, validate }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState('');

  const pay = async () => {
    setErr('');
    if (!validate()) return;
    if (!stripe || !elements) return;
    setPaying(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + '/checkout' },
      redirect: 'if_required',
    });
    if (error) {
      setErr(error.message || 'Payment failed. Please check your card details.');
      setPaying(false);
      return;
    }
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      const ok = await onPay(paymentIntent.id);
      if (ok) return; // parent swaps to the success screen and unmounts us
      setErr('Payment succeeded but the order could not be placed. Please contact support.');
    } else {
      setErr('Payment was not completed.');
    }
    setPaying(false);
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      {err && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{err}</div>
      )}
      <Button onClick={pay} loading={paying} disabled={!stripe} className="w-full" size="lg">
        Pay €{grandTotal.toFixed(2)}
      </Button>
    </div>
  );
}

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
  const [discountCode, setDiscountCode] = useState('');
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const shippingRef = useRef(null);

  // Stripe payment state
  const [clientSecret, setClientSecret] = useState('');
  const [cardUnavailable, setCardUnavailable] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' | 'cash'

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

  const storeCredit = Number(user?.account_credit || 0);
  const discountedSubtotal = appliedDiscount ? Math.max(0, total - appliedDiscount.discount_amount) : total;
  const appliedCredit = Math.min(storeCredit, discountedSubtotal);
  const netSubtotal = Math.max(0, discountedSubtotal - appliedCredit);
  const vat = netSubtotal * 0.23;
  const grandTotal = netSubtotal + vat;
  // When card payments aren't configured, only cash is offered.
  const effectiveMethod = cardUnavailable ? 'cash' : paymentMethod;

  // (Re)create the PaymentIntent whenever the amount owed changes. The server
  // computes the amount itself; we only need the returned client_secret.
  useEffect(() => {
    if (!user || items.length === 0 || grandTotal <= 0) {
      setClientSecret('');
      setCardUnavailable(false);
      return;
    }
    let cancelled = false;
    setClientSecret('');
    setCardUnavailable(false);
    const body = appliedDiscount
      ? { discount_code: appliedDiscount.code, discount_percent: appliedDiscount.discount_percent }
      : {};
    paymentAPI
      .createIntent(body)
      .then((res) => {
        if (!cancelled) setClientSecret(res.data.client_secret);
      })
      .catch(() => {
        if (!cancelled) setCardUnavailable(true); // Stripe not configured → pay on delivery
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, items.length, grandTotal, appliedDiscount]);

  if (authLoading) return null;
  if (!user) return null;

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    setApplyingDiscount(true);
    setDiscountError('');
    try {
      const res = await discountAPI.validate(discountCode.trim(), total);
      setAppliedDiscount(res.data);
    } catch (err) {
      setAppliedDiscount(null);
      setDiscountError(err.response?.data?.message || 'Invalid discount code.');
    } finally {
      setApplyingDiscount(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode('');
    setDiscountError('');
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.street.trim()) e.street = 'Street address is required';
    if (!form.city.trim()) e.city = 'City is required';
    if (!form.postal_code.trim()) e.postal_code = 'Postal code is required';
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    setErrors(e);
    if (Object.keys(e).length > 0) {
      // The payment button lives well below this section, so a failed
      // validation otherwise looks like nothing happened at all — the red
      // error text only appears off-screen above the fold.
      shippingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return Object.keys(e).length === 0;
  };

  // Places the order. paymentIntentId is set for card payments; null for
  // fully-credit-covered (free) or pay-on-delivery orders.
  const handlePlaceOrder = async (paymentIntentId) => {
    if (!validate()) return false;
    setLoading(true);
    try {
      const payload = {
        shipping_address: {
          name: form.name,
          street: form.street,
          city: form.city,
          postal_code: form.postal_code,
          phone: form.phone,
        },
        delivery_notes: form.delivery_notes,
      };
      if (appliedDiscount) {
        payload.discount_code = appliedDiscount.code;
        payload.discount_percent = appliedDiscount.discount_percent;
      }
      if (paymentIntentId) payload.payment_intent_id = paymentIntentId;
      const res = await orderAPI.create(payload);
      setSuccess(res.data.order_id);
      clearCart();
      return true;
    } catch (err) {
      setErrors({ server: err.response?.data?.message || 'Failed to place order. Please try again.' });
      return false;
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
          <p className="text-zinc-500 text-sm mb-8">Thank you for your purchase!</p>
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
          {/* Shipping + Payment */}
          <div className="lg:col-span-2 space-y-6">
            <div ref={shippingRef} className="bg-dark-card border border-dark-border rounded-xl p-6 scroll-mt-24">
              <h2 className="text-lg font-semibold text-white mb-6">Shipping Address</h2>

              <div className="space-y-5">
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
              </div>
            </div>

            {/* Payment */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-6">Payment</h2>

              {grandTotal <= 0 ? (
                <>
                  <p className="text-zinc-400 text-sm mb-5">
                    Your store credit covers this order in full — no payment required.
                  </p>
                  <Button onClick={() => handlePlaceOrder(null)} loading={loading} className="w-full" size="lg">
                    Place Order
                  </Button>
                </>
              ) : (
                <>
                  {/* Payment method selector */}
                  <div className="space-y-2 mb-5">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`w-full flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${effectiveMethod === 'cash' ? 'border-accent-purple bg-accent-purple/5' : 'border-dark-border bg-dark-lighter hover:border-accent-purple/40'}`}
                    >
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${effectiveMethod === 'cash' ? 'border-accent-purple' : 'border-zinc-600'}`}>
                        {effectiveMethod === 'cash' && <span className="w-2.5 h-2.5 rounded-full bg-accent-purple" />}
                      </span>
                      <span className="text-white">Pay on Delivery (Cash)</span>
                    </button>
                    {!cardUnavailable && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`w-full flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${effectiveMethod === 'card' ? 'border-accent-purple bg-accent-purple/5' : 'border-dark-border bg-dark-lighter hover:border-accent-purple/40'}`}
                      >
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${effectiveMethod === 'card' ? 'border-accent-purple' : 'border-zinc-600'}`}>
                          {effectiveMethod === 'card' && <span className="w-2.5 h-2.5 rounded-full bg-accent-purple" />}
                        </span>
                        <span className="text-white">Credit / Debit Card</span>
                      </button>
                    )}
                  </div>

                  {/* Selected method */}
                  {effectiveMethod === 'card' ? (
                    clientSecret ? (
                      <Elements
                        stripe={stripePromise}
                        options={{ clientSecret, appearance: stripeAppearance }}
                        key={clientSecret}
                      >
                        <PaymentForm grandTotal={grandTotal} onPay={handlePlaceOrder} validate={validate} />
                      </Elements>
                    ) : (
                      <div className="flex items-center gap-3 text-zinc-500 text-sm py-4">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Initializing secure payment…
                      </div>
                    )
                  ) : (
                    <Button onClick={() => handlePlaceOrder(null)} loading={loading} className="w-full" size="lg">
                      Place Order
                    </Button>
                  )}
                </>
              )}
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

              {/* Discount code */}
              <div className="mb-4">
                {appliedDiscount ? (
                  <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div>
                      <p className="text-green-400 text-sm font-mono font-medium">{appliedDiscount.code}</p>
                      <p className="text-green-400/70 text-xs">-€{appliedDiscount.discount_amount.toFixed(2)} applied</p>
                    </div>
                    <button onClick={handleRemoveDiscount} className="text-zinc-400 hover:text-white text-sm">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Discount code"
                        value={discountCode}
                        onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setDiscountError(''); }}
                        className="flex-1 px-3 py-2 bg-dark-lighter border border-dark-border rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-accent-purple"
                      />
                      <button
                        onClick={handleApplyDiscount}
                        disabled={applyingDiscount || !discountCode.trim()}
                        className="px-4 py-2 bg-dark-lighter border border-dark-border rounded-lg text-sm text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
                      >
                        {applyingDiscount ? '...' : 'Apply'}
                      </button>
                    </div>
                    {discountError && <p className="text-red-400 text-xs mt-1.5">{discountError}</p>}
                  </div>
                )}
              </div>

              <div className="border-t border-dark-border pt-3 space-y-2">
                <div className="flex justify-between text-zinc-400 text-sm">
                  <span>Subtotal</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
                {appliedDiscount && (
                  <div className="flex justify-between text-green-400 text-sm">
                    <span>Discount</span>
                    <span>-€{appliedDiscount.discount_amount.toFixed(2)}</span>
                  </div>
                )}
                {appliedCredit > 0 && (
                  <div className="flex justify-between text-accent-cyan text-sm">
                    <span>Store credit</span>
                    <span>-€{appliedCredit.toFixed(2)}</span>
                  </div>
                )}
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
