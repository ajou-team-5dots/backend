import { Module } from '@nestjs/common';

import { RevalidateTokenGuard } from '../security/revalidate-token.guard.js';

import { AdminController } from './admin.controller.js';

/** Operator endpoints. QueryCacheService comes from the global cache module. */
@Module({
  controllers: [AdminController],
  providers: [RevalidateTokenGuard],
})
export class AdminModule {}
