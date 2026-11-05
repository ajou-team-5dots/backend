import { defineConfig, globalIgnores } from 'eslint/config';
import { configs, plugins } from 'eslint-config-airbnb-extended';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig([
  globalIgnores(['dist/**', 'coverage/**']),

  // Airbnb style guide (JS + TypeScript + Node). Same base as front-demo, without React/Next.
  plugins.stylistic,
  plugins.importX,
  plugins.node,
  plugins.typescriptEslint,
  ...configs.base.all,
  ...configs.node.recommended,

  // Team overrides. Keep this list short and explain every entry in docs/CONVENTION.md.
  {
    rules: {
      // any disables type checking from that point on. Use unknown and narrow instead.
      '@typescript-eslint/no-explicit-any': 'error',
      // Nest files export one named class each (XxxModule, XxxController, XxxService)
      // and import them by name in @Module(). A default export would hide that name.
      'import-x/prefer-default-export': 'off',
      // Nest calls controller and provider methods on the DI instance (routes, lifecycle hooks),
      // so a method that does not touch `this` still has to be an instance method.
      'class-methods-use-this': 'off',
    },
  },
  {
    // Tests and tool config run only in development, so devDependencies are the right place.
    files: ['test/**', '**/*.spec.ts', '*.config.{ts,mjs}', 'vitest.config.*.ts'],
    rules: {
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
    },
  },
  {
    // Env vars (DB credentials etc.) are read only in src/config/ (via @nestjs/config).
    // Everything else receives values through DI. See docs/CONVENTION.md.
    files: ['src/**'],
    ignores: ['src/config/**'],
    rules: {
      'n/no-process-env': 'error',
    },
  },

  // Must stay last: turns off formatting rules that Prettier owns.
  prettierConfig,
]);
