import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from './ui/Spinner';

/**
 * Route guards.
 *
 * These are a *navigation* convenience, not a security boundary. Every protected
 * endpoint is enforced server-side by `requireAuth` / `requireStaff`, and this app
 * holds no secrets - hiding the admin routes here stops a customer stumbling into a
 * broken screen, it does not stop anyone determined. That is the correct division:
 * authorization belongs where the data is.
 *
 * All three wait on `ready` before deciding. Redirecting while the `GET /auth/me`
 * check is still in flight would bounce a signed-in admin to the login page on every
 * hard refresh of an admin URL.
 */

/** Requires any signed-in user. Remembers where they were headed. */
export function RequireAuth() {
  const { isAuthenticated, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader label="Checking your session" />;

  if (!isAuthenticated) {
    // `state.from` is read by the login page so sign-in returns them here rather than
    // dumping them on the home page.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Requires admin or staff. Customers get the storefront, not a 403 screen. */
export function RequireStaff() {
  const { isAuthenticated, isStaff, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader label="Checking your session" />;

  if (!isAuthenticated) return <Navigate to="/admin/login" replace state={{ from: location }} />;

  /**
   * A signed-in customer who hits an /admin URL is sent home rather than shown an
   * error. There is nothing they can do about it, and an "access denied" page mostly
   * serves to confirm the route exists.
   */
  if (!isStaff) return <Navigate to="/" replace />;

  return <Outlet />;
}

/** Admin-only areas within the dashboard (staff accounts, site settings). */
export function RequireAdmin() {
  const { isAdmin, isStaff, ready } = useAuth();

  if (!ready) return <PageLoader label="Checking your session" />;
  if (!isAdmin) {
    // Staff land back on the dashboard; anyone else is not in here at all.
    return <Navigate to={isStaff ? '/admin' : '/'} replace />;
  }
  return <Outlet />;
}

/**
 * For the login and register pages: a signed-in visitor has no business there.
 * Staff are sent to the dashboard, customers to their account.
 */
export function RedirectIfAuthenticated() {
  const { isAuthenticated, isStaff, ready } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader label="Loading" />;

  if (isAuthenticated) {
    const from = location.state?.from?.pathname;
    return <Navigate to={from || (isStaff ? '/admin' : '/account')} replace />;
  }
  return <Outlet />;
}
