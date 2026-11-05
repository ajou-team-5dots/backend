import { createClient } from '@clickhouse/client';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';

import { CLICKHOUSE_CLIENT } from './clickhouse.constants.js';
import { ClickHouseService } from './clickhouse.service.js';

@Module({
  providers: [
    {
      // One client per process: it keeps an HTTP keep-alive pool, so a client per request
      // would open a new connection every time.
      provide: CLICKHOUSE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createClient({
          url: config.get('CLICKHOUSE_URL', { infer: true }),
          username: config.get('CLICKHOUSE_USER', { infer: true }),
          password: config.get('CLICKHOUSE_PASSWORD', { infer: true }),
          database: config.get('CLICKHOUSE_DB', { infer: true }),
          request_timeout: config.get('CLICKHOUSE_REQUEST_TIMEOUT_MS', { infer: true }),
          // No clickhouse_settings: the production `api` user is readonly=2, and sending a
          // `readonly` setting from the client is rejected by the server.
        }),
    },
    ClickHouseService,
  ],
  exports: [ClickHouseService],
})
export class ClickHouseModule {}
