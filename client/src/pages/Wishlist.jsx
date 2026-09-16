import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import { SkeletonCards } from '../components/ui/Spinner';
import EmptyState, { ErrorState } from '../components/ui/EmptyState';
import { ProductGrid } from '../components/shop/ProductCard';
import { Modal } from '../components/admin/AdminPage';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useWishlist } from '../context/WishlistContext';
import { useFetch } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';

/**
 * Saved items.
 *
 * `/api/wishlist` is entirely behind `requireAuth`, and a guest's list is a bag of ids in
 * localStorage with no public endpoint to turn ids into products. So a guest is told how
 * many they have saved and invited to sign in - at which point `WishlistContext` posts the
 * ids to `/wishlist/merge` and they arrive intact. Pretending to show them here would mean
 * inventing a bulk-lookup endpoint the API does not have.
 *
 * The grid is filtered through the context's `ids` rather than re-fetched after every
 * heart tap: `ProductCard` already owns the heart, so unsaving something should make the
 * card leave immediately instead of waiting on a round trip that would also reorder the
 * whole page.
 */
export default function Wishlist() {
  const { isAuthenticated, ready } = useAuth();
  const { locale } = useSettings();
  const wishlist = useWishlist();
  const [confirmClear, setConfirmClear] = useState(false);

  useSeo({ title: 'Your wishlist', noIndex: true });

  const { data, error, loading, refetch } = useFetch('/wishlist', {
    skip: !ready || !isAuthenticated,
    deps: [isAuthenticated],
  });

  const saved = new Set(wishlist.ids);
  const items = (data?.items ?? []).filter((product) => saved.has(String(product._id)));
  const unavailable = data?.unavailable ?? 0;

  return (
    <div className="container-page py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <span className="text-ink-600">Wishlist</span>
      </nav>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">Saved for later</h1>
          <p className="text-ink-500 mt-1 text-sm">
            The jars you are thinking about. Nothing here is reserved — popular pickles do
            sell out.
          </p>
        </div>
        {items.length ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="btn-ghost btn-sm text-red-700"
          >
            <Icon name="trash" className="size-4" />
            Clear the list
          </button>
        ) : null}
      </header>

      {/* --- Guest ------------------------------------------------------- */}
      {ready && !isAuthenticated ? (
        <div className="card">
          <EmptyState
            icon="heart"
            title={
              wishlist.count
                ? `${wishlist.count} ${wishlist.count === 1 ? 'item is' : 'items are'} saved on this device`
                : 'Nothing saved yet'
            }
            description={
              wishlist.count
                ? 'Sign in and we will move them to your account, so they are still here on your phone.'
                : 'Tap the heart on anything you like the look of and it turns up here.'
            }
            action={wishlist.count ? 'Sign in to see them' : 'Browse the pickles'}
            actionTo={wishlist.count ? '/login?redirect=/wishlist' : '/shop'}
            secondary={
              wishlist.count ? (
                <Link to="/shop" className="btn-outline">
                  Keep browsing
                </Link>
              ) : null
            }
          />
        </div>
      ) : null}

      {/* --- Signed in --------------------------------------------------- */}
      {isAuthenticated ? (
        error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : loading ? (
          <SkeletonCards count={4} />
        ) : items.length ? (
          <>
            {unavailable > 0 ? (
              <p className="border-mustard-200 bg-mustard-50 text-mustard-900 mb-4 rounded-lg border px-3 py-2 text-sm">
                {unavailable} saved {unavailable === 1 ? 'item is' : 'items are'} no longer
                listed, so {unavailable === 1 ? 'it is' : 'they are'} not shown.
              </p>
            ) : null}
            <ProductGrid products={items} locale={locale} />
            <p className="text-ink-400 mt-5 text-xs">
              Tap a filled heart to take something off the list.
            </p>
          </>
        ) : (
          <div className="card">
            <EmptyState
              icon="heart"
              title="Your wishlist is empty"
              description="Tap the heart on anything you like the look of and it waits here for you."
              action="Browse the pickles"
              actionTo="/shop"
            />
          </div>
        )
      ) : null}

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear your wishlist?"
        footer={
          <>
            <button type="button" onClick={() => setConfirmClear(false)} className="btn-outline">
              Keep it
            </button>
            <button
              type="button"
              onClick={async () => {
                await wishlist.clear();
                setConfirmClear(false);
              }}
              className="btn-danger"
            >
              Clear it
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          All {items.length} saved {items.length === 1 ? 'item' : 'items'} will be removed. Your
          bag and your orders are not affected.
        </p>
      </Modal>
    </div>
  );
}
