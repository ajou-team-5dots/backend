import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Lets a route through ApiKeyGuard without a key. Two uses only:
 * - GET /health: liveness probe, reveals nothing
 * - AdminController (/admin/*), marked at class level: protected by REVALIDATE_TOKEN
 *   (RevalidateTokenGuard) instead of an API key
 * Because the whole AdminController is @Public(), every route added there skips the API key and
 * relies on RevalidateTokenGuard alone: keep that guard on the class, and put anything a key holder
 * should reach in a feature controller, not in admin/. Never mark a data route @Public().
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
