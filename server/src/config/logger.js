import env from './env.js';

const LEVELS = { error: 0, warn: 1, info: 2, http: 3, debug: 4 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (env.isProd ? LEVELS.info : LEVELS.debug);

const stamp = () => new Date().toISOString();

const write = (level, stream, args) => {
  if (LEVELS[level] > threshold) return;
  if (env.isTest && level !== 'error') return;
  stream(`[${stamp()}] ${level.toUpperCase()}`, ...args);
};

/**
 * Minimal structured logger. Deliberately dependency-free: Winston/Pino would be
 * the next step if log shipping is added, and only this module would change.
 *
 * `http` sits between info and debug so a production deployment can drop the access
 * log (`LOG_LEVEL=info`) without also losing the application's own info lines - the
 * two have very different volumes and very different value during an incident.
 */
const logger = {
  error: (...args) => write('error', console.error, args),
  warn: (...args) => write('warn', console.warn, args),
  info: (...args) => write('info', console.log, args),
  http: (...args) => write('http', console.log, args),
  debug: (...args) => write('debug', console.log, args),
};

export default logger;
