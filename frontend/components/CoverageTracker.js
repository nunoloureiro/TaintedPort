'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { coverageAPI } from '@/lib/api';

export default function CoverageTracker() {
  const pathname = usePathname();
  // StrictMode runs effects twice in development; don't count the same page load twice
  const lastRecorded = useRef(null);

  useEffect(() => {
    if (!pathname || lastRecorded.current === pathname) return;
    lastRecorded.current = pathname;
    coverageAPI.recordView(pathname).catch(() => {});
  }, [pathname]);

  return null;
}
