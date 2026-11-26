import { defineConfig } from 'vitest/config';

import { TEST_API_KEY } from './test/test-env.js';

// Tests against the real ClickHouse. CLICKHOUSE_* come from .env (read by @nestjs/config).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/db/**/*.db-spec.ts'],
    // process.env wins over .env: the tests use a known key whatever API_KEYS the local .env has.
    env: { NODE_ENV: 'test', API_KEYS: TEST_API_KEY },
    testTimeout: 30_000,
  },
});
