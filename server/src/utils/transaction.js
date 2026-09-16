import mongoose from 'mongoose';
import { supportsTransactions } from '../config/db.js';
import logger from '../config/logger.js';

/**
 * Runs `fn` inside a MongoDB transaction when the deployment supports one
 * (Atlas, any replica set, mongodb-memory-server with replSet) and falls back to
 * running it without a session on a standalone mongod.
 *
 * Every caller must pass the received session straight through to its queries, so
 * the same code path is correct either way. The fallback is *not* atomic - which
 * is why inventory reservation additionally relies on conditional
 * `findOneAndUpdate` guards that cannot oversell even without a transaction.
 */
export async function withTransaction(fn, { retries = 2 } = {}) {
  if (!supportsTransactions()) {
    return fn(undefined);
  }

  let attempt = 0;
  // Retry loop: the exit is the `return` on success or the `throw` once retries run
  // out, so there is no condition to test up front.
  while (true) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await fn(session);
      });
      return result;
    } catch (error) {
      const transient =
        error?.hasErrorLabel?.('TransientTransactionError') ||
        error?.hasErrorLabel?.('UnknownTransactionCommitResult');
      if (transient && attempt < retries) {
        attempt += 1;
        logger.warn(`Transaction retry ${attempt}/${retries}: ${error.message}`);
        continue;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

/** Convenience: spreads `{ session }` only when a session exists. */
export const sessionOption = (session) => (session ? { session } : {});

export default withTransaction;
