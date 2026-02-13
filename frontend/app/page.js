'use client';

import Link from 'next/link';
import Button from '@/components/Button';
import Logo from '@/components/Logo';

export default function Home() {
  return (
    <div className="min-h-screen bg-pattern">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-purple/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-cyan/10 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center">
          <div className="mb-8 flex justify-center">
            <Logo size="xl" />
          </div>

          <div className="mb-6">
            <span className="inline-block px-4 py-1.5 bg-accent-purple/10 border border-accent-purple/20 rounded-full text-accent-purple-light text-sm font-medium">
              Portuguese Wine Store &middot; Security Test Application
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            Discover the{' '}
            <span className="gradient-text">Finest Wines</span>
            <br />from Portugal
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            From the terraced vineyards of Douro to the sun-drenched plains of Alentejo,
            explore our curated collection of exceptional Portuguese wines.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/wines">
              <Button size="xl" variant="primary">
                Explore Wines
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="xl" variant="secondary">
                Create Account
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">
            Why Choose <span className="gradient-text">TaintedPort</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '🍇',
                title: 'Curated Selection',
                desc: 'Hand-picked wines from Portugal\'s most renowned regions - Douro, Alentejo, Vinho Verde, and more.',
              },
              {
                icon: '🏆',
                title: 'Award-Winning',
                desc: 'Our collection features wines recognized by international competitions and top sommeliers.',
              },
              {
                icon: '🚚',
                title: 'Cash on Delivery',
                desc: 'Simple and secure payment on delivery. No hassle, no prepayment required.',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="bg-dark-card border border-dark-border rounded-xl p-8 text-center hover:border-accent-purple/30 transition-all duration-300 group"
              >
                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Regions Section */}
      <section className="py-24 px-4 bg-dark-card/50">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">
            Explore <span className="gradient-text">Wine Regions</span>
          </h2>
          <p className="text-zinc-400 mb-12 max-w-2xl mx-auto">
            Portugal is home to some of the world&apos;s oldest wine regions, each with unique terroir and grape varieties.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            {['Douro', 'Alentejo', 'Vinho Verde', 'Dão', 'Bairrada', 'Lisboa', 'Madeira'].map((region) => (
              <Link
                key={region}
                href={`/wines?region=${encodeURIComponent(region)}`}
                className="px-6 py-3 bg-dark-lighter border border-dark-border rounded-full text-zinc-300 hover:border-accent-purple/50 hover:text-white transition-all"
              >
                {region}
              </Link>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
