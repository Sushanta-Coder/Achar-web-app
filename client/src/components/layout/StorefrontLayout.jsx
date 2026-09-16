import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { PageLoader } from '../ui/Spinner';

/**
 * Shell for every public page.
 *
 * Two behaviours worth naming:
 *
 *  - Scroll restoration. React Router 7 does not reset scroll on navigation, so without
 *    this a visitor who scrolls to the bottom of the shop and opens a product lands
 *    halfway down the description. Hash links are left alone so in-page anchors still work.
 *
 *  - The skip link. First focusable element on the page, jumps past the header's dozen
 *    or so links straight to the content - the cheapest meaningful keyboard-accessibility
 *    win there is.
 */
export default function StorefrontLayout() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only-focusable">
        Skip to main content
      </a>

      <Header />

      <main id="main" className="flex-1">
        {/*
          Suspense sits inside the layout, not around it: a route change swaps the page
          while the header and footer stay put, so the chrome does not flash on every
          lazy-loaded route.
        */}
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
