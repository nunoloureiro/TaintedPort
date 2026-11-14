'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';

const TABS = [
  { href: '/admin', label: 'Overview', roles: ['admin'] },
  { href: '/admin/orders', label: 'Orders', roles: ['admin', 'support'] },
  { href: '/admin/wines', label: 'Wines', roles: ['admin'] },
  { href: '/admin/discounts', label: 'Discounts & Referrals', roles: ['admin'] },
  { href: '/admin/giftcards', label: 'Gift Cards', roles: ['admin'] },
  { href: '/admin/support', label: 'Support', roles: ['admin', 'support'] },
  { href: '/admin/team', label: 'Team', roles: ['admin'] },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const role = user?.role || (user?.is_admin ? 'admin' : 'user');
  const allowed = role === 'admin' || role === 'support';
  const currentTab = TABS.find((t) => (t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href)));
  const tabAllowed = !currentTab || currentTab.roles.includes(role);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (!allowed) {
      router.push('/');
      return;
    }
    if (!tabAllowed) {
      router.push(role === 'support' ? '/admin/orders' : '/admin');
    }
  }, [user, loading, allowed, tabAllowed, role, router]);

  if (loading || !user || !allowed || !tabAllowed) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-5xl mb-4">🔐</div>
          <p className="text-zinc-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  const tabs = TABS.filter((t) => t.roles.includes(role));

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="flex items-center gap-1 border-b border-dark-border mb-8 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active ? 'border-accent-purple text-white' : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {children}
      </div>
    </div>
  );
}
