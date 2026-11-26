import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Env } from '../config/env.schema.js';

import { IS_PUBLIC_KEY } from './public.decorator.js';
import { matchesSecret, secretDigest } from './secret-match.js';

export const API_KEY_HEADER = 'x-api-key';

/**
 * Every route needs `x-api-key` matching one of API_KEYS, except routes marked @Public().
 * The caller is the Next.js server (Vercel), never the browser, so the key stays server-side.
 * With API_KEYS empty the guard is off; env validation allows that outside production only.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  private readonly keyDigests: readonly Buffer[];

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    this.keyDigests = config.get('API_KEYS', { infer: true }).map(secretDigest);
    if (this.keyDigests.length === 0) {
      this.logger.warn('API_KEYS가 비어 있어 API 키 검사를 끕니다 (개발 전용).');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.keyDigests.length === 0) {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }
    const presented = context.switchToHttp().getRequest<Request>().headers[API_KEY_HEADER];
    if (matchesSecret(presented, this.keyDigests)) {
      return true;
    }
    // One message for missing and wrong keys: the response must not say which it was.
    throw new UnauthorizedException('API 키가 없거나 올바르지 않습니다.');
  }
}
