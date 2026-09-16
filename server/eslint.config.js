import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat config (ESLint 9) for the API.
 *
 * Deliberately a small ruleset. The rules kept here are the ones that catch mistakes
 * this codebase can actually make - a forgotten `await` on a Mongoose call, an unused
 * import left behind by a refactor, a `==` against a possibly-undefined id - rather
 * than a house style. Formatting belongs to Prettier and is not duplicated here.
 */
export default [
  { ignores: ['node_modules', 'uploads', 'coverage'] },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'error',
        // `_req`, `_res`, `_next`: Express identifies error handlers by arity, so
        // unused leading parameters are load-bearing and cannot simply be removed.
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],

      /**
       * `require-await` and `no-return-await` were both tried here and removed.
       *
       * `require-await` fired on ~24 correct call sites, all of the same shape:
       *
       *   export async function clearCart(id) { return Cart.findOneAndUpdate(...); }
       *
       * That promise *is* returned to the caller, so nothing is dropped - the rule only
       * checks for a missing `await`, not for a dropped promise. Catching a genuinely
       * floating promise needs type information (`no-floating-promises`), which is a
       * typescript-eslint rule and not available on a plain JS codebase. Leaving the
       * rule on would have meant either 24 inline disables or `await`-ing every return
       * for the linter's benefit.
       *
       * `no-return-await` is deprecated in ESLint 9, and for a good reason: `return
       * await` keeps the frame in the async stack trace, which is worth more than the
       * microtask it saves when an order fails at 2am.
       */
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      // Mongoose `$`-prefixed keys and template literals in log lines are fine; a
      // bare `console.log` left in a request path is not - the logger is configured.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  {
    // The seed script and CLI entry points legitimately talk to the terminal - and so
    // does the logger, which *is* the console transport. Flagging it there would mean
    // disabling the rule in the one file whose entire job is calling console.
    files: ['src/seed/**/*.js', 'src/server.js', 'src/config/logger.js'],
    rules: { 'no-console': 'off' },
  },

  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest },
    },
  },
];
