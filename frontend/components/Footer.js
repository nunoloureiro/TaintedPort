import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="py-6 px-4 border-t border-dark-border bg-dark/80">
      <div className="max-w-6xl mx-auto flex items-center justify-center">
        <p className="text-zinc-500 text-sm text-center flex-1">
          <span className="font-medium text-zinc-400">TaintedPort</span> is a test application for security testing purposes only. Not a real store.{' '}
          <Link href="/about" className="text-accent-purple-light hover:text-white transition-colors underline">
            More info
          </Link>
          {' | '}
          <Link href="/contact" className="text-accent-purple-light hover:text-white transition-colors underline">
            Contact
          </Link>
        </p>
        <span className="text-zinc-600 text-xs ml-4 flex-shrink-0">v{process.env.APP_VERSION}</span>
      </div>
    </footer>
  );
}
