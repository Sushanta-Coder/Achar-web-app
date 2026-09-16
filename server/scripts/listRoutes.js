import express from 'express';

/**
 * Dev utility: prints every route Express actually registered, with its full path.
 *
 *   node scripts/listRoutes.js
 *
 * Useful for spotting a router that was written but never mounted, or a literal path
 * shadowed by a parameterised one declared before it (`/merge` after `/:productId`).
 *
 * Express 5 compiles mount paths into opaque matcher closures, so there is nothing
 * to read back off a layer. Instead `use` is patched on the shared router prototype
 * *before* the app is imported, recording each sub-router's mount path.
 *
 * The prototype rather than `express.Router` itself: the route modules captured that
 * binding when they were imported, so reassigning it here would not reach them.
 * Hence also the dynamic import of the app below - it must happen after the patch.
 */
const mounts = new WeakMap();

// `use` sits two links up the prototype chain from a router instance in Express 5.
const routerProto = Object.getPrototypeOf(Object.getPrototypeOf(express.Router()));
const originalUse = routerProto.use;

routerProto.use = function patchedUse(...args) {
  const [first, ...handlers] = args;
  if (typeof first === 'string') {
    // A sub-router is a function carrying its own `stack`.
    handlers
      .filter((handler) => typeof handler === 'function' && handler.stack)
      .forEach((handler) => mounts.set(handler, first));
  }
  return originalUse.apply(this, args);
};

const app = (await import('../src/app.js')).default;

const routes = [];

const walk = (stack, prefix = '') => {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter((method) => layer.route.methods[method])
        .map((method) => method.toUpperCase())
        .sort()
        .join('|');
      const full = `${prefix}${layer.route.path}`.replace(/\/+$/, '') || '/';
      routes.push({ methods, path: full });
    } else if (layer.handle?.stack) {
      walk(layer.handle.stack, prefix + (mounts.get(layer.handle) ?? ''));
    }
  }
};

walk(app.router?.stack ?? app._router.stack);

const width = Math.max(...routes.map((route) => route.methods.length));
routes.forEach((route) => console.log(`${route.methods.padEnd(width)}  ${route.path}`));

// A duplicate here is usually two routers fighting over the same path, which Express
// resolves silently by always running the first - worth surfacing.
const seen = new Map();
routes.forEach((route) => {
  const key = `${route.methods} ${route.path}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
});
const duplicates = [...seen].filter(([, count]) => count > 1);

console.log(`\n${routes.length} routes registered`);
if (duplicates.length) {
  console.log('\nDuplicates:');
  duplicates.forEach(([key, count]) => console.log(`  ${key} (x${count})`));
}

process.exit(0);
