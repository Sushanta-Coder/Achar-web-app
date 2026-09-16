# Hosting Achar Ghar for free (with a real database)

A complete free-tier deployment: **Vercel** (storefront) + **Render** (API) + **MongoDB Atlas** (database) + **Cloudinary** (product photos). No credit card is required for any of the four.

Total cost: **Rs 0/month.** The one thing you will eventually want to pay for is the API staying awake — see [The one real limitation](#the-one-real-limitation) before you launch.

---

## Architecture

```
  Customer's browser
        │
        │  https://your-shop.vercel.app
        ▼
  ┌──────────────────┐     /api/*  rewritten by vercel.json
  │  Vercel (client) │ ─────────────────────────────┐
  │  React build     │                              │
  └──────────────────┘                              ▼
                                        ┌───────────────────────┐
                                        │  Render (server)      │
                                        │  Express API          │
                                        └───────────┬───────────┘
                                                    │
                            ┌───────────────────────┼──────────────────┐
                            ▼                       ▼                  ▼
                   ┌─────────────────┐   ┌──────────────────┐  ┌──────────────┐
                   │ MongoDB Atlas   │   │ Cloudinary       │  │ Brevo (SMTP) │
                   │ M0 · 512 MB     │   │ product photos   │  │ optional     │
                   └─────────────────┘   └──────────────────┘  └──────────────┘
```

**The browser never talks to Render directly.** Vercel rewrites `/api/*` to your Render URL server-side, so as far as the browser is concerned everything is one origin.

That single decision is what makes this work, and it is worth understanding before you start. If the browser called Render directly, the session cookie would be a *third-party* cookie (`your-shop.vercel.app` → `your-api.onrender.com` are different sites). Safari blocks those outright, Firefox partitions them, and Chrome is phasing them out. Login would appear to succeed and then silently fail on the next request — for some of your customers but not others, depending on their browser. Routing through the proxy keeps the cookie first-party and `SameSite=Lax`, which works everywhere, forever.

---

## Before you start

Create these four free accounts:

| Service | Sign up | What it stores |
|---|---|---|
| MongoDB Atlas | [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) | Orders, products, customers |
| Cloudinary | [cloudinary.com/users/register_free](https://cloudinary.com/users/register_free) | Product photos |
| Render | [render.com](https://render.com) (sign in with GitHub) | The API |
| Vercel | [vercel.com](https://vercel.com) (sign in with GitHub) | The storefront |

Push this repository to GitHub first — Render and Vercel both deploy from it.

---

## Step 1 — Database (MongoDB Atlas)

1. Create a **free M0 cluster**. Any provider/region works; pick one near Nepal (Mumbai `ap-south-1` or Singapore) so queries are fast.
2. **Database Access** → *Add New Database User*. Choose **Password** auth. Use the "Autogenerate Secure Password" button and copy it somewhere safe.
   - If you type your own password and it contains `@ : / ? # [ ] %`, you must URL-encode it in the connection string. Autogenerating avoids the problem.
3. **Network Access** → *Add IP Address* → **Allow Access from Anywhere** (`0.0.0.0/0`).
   - Render's free tier has no static outbound IP, so there is nothing narrower to allow-list. Your database is still protected by the username, password and TLS. Do not skip the strong password.
4. **Connect** → *Drivers* → copy the connection string. It looks like:

```
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

**Add the database name** before the `?`, or Mongo will use `test`:

```
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/achar-ghar?retryWrites=true&w=majority
```

Keep this string — it is `MONGO_URI` in step 4.

M0 gives you 512 MB of storage, which for this schema is roughly 100,000 orders. Product *photos* do not go here (see the next step), which is what keeps it small.

---

## Step 2 — Image storage (Cloudinary)

**This is not optional in production.** Render's filesystem is ephemeral: every deploy, restart, and wake-from-sleep gives the container a clean disk. Without Cloudinary, your product photos work perfectly until the first redeploy and then every image on the site 404s at once.

The app already handles both cases — `server/src/services/imageStorage.js` picks Cloudinary when the three keys are present and falls back to local disk when they are not. The admin uploader shows a warning when it is running on disk.

From your Cloudinary **dashboard**, copy:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Free tier is 25 GB storage and 25 GB bandwidth per month — far more than a shop this size will use.

---

## Step 3 — Generate your JWT secrets

Run this **twice** and keep both results. They must differ from each other.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The server refuses to boot in production if these are missing, under 32 characters, identical to each other, or still contain `change-me`. That check lives in `assertProductionEnv()` in [server/src/config/env.js](server/src/config/env.js).

---

## Step 4 — API (Render)

**New +** → **Web Service** → connect your GitHub repo.

| Setting | Value |
|---|---|
| Root Directory | *(leave blank — this is an npm workspaces monorepo)* |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start --workspace=server` |
| Instance Type | **Free** |
| Health Check Path | `/api/health` |

Then **Environment** → add these. Leave `CLIENT_URL` as a placeholder for now; you will not know your Vercel URL until step 5.

```bash
NODE_ENV=production
MONGO_URI=mongodb+srv://...            # from step 1, with /achar-ghar in it
JWT_SECRET=<first 96-char string>      # from step 3
JWT_REFRESH_SECRET=<second one>        # must differ from the first
CLIENT_URL=https://placeholder.vercel.app   # corrected in step 6
SERVER_URL=https://your-api.onrender.com    # this service's own URL

CLOUDINARY_CLOUD_NAME=...              # from step 2
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

SEED_ADMIN_EMAIL=you@example.com       # your real email - this is your login
SEED_ADMIN_PASSWORD=<a long password>  # used once, in step 7
```

You do **not** need to set `COOKIE_SECURE` or `COOKIE_CROSS_SITE`:

- `COOKIE_SECURE` defaults to `true` whenever `NODE_ENV=production`.
- `COOKIE_CROSS_SITE` must stay **false** (its default). Setting it to `true` would switch cookies to `SameSite=None`, which is exactly the third-party-cookie problem the proxy exists to avoid.

Payment gateway keys are covered in step 8 — the shop deploys fine without them and runs cash-on-delivery only.

Deploy. The first build takes a few minutes. When it finishes, visit `https://your-api.onrender.com/api/health` — you should see `{"success":true,"status":"ok",...}`.

If the deploy fails at boot, read the logs: `assertProductionEnv()` prints exactly which variable is wrong, one per line. That is by design, and it is the most common cause of a failed first deploy.

---

## Step 5 — Storefront (Vercel)

**Add New** → **Project** → import the same repo.

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Root Directory | **`client`** |
| Build Command | `npm run build` *(default)* |
| Output Directory | `dist` *(default)* |

**Do not set `VITE_API_URL`.** Leaving it unset makes the client call `/api` relatively, which is what routes it through the proxy. Setting it to your Render URL would bypass the rewrite and reintroduce the third-party-cookie problem.

Before this works, you must point the rewrite at your own API. Edit [vercel.json](vercel.json) and replace all three occurrences of `https://api.acharghar.com.np` with your Render URL:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://your-api.onrender.com/api/$1" },
    { "source": "/sitemap.xml", "destination": "https://your-api.onrender.com/sitemap.xml" },
    { "source": "/robots.txt",  "destination": "https://your-api.onrender.com/robots.txt"  }
  ]
}
```

Commit and push. Vercel redeploys automatically.

> Using Netlify instead? Same idea — edit the four `to =` lines in [netlify.toml](netlify.toml). The build settings are already in that file, so Netlify picks them up on import.

---

## Step 6 — Connect the two

Go back to Render → **Environment** and set `CLIENT_URL` to your real Vercel URL:

```bash
CLIENT_URL=https://your-shop.vercel.app
```

Save (Render redeploys automatically).

This one matters more than it looks. `verifyOrigin` in [server/src/middleware/csrf.js](server/src/middleware/csrf.js) rejects any state-changing request whose `Origin` header is not on the allow-list — and browsers send `Origin` on same-origin `POST`s too. Get this wrong and browsing works fine while *every* login, signup and checkout fails with "Cross-origin request blocked".

Adding a custom domain later? Add it alongside, comma-separated:

```bash
CORS_ORIGINS=https://acharghar.com.np,https://www.acharghar.com.np
```

---

## Step 7 — Seed the database

Production does **not** auto-seed. The auto-seed in `server/src/server.js` only fires on the in-memory development fallback, so your Atlas database starts completely empty — no admin account, no delivery zones, no settings.

Run the seed **once**, from your own machine, pointed at Atlas. Because Atlas accepts connections from anywhere, this works without a shell on Render (the free tier has no shell).

```bash
cd server
```

Temporarily put your production values in `server/.env`:

```bash
MONGO_URI=mongodb+srv://...            # your Atlas string
SEED_ADMIN_EMAIL=you@example.com
SEED_ADMIN_PASSWORD=<same as on Render>
```

Then:

```bash
npm run seed --workspace=server
```

This creates your admin account, six categories, twelve sample products, five delivery zones (Kathmandu Valley through Remote Districts), coupons, banners and the settings document.

**Afterwards, restore your local `.env`** — put `MONGO_URI` back to blank so local development returns to the in-memory database and cannot touch live orders. This is the single most dangerous step in the guide; a `MONGO_URI` left pointing at Atlas means your next `npm run seed:reset` wipes the real shop.

Now sign in at `https://your-shop.vercel.app/login` with the admin email and password. Change the password immediately from the account page — it has been sitting in a `.env` file and in Render's dashboard.

---

## Step 8 — Payments (when you are ready)

The shop runs on **cash on delivery** with no gateway configured, which is a reasonable way to launch in Nepal.

When you get live merchant credentials, add them on Render:

```bash
# eSewa
ESEWA_BASE_URL=https://epay.esewa.com.np
ESEWA_MERCHANT_ID=<your live merchant code>
ESEWA_SECRET_KEY=<your live secret>
ESEWA_PRODUCT_CODE=<your live product code>

# Khalti
KHALTI_BASE_URL=https://khalti.com/api/v2
KHALTI_SECRET_KEY=<your live secret>
KHALTI_PUBLIC_KEY=<your live public key>
```

The server actively refuses to boot in production with **sandbox** credentials set — `EPAYTEST`, the published sandbox secret, or a `rc-epay`/`dev.khalti.com` base URL. That check exists because sandbox credentials in production are worse than none at all: eSewa would happily approve the redirect and your shop would mark real orders paid for money that was never collected.

A gateway you simply leave unset is switched off cleanly, and only the methods that are both enabled in settings *and* actually configured are offered at checkout.

> **Cold starts and payment callbacks.** A sleeping Render service takes about a minute to wake. If a customer is redirected back from eSewa while the API is asleep, the callback may time out. Payment verification is server-side and idempotent, so the order is not lost — but this is the strongest argument for the uptime ping below, or for the $7/month paid tier once real money is moving.

---

## Step 9 — Email (optional)

Order confirmations and password resets need SMTP. Without it the server logs the message instead of sending it, and everything else keeps working.

**Render's free tier blocks outbound SMTP ports (25, 465, 587).** A normal SMTP provider will silently fail there. Your options:

1. **Launch without email.** Password reset becomes a manual process; order confirmations happen in the admin panel.
2. **Upgrade to a paid Render instance** ($7/month), then any SMTP provider works — Brevo's free tier allows 300 emails/day:
   ```bash
   EMAIL_HOST=smtp-relay.brevo.com
   EMAIL_PORT=587
   EMAIL_USER=<your brevo login>
   EMAIL_PASSWORD=<your brevo SMTP key>
   EMAIL_FROM=Achar Ghar <no-reply@yourdomain.com>
   ```
3. **Host the API somewhere without the SMTP block** — Fly.io and Railway both have free allowances and permit outbound SMTP.

---

## The one real limitation

**A free Render service sleeps after 15 minutes without traffic**, and the next request waits roughly 50–60 seconds while it wakes. A customer landing on your shop after a quiet hour sees a page that appears broken.

The honest options:

| Option | Cost | Trade-off |
|---|---|---|
| Accept it | Rs 0 | Fine for a portfolio or a soft launch; poor for paying customers |
| Uptime ping every 10 min | Rs 0 | Keeps it awake ~16h/day within the 750 free instance-hours/month |
| Render Starter | ~$7/mo | Never sleeps. The right answer once you are taking real orders |

To set up the ping: create a free monitor at [uptimerobot.com](https://uptimerobot.com) pointing at `https://your-api.onrender.com/api/health`, interval 10 minutes.

Note the arithmetic: 750 instance-hours is **31 days × 24 h = 744 h**, so one service pinged continuously just fits — but a second free service in the same account would blow the budget and both would be suspended. Keep the ping to a 10-minute interval on a single service.

---

## Deployment checklist

Before telling anyone the URL:

- [ ] `https://your-api.onrender.com/api/health` returns `status: "ok"`
- [ ] Storefront loads and shows products
- [ ] You can log in as admin and reach `/admin`
- [ ] **Log out, then confirm `/admin` is refused** — the guard is server-side, but verify it
- [ ] Add a product with a photo from your computer; confirm the URL is `res.cloudinary.com`, not `/uploads`
- [ ] Redeploy Render, then reload that product — the photo must still be there (this is the test that proves Cloudinary is actually in use)
- [ ] Place a test COD order end to end
- [ ] Admin password changed from the seed value
- [ ] Local `server/.env` has `MONGO_URI` blank again
- [ ] `server/.env` is not in Git: `git check-ignore server/.env` prints the path

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Deploy fails immediately, logs list variables | `assertProductionEnv()` — fix exactly what it names |
| Browsing works, every login/checkout is 403 | `CLIENT_URL` on Render ≠ your actual Vercel URL |
| Login succeeds then next request is 401 | `COOKIE_CROSS_SITE=true`, or `VITE_API_URL` is set. Unset both |
| First request of the hour takes a minute | Free-tier sleep — see above |
| Images vanish after a deploy | Cloudinary keys missing; server fell back to disk |
| `/api/*` returns Vercel's 404 page | Rewrite in `vercel.json` still points at the old domain |
| Atlas connection times out | Network Access is not `0.0.0.0/0` |
| No emails | Render free blocks SMTP — see step 9 |

---

## Costs as you grow

| | Free limit | What exceeding it costs |
|---|---|---|
| Atlas M0 | 512 MB | M10 ~$9/mo |
| Cloudinary | 25 GB storage & bandwidth | ~$89/mo, or optimise images first |
| Render Free | Sleeps; 750 h/mo | Starter $7/mo |
| Vercel Hobby | 100 GB bandwidth | Pro $20/mo |

Realistically, the first thing you should pay for is **Render Starter at $7/month**, the day you take your first real payment. Everything else on this list has years of headroom for a shop of this size.
