import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const DEFAULT_PORT = 3000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
/**
 * The repo's data/precomputed, found from this file rather than the working directory: this file
 * sits two levels below the project root both as src/config/*.ts and as dist/config/*.js, so the
 * default holds in tests, `pnpm start:prod` and the Docker image (/app) wherever they are started.
 */
export const DEFAULT_PRECOMPUTED_DIR = fileURLToPath(
  new URL('../../data/precomputed', import.meta.url),
);
/** Same lifetime as front-demo's cacheLife('hours'). */
const DEFAULT_CACHE_TTL_MS = 3_600_000;
/** Per client IP per minute (see ThrottlerModule in security.module.ts). */
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
/** Two keys at once lets a key be rotated without downtime: add the new one, move callers, drop the old. */
export const MAX_API_KEYS = 2;
/** `openssl rand -hex 32` gives 64 characters; anything this short is a placeholder, not a key. */
export const MIN_API_KEY_LENGTH = 32;
/** Same rule as API keys: `openssl rand -hex 32`. */
export const MIN_REVALIDATE_TOKEN_LENGTH = 32;

const nonEmpty = z.string().trim().min(1);

/** `KEY=` copied from .env.example arrives as '', which means "use the default". */
const blankAsUnset = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// Credentials go in CLICKHOUSE_USER/PASSWORD, never in the URL, so the URL can be logged
// by host alone and is never a secret by itself.
const clickHouseUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return url.username === '' && url.password === '';
});

/** `KEY_A,KEY_B` -> ['KEY_A', 'KEY_B']; blank -> [] (no keys: the guard is off, development only). */
const apiKeys = z
  .preprocess(blankAsUnset, z.string().optional())
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key !== ''),
  )
  .pipe(z.array(z.string().min(MIN_API_KEY_LENGTH)).max(MAX_API_KEYS));

export const envSchema = z
  .object({
    NODE_ENV: z.preprocess(
      blankAsUnset,
      z.enum(['development', 'production', 'test']).default('development'),
    ),
    PORT: z.preprocess(
      blankAsUnset,
      z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
    ),
    CLICKHOUSE_URL: clickHouseUrl,
    CLICKHOUSE_USER: nonEmpty,
    CLICKHOUSE_PASSWORD: nonEmpty,
    CLICKHOUSE_DB: nonEmpty,
    CLICKHOUSE_REQUEST_TIMEOUT_MS: z.preprocess(
      blankAsUnset,
      z.coerce.number().int().positive().default(DEFAULT_REQUEST_TIMEOUT_MS),
    ),
    PRECOMPUTED_DIR: z.preprocess(blankAsUnset, nonEmpty.default(DEFAULT_PRECOMPUTED_DIR)),
    CACHE_TTL_MS: z.preprocess(
      blankAsUnset,
      z.coerce.number().int().positive().default(DEFAULT_CACHE_TTL_MS),
    ),
    API_KEYS: apiKeys,
    // Blank: POST /admin/cache/clear refuses every request (development only).
    REVALIDATE_TOKEN: z.preprocess(
      blankAsUnset,
      z.string().trim().min(MIN_REVALIDATE_TOKEN_LENGTH).optional(),
    ),
    RATE_LIMIT_PER_MINUTE: z.preprocess(
      blankAsUnset,
      z.coerce.number().int().positive().default(DEFAULT_RATE_LIMIT_PER_MINUTE),
    ),
  })
  .superRefine((env, ctx) => {
    // Production must never start with the API open.
    if (env.NODE_ENV === 'production' && env.API_KEYS.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['API_KEYS'], message: 'required in production' });
    }
    // Without it, production could only pick up a new data load by restarting.
    if (env.NODE_ENV === 'production' && env.REVALIDATE_TOKEN === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['REVALIDATE_TOKEN'],
        message: 'required in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates env vars at startup (ConfigModule `validate`). The error names the bad keys only:
 * zod messages can quote the received value, and that value may be a password.
 */
export const validateEnv = (raw: Record<string, unknown>): Env => {
  const result = envSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const problems = result.error.issues.map((issue) => {
    // Only the top-level key: API_KEYS problems point inside the parsed list (API_KEYS.0).
    const key = String(issue.path[0] ?? '');
    const reason = raw[key] === undefined || raw[key] === '' ? '없음' : '형식 오류';
    return `${key}(${reason})`;
  });
  throw new Error(
    `환경 변수 설정 오류: ${[...new Set(problems)].join(', ')}. .env.example과 docs/ENV.md를 확인하세요.`,
  );
};
