'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { wineAPI, reviewAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import Button from '@/components/Button';
import WineCard from '@/components/WineCard';
import WineBottle from '@/components/WineBottle';

function StarRating({ rating, size = 'sm', interactive = false, onChange }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`${sizes[size]} ${
            star <= rating ? 'text-yellow-400' : 'text-zinc-600'
          } ${interactive ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          onClick={() => interactive && onChange && onChange(star)}
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

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

  // Review state
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');

  useEffect(() => {
    const fetchWine = async () => {
      setLoading(true);
      try {
        const res = await wineAPI.getById(id);
        setWine(res.data.wine);

        // Fetch reviews
        try {
          const revRes = await reviewAPI.getByWine(id);
          setReviews(revRes.data.reviews || []);
          setAvgRating(revRes.data.avg_rating || 0);
          setReviewCount(revRes.data.review_count || 0);
        } catch {
          // Reviews may fail for injected IDs
        }

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

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!newRating) {
      setReviewError('Please select a rating.');
      return;
    }
    setSubmittingReview(true);
    setReviewError('');
    setReviewSuccess('');
    try {
      await reviewAPI.create(id, { rating: newRating, comment: newComment });
      setReviewSuccess('Review submitted successfully!');
      setNewRating(0);
      setNewComment('');
      // Refresh reviews
      const revRes = await reviewAPI.getByWine(id);
      setReviews(revRes.data.reviews || []);
      setAvgRating(revRes.data.avg_rating || 0);
      setReviewCount(revRes.data.review_count || 0);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit review.';
      setReviewError(msg);
    } finally {
      setSubmittingReview(false);
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

            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{wine.name}</h1>

            {/* Rating Summary */}
            <div className="flex items-center gap-3 mb-4">
              <StarRating rating={Math.round(avgRating)} size="md" />
              <span className="text-lg font-semibold text-white">{avgRating > 0 ? avgRating.toFixed(1) : '—'}</span>
              <span className="text-zinc-500 text-sm">
                ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
              </span>
            </div>

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

        {/* Reviews Section */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-white mb-8">
            Customer <span className="gradient-text">Reviews</span>
          </h2>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Review Summary */}
            <div className="lg:col-span-1">
              <div className="bg-dark-card border border-dark-border rounded-xl p-6 sticky top-8">
                <div className="text-center mb-6">
                  <div className="text-5xl font-bold text-white mb-2">
                    {avgRating > 0 ? avgRating.toFixed(1) : '—'}
                  </div>
                  <StarRating rating={Math.round(avgRating)} size="lg" />
                  <p className="text-zinc-500 text-sm mt-2">
                    Based on {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
                  </p>
                </div>

                {/* Rating Distribution */}
                {reviewCount > 0 && (
                  <div className="space-y-2 mb-6">
                    {[5, 4, 3, 2, 1].map((stars) => {
                      const count = reviews.filter(r => r.rating === stars).length;
                      const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
                      return (
                        <div key={stars} className="flex items-center gap-2 text-sm">
                          <span className="text-zinc-400 w-3">{stars}</span>
                          <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <div className="flex-1 bg-dark-lighter rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-yellow-400 h-full rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-zinc-500 w-6 text-right">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Write a Review */}
                {user ? (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-3">Write a Review</h3>
                    <form onSubmit={handleSubmitReview}>
                      <div className="mb-3">
                        <label className="block text-xs text-zinc-500 mb-1">Your Rating</label>
                        <StarRating
                          rating={newRating}
                          size="lg"
                          interactive={true}
                          onChange={setNewRating}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs text-zinc-500 mb-1">Your Review</label>
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          rows={3}
                          placeholder="Share your thoughts about this wine..."
                          className="w-full px-3 py-2 bg-dark-lighter border border-dark-border rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-accent-purple resize-none"
                        />
                      </div>
                      {reviewError && (
                        <p className="text-red-400 text-xs mb-2">{reviewError}</p>
                      )}
                      {reviewSuccess && (
                        <p className="text-green-400 text-xs mb-2">{reviewSuccess}</p>
                      )}
                      <button
                        type="submit"
                        disabled={submittingReview}
                        className="w-full px-4 py-2 bg-gradient-to-r from-accent-purple to-accent-cyan text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {submittingReview ? 'Submitting...' : 'Submit Review'}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-zinc-500 text-sm mb-2">Log in to write a review</p>
                    <Link
                      href="/login"
                      className="text-accent-purple hover:text-accent-purple-light text-sm transition-colors"
                    >
                      Sign in
                    </Link>
                  </div>
                )}
              </div>
            </div>

            {/* Review List */}
            <div className="lg:col-span-2">
              {reviews.length === 0 ? (
                <div className="text-center py-12 bg-dark-card border border-dark-border rounded-xl">
                  <div className="text-4xl mb-3">📝</div>
                  <h3 className="text-lg font-medium text-white mb-1">No reviews yet</h3>
                  <p className="text-zinc-500 text-sm">Be the first to review this wine!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review) => (
                    <div key={review.id} className="bg-dark-card border border-dark-border rounded-xl p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium text-sm">{review.user_name}</span>
                            <StarRating rating={review.rating} size="sm" />
                          </div>
                          <p className="text-zinc-600 text-xs mt-0.5">
                            {new Date(review.created_at).toLocaleDateString('en-US', {
                              year: 'numeric', month: 'long', day: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                      {/* VULN: Stored XSS - review comment rendered as raw HTML */}
                      {review.comment && (
                        <div
                          className="text-zinc-300 text-sm leading-relaxed mt-2"
                          dangerouslySetInnerHTML={{ __html: review.comment }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
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
