import { useEffect, useRef } from 'react';
import { applySeo } from '../lib/seo';

/**
 * Applies a page's document head.
 *
 *   useSeo({ title: 'Shop', description: '...', canonical: '/shop' });
 *
 * The options object is almost always a fresh literal on every render, so it is
 * compared by serialised value rather than by reference - otherwise every render would
 * rewrite the whole head, which flickers the tab title and re-injects the JSON-LD.
 */
export default function useSeo(options) {
  const key = JSON.stringify(options ?? {});
  const previous = useRef(null);

  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    applySeo(JSON.parse(key));
  }, [key]);
}
