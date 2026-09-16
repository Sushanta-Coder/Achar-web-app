#!/usr/bin/env node
/**
 * Runs any command against a throwaway in-memory MongoDB replica set.
 *
 *   node scripts/withMemoryDb.js npm run seed
 *   node scripts/withMemoryDb.js npm start
 *
 * A replica set of one rather than a standalone `mongod`, because `supportsTransactions()`
 * keys off the topology type and the order and payment services take a different code
 * path when transactions are unavailable. Verifying against a standalone would exercise
 * the fallback and leave the path that actually runs in production untested.
 *
 * The child inherits `MONGO_URI`; everything is torn down on exit, so nothing survives
 * the process. Development convenience only - never part of a deployment.
 */
import { spawn } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: node scripts/withMemoryDb.js <command> [args...]');
  process.exit(64);
}

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
});

const uri = replSet.getUri('achar-ghar');
console.log(`[withMemoryDb] ${uri}\n`);

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, MONGO_URI: uri },
});

const shutdown = async (code) => {
  await replSet.stop().catch(() => {});
  process.exit(code ?? 0);
};

child.on('exit', (code, signal) => shutdown(signal ? 1 : code));
child.on('error', (error) => {
  console.error(`[withMemoryDb] ${error.message}`);
  shutdown(1);
});

// Ctrl-C reaches the child too; stop the server here so no data directory is left behind.
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
