import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import useSeo from '../hooks/useSeo';
import { breadcrumbJsonLd } from '../lib/seo';

/**
 * 404.
 *
 * A dead end on a shop is a lost customer, so this offers the four things someone who
 * mistyped a URL is most likely to have wanted. `noIndex` matters: without it, Google will
 * happily index a soft-404 as a real page.
 *
 * Deliberately not wired to the API. If the backend is what is broken, this page still has
 * to render.
 */
export default function NotFound() {
  useSeo({
    title: 'Page not found',
    description: 'That page does not exist.',
    noIndex: true,
    structuredData: breadcrumbJsonLd([{ name: 'Home', url: '/' }]),
  });

  return (
    <div className="container-page flex flex-col items-center py-16 text-center sm:py-24">
      <span className="bg-cream-200 text-brand-600 mb-5 grid size-20 place-items-center rounded-full">
        <Icon name="search" className="size-9" />
      </span>

      <p className="text-ink-400 tnum text-sm font-semibold tracking-widest">404</p>
      <h1 className="mt-1 text-2xl sm:text-3xl">We cannot find that page</h1>
      <p className="text-ink-500 mt-2 max-w-md text-sm">
        The link may be old, or the jar may have been retired. Nothing is broken on your
        side.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link to="/shop" className="btn-primary">
          <Icon name="cart" className="size-4" />
          Shop the pickles
        </Link>
        <Link to="/" className="btn-outline">
          Go home
        </Link>
      </div>

      <ul className="text-ink-500 mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
        <li>
          <Link to="/categories" className="hover:text-brand-700 underline">
            Browse by kind
          </Link>
        </li>
        <li>
          <Link to="/track-order" className="hover:text-brand-700 underline">
            Track an order
          </Link>
        </li>
        <li>
          <Link to="/faq" className="hover:text-brand-700 underline">
            Common questions
          </Link>
        </li>
        <li>
          <Link to="/contact" className="hover:text-brand-700 underline">
            Talk to us
          </Link>
        </li>
      </ul>
    </div>
  );
}
