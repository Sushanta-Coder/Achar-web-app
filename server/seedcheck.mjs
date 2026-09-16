import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = replSet.getUri('acharghar_seedcheck');

const run = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ['src/seed/seed.js', ...args], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        MONGO_URI: uri,
        SEED_ADMIN_PASSWORD: 'seedcheck-admin-pw',
        SEED_DEMO_PASSWORD: 'seedcheck-demo-pw',
      },
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolve(code));
  });

console.log('\n===== FIRST RUN =====');
const first = await run([]);
console.log(`\n===== SECOND RUN (idempotency) =====`);
const second = await run([]);
console.log(`\n===== THIRD RUN (--reset) =====`);
const third = await run(['--reset']);

// Inspect the result.
const mongoose = (await import('mongoose')).default;
await mongoose.connect(uri);
const names = ['products', 'categories', 'deliveryzones', 'coupons', 'banners', 'blogposts', 'users', 'reviews', 'sitesettings'];
console.log('\n===== COUNTS =====');
for (const n of names) {
  console.log(`  ${n}: ${await mongoose.connection.db.collection(n).countDocuments()}`);
}

const { Product } = await import('./src/models/index.js');
const p = await Product.findOne({ slug: 'mula-ko-achar-radish-pickle' }).lean();
console.log('\n===== DERIVED FIELDS (mula ko achar) =====');
console.log({ minPrice: p.minPrice, maxPrice: p.maxPrice, totalStock: p.totalStock, maxDiscountPercentage: p.maxDiscountPercentage, thumbnail: !!p.thumbnail?.url, ratingAverage: p.ratingAverage, ratingCount: p.ratingCount });
console.log('variant skus:', p.variants.map((v) => `${v.size}=${v.sku} Rs.${v.price} stock=${v.stock}/avail=${v.availableStock} default=${!!v.isDefault}`));

const skus = (await Product.find({}).select('variants.sku').lean()).flatMap((d) => d.variants.map((v) => v.sku));
console.log(`\nvariant SKUs: ${skus.length} total, ${new Set(skus).size} unique`);

console.log('\nexit codes:', { first, second, third });
await mongoose.disconnect();
await replSet.stop();
process.exit(first || second || third ? 1 : 0);
