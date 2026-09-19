import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon';
import { PageLoader } from '../ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../lib/format';

/**
 * Admin shell: a fixed sidebar on desktop, an off-canvas drawer on mobile.
 *
 * The nav is grouped the way the work is actually done - catalogue, orders, customers,
 * content, settings - rather than mirroring the API's resource list. `adminOnly` items
 * are hidden from staff accounts, which matches the server: `requireAdmin` guards staff
 * management and site settings, `requireStaff` guards the rest.
 *
 * Hiding them is a courtesy, not the control. Every one of these screens is enforced
 * server-side; this only keeps a staff member from clicking into a 403.
 */

const NAV_GROUPS = [
  {
    title: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true }],
  },
  {
    title: 'Catalogue',
    items: [
      { to: '/admin/products', label: 'Products', icon: 'box' },
      { to: '/admin/categories', label: 'Categories', icon: 'tag' },
      { to: '/admin/inventory', label: 'Inventory', icon: 'package' },
      { to: '/admin/coupons', label: 'Coupons', icon: 'tag' },
    ],
  },
  {
    title: 'Selling',
    items: [
      { to: '/admin/orders', label: 'Orders', icon: 'truck' },
      { to: '/admin/payments', label: 'Payments', icon: 'wallet' },
      { to: '/admin/customers', label: 'Customers', icon: 'users' },
      { to: '/admin/reviews', label: 'Reviews', icon: 'star' },
    ],
  },
  {
    title: 'Content',
    items: [
      { to: '/admin/blog', label: 'Blog', icon: 'note' },
      { to: '/admin/banners', label: 'Banners', icon: 'image' },
      { to: '/admin/messages', label: 'Messages', icon: 'mail' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/admin/reports', label: 'Reports', icon: 'chart' },
      { to: '/admin/delivery', label: 'Delivery zones', icon: 'pin' },
      { to: '/admin/settings', label: 'Site settings', icon: 'settings', adminOnly: true },
      { to: '/admin/staff', label: 'Admin users', icon: 'users', adminOnly: true },
    ],
  },
];

export default function AdminLayout() {
  const { user, isAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="bg-cream-100 min-h-screen lg:flex">
      <a href="#admin-main" className="sr-only-focusable">
        Skip to main content
      </a>

      {/* --- Sidebar (desktop) --- */}
      <aside className="bg-ink-900 hidden w-64 shrink-0 flex-col lg:sticky lg:top-0 lg:flex lg:h-screen">
        <SidebarContent isAdmin={isAdmin} user={user} onSignOut={signOut} />
      </aside>

      {/* --- Drawer (mobile) --- */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-70 lg:hidden">
          <button
            type="button"
            className="animate-fade-in bg-ink-900/50 absolute inset-0"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          />
          <aside className="animate-fade-in bg-ink-900 absolute inset-y-0 left-0 flex w-[min(17rem,85vw)] flex-col">
            <SidebarContent
              isAdmin={isAdmin}
              user={user}
              onSignOut={signOut}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar. Desktop gets no top bar - the sidebar is the chrome. */}
        <div className="border-cream-300 sticky top-0 z-40 flex items-center gap-2 border-b bg-cream-50/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="btn-ghost size-10 rounded-lg px-0"
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <span className="font-display text-ink-900 font-bold">Deeva Achar admin</span>
          <Link to="/" className="btn-ghost btn-sm ml-auto" title="View storefront">
            <Icon name="external" className="size-4" />
          </Link>
        </div>

        <main id="admin-main" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ isAdmin, user, onSignOut, onClose }) {
  return (
    <>
      <div className="border-ink-800 flex items-center gap-2.5 border-b px-4 py-4">
        <span className="bg-brand-700 grid size-9 place-items-center rounded-lg text-white">
          <Icon name="flame" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">Deeva Achar</p>
          <p className="text-[0.6875rem] text-cream-400">Admin dashboard</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 cursor-pointer place-items-center rounded text-cream-400 hover:text-white"
            aria-label="Close menu"
          >
            <Icon name="close" className="size-4.5" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Admin">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (!items.length) return null;

          return (
            <div key={group.title}>
              <p className="text-ink-400 px-2 pb-1.5 text-[0.6875rem] font-semibold tracking-wider uppercase">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                          isActive
                            ? 'bg-brand-700 text-white'
                            : 'hover:bg-ink-800 text-cream-300 hover:text-white'
                        }`
                      }
                    >
                      <Icon name={item.icon} className="size-4.5 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-ink-800 space-y-2 border-t px-3 py-3">
        <Link
          to="/"
          className="hover:bg-ink-800 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-cream-300 hover:text-white"
        >
          <Icon name="external" className="size-4" />
          View storefront
        </Link>

        <div className="hover:bg-ink-800 flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <span className="bg-brand-700 grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white">
            {initials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="text-[0.6875rem] text-cream-400 capitalize">{user?.role}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded text-cream-400 transition hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
