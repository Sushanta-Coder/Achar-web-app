import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { get } from '../lib/apiClient';

/**
 * Site settings, loaded once at boot from `GET /api/settings`.
 *
 * The storefront needs to know which payment gateways are actually usable, the free
 * delivery threshold, the contact details in the footer and whether maintenance mode is
 * on - all of it admin-editable, none of it safe to hardcode. Locale lives here too
 * since it is a site-wide preference.
 *
 * The fallbacks below are not a second source of truth: they are what renders during
 * the first paint and if the API is unreachable, so the header and footer are not blank.
 */

const SettingsContext = createContext(null);

/*
  Section names and field names match `GET /api/settings`'s public projection exactly. A
  fallback that invents its own shape is worse than no fallback: the first paint looks
  right, the real response arrives under different keys, and the header quietly keeps
  rendering placeholder copy forever.
*/
const FALLBACK = {
  company: {
    name: 'Deeva Achar',
    tagline: 'Tradition · Taste · Trust',
    phone: '',
    email: '',
    supportEmail: '',
    whatsapp: '',
    address: null,
    social: {},
  },
  announcement: { isActive: false, text: '', link: '' },
  commerce: { minOrderAmount: 0, freeDeliveryThreshold: 0, taxLabel: 'VAT', currency: 'NPR' },
  payments: { gateways: [], cod: { isEnabled: true, label: 'Cash on delivery' }, khaltiPublicKey: null },
  delivery: { freeDeliveryThreshold: 0, zones: [] },
  currency: { code: 'NPR', symbol: 'Rs.' },
  maintenanceMode: false,
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState(() => localStorage.getItem('ag_locale') || 'en');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await get('/settings');
        if (!cancelled && data) setSettings({ ...FALLBACK, ...data });
      } catch {
        // Keep the fallbacks; the site is still usable without admin-set copy.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ag_locale', locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      settings,
      loading,
      locale,
      setLocale,
      toggleLocale: () => setLocale((current) => (current === 'en' ? 'np' : 'en')),
      /** Convenience: the gateways that are both enabled and configured. */
      gateways: settings.payments?.gateways ?? [],
      freeDeliveryThreshold: settings.delivery?.freeDeliveryThreshold ?? 0,
    }),
    [settings, loading, locale]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>');
  return context;
}

export default SettingsContext;
