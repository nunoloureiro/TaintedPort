'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useState } from 'react';
import Logo from '@/components/Logo';

const ADMIN_LINKS = [
  { href: '/admin', label: 'Overview', roles: ['admin'] },
  { href: '/admin/orders', label: 'Orders', roles: ['admin', 'support'] },
  { href: '/admin/wines', label: 'Wines', roles: ['admin'] },
  { href: '/admin/discounts', label: 'Discounts & Referrals', roles: ['admin'] },
  { href: '/admin/support', label: 'Support', roles: ['admin', 'support'] },
  { href: '/admin/team', label: 'Team', roles: ['admin'] },
];

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const { itemCount } = useCart();
  // Hidden rather than removed while the stored login is checked: no guest-menu flash for
  // signed-in users, and the links stay in the server-rendered HTML for non-JS crawlers
  const guestHidden = loading ? 'invisible' : '';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const role = user?.role || (user?.is_admin ? 'admin' : 'user');
  const adminLinks = ADMIN_LINKS.filter((l) => l.roles.includes(role));

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark/80 backdrop-blur-xl border-b border-dark-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Logo size="sm" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-6">
            {user && (
              <span className="text-zinc-300 text-sm border-r border-dark-border pr-6" dangerouslySetInnerHTML={{ __html: `Hi, ${user.name}` }} />
            )}
            <Link href="/wines" className="text-zinc-400 hover:text-white transition-colors">
              Wines
            </Link>
            <Link href="/about" className="text-zinc-400 hover:text-white transition-colors">
              About
            </Link>
            <Link href="/contact" className="text-zinc-400 hover:text-white transition-colors">
              Contact
            </Link>

            {user ? (
              <>
                <Link href="/cart" className="relative text-zinc-400 hover:text-white transition-colors">
                  Cart
                  {itemCount > 0 && (
                    <span className="absolute -top-2 -right-4 bg-accent-purple text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {itemCount}
                    </span>
                  )}
                </Link>
                <Link href="/wishlist" className="text-zinc-400 hover:text-white transition-colors">
                  Wishlist
                </Link>
                <Link href="/support" className="text-zinc-400 hover:text-white transition-colors">
                  Support
                </Link>
                <Link href="/account" className="text-zinc-400 hover:text-white transition-colors">
                  Account
                </Link>
                {adminLinks.length > 0 && (
                  <div
                    className="relative"
                    onMouseEnter={() => setAdminOpen(true)}
                    onMouseLeave={() => setAdminOpen(false)}
                  >
                    <button
                      onClick={() => setAdminOpen(!adminOpen)}
                      className="flex items-center gap-1 text-yellow-400 hover:text-yellow-300 transition-colors"
                    >
                      Admin
                      <svg className={`w-3.5 h-3.5 transition-transform ${adminOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {adminOpen && (
                      // top-full pt-2: the 8px spacing is hoverable padding (a
                      // descendant of the wrapper), not an empty margin gap, so
                      // the pointer can travel from the button to the menu
                      // without ever leaving the wrapper and closing it.
                      <div className="absolute right-0 top-full pt-2 w-56 z-50">
                        <div className="bg-dark-card border border-dark-border rounded-lg shadow-xl overflow-hidden py-1">
                          {adminLinks.map((l) => (
                            <Link
                              key={l.href}
                              href={l.href}
                              onClick={() => setAdminOpen(false)}
                              className="block px-4 py-2 text-sm text-zinc-300 hover:bg-dark-lighter hover:text-white transition-colors"
                            >
                              {l.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={logout}
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={`text-zinc-400 hover:text-white transition-colors ${guestHidden}`}
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className={`px-4 py-2 bg-gradient-to-r from-accent-purple to-accent-purple-light text-white rounded-lg font-medium hover:opacity-90 transition-opacity ${guestHidden}`}
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-zinc-400 hover:text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <Link href="/wines" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
              Wines
            </Link>
            <Link href="/about" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
              About
            </Link>
            <Link href="/contact" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
              Contact
            </Link>
            {user ? (
              <>
                <Link href="/cart" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
                  Cart {itemCount > 0 && `(${itemCount})`}
                </Link>
                <Link href="/wishlist" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
                  Wishlist
                </Link>
                <Link href="/support" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
                  Support
                </Link>
                <Link href="/account" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
                  Account
                </Link>
                {adminLinks.map((l) => (
                  <Link key={l.href} href={l.href} className="block px-3 py-2 text-yellow-400 hover:text-yellow-300" onClick={() => setMobileOpen(false)}>
                    {l.label}
                  </Link>
                ))}
                <button onClick={() => { logout(); setMobileOpen(false); }} className="block px-3 py-2 text-zinc-400 hover:text-white">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={`block px-3 py-2 text-zinc-400 hover:text-white ${guestHidden}`} onClick={() => setMobileOpen(false)}>
                  Login
                </Link>
                <Link href="/signup" className={`block px-3 py-2 text-accent-purple hover:text-accent-purple-light ${guestHidden}`} onClick={() => setMobileOpen(false)}>
                  Sign Up
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
