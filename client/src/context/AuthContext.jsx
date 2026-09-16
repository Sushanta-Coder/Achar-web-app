import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, onSessionExpired, apiError } from '../lib/apiClient';

/**
 * Session state.
 *
 * There is no token here, and nothing is written to localStorage. The session lives
 * entirely in HTTP-only cookies the browser holds and this app cannot read; "am I
 * signed in?" is answered by asking the API (`GET /auth/me`) on first load. That costs
 * one request at boot and buys immunity to a stolen-token XSS.
 *
 * `ready` exists to distinguish "not signed in" from "we have not checked yet".
 * Rendering a guarded route before the check completes would bounce a signed-in
 * customer to the login page on every hard refresh.
 */

const AuthContext = createContext(null);

const STAFF_ROLES = new Set(['admin', 'staff']);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await get('/auth/me');
        if (!cancelled) setUser(data?.user ?? null);
      } catch {
        // A 401 here is the normal case for a first-time visitor, and the Axios
        // interceptor has already tried a refresh. Nothing to report.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * When a refresh fails anywhere in the app, the session is gone - drop the user so
   * guarded routes redirect instead of firing request after request into a 401.
   */
  useEffect(() => onSessionExpired(() => setUser(null)), []);

  /**
   * `cart` is the guest cart handed to the API at sign-in so it can be merged into the
   * saved one. Passed in by the caller rather than read from CartContext here, because
   * that would make the two contexts circular.
   */
  const login = useCallback(async ({ identifier, password, cart }) => {
    const data = await post('/auth/login', { identifier, password, cart });
    setUser(data?.user ?? null);
    return data?.user ?? null;
  }, []);

  /** Separate endpoint: it refuses customer accounts outright rather than signing them in. */
  const adminLogin = useCallback(async ({ email, password }) => {
    const data = await post('/auth/admin/login', { email, password });
    setUser(data?.user ?? null);
    return data?.user ?? null;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await post('/auth/register', payload);
    setUser(data?.user ?? null);
    return data?.user ?? null;
  }, []);

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout');
    } catch {
      // Clearing the cookies is the server's job, but if the request fails the user
      // still asked to sign out - drop the local state either way.
    }
    setUser(null);
  }, []);

  /** Invalidates every refresh token by bumping `tokenVersion` server-side. */
  const logoutEverywhere = useCallback(async () => {
    await post('/auth/logout-everywhere');
    setUser(null);
  }, []);

  /** Re-reads the profile after a change made elsewhere (address added, order placed). */
  const refreshUser = useCallback(async () => {
    try {
      const data = await get('/auth/me');
      setUser(data?.user ?? null);
      return data?.user ?? null;
    } catch (error) {
      if (apiError(error).status === 401) setUser(null);
      return null;
    }
  }, []);

  /** Local merge so a profile edit shows immediately without a second round trip. */
  const patchUser = useCallback((changes) => {
    setUser((current) => (current ? { ...current, ...changes } : current));
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      isStaff: Boolean(user && STAFF_ROLES.has(user.role)),
      isAdmin: user?.role === 'admin',
      login,
      adminLogin,
      register,
      logout,
      logoutEverywhere,
      refreshUser,
      patchUser,
    }),
    [user, ready, login, adminLogin, register, logout, logoutEverywhere, refreshUser, patchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export default AuthContext;
