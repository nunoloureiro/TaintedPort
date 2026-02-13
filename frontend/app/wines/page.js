import { Suspense } from 'react';
import WinesCatalog from './WinesCatalog';

export default function WinesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-pattern">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              Wine <span className="gradient-text">Collection</span>
            </h1>
            <p className="text-zinc-400">Loading wines...</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden animate-pulse">
                <div className="h-48 bg-dark-lighter" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-dark-lighter rounded w-3/4" />
                  <div className="h-4 bg-dark-lighter rounded w-1/2" />
                  <div className="h-4 bg-dark-lighter rounded w-full" />
                  <div className="flex justify-between mt-4">
                    <div className="h-6 bg-dark-lighter rounded w-16" />
                    <div className="h-8 bg-dark-lighter rounded w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    }>
      <WinesCatalog />
    </Suspense>
  );
}
