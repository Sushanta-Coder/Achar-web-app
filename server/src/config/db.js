import mongoose from 'mongoose';
import env from './env.js';
import logger from './logger.js';

let transactionsSupported = null;
let memoryServer = null;

/**
 * Connects to MongoDB and detects whether the deployment supports multi-document
 * transactions (replica set / Atlas) so that services can degrade gracefully on a
 * standalone local mongod.
 *
 * In development only, a connection failure falls back to an in-memory MongoDB rather
 * than refusing to boot. The reason is practical: someone cloning this repo to look at
 * the storefront should get a working `npm run dev` without first installing a database
 * server, and an API that will not start makes every page an error page. The fallback is
 * loud about what it is, never runs in production or test (where a silent switch to an
 * empty database would turn a misconfigured MONGO_URI into a mystery), and is skipped
 * when MONGO_URI was set explicitly - if you named a database, a typo should fail, not be
 * papered over.
 */
export async function connectDatabase(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);
  if (!env.isProd) mongoose.set('debug', false);

  let connection;
  try {
    connection = await open(uri);
  } catch (error) {
    if (!canFallBack(uri)) throw error;
    logger.warn(`Could not reach MongoDB at ${uri}: ${error.message}`);
    connection = await open(await startMemoryServer());
  }

  transactionsSupported = detectTransactionSupport(connection.connection);
  logger.info(
    `MongoDB connected: ${connection.connection.host}/${connection.connection.name} ` +
      `(transactions: ${transactionsSupported ? 'enabled' : 'unavailable - standalone server'})`
  );

  if (env.isProd) {
    // Indexes are created explicitly in production via `npm run seed` / migrations
    // so that a cold start is not blocked by index builds.
    await syncIndexes();
  }

  return connection;
}

const open = (uri) =>
  mongoose.connect(uri, {
    // Short in development so the in-memory fallback kicks in quickly instead of making
    // someone stare at a blank terminal for fifteen seconds.
    serverSelectionTimeoutMS: env.isProd ? 15000 : 4000,
    maxPoolSize: 20,
    autoIndex: !env.isProd,
  });

const canFallBack = (uri) =>
  env.nodeEnv === 'development' && !process.env.MONGO_URI && uri === env.mongoUri;

/**
 * `mongodb-memory-server` is a devDependency, so it is imported dynamically: a static
 * import would crash a production install done with `npm ci --omit=dev`.
 */
async function startMemoryServer() {
  let MongoMemoryServer;
  try {
    ({ MongoMemoryServer } = await import('mongodb-memory-server'));
  } catch {
    throw new Error(
      'MongoDB is not running and the in-memory fallback is unavailable. ' +
        'Start mongod, or set MONGO_URI to an Atlas connection string.'
    );
  }

  memoryServer = await MongoMemoryServer.create({ instance: { dbName: 'achar-ghar' } });
  logger.warn(
    'Falling back to an in-memory MongoDB. Data is discarded when the server stops - ' +
      'run `npm run seed` to populate it, and set MONGO_URI for a real database.'
  );
  return memoryServer.getUri();
}

function detectTransactionSupport(connection) {
  const topology = connection?.client?.topology;
  const description = topology?.description;
  if (!description) return false;
  return ['ReplicaSetWithPrimary', 'Sharded', 'LoadBalanced'].includes(description.type);
}

export function supportsTransactions() {
  return transactionsSupported === true;
}

export function isUsingMemoryFallback() {
  return memoryServer !== null;
}

export async function syncIndexes() {
  const results = await Promise.allSettled(
    Object.values(mongoose.models).map((model) => model.syncIndexes())
  );
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    logger.warn(`Index sync completed with ${failed.length} failure(s)`);
    failed.forEach((f) => logger.warn(f.reason?.message));
  }
}

export async function disconnectDatabase() {
  await mongoose.connection.close();
  transactionsSupported = null;
}

export default connectDatabase;
