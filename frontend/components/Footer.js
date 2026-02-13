import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="py-6 px-4 border-t border-dark-border bg-dark/80">
      <div className="max-w-6xl mx-auto text-center">
        <p className="text-zinc-500 text-sm">
          <span className="font-medium text-zinc-400">TaintedPort</span> is a test application for security testing purposes only. Not a real store.{' '}
          <Link href="/about" className="text-accent-purple-light hover:text-white transition-colors underline">
            More info
          </Link>
        </p>
      </div>
    </footer>
  );
}
