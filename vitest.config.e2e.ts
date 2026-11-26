import { defineConfig } from 'vitest/config';

import {
  TEST_API_KEY,
  TEST_RATE_LIMIT_PER_MINUTE,
  TEST_REVALIDATE_TOKEN,
} from './test/test-env.js';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // Placeholder values so AppModule passes env validation without a database.
    // process.env wins over .env in @nestjs/config, so a local .env is never used here.
    env: {
      NODE_ENV: 'test',
      CLICKHOUSE_URL: 'http://localhost:8123',
      CLICKHOUSE_USER: 'test',
      CLICKHOUSE_PASSWORD: 'test',
      CLICKHOUSE_DB: 'test',
      // Set explicitly so a local .env (which fills keys missing here) cannot change the tests.
      API_KEYS: TEST_API_KEY,
      REVALIDATE_TOKEN: TEST_REVALIDATE_TOKEN,
      RATE_LIMIT_PER_MINUTE: String(TEST_RATE_LIMIT_PER_MINUTE),
      PRECOMPUTED_DIR: '',
      CACHE_TTL_MS: '',
    },
  },
});
