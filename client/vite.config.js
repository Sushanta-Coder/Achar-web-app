import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite config.
 *
 * The dev proxy is what makes the HTTP-only session cookie work locally: with
 * `/api` proxied through the Vite origin the browser treats the API as same-site, so
 * `SameSite=Lax` cookies are sent and no CORS preflight is involved. In production the
 * two apps sit on different hosts (Vercel + Render) and the cookie is configured
 * `SameSite=None; Secure` instead - see COOKIE_CROSS_SITE in server/.env.example.
 *
 * `VITE_API_URL` overrides the proxy target for anyone running the API on another port.
 */
export default defineConfig(({ mode }) => {
  const apiTarget = process.env.VITE_API_PROXY || 'http://localhost:5000';

  return {
    plugins: [react(), tailwindcss()],

    server: {
      port: 5173,
      // Fail loudly rather than silently moving to 5174, which would break the
      // server's CORS allow-list and the OAuth-style redirect URLs.
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        // Served by the API so the sitemap can be built from live product data.
        '/sitemap.xml': { target: apiTarget, changeOrigin: true },
        '/robots.txt': { target: apiTarget, changeOrigin: true },
      },
    },

    build: {
      // Reports are useful but a source map shipped to production hands an attacker
      // the unminified app; keep them for the local `build` only.
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          /**
           * Split the vendor bundle by hand. React and the router change on their own
           * (rare) cadence, so pinning them into their own chunk means a routine app
           * deploy does not invalidate ~150 kB of cached vendor code for every visitor.
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react-router')) return 'router';
            if (id.includes('/react/') || id.includes('react-dom')) return 'react';
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod'))
              return 'forms';
            if (id.includes('axios')) return 'http';
            return 'vendor';
          },
        },
      },
    },

    // Hand-rolled SVG charts and no icon library, so there is little to pre-bundle.
    optimizeDeps: { include: ['react', 'react-dom', 'react-router-dom', 'axios'] },
  };
});
