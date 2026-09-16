import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Flat config (ESLint 9). Deliberately close to the defaults - the value here is
 * `react-hooks`, which catches the dependency-array mistakes that produce stale carts and
 * infinite refetch loops, and `react-refresh`, which catches the exports that silently
 * break hot reload during development.
 *
 * `react/prop-types` is off: this codebase does not use PropTypes, and a rule that fires on
 * every component is a rule nobody reads.
 */
export default [
  { ignores: ['dist', 'coverage', 'node_modules'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs['recommended-latest'].rules,

      'react/prop-types': 'off',
      // Anything rendered with dangerouslySetInnerHTML in this app is sanitised on write by
      // the server; the call sites say so explicitly, so the rule would only add noise.
      'react/no-danger': 'off',

      /**
       * The three rules below come from react-hooks v7, which ships the React Compiler
       * lints. They are kept on, but as warnings, because in this codebase they fire almost
       * entirely on two patterns that are correct here:
       *
       * - `set-state-in-effect`: resetting a local edit form when the record it is editing
       *   finishes loading (admin order, settings, delivery zones), and syncing an input to
       *   the query string after a back-button navigation. There is no way to express
       *   "reset this draft when the server data changes" without it, short of remounting
       *   with a `key`, which throws away scroll position.
       * - `immutability`: assigning to a ref inside an effect to break a
       *   declaration-order cycle between two callbacks in CartContext.
       * - `incompatible-library`: React Hook Form's `watch()`, which is the documented way
       *   to read a field while typing.
       *
       * Left as errors they would make `npm run lint` fail on working code, which trains
       * people to stop running it. As warnings they still show up in review.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/incompatible-library': 'warn',

      'react-refresh/only-export-components': [
        'warn',
        // Context files legitimately export a provider alongside its hook.
        { allowConstantExport: true },
      ],

      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  {
    // Build-time scripts run in Node, not the browser.
    files: ['scripts/**/*.mjs', 'vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
];
