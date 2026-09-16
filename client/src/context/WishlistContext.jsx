import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { get, post, del } from '../lib/apiClient';
import { useAuth } from './AuthContext';

/**
 * Wishlist.
 *
 * Same shape as the cart: ids in localStorage for guests, a server document for
 * signed-in customers, merged on sign-in. Only the *ids* are held in state - the full
 * product documents are fetched by the wishlist page itself, so the heart icon on a
 * product card can render from a Set lookup without any page holding a product list it
 * does not need.
 */

const WishlistContext = createContext(null);
const STORAGE_KEY = 'ag_wishlist';

function readLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').slice(0, 200) : [];
  } catch {
    return [];
  }
}

export function WishlistProvider({ children }) {
  const { isAuthenticated, ready } = useAuth();
  const [ids, setIds] = useState(readLocal);
  const wasAuthenticated = useRef(null);

  useEffect(() => {
    if (isAuthenticated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* quota or private mode - degrade to session-only */
    }
  }, [ids, isAuthenticated]);

  useEffect(() => {
    if (!ready) return;
    const previous = wasAuthenticated.current;
    wasAuthenticated.current = isAuthenticated;

    (async () => {
      if (!isAuthenticated) return;
      try {
        if (previous === false && ids.length) {
          /*
            `/merge` answers with hydrated product cards, not ids - it is the same
            payload the wishlist page renders. The ids are derived from it rather than
            read off a `productIds` field that the endpoint does not send.
          */
          const data = await post('/wishlist/merge', { productIds: ids });
          setIds((data?.items ?? []).map((product) => String(product._id)));
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        const data = await get('/wishlist/ids');
        setIds(data?.ids ?? []);
      } catch {
        /* leave the local list alone */
      }
    })();
    // Auth-transition effect; `ids` deliberately excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, ready]);

  const has = useCallback((productId) => ids.includes(String(productId)), [ids]);

  const toggle = useCallback(
    async (productId) => {
      const id = String(productId);
      const wasSaved = ids.includes(id);

      // Optimistic: the heart must respond to the tap, not to the round trip.
      setIds((current) => (wasSaved ? current.filter((item) => item !== id) : [...current, id]));

      if (!isAuthenticated) return !wasSaved;

      try {
        // The product id is a path segment, not a body field: `POST /wishlist/:productId/toggle`.
        const data = await post(`/wishlist/${id}/toggle`);
        // The server reports the resulting state, so the heart cannot desynchronise even
        // if two taps race.
        const saved = data?.inWishlist ?? !wasSaved;
        setIds((current) => {
          const without = current.filter((item) => item !== id);
          return saved ? [...without, id] : without;
        });
        return saved;
      } catch (error) {
        setIds((current) => (wasSaved ? [...current, id] : current.filter((item) => item !== id)));
        throw error;
      }
    },
    [ids, isAuthenticated]
  );

  const remove = useCallback(
    async (productId) => {
      const id = String(productId);
      setIds((current) => current.filter((item) => item !== id));
      if (isAuthenticated) await del(`/wishlist/${id}`).catch(() => {});
    },
    [isAuthenticated]
  );

  const clear = useCallback(async () => {
    setIds([]);
    if (isAuthenticated) await del('/wishlist').catch(() => {});
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({ ids, count: ids.length, has, toggle, remove, clear }),
    [ids, has, toggle, remove, clear]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside <WishlistProvider>');
  return context;
}

export default WishlistContext;
