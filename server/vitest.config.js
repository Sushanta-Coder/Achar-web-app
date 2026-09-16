import { defineConfig } from 'vitest/config';

/**
 * The only setting that matters here is `hookTimeout`.
 *
 * `beforeAll` starts a real `mongodb-memory-server`, which on a cold machine has to
 * unpack and boot a mongod binary. That regularly exceeds Vitest's 5s default, and the
 * failure is misleading when it happens: every test reports as *skipped* and the file
 * as failed, which reads like a broken suite rather than a slow start. Sixty seconds is
 * generous on purpose - the timeout exists to catch a genuine hang, not to police
 * startup speed on someone else's laptop.
 */
export default defineConfig({
  test: {
    hookTimeout: 60_000,
    testTimeout: 20_000,
    // The suite shares one in-memory database and seeds it once, so the files in it
    // must not run concurrently against each other.
    fileParallelism: false,
  },
});
