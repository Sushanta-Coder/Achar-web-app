/**
 * Routes DNS through public resolvers for this process only.
 *
 * `mongodb+srv://` connection strings require an SRV record lookup, and some ISP
 * resolvers refuse SRV queries outright — the failure reads `querySrv ECONNREFUSED`
 * and looks like a database or credentials problem, which it is not. Atlas is
 * reachable; the local resolver simply will not answer the question.
 *
 * Preload it ahead of any script that connects to Atlas:
 *
 *   node -r ./scripts/dnsPublic.cjs src/seed/seed.js
 *
 * Scoped to the process, so nothing about the machine's network settings changes.
 * Not needed on Render, Vercel or any other host with a working resolver — this is
 * purely a workaround for running production scripts from a home connection.
 */
const dns = require('node:dns');

dns.setServers(['8.8.8.8', '1.1.1.1']);
