'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { wineAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import Button from '@/components/Button';
import WineCard from '@/components/WineCard';
import WineBottle from '@/components/WineBottle';

export default function WineDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { addItem } = useCart();
  const [wine, setWine] = useState(null);
  const [relatedWines, setRelatedWines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const fetchWine = async () => {
      setLoading(true);
      try {
        const res = await wineAPI.getById(id);
        setWine(res.data.wine);

        // Fetch related wines (same region or type)
        const relRes = await wineAPI.getAll({ region: res.data.wine.region });
        setRelatedWines(
          (relRes.data.wines || [])
            .filter((w) => w.id !== parseInt(id))
            .slice(0, 4)
        );
      } catch {
        router.push('/wines');
      } finally {
        setLoading(false);
      }
    };
    fetchWine();
  }, [id, router]);

  const handleAddToCart = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    setAdding(true);
    try {
      await addItem(wine.id, quantity);
    } catch (err) {
      console.error('Failed to add to cart:', err);
    } finally {
      setTimeout(() => setAdding(false), 800);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-pattern flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-5xl mb-4">🍷</div>
          <p className="text-zinc-400">Loading wine details...</p>
        </div>
      </div>
    );
  }

  if (!wine) return null;

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="mb-8">
          <Link href="/wines" className="text-accent-purple hover:text-accent-purple-light transition-colors text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Catalog
          </Link>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Wine Image */}
          <div className="bg-gradient-to-b from-dark-lighter to-dark-card border border-dark-border rounded-2xl p-12 flex flex-col items-center justify-center min-h-[400px]">
            <div className="drop-shadow-2xl mb-4">
              <WineBottle type={wine.type} name={wine.name} size="xl" />
            </div>
            <p className="text-zinc-500 text-sm">{wine.producer}</p>
          </div>

          {/* Wine Details */}
          <div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="px-3 py-1 bg-accent-purple/10 border border-accent-purple/20 rounded-full text-accent-purple-light text-sm">
                {wine.region}
              </span>
              <span className="px-3 py-1 bg-accent-cyan/10 border border-accent-cyan/20 rounded-full text-accent-cyan text-sm">
                {wine.type}
              </span>
              <span className="px-3 py-1 bg-dark-lighter border border-dark-border rounded-full text-zinc-400 text-sm">
                {wine.vintage}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{wine.name}</h1>

            <p className="text-zinc-400 text-lg leading-relaxed mb-8">{wine.description}</p>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-dark-lighter rounded-lg p-4">
                <p className="text-zinc-500 text-sm">Grapes</p>
                <p className="text-white text-sm mt-1">{wine.grapes}</p>
              </div>
              <div className="bg-dark-lighter rounded-lg p-4">
                <p className="text-zinc-500 text-sm">Alcohol</p>
                <p className="text-white text-sm mt-1">{wine.alcohol}%</p>
              </div>
              <div className="bg-dark-lighter rounded-lg p-4">
                <p className="text-zinc-500 text-sm">Bottle Size</p>
                <p className="text-white text-sm mt-1">{wine.bottle_size}</p>
              </div>
              <div className="bg-dark-lighter rounded-lg p-4">
                <p className="text-zinc-500 text-sm">Producer</p>
                <p className="text-white text-sm mt-1">{wine.producer}</p>
              </div>
            </div>

            {/* Food Pairing */}
            {wine.food_pairing && (
              <div className="mb-8">
                <h3 className="text-sm font-medium text-zinc-400 mb-2">Food Pairing</h3>
                <div className="flex flex-wrap gap-2">
                  {wine.food_pairing.split(',').map((item, i) => (
                    <span key={i} className="px-3 py-1 bg-dark-lighter border border-dark-border rounded-full text-zinc-300 text-sm">
                      {item.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Price and Add to Cart */}
            <div className="bg-dark-card border border-dark-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-4xl font-bold text-white">€{wine.price.toFixed(2)}</span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center border border-dark-border rounded-lg">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-3 py-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    −
                  </button>
                  <span className="px-4 py-2 text-white font-medium min-w-[3rem] text-center">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(12, quantity + 1))}
                    className="px-3 py-2 text-zinc-400 hover:text-white transition-colors"
                  >
                    +
                  </button>
                </div>

                <Button
                  onClick={handleAddToCart}
                  loading={adding}
                  className="flex-1"
                  size="lg"
                >
                  {adding ? 'Added!' : 'Add to Cart'}
                </Button>
              </div>

              <p className="text-zinc-500 text-sm mt-3">
                Subtotal: €{(wine.price * quantity).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Related Wines */}
        {relatedWines.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-white mb-8">
              More from <span className="gradient-text">{wine.region}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedWines.map((w) => (
                <WineCard key={w.id} wine={w} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
