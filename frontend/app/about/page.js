'use client';

import Link from 'next/link';
import Button from '@/components/Button';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Warning Banner */}
        <div className="mb-10 p-5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h3 className="text-yellow-400 font-semibold text-lg mb-1">This is NOT a real store</h3>
              <p className="text-yellow-200/80 text-sm leading-relaxed">
                This application is an intentionally vulnerable web application designed for
                security testing and educational purposes only. No real transactions are processed,
                no real products are sold, and no real deliveries are made.
              </p>
            </div>
          </div>
        </div>

        {/* Page Title */}
        <h1 className="text-4xl sm:text-5xl font-bold mb-6">
          About <span className="gradient-text">This Application</span>
        </h1>

        {/* Main Content */}
        <div className="space-y-8">
          <div className="bg-dark-card border border-dark-border rounded-xl p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-white mb-3">What is this?</h2>
            <p className="text-zinc-400 leading-relaxed">
              <strong className="text-white">TaintedPort</strong> is a deliberately vulnerable
              web application built for Dynamic Application Security Testing (DAST) and security
              research. It simulates a Portuguese wine e-commerce store to provide a realistic attack surface
              for security scanners and penetration testers.
            </p>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-white mb-3">Important Disclaimers</h2>
            <ul className="space-y-3 text-zinc-400">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span><strong className="text-white">Not a real store</strong> &mdash; You cannot purchase any wines here. No orders are fulfilled, no payments are processed.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span><strong className="text-white">Inaccurate information</strong> &mdash; Wine names, prices, descriptions, tasting notes, and all other product information are fictional or approximate. Do not rely on any data shown here.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span><strong className="text-white">Intentionally vulnerable</strong> &mdash; This application may contain security vulnerabilities on purpose. Do not use any of its code in production.</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span><strong className="text-white">Testing only</strong> &mdash; This site exists solely for testing security scanning tools and learning about web application security.</span>
              </li>
            </ul>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-white mb-3">Purpose</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              This application was created to serve as a target for:
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: '🔍', title: 'DAST Scanning', desc: 'Dynamic Application Security Testing tools' },
                { icon: '🛡️', title: 'Penetration Testing', desc: 'Manual and automated security assessments' },
                { icon: '📚', title: 'Security Training', desc: 'Learning about web application vulnerabilities' },
                { icon: '🧪', title: 'Tool Evaluation', desc: 'Comparing security scanning products' },
              ].map((item, i) => (
                <div key={i} className="bg-dark-lighter border border-dark-border rounded-lg p-4">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <h4 className="text-white font-medium mb-1">{item.title}</h4>
                  <p className="text-zinc-500 text-sm">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-dark-card border border-dark-border rounded-xl p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-white mb-3">Tech Stack</h2>
            <p className="text-zinc-400 leading-relaxed mb-4">
              Built with modern technologies to simulate a realistic web application:
            </p>
            <div className="flex flex-wrap gap-2">
              {['Next.js 14', 'React 18', 'Tailwind CSS', 'PHP 8', 'SQLite', 'JWT Auth', 'TOTP 2FA'].map((tech) => (
                <span key={tech} className="px-3 py-1.5 bg-dark-lighter border border-dark-border rounded-full text-zinc-300 text-sm">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-zinc-500 mb-4">Want to explore the test application?</p>
          <Link href="/wines">
            <Button size="lg" variant="primary">
              Browse Test Catalog
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
