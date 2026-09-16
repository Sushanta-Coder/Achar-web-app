import http from 'node:http';

import app from './app.js';
import env, { assertProductionEnv } from './config/env.js';
import logger from './config/logger.js';
import { connectDatabase, disconnectDatabase, isUsingMemoryFallback } from './config/db.js';
import { ensureSettings } from './services/settingsService.js';
import { ensureLocalUploadDir, activeDriver } from './services/imageStorage.js';
import { startReservationSweeper } from './jobs/releaseExpiredReservations.js';

/**
 * Process entry point: configuration checks, database, background jobs, listener,
 * graceful shutdown. The Express app itself lives in `app.js` so tests can mount it
 * without any of this.
 *
 * Nothing here starts before the database is up. A server that accepts requests
 * while Mongo is still connecting answers the first minute of traffic with 500s,
 * which on a fresh deploy looks exactly like a broken release.
 */

let server;
let stopSweeper;

async function start() {
  // Fails fast on a production deploy still using a development secret, before
  // anything is listening. Better a refused boot than a live shop signing sessions
  // with a key published in the repository.
  assertProductionEnv();

  await connectDatabase();

  // Auto-seed when running on the in-memory fallback so the storefront has
  // products, categories and delivery zones without a separate seed step.
  if (isUsingMemoryFallback()) {
    const { seedAll } = await import('./seed/seed.js');
    await seedAll();
  }

  // Creates the singleton settings document on a fresh database, so the first
  // request does not have to deal with its absence.
  await ensureSettings();

  // Creates `server/uploads/` when running on the local storage driver, so the first
  // image an admin picks does not fail on a missing directory.
  await ensureLocalUploadDir();

  stopSweeper = startReservationSweeper();

  server = http.createServer(app);

  /**
   * Slightly above the 60s a typical proxy uses, and `headersTimeout` above
   * `keepAliveTimeout`: with the defaults the other way round, Node can close a
   * connection the proxy is about to reuse, surfacing as sporadic 502s that are
   * miserable to diagnose.
   */
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  await new Promise((resolve) => server.listen(env.port, resolve));

  logger.info(`Achar Ghar API listening on port ${env.port} [${env.nodeEnv}]`);
  logger.info(`Storefront origin: ${env.clientUrl}`);
  if (!env.khalti.secretKey) logger.warn('KHALTI_SECRET_KEY is not set - Khalti checkout is disabled');
  /**
   * Uploads always work now; the warning is about durability, not availability. Local
   * files live on the container's disk, which most free hosts wipe on every deploy.
   */
  if (activeDriver() === 'local') {
    logger.warn(
      'Image uploads are being stored on this server\'s disk. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET so images survive a redeploy.'
    );
  }
}

/**
 * Ordered shutdown: stop accepting connections, let in-flight requests finish, then
 * close the database.
 *
 * The order matters most for payments. Dropping the connection pool while a gateway
 * verification is mid-flight would leave money taken and no order recorded, so the
 * HTTP server drains first and Mongo closes last.
 */
async function shutdown(signal) {
  logger.info(`${signal} received - shutting down`);

  const failsafe = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 15s - exiting');
    process.exit(1);
  }, 15_000);
  failsafe.unref();

  try {
    stopSweeper?.();
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDatabase();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

['SIGTERM', 'SIGINT'].forEach((signal) => process.on(signal, () => shutdown(signal)));

/**
 * An unhandled rejection has left the process in a state nobody reasoned about, so
 * it is logged and the process is cycled rather than left running in an unknown
 * condition - the host restarts it in a known-good one.
 */
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
