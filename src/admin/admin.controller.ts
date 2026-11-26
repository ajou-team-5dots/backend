import { Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';

import { QueryCacheService } from '../cache/query-cache.service.js';
import { Public } from '../security/public.decorator.js';
import { RevalidateTokenGuard } from '../security/revalidate-token.guard.js';

export interface CacheClearResult {
  cleared: number;
}

/**
 * Operator routes. @Public() skips the API key guard (an API key must not be able to clear the
 * cache); RevalidateTokenGuard lets only REVALIDATE_TOKEN through. The rate limit still applies.
 */
@Public()
@UseGuards(RevalidateTokenGuard)
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly cache: QueryCacheService) {}

  /**
   * Call after a ClickHouse load or a batch run so the next requests read the new data.
   * Also drops the known-monster list, so new monsters show up on the next request.
   */
  @Post('cache/clear')
  @HttpCode(HttpStatus.OK)
  clearCache(): CacheClearResult {
    const cleared = this.cache.clear();
    this.logger.log(`캐시 비움: ${String(cleared)}개`);
    return { cleared };
  }
}
