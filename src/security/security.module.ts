import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import type { Env } from '../config/env.schema.js';

import { ApiKeyGuard } from './api-key.guard.js';

const ONE_MINUTE_MS = 60_000;

/**
 * Global guards, in this order: rate limit first (so requests with wrong keys are counted too),
 * then the API key. Nest runs APP_GUARD providers in the order listed here. Counts are per client
 * IP across all routes and kept in process memory (one container).
 * Behind a reverse proxy every request comes from the proxy's IP, so set `trust proxy` first
 * (see app.setup.ts). The only caller is the Next.js server, so one IP carries all users' traffic:
 * size RATE_LIMIT_PER_MINUTE for the whole site, not for one person.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          { ttl: ONE_MINUTE_MS, limit: config.get('RATE_LIMIT_PER_MINUTE', { infer: true }) },
        ],
        // The library counts each route separately by default; one budget per client is simpler
        // to reason about and cannot be multiplied by spreading requests over routes.
        generateKey: (_context, tracker, name) => `${name}:${tracker}`,
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
})
export class SecurityModule {}
