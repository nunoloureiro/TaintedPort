'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-6xl font-bold text-purple-400 mb-4">404</h1>
      <p className="text-xl text-zinc-300 mb-8">This page could not be found.</p>
      <Link
        href="/"
        className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
