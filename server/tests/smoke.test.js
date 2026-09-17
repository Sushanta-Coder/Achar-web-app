import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

/**
 * Boots the real Express app against `mongodb-memory-server`, so these exercise the
 * actual middleware chain - CSRF, rate limiting, auth guards, the error handler -
 * rather than handler functions in isolation. That chain is where the security
 * properties live, and it is the part a unit test with a mocked request would skip.
 *
 * The suite is deliberately small and behavioural. Its job is to fail loudly when
 * someone changes a rule that money or authorization depends on, not to cover lines.
 */

process.env.NODE_ENV = 'test';
// Small and fixed rather than random: the JWT secrets only need to differ from the
// placeholder values, and a stable pair keeps tokens valid across a re-run.
process.env.JWT_SECRET = 'test-only-secret-value-not-used-in-production-0001';
process.env.JWT_REFRESH_SECRET = 'test-only-secret-value-not-used-in-production-0002';
process.env.RATE_LIMIT_AUTH_MAX = '1000';
/**
 * Only takes effect on a checkout with no `.env` - dotenv runs with `override: true`,
 * so a developer's own value wins. Without it the seed would invent a random admin
 * password and only log it, and the authorization test below could never sign in.
 */
process.env.SEED_ADMIN_PASSWORD ||= 'Smoke!Seed7vQ2pL9xR4';

let app;
let seedAll;
/** The *effective* config, read after dotenv has had its say. */
let config;

beforeAll(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mongo = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongo.getUri();

  await mongoose.connect(process.env.MONGO_URI);

  // Imported dynamically, not at the top of the file: static imports are hoisted, so
  // `env.js` would read `process.env` before the assignments above had run.
  ({ default: config } = await import('../src/config/env.js'));
  ({ default: app } = await import('../src/app.js'));
  ({ seedAll } = await import('../src/seed/seed.js'));
  await seedAll();
});

afterAll(async () => {
  await mongoose.disconnect();
});

/** Logs in and returns the cookie jar plus the CSRF token the write endpoints need. */
async function signIn(identifier, password) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ identifier, password });
  return { agent, csrf: response.body?.data?.csrfToken ?? '', response };
}

const write = (agent, csrf, method, url) => agent[method](url).set('X-CSRF-Token', csrf);

