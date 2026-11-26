import { Global, Module } from '@nestjs/common';

import { QueryCacheService } from './query-cache.service.js';

/**
 * One cache per process, shared by every feature module (global, imported once in AppModule).
 * The NestJS server runs as a single container, so every request sees the same cache.
 */
@Global()
@Module({
  providers: [QueryCacheService],
  exports: [QueryCacheService],
})
export class QueryCacheModule {}
