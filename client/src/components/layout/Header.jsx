import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useSettings } from '../../context/SettingsContext';
import { formatPrice } from '../../lib/format';

/**
 * Storefront header.
 *
 * Mobile-first, because that is where nearly all Nepali e-commerce traffic is: a
 * two-row bar (brand + icons, then a full-width search) collapsing to a single row on
 * desktop. The cart count and wishlist count are live from context, so adding from a
 * product card updates the badge without a navigation.
 *
 * The account menu and mobile drawer both close on route change and on Escape, and the
 * drawer traps nothing - it is a plain overlay with a focusable close button, which is
 * simpler and less breakable than a focus trap for a five-link menu.
 */

const NAV = [
  { to: '/shop', label: 'Shop' },
  { to: '/categories', label: 'Categories' },
  { to: '/track-order', label: 'Track order' },
  { to: '/about', label: 'Our story' },
  { to: '/contact', label: 'Contact' },
];

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isStaff, logout } = useAuth();
  const { count: cartCount, pricing } = useCart();
  const { count: wishCount } = useWishlist();
  const { settings, locale, toggleLocale } = useSettings();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [term, setTerm] = useState('');
  const menuRef = useRef(null);

  // Settings arrive from the API a beat after first paint, so the literal is what the
  // very first frame shows. It is the brand name, not a placeholder - if it ever renders
  // it should already be right.
  const brandName = settings.company?.name ?? 'Deeva Achar';

  // Any navigation closes everything - otherwise the drawer stays open over the new page.
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    // Stop the page behind the drawer from scrolling.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      setMenuOpen(false);
    };
    const onPointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) return;
    navigate(`/search?q=${encodeURIComponent(query)}`);
    setDrawerOpen(false);
  };

  const freeThreshold = settings.delivery?.freeDeliveryThreshold ?? 0;

  return (
    <>
      {/* Free-delivery nudge: the single most effective bar of copy on a Nepali store. */}
      {freeThreshold > 0 ? (
        <div className="bg-brand-700 text-center text-xs font-medium text-white sm:text-[0.8125rem]">
          <div className="container-page py-2">
            Free delivery on orders over {formatPrice(freeThreshold)} · Cash on delivery available
            nationwide
          </div>
        </div>
      ) : null}

      <header className="border-cream-300 sticky top-0 z-50 border-b bg-cream-50/95 backdrop-blur">
        <div className="container-page">
          <div className="flex items-center gap-3 py-3 lg:gap-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="btn-ghost -ml-2 size-11 shrink-0 rounded-lg px-0 lg:hidden"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
            >
              <Icon name="menu" />
            </button>

            <Link
              to="/"
              className="flex shrink-0 items-center gap-2.5"
              aria-label={`${brandName} home`}
            >
              {/*
                The badge is a round mark printed on a square white field. Clipping it to a
                circle and letting it overflow the frame crops that margin off, so the green
                ring meets the edge of the container - otherwise the mark reads as a white
                tile floating on the cream header, which is the one thing a logo must not do.
              */}
              <span className="ring-ink-900/5 grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-sm ring-1">
                <img
                  src="/logo.jpg"
                  alt=""
                  width="40"
                  height="40"
                  className="size-full scale-[1.18] object-cover"
                />
              </span>
              <span className="hidden sm:block">
                <span className="text-ink-900 font-display block text-lg leading-tight font-bold">
                  {brandName}
                </span>
                <span className="text-ink-400 block text-[0.6875rem] leading-tight">
                  {locale === 'np' ? 'लुकेको स्वाद' : 'Tradition · Taste · Trust'}
                </span>
              </span>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? 'text-brand-700 bg-brand-50'
                        : 'text-ink-600 hover:text-ink-900 hover:bg-cream-200'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <form
              onSubmit={submitSearch}
              role="search"
              className="ml-auto hidden max-w-sm flex-1 lg:block"
            >
              <label htmlFor="header-search" className="sr-only">
                Search products
              </label>
              <div className="relative">
                <Icon
                  name="search"
                  className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                />
                <input
                  id="header-search"
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search mula, lapsi, dalle…"
                  className="field-input min-h-10 pl-9 text-sm"
                />
              </div>
            </form>

            <div className="ml-auto flex items-center gap-0.5 lg:ml-0">
              <Link
                to="/search"
                className="btn-ghost size-11 rounded-lg px-0 lg:hidden"
                aria-label="Search"
              >
                <Icon name="search" />
              </Link>

              <button
                type="button"
                onClick={toggleLocale}
                className="btn-ghost hidden size-11 rounded-lg px-0 text-xs font-bold sm:inline-flex"
                aria-label={locale === 'en' ? 'Switch to Nepali' : 'Switch to English'}
                title={locale === 'en' ? 'नेपाली' : 'English'}
              >
                {locale === 'en' ? 'ने' : 'EN'}
              </button>

              <Link
                to="/wishlist"
                className="btn-ghost relative size-11 rounded-lg px-0"
                aria-label={`Wishlist${wishCount ? `, ${wishCount} saved` : ''}`}
              >
                <Icon name="heart" />
                {wishCount > 0 ? <Badge>{wishCount}</Badge> : null}
              </Link>

              <Link
                to="/cart"
                className="btn-ghost relative size-11 rounded-lg px-0"
                aria-label={`Cart${cartCount ? `, ${cartCount} items, ${formatPrice(pricing.total)}` : ', empty'}`}
              >
                <Icon name="cart" />
                {cartCount > 0 ? <Badge>{cartCount}</Badge> : null}
              </Link>

              {/* Account: a menu when signed in, a straight link when not. */}
              {isAuthenticated ? (
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setMenuOpen((open) => !open)}
                    className="btn-ghost size-11 rounded-lg px-0"
                    aria-label="Account menu"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                  >
                    <Icon name="user" />
                  </button>

                  {menuOpen ? (
                    <div
                      role="menu"
                      className="animate-fade-up border-cream-300 absolute right-0 mt-1 w-56 overflow-hidden rounded-xl border bg-white shadow-[--shadow-pop]"
                    >
                      <div className="border-cream-200 bg-cream-50 border-b px-4 py-3">
                        <p className="text-ink-900 truncate text-sm font-semibold">{user.name}</p>
                        <p className="text-ink-400 truncate text-xs">{user.email}</p>
                      </div>
                      {isStaff ? (
                        <MenuItem to="/admin" icon="dashboard">
                          Admin dashboard
                        </MenuItem>
                      ) : null}
                      <MenuItem to="/account" icon="user">
                        My account
                      </MenuItem>
                      <MenuItem to="/account/orders" icon="package">
                        My orders
                      </MenuItem>
                      <MenuItem to="/wishlist" icon="heart">
                        Wishlist
                      </MenuItem>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          logout();
                          navigate('/');
                        }}
                        className="text-ink-600 hover:bg-cream-100 border-cream-200 flex w-full cursor-pointer items-center gap-2.5 border-t px-4 py-2.5 text-left text-sm"
                      >
                        <Icon name="logout" className="size-4" />
                        Sign out
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Link to="/login" className="btn-primary btn-sm ml-1 hidden sm:inline-flex">
                  Sign in
                </Link>
              )}
            </div>
          </div>

          {/* Mobile search sits on its own row so the tap target is full width. */}
          <form onSubmit={submitSearch} role="search" className="pb-3 lg:hidden">
            <label htmlFor="header-search-mobile" className="sr-only">
              Search products
            </label>
            <div className="relative">
              <Icon
                name="search"
                className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <input
                id="header-search-mobile"
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search achar…"
                className="field-input min-h-10 pl-9 text-sm"
              />
            </div>
          </form>
        </div>
      </header>

      {/* --- Mobile drawer --- */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-70 lg:hidden">
          <button
            type="button"
            className="animate-fade-in absolute inset-0 bg-ink-900/45"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          />
          <div className="animate-fade-in absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-cream-50 shadow-[--shadow-pop]">
            <div className="border-cream-300 flex items-center justify-between border-b px-4 py-3.5">
              <span className="font-display text-ink-900 text-lg font-bold">Menu</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="btn-ghost size-10 rounded-lg px-0"
                aria-label="Close menu"
              >
                <Icon name="close" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2" aria-label="Mobile">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-lg px-3 py-3 text-[0.9375rem] font-medium ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700'
                    }`
                  }
                >
                  {item.label}
                  <Icon name="chevronRight" className="size-4 opacity-40" />
                </NavLink>
              ))}

              <div className="border-cream-300 my-2 border-t" />

              {isStaff ? (
                <NavLink to="/admin" className="text-ink-700 flex items-center gap-2.5 rounded-lg px-3 py-3 text-[0.9375rem]">
                  <Icon name="dashboard" className="size-4.5" />
                  Admin dashboard
                </NavLink>
              ) : null}
              <button
                type="button"
                onClick={toggleLocale}
                className="text-ink-700 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-3 text-left text-[0.9375rem]"
              >
                <span className="text-xs font-bold">{locale === 'en' ? 'ने' : 'EN'}</span>
                {locale === 'en' ? 'नेपालीमा हेर्नुहोस्' : 'View in English'}
              </button>
            </nav>

            <div className="border-cream-300 border-t p-4">
              {isAuthenticated ? (
                <Link to="/account" className="btn-outline w-full">
                  <Icon name="user" className="size-4" />
                  {user.name.split(' ')[0]}&apos;s account
                </Link>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" className="btn-primary">
                    Sign in
                  </Link>
                  <Link to="/register" className="btn-outline">
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Badge({ children }) {
  return (
    <span className="bg-brand-700 absolute top-1.5 right-1.5 grid min-w-4.5 place-items-center rounded-full px-1 text-[0.625rem] leading-4.5 font-bold text-white">
      {children}
    </span>
  );
}

function MenuItem({ to, icon, children }) {
  return (
    <Link
      to={to}
      role="menuitem"
      className="text-ink-600 hover:bg-cream-100 flex items-center gap-2.5 px-4 py-2.5 text-sm"
    >
      <Icon name={icon} className="size-4" />
      {children}
    </Link>
  );
}
