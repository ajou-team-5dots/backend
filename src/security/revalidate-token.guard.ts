import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { Env } from '../config/env.schema.js';

import { matchesSecret, secretDigest } from './secret-match.js';

export const REVALIDATE_TOKEN_HEADER = 'x-revalidate-token';

/**
 * Guards operator routes (cache clear after a data load) with REVALIDATE_TOKEN instead of an API
 * key: the Next.js server holds API keys, the load/batch operator holds this token, and neither
 * can do the other's job. With the token unset (development only), every request is refused.
 */
@Injectable()
export class RevalidateTokenGuard implements CanActivate {
  private readonly tokenDigests: readonly Buffer[];

  constructor(config: ConfigService<Env, true>) {
    const token = config.get('REVALIDATE_TOKEN', { infer: true });
    this.tokenDigests = token === undefined ? [] : [secretDigest(token)];
  }

  canActivate(context: ExecutionContext): boolean {
    const presented = context.switchToHttp().getRequest<Request>().headers[REVALIDATE_TOKEN_HEADER];
    if (matchesSecret(presented, this.tokenDigests)) {
      return true;
    }
    throw new UnauthorizedException('운영 토큰이 없거나 올바르지 않습니다.');
  }
}
