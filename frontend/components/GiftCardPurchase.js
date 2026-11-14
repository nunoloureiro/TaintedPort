'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { giftcardAPI } from '@/lib/api';
import { stripePromise, stripeAppearance } from '@/lib/stripe';
import Button from '@/components/Button';

// Card form — lives inside <Elements> so it can use the Stripe hooks.
function GiftCardPaymentForm({ amount, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState('');

  const pay = async () => {
    setErr('');
    if (!stripe || !elements) return;
    setPaying(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.origin + '/account' },
      redirect: 'if_required',
    });
    if (error) {
      setErr(error.message || 'Payment failed. Please check your card details.');
      setPaying(false);
      return;
    }
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      const message = await onPaid(paymentIntent.id);
      if (!message) return; // parent resets the form and unmounts us
      setErr(message);
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
      <Button onClick={pay} loading={paying} disabled={!stripe} className="w-full">
        Pay €{Number(amount).toFixed(2)}
      </Button>
    </div>
  );
}

export default function GiftCardPurchase({ denominations, onPurchased }) {
  const [amount, setAmount] = useState(null);
  const [clientSecret, setClientSecret] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setClientSecret('');
    setAmount(null);
    setError('');
  };

  const startPayment = async () => {
    if (!amount) return;
    setStarting(true);
    setError('');
    try {
      const res = await giftcardAPI.createPurchaseIntent(amount);
      setClientSecret(res.data.client_secret);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start the payment. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  // Returns an error message on failure, or null once the card is issued.
  const handlePaid = async (paymentIntentId) => {
    try {
      const res = await giftcardAPI.purchase(paymentIntentId);
      reset();
      onPurchased(res.data.gift_card);
      return null;
    } catch (err) {
      return err.response?.data?.message || 'Payment succeeded but the gift card could not be issued. Please contact support.';
    }
  };

  return (
    <div>
      <p className="text-white font-medium mb-1">Buy a Gift Card</p>
      <p className="text-zinc-500 text-sm mb-3">Give it to someone else, or redeem it yourself for store credit.</p>

      {clientSecret ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-zinc-400 text-sm">€{Number(amount).toFixed(2)} gift card</p>
            <button onClick={reset} className="text-zinc-400 hover:text-white text-sm">Change amount</button>
          </div>
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }} key={clientSecret}>
            <GiftCardPaymentForm amount={amount} onPaid={handlePaid} />
          </Elements>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {denominations.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { setAmount(d); setError(''); }}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${amount === d ? 'border-accent-purple bg-accent-purple/10 text-white' : 'border-dark-border bg-dark-lighter text-zinc-300 hover:border-accent-purple/40'}`}
            >
              €{d}
            </button>
          ))}
          <Button variant="primary" size="sm" onClick={startPayment} loading={starting} disabled={!amount}>
            Continue to payment
          </Button>
        </div>
      )}
      {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
    </div>
  );
}
