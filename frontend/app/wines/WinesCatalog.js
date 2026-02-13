'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { wineAPI } from '@/lib/api';
import WineCard from '@/components/WineCard';

export default function WinesCatalog() {
  const searchParams = useSearchParams();
  const [wines, setWines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState(searchParams.get('region') || '');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [priceRange, setPriceRange] = useState([0, 4000]);
  const [regions, setRegions] = useState([]);
  const [types, setTypes] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchWines = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (region) params.region = region;
      if (type) params.type = type;
      if (sort) params.sort = sort;
      if (priceRange[0] > 0) params.minPrice = priceRange[0];
      if (priceRange[1] < 4000) params.maxPrice = priceRange[1];

      const res = await wineAPI.getAll(params);
      setWines(res.data.wines || []);
    } catch (err) {
      console.error('Failed to fetch wines:', err);
    } finally {
      setLoading(false);
    }
  }, [search, region, type, sort, priceRange]);

  useEffect(() => {
    fetchWines();
  }, [fetchWines]);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [regRes, typeRes] = await Promise.all([
          wineAPI.getRegions(),
          wineAPI.getTypes(),
        ]);
        setRegions(regRes.data.regions || []);
        setTypes(typeRes.data.types || []);
      } catch (err) {
        console.error('Failed to fetch filters:', err);
      }
    };
    fetchFilters();
  }, []);

  const clearFilters = () => {
    setSearch('');
    setRegion('');
    setType('');
    setSort('name_asc');
    setPriceRange([0, 4000]);
  };

  return (
    <div className="min-h-screen bg-pattern">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Wine <span className="gradient-text">Collection</span>
          </h1>
          <p className="text-zinc-400">
            Explore our curated selection of {wines.length} Portuguese wines
          </p>
        </div>

        {/* Search & Filter Bar */}
        <div className="mb-8 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search wines, regions, producers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-dark-card border border-dark-border rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-accent-purple transition-colors"
              />
            </div>
            <button
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="px-4 py-3 bg-dark-card border border-dark-border rounded-xl text-zinc-300 hover:border-accent-purple/50 transition-colors flex items-center gap-2 sm:w-auto"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {(region || type || priceRange[0] > 0 || priceRange[1] < 4000) && (
                <span className="w-2 h-2 bg-accent-purple rounded-full" />
              )}
            </button>
          </div>

          {/* Expandable Filters */}
          {filtersOpen && (
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Region</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-accent-purple"
                >
                  <option value="">All Regions</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-accent-purple"
                >
                  <option value="">All Types</option>
                  {types.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Sort By</label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="w-full px-3 py-2.5 bg-dark-lighter border border-dark-border rounded-lg text-white focus:outline-none focus:border-accent-purple"
                >
                  <option value="name_asc">Name (A-Z)</option>
                  <option value="name_desc">Name (Z-A)</option>
                  <option value="price_asc">Price (Low to High)</option>
                  <option value="price_desc">Price (High to Low)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">
                  Max Price: €{priceRange[1]}
                </label>
                <input
                  type="range"
                  min="0"
                  max="4000"
                  step="100"
                  value={priceRange[1]}
                  onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                  className="w-full accent-accent-purple"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <button
                  onClick={clearFilters}
                  className="text-sm text-accent-purple hover:text-accent-purple-light transition-colors"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Wine Grid */}
        {loading ? (
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
        ) : wines.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-white mb-2">No wines found</h3>
            <p className="text-zinc-400 mb-6">Try adjusting your search or filter criteria</p>
            <button
              onClick={clearFilters}
              className="px-6 py-2 bg-accent-purple text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {wines.map((wine) => (
              <WineCard key={wine.id} wine={wine} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
