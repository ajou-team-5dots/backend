import { Module } from '@nestjs/common';

import { PrecomputedService } from './precomputed.service.js';

/**
 * Import in feature modules that read batch JSON. QueryCacheService comes from the global module.
 */
@Module({
  providers: [PrecomputedService],
  exports: [PrecomputedService],
})
export class PrecomputedModule {}
