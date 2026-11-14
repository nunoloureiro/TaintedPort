import { loadStripe } from '@stripe/stripe-js';

const STRIPE_PK =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
  'pk_test_51UFzKeFjrKiRZbyXSpCq8zcBCi5ipwMX9pTVxFZdJ218xvv1YPypyyklo1vCd4hnECpsnot8fbXUN5V8gTvYoRzx008xoUNp7J';
// developerTools.assistant: 'never' suppresses Stripe.js's floating dev-tools
// widget that otherwise appears in test/sandbox mode.
export const stripePromise = loadStripe(STRIPE_PK, { developerTools: { assistant: { enabled: false } } });

export const stripeAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#a855f7',
    colorBackground: '#18181b',
    colorText: '#e4e4e7',
    borderRadius: '8px',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
};