describe('health and public reads', () => {
  it('answers the liveness probe without touching the database', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('serves the catalogue to an anonymous visitor', async () => {
    const response = await request(app).get('/api/products').expect(200);
    expect(Array.isArray(response.body.data.products)).toBe(true);
    expect(response.body.data.products.length).toBeGreaterThan(0);
  });

  it('never exposes a secret through the public settings projection', async () => {
    const response = await request(app).get('/api/settings').expect(200);
    const serialised = JSON.stringify(response.body).toLowerCase();

    for (const forbidden of ['jwt_secret', 'jwtsecret', 'apisecret', 'api_secret', 'esewa_secret', 'password']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe('money is calculated server-side', () => {
  it('ignores a price injected into the cart quote', async () => {
    const listed = await request(app).get('/api/products?limit=1').expect(200);
    const product = listed.body.data.products[0];
    const variant = product.variants[0];

    const response = await request(app)
      .post('/api/cart/quote')
      .send({
        items: [
          {
            productId: product._id,
            variantId: variant._id,
            quantity: 2,
            // The client trying to name its own price. Must be ignored entirely.
            price: 1,
            total: 1,
          },
        ],
      })
      .expect(200);

    /**
     * Asserted against the catalogue rather than a hardcoded number, so the test keeps
     * meaning when the seed prices change. `unitPrice` may sit below `variant.price`
     * when a discount applies, which is why this is a ceiling and not an equality.
     */
    const [line] = response.body.data.items;
    expect(line.unitPrice).toBeGreaterThan(1);
    expect(line.unitPrice).toBeLessThanOrEqual(variant.price);
    expect(line.lineTotal).toBe(line.unitPrice * 2);
    expect(response.body.data.pricing.subtotal).toBe(line.lineTotal);
  });

  it('refuses a quantity above the per-item ceiling', async () => {
    const listed = await request(app).get('/api/products?limit=1').expect(200);
    const product = listed.body.data.products[0];

    await request(app)
      .post('/api/cart/quote')
      .send({
        items: [{ productId: product._id, variantId: product.variants[0]._id, quantity: 50 }],
      })
      .expect(422);
  });

  /**
   * A cleared discount once reached the database as `0` instead of `null`, and the
   * storefront read that zero as a real price: a Rs. 420 jar went on the shop for
   * nothing. Two separate mistakes had to line up - a coercing Zod union that turned
   * `null` into `0`, and a `??` in `catalogService` where the model uses `&&` - so this
   * asserts the stored value *and* what a shopper is quoted, not just one of them.
   */
  it('stores a cleared discount as null, and never prices a jar at zero', async () => {
    const admin = await signIn(config.seed.adminEmail, config.seed.adminPassword);
    const categories = await request(app).get('/api/categories').expect(200);
    const categoryId = (categories.body.data.categories ?? categories.body.data)[0]._id;

    const image = { url: 'https://example.com/jar.jpg', alt: 'A jar of pickle' };
    const unique = Date.now().toString().slice(-6);

    // Every shape a blank "Sale price" field can arrive in, plus a real discount as a
    // control - if the guard were simply "ignore discountPrice", that one would fail.
    const cases = [
      { label: 'blank string', sent: '', expected: null },
      { label: 'explicit null', sent: null, expected: null },
      { label: 'omitted', sent: undefined, expected: null },
      { label: 'a real discount', sent: 380, expected: 380 },
    ];

    for (const [index, testCase] of cases.entries()) {
      const suffix = `${unique}${index}`;
      const variant = {
        size: '250g',
        weightGrams: 250,
        sku: `SMOKE${suffix}-250`,
        price: 420,
        stock: 5,
        isActive: true,
        isDefault: true,
      };
      if (testCase.sent !== undefined) variant.discountPrice = testCase.sent;

      const created = await write(admin.agent, admin.csrf, 'post', '/api/products/admin')
        .send({
          name: `Smoke Discount ${suffix}`,
          sku: `SMOKE${suffix}`,
          shortDescription: 'Checking how a cleared discount is stored.',
          description: 'A description long enough to satisfy the product validator here.',
          category: categoryId,
          images: [image],
          thumbnail: image,
          variants: [variant],
        })
        .expect(201);

      const stored = created.body.data.product.variants[0].discountPrice;
      expect(stored, `${testCase.label} should store ${testCase.expected}`).toBe(testCase.expected);

      const shopper = await request(app)
        .get(`/api/products/${created.body.data.product.slug}`)
        .expect(200);
      expect(shopper.body.data.product.variants[0].effectivePrice).toBe(testCase.expected ?? 420);
      expect(shopper.body.data.product.price).toBeGreaterThan(0);
    }
  });

  /** The other half of the rule: a "discount" that is not one must be refused outright. */
  it('refuses a discount that is not below the regular price', async () => {
    const admin = await signIn(config.seed.adminEmail, config.seed.adminPassword);
    const categories = await request(app).get('/api/categories').expect(200);
    const categoryId = (categories.body.data.categories ?? categories.body.data)[0]._id;

    const image = { url: 'https://example.com/jar.jpg', alt: 'A jar of pickle' };
    const suffix = `${Date.now().toString().slice(-6)}X`;

    const response = await write(admin.agent, admin.csrf, 'post', '/api/products/admin')
      .send({
        name: `Smoke Discount ${suffix}`,
        sku: `SMOKE${suffix}`,
        shortDescription: 'A discount above the list price must be rejected.',
        description: 'A description long enough to satisfy the product validator here.',
        category: categoryId,
        images: [image],
        thumbnail: image,
        variants: [
          {
            size: '250g',
            weightGrams: 250,
            sku: `SMOKE${suffix}-250`,
            price: 420,
            discountPrice: 500,
            stock: 5,
            isActive: true,
            isDefault: true,
          },
        ],
      })
      .expect(422);

    expect(JSON.stringify(response.body.errors)).toContain('below the regular price');
  });
});

describe('authorization', () => {
  it('rejects an anonymous write without a CSRF token', async () => {
    await request(app).post('/api/contact').send({}).expect(422);
  });

  it('answers an anonymous admin read with 401, never data', async () => {
    const response = await request(app).get('/api/admin/dashboard');
    expect([401, 403]).toContain(response.status);
  });

  it('lets an admin in and keeps a customer out of the same endpoint', async () => {
    /**
     * Both halves matter. A test that only checks the customer is refused would still
     * pass if the route were broken shut for everyone, and a test that only checks the
     * admin is admitted would pass if it were open to everyone.
     */
    const admin = await signIn(config.seed.adminEmail, config.seed.adminPassword);
    expect(admin.response.status).toBe(200);
    await admin.agent.get('/api/admin/dashboard').expect(200);

    const email = `smoke-customer-${Date.now()}@example.com`;
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Smoke Customer', email, password: 'Smoke!N7vQ2pL9xR4', phone: '9845000111' });
    expect(registered.status).toBe(201);

    const customer = await signIn(email, 'Smoke!N7vQ2pL9xR4');
    expect(customer.response.status).toBe(200);
    await customer.agent.get('/api/admin/dashboard').expect(403);
  });

  it('refuses image uploads to an unauthenticated caller', async () => {
    await request(app).post('/api/uploads/images').expect(401);
  });
});

describe('order access control', () => {
  it('hides an order from a caller who is not signed in', async () => {
    // Any order number: the point is that the response does not reveal whether it exists.
    const response = await request(app).get('/api/orders/ACH-2026-000001');
    expect([401, 403, 404]).toContain(response.status);
  });
});

describe('validation hardens the database boundary', () => {
  it('rejects a Mongo operator smuggled into a string field', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ identifier: { $ne: null }, password: { $ne: null } });
    expect(response.status).toBe(422);
  });

  it('rejects a malformed product id', async () => {
    await request(app).get('/api/products/not-a-valid-object-id').expect(404);
  });
});

describe('uploads refuse files that are not images', () => {
  it('reports which image types are accepted, to staff only', async () => {
    // Staff-gated: the endpoint names the storage driver, which is deployment detail.
    await request(app).get('/api/uploads/status').expect(401);

    const admin = await signIn(config.seed.adminEmail, config.seed.adminPassword);
    const response = await admin.agent.get('/api/uploads/status').expect(200);

    // The shape must stay stable - the admin uploader reads `enabled` to decide
    // whether to disable the "choose from your device" button.
    expect(typeof response.body.data.enabled).toBe('boolean');
    expect(response.body.data.accepted).toContain('image/png');
  });

  it('rejects a file whose bytes are not an image, whatever it claims to be', async () => {
    /**
     * The declared MIME type is attacker-controlled, so `storeImage` checks the magic
     * bytes instead. This sends PHP source labelled as a PNG - the exact shape of a
     * web-shell upload - and expects it refused on content, not on its extension.
     */
    const admin = await signIn(config.seed.adminEmail, config.seed.adminPassword);

    const response = await write(admin.agent, admin.csrf, 'post', '/api/uploads/images')
      .attach('images', Buffer.from('<?php system($_GET["c"]); ?>'), {
        filename: 'shell.png',
        contentType: 'image/png',
      })
      .field('folder', 'products');

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('php');
  });
});

export { signIn, write };
