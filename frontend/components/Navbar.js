'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useState } from 'react';
import Logo from '@/components/Logo';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

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
                <Link href="/account" className="text-zinc-400 hover:text-white transition-colors">
                  Account
                </Link>
                {user.is_admin && (
                  <Link href="/admin" className="text-yellow-400 hover:text-yellow-300 transition-colors">
                    Admin
                  </Link>
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
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 bg-gradient-to-r from-accent-purple to-accent-purple-light text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
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
            {user ? (
              <>
                <Link href="/cart" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
                  Cart {itemCount > 0 && `(${itemCount})`}
                </Link>
                <Link href="/account" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
                  Account
                </Link>
                {user.is_admin && (
                  <Link href="/admin" className="block px-3 py-2 text-yellow-400 hover:text-yellow-300" onClick={() => setMobileOpen(false)}>
                    Admin
                  </Link>
                )}
                <button onClick={() => { logout(); setMobileOpen(false); }} className="block px-3 py-2 text-zinc-400 hover:text-white">
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block px-3 py-2 text-zinc-400 hover:text-white" onClick={() => setMobileOpen(false)}>
                  Login
                </Link>
                <Link href="/signup" className="block px-3 py-2 text-accent-purple hover:text-accent-purple-light" onClick={() => setMobileOpen(false)}>
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
