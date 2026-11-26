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
/** Two keys let a key be rotated without downtime: add the new one, move callers, drop the old. */
export const MAX_API_KEYS = 2;
/** `openssl rand -hex 32` gives 64 characters; anything this short is a placeholder, not a key. */
export const MIN_API_KEY_LENGTH = 32;
/** Same rule as API keys: `openssl rand -hex 32`. */
export const MIN_REVALIDATE_TOKEN_LENGTH = 32;
/**
 * Production secrets must look like `openssl rand -hex 32` output. Rejects hand-typed values and
 * the test keys committed in this public repo.
 */
const PRODUCTION_SECRET = /^[0-9a-f]{64}$/;

const nonEmpty = z.string().trim().min(1);

/** `KEY=` copied from .env.example arrives as '', which means "use the default". */
const blankAsUnset = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

// Credentials go in CLICKHOUSE_USER/PASSWORD, never in the URL, so the URL can be logged by host
// alone and is never a secret by itself.
// zod runs this refinement even when the url check already failed, so guard `new URL` (which
// throws on a non-URL) or the raw TypeError would escape instead of the "형식 오류" report.
const clickHouseUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return url.username === '' && url.password === '';
});

/** `KEY_A,KEY_B` -> ['KEY_A', 'KEY_B']; blank -> [] (no keys: guard off, development only). */
const apiKeys = z
  .preprocess(blankAsUnset, z.string().optional())
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter((key) => key !== ''),
  )
  .pipe(z.array(z.string().min(MIN_API_KEY_LENGTH)).max(MAX_API_KEYS));

// Cross-field rules (production secrets) live in secretProblems(), not in a refinement: zod skips
// refinements once a field fails, and every problem should be reported in one go.
export const envSchema = z.object({
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
});

export type Env = z.infer<typeof envSchema>;

type Problem = [key: string, reason: string];

const isBlank = (value: unknown): boolean =>
  value === undefined || (typeof value === 'string' && value.trim() === '');

/**
 * Rules across keys, checked on each key's own parse so they run even when other keys are broken.
 * - API_KEYS may be empty (key check off) only when NODE_ENV is set explicitly to development or
 *   test. A blank NODE_ENV defaults to development, but an unset NODE_ENV on a server must not
 *   leave the API open
 * - production needs API_KEYS and REVALIDATE_TOKEN, each 64 lowercase hex characters
 * - REVALIDATE_TOKEN must differ from every API key (in any environment): otherwise whoever holds
 *   an API key could also clear the cache
 */
const secretProblems = (raw: Record<string, unknown>): Problem[] => {
  const { shape } = envSchema;
  const nodeEnv = shape.NODE_ENV.safeParse(raw.NODE_ENV);
  const keys = shape.API_KEYS.safeParse(raw.API_KEYS);
  const token = shape.REVALIDATE_TOKEN.safeParse(raw.REVALIDATE_TOKEN);
  const problems: Problem[] = [];

  const explicitNonProduction =
    !isBlank(raw.NODE_ENV) && nodeEnv.success && nodeEnv.data !== 'production';
  if (!explicitNonProduction && keys.success && keys.data.length === 0) {
    problems.push([
      'API_KEYS',
      isBlank(raw.NODE_ENV) ? '없음: 비워 두려면 NODE_ENV=development를 명시' : '없음',
    ]);
  }
  if (nodeEnv.success && nodeEnv.data === 'production') {
    if (
      keys.success &&
      keys.data.length > 0 &&
      !keys.data.every((key) => PRODUCTION_SECRET.test(key))
    ) {
      problems.push(['API_KEYS', '형식 오류: openssl rand -hex 32 값만']);
    }
    if (token.success && token.data === undefined) {
      problems.push(['REVALIDATE_TOKEN', '없음']);
    } else if (token.success && !PRODUCTION_SECRET.test(token.data ?? '')) {
      problems.push(['REVALIDATE_TOKEN', '형식 오류: openssl rand -hex 32 값만']);
    }
  }
  if (keys.success && token.success && token.data !== undefined) {
    if (keys.data.includes(token.data)) {
      problems.push(['REVALIDATE_TOKEN', 'API_KEYS와 같음']);
    }
  }
  return problems;
};

/**
 * Validates env vars at startup (ConfigModule `validate`). The error names the bad keys only:
 * zod messages can quote the received value, and that value may be a password. Every problem is
 * reported at once, one per key.
 */
export const validateEnv = (raw: Record<string, unknown>): Env => {
  const result = envSchema.safeParse(raw);
  const problems: Problem[] = result.success
    ? []
    : result.error.issues.map((issue): Problem => {
        // Only the top-level key: API_KEYS problems point inside the parsed list (API_KEYS.0).
        const key = String(issue.path[0] ?? '');
        return [key, isBlank(raw[key]) ? '없음' : '형식 오류'];
      });
  problems.push(...secretProblems(raw));
  if (result.success && problems.length === 0) {
    return result.data;
  }
  const firstPerKey = new Map<string, string>();
  problems.forEach(([key, reason]) => {
    if (!firstPerKey.has(key)) {
      firstPerKey.set(key, reason);
    }
  });
  const listed = [...firstPerKey].map(([key, reason]) => `${key}(${reason})`).join(', ');
  throw new Error(`환경 변수 설정 오류: ${listed}. .env.example과 docs/ENV.md를 확인하세요.`);
};
