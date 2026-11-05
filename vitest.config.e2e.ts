import { defineConfig } from 'vitest/config';

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
    },
  },
});
