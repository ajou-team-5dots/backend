import { z } from 'zod';

const DEFAULT_PORT = 3000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

const nonEmpty = z.string().trim().min(1);

// Credentials go in CLICKHOUSE_USER/PASSWORD, never in the URL, so the URL can be logged
// by host alone and is never a secret by itself.
const clickHouseUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return url.username === '' && url.password === '';
});

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(DEFAULT_PORT),
  CLICKHOUSE_URL: clickHouseUrl,
  CLICKHOUSE_USER: nonEmpty,
  CLICKHOUSE_PASSWORD: nonEmpty,
  CLICKHOUSE_DB: nonEmpty,
  CLICKHOUSE_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_REQUEST_TIMEOUT_MS),
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
    const key = issue.path.join('.');
    const reason = raw[key] === undefined || raw[key] === '' ? '없음' : '형식 오류';
    return `${key}(${reason})`;
  });
  throw new Error(
    `환경 변수 설정 오류: ${[...new Set(problems)].join(', ')}. .env.example과 docs/ENV.md를 확인하세요.`,
  );
};
