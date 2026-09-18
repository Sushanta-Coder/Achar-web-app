# Achar Ghar

Production-ready MERN e-commerce platform for a Nepal-based pickle (achar) company. Fully responsive, SEO-optimised, with Khalti and eSewa payment integration and a complete admin dashboard.

## Quick start

```bash
# 1. Install all dependencies (root + both workspaces)
npm install

# 2. Copy the server env template and fill in credentials
cp server/.env.example server/.env

# 3. Start both server and client in watch mode
npm run dev
```

The client runs on <http://localhost:5173> and the API on <http://localhost:5000>.

**No local MongoDB needed for development.** If `MONGO_URI` is not set, the server falls back to an in-memory database automatically. Data is discarded when the server stops; run `npm run seed` to populate it.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start server + client concurrently |
| `npm run build` | Production build of the React client |
| `npm run seed` | Seed admin account, categories, products, settings |
| `npm run test` | Run the server test suite |
| `npm run lint` | ESLint both workspaces |
| `npm run format` | Prettier over the whole repo |

## Stack

- **Client** — React 19, React Router 7, Tailwind CSS v4, Vite
- **Server** — Node 20+, Express 5, Mongoose 9, JWT (httpOnly cookies)
- **Database** — MongoDB (Atlas in production; in-memory fallback in development)
- **Images** — Cloudinary (leave env vars blank in dev to skip)
- **Payments** — Khalti, eSewa (sandbox credentials work out of the box)
- **Email** — Brevo's REST API, or any SMTP provider via Nodemailer (leave blank in dev to skip)

## Project structure

```
achar-ghar/
├── client/             React SPA
│   ├── public/         Static assets (favicon, manifest, og-default.png)
│   ├── scripts/        make-assets.mjs — generates PNG assets at build time
│   └── src/
│       ├── components/ Shared UI components
│       ├── context/    Auth, Cart, Settings contexts
│       ├── hooks/      useFetch, useMutation, useDebounced, useSeo
│       ├── lib/        format.js, seo.js, http.js
│       └── pages/      All 26 public + 21 admin pages
└── server/             Express API
    ├── src/
    │   ├── config/     env.js, db.js, logger.js
    │   ├── controllers/
    │   ├── middleware/
    │   ├── models/
    │   ├── routes/
    │   └── services/   PaymentService (KhaltiProvider, EsewaProvider)
    ├── .env.example    Document all env vars — copy to .env
    └── seeds/
```

## Environment variables

See [server/.env.example](server/.env.example) for the full list with comments. Required for production:

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | ≥ 32-char random string |
| `JWT_REFRESH_SECRET` | ≥ 32-char, different from JWT_SECRET |
| `CLIENT_URL` | Deployed frontend URL (for CORS + cookies) |
| `KHALTI_SECRET_KEY` | Khalti server-side key |
| `ESEWA_SECRET_KEY` | eSewa HMAC key |
| `CLOUDINARY_*` | Cloud name, API key, API secret |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Deploying

### Frontend — Netlify

Push the repo; Netlify picks up [netlify.toml](netlify.toml) automatically. Set `VITE_API_URL` in the Netlify environment to your API URL. The toml proxies `/sitemap.xml` and `/robots.txt` to the API.

### Frontend — Vercel

Import the repo and set the root directory to `client`. [vercel.json](vercel.json) handles the SPA fallback and proxy rewrites.

### Backend — Render / Railway / Fly

Deploy the `server` workspace. Set all required env vars (see above). The server refuses to start in production if `MONGO_URI`, `JWT_SECRET`, or `CLIENT_URL` are missing.

## Known assumptions

- **Link-preview images** for dynamically-rendered pages (individual products, blog posts) require a Node SSR or edge function to generate per-URL OG images. The SPA serves a single `og-default.png` for all routes; crawlers that execute JavaScript (Google, Facebook, Twitter) will see the correct `<meta>` tags rendered by the client.
- **Email verification resend** — there is no public endpoint to resend a verification email. A user who loses the email must contact the admin.
- **Customer review photos** — reviews are text-only. Image uploads are restricted to staff (product and category images via the admin dashboard).
- **Policy pages** (Shipping, Returns, Privacy, Terms, Cookie) ship with bundled default text. Edit the content directly in the source or wire up a CMS of your choice.
- **VAT / tax** — the order total does not add a separate tax line by default. Nepal's tax rules vary; add a `taxRate` field to `SiteSettings` and include it in the server-side total calculation if needed.
- **COD limit** — cash-on-delivery is capped at a configurable amount in site settings. Orders above the limit must pay online.
- **Inventory reservations** — stock is reserved for `RESERVATION_TTL_MINUTES` (default 45) when an order is placed. If payment is not completed in that window, the reservation is released. COD orders are confirmed immediately and are not swept.

## Security

- Payments are verified server-side only. The frontend never marks an order paid.
- JWT tokens are stored in httpOnly, SameSite cookies — never in localStorage.
- Admin routes require both a valid JWT and `role: admin`. There is no client-side guard that can be bypassed.
- Stack traces are suppressed in production responses.
- All image uploads go to Cloudinary; no large binaries are stored in MongoDB.
- `assertProductionEnv()` in `server/src/config/env.js` fails fast on startup if any required secret is missing or on its insecure development default.
