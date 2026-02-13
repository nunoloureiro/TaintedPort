'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import WineBottle from './WineBottle';

const regionColors = {
  'Douro': 'bg-red-500/20 text-red-300',
  'Alentejo': 'bg-amber-500/20 text-amber-300',
  'Vinho Verde': 'bg-green-500/20 text-green-300',
  'Dão': 'bg-purple-500/20 text-purple-300',
  'Bairrada': 'bg-pink-500/20 text-pink-300',
  'Lisboa': 'bg-blue-500/20 text-blue-300',
  'Tejo': 'bg-teal-500/20 text-teal-300',
  'Madeira': 'bg-orange-500/20 text-orange-300',
};

export default function WineCard({ wine }) {
  const { user } = useAuth();
  const { addItem } = useCart();
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const handleAddToCart = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push('/login');
      return;
    }
    setAdding(true);
    try {
      await addItem(wine.id, 1);
    } catch (err) {
      console.error('Failed to add to cart:', err);
    } finally {
      setTimeout(() => setAdding(false), 600);
    }
  };

  return (
    <Link href={`/wines/${wine.id}`}>
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden transition-all duration-300 wine-card-hover cursor-pointer group h-full flex flex-col">
        {/* Wine image area */}
        <div className="relative h-52 bg-gradient-to-b from-dark-lighter to-dark-card flex items-center justify-center overflow-hidden">
          <div className="group-hover:scale-105 transition-transform duration-500 drop-shadow-lg">
            <WineBottle type={wine.type} name={wine.name} size="sm" />
          </div>
          <div className="absolute top-3 right-3">
            <span className={`text-xs px-2 py-1 rounded-full ${regionColors[wine.region] || 'bg-zinc-500/20 text-zinc-300'}`}>
              {wine.region}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 flex flex-col">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-white font-semibold text-lg leading-tight group-hover:text-accent-purple-light transition-colors line-clamp-2">
              {wine.name}
            </h3>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-zinc-500">{wine.type}</span>
            <span className="text-xs text-zinc-600">•</span>
            <span className="text-xs text-zinc-500">{wine.vintage}</span>
          </div>

          <p className="text-zinc-400 text-sm mb-4 line-clamp-2 flex-1">
            {wine.description_short}
          </p>

          <div className="flex items-center justify-between mt-auto">
            <span className="text-2xl font-bold text-white">
              €{wine.price.toFixed(2)}
            </span>
            <button
              onClick={handleAddToCart}
              disabled={adding}
              className="px-4 py-2 bg-gradient-to-r from-accent-purple to-accent-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
            >
              {adding ? '✓ Added' : 'Add to Cart'}
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
