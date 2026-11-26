import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ApiKeyGuard } from './api-key.guard.js';

/**
 * Global API key guard. There is no rate limit: the key check rejects outsiders before any DB
 * work, and the only key holder is the Next.js server, so a per-user limit belongs there (Vercel).
 */
@Module({
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class SecurityModule {}
