import { defineConfig } from 'vitest/config';

// Tests against the real ClickHouse. CLICKHOUSE_* come from .env (read by @nestjs/config).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/db/**/*.db-spec.ts'],
    env: { NODE_ENV: 'test' },
    testTimeout: 30_000,
  },
});
