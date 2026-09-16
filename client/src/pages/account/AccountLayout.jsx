import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import useSeo from '../../hooks/useSeo';
import { initials } from '../../lib/format';

/**
 * The shell for `/account/*`.
 *
 * Sits inside `RequireAuth`, so `user` is guaranteed here - no null-guarding, no
 * "loading your account" flash. On mobile the sidebar becomes a horizontal scroller
 * rather than a hamburger inside a hamburger; there are six links and they all fit.
 *
 * Signing out clears the cart quote as well as the session. Skipping that leaves the
 * previous customer's item count in the header on a shared phone, which is both a
 * privacy problem and a confusing one.
 */

const LINKS = [
  { to: '/account', label: 'Overview', icon: 'dashboard', end: true },
  { to: '/account/orders', label: 'Orders', icon: 'package' },
  { to: '/account/addresses', label: 'Addresses', icon: 'pin' },
  { to: '/account/reviews', label: 'Reviews', icon: 'star' },
  { to: '/account/profile', label: 'Profile', icon: 'user' },
];

export default function AccountLayout() {
  const { user, logout } = useAuth();
  const { clear } = useCart();
  const navigate = useNavigate();

  useSeo({ title: 'My account', noIndex: true });

  const signOut = async () => {
    await logout();
    await clear().catch(() => {});
    navigate('/', { replace: true });
  };

  return (
    <div className="container-page py-6 sm:py-10">
      <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-8">
        {/* --- Sidebar ------------------------------------------------------ */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card flex items-center gap-3 p-4">
            <span className="bg-brand-100 text-brand-700 grid size-11 shrink-0 place-items-center rounded-full font-semibold">
              {initials(user.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{user.name}</span>
              <span className="text-ink-400 block truncate text-xs">{user.email}</span>
            </span>
          </div>

          {!user.emailVerified ? (
            <p className="border-mustard-200 bg-mustard-50 text-mustard-900 mt-3 rounded-lg border px-3 py-2 text-xs">
              Your email is not confirmed yet. Look for our verification link — it keeps your
              receipts arriving.
            </p>
          ) : null}

          {/*
            Horizontally scrollable on small screens. `-mx-4 px-4` lets the row bleed to
            the screen edges so the last chip does not look clipped mid-word.
          */}
          <nav className="-mx-4 mt-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-ink-600 hover:bg-cream-200'
                  }`
                }
              >
                <Icon name={link.icon} className="size-4 shrink-0" />
                {link.label}
              </NavLink>
            ))}

            <button
              type="button"
              onClick={signOut}
              className="text-ink-600 hover:bg-cream-200 flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition lg:mt-2"
            >
              <Icon name="logout" className="size-4 shrink-0" />
              Sign out
            </button>
          </nav>
        </aside>

        {/* --- Page -------------------------------------------------------- */}
        <div className="mt-6 min-w-0 lg:mt-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
