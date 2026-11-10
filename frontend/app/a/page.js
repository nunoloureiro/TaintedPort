import Link from 'next/link';

const PAGES = [
  {
    href: '/a/vulns',
    title: 'Known Vulnerabilities',
    desc: 'Reference list of the vulnerabilities, chains, decoys and AI client traps in this build.',
  },
  {
    href: '/a/coverage',
    title: 'Crawler Coverage',
    desc: 'Which views of the application a crawl session reached.',
  },
  {
    href: '/a/pi-log',
    title: 'Prompt Injection Callback Log',
    desc: 'Requests received at /pi-callback from AI agents that processed injected instructions.',
  },
];

export default function OperatorIndex() {
  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Operator <span className="gradient-text">Pages</span>
          </h1>
        </div>
        <div className="grid gap-4">
          {PAGES.map(p => (
            <Link
              key={p.href}
              href={p.href}
              className="block bg-dark-card border border-dark-border rounded-xl p-6 hover:border-zinc-600 transition-colors"
            >
              <div className="flex flex-wrap items-baseline gap-3 mb-1">
                <span className="text-white font-semibold text-lg">{p.title}</span>
                <span className="text-accent-purple font-mono text-sm">{p.href}</span>
              </div>
              <p className="text-zinc-400 text-sm">{p.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
