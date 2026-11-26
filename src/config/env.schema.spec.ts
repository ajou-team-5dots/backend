import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_PRECOMPUTED_DIR, validateEnv } from './env.schema.js';

// NODE_ENV set explicitly, as in .env.example: only then may API_KEYS stay empty.
const VALID = {
  NODE_ENV: 'development',
  CLICKHOUSE_URL: 'http://db.example.test:8123',
  CLICKHOUSE_USER: 'reader',
  CLICKHOUSE_PASSWORD: 'p4ss-w0rd-never-printed',
  CLICKHOUSE_DB: 'default',
};

/** VALID with NODE_ENV left unset, as on a server whose .env forgot it. */
const WITHOUT_NODE_ENV = { ...VALID, NODE_ENV: undefined };

const KEY_A = 'a'.repeat(32);
const KEY_B = 'b'.repeat(40);
// Shaped like `openssl rand -hex 32`, as production requires. Not real secrets.
const HEX_KEY = '0123456789abcdef'.repeat(4);
const HEX_TOKEN = 'fedcba9876543210'.repeat(4);

const errorOf = (raw: Record<string, unknown>): string => {
  try {
    validateEnv(raw);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('validateEnv did not throw');
};

describe('validateEnv', () => {
  it('기본값을 채운다', () => {
    expect(validateEnv({ ...WITHOUT_NODE_ENV, API_KEYS: KEY_A })).toEqual({
      ...WITHOUT_NODE_ENV,
      NODE_ENV: 'development',
      PORT: 3000,
      CLICKHOUSE_REQUEST_TIMEOUT_MS: 10_000,
      PRECOMPUTED_DIR: DEFAULT_PRECOMPUTED_DIR,
      CACHE_TTL_MS: 3_600_000,
      API_KEYS: [KEY_A],
    });
  });

  it('NODE_ENV를 비워 둔 채 API_KEYS도 비우면 시작하지 않는다 (서버에서 API가 열리지 않게)', () => {
    expect(errorOf(WITHOUT_NODE_ENV)).toContain(
      'API_KEYS(없음: 비워 두려면 NODE_ENV=development를 명시)',
    );
    expect(errorOf({ ...WITHOUT_NODE_ENV, NODE_ENV: ' ' })).toContain('API_KEYS(없음');
    expect(validateEnv({ ...WITHOUT_NODE_ENV, NODE_ENV: 'test' }).API_KEYS).toEqual([]);
    expect(validateEnv(VALID).API_KEYS).toEqual([]);
  });

  it('미리 계산 폴더 기본값은 실행 위치가 아니라 프로젝트 루트 기준이다', () => {
    expect(path.isAbsolute(DEFAULT_PRECOMPUTED_DIR)).toBe(true);
    expect(DEFAULT_PRECOMPUTED_DIR).toBe(
      path.resolve(import.meta.dirname, '../../data/precomputed'),
    );
  });

  it('.env.example을 그대로 복사하고 ClickHouse 필수 키만 채워도 시작한다', async () => {
    // Every key in the template as written, as a teammate gets it after `cp .env.example .env`.
    const template = await readFile(
      path.resolve(import.meta.dirname, '../../.env.example'),
      'utf8',
    );
    const copied = Object.fromEntries(
      template
        .split('\n')
        .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
        .filter((match): match is RegExpExecArray => match !== null)
        .map(([, key, value]) => [key, value]),
    );
    expect(Object.keys(copied)).toEqual(expect.arrayContaining(['NODE_ENV', 'PORT', 'API_KEYS']));

    const env = validateEnv({ ...copied, ...VALID, NODE_ENV: copied.NODE_ENV });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CLICKHOUSE_REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it('.env.example처럼 빈 값(KEY=)이면 기본값을 쓴다', () => {
    const env = validateEnv({ ...VALID, PRECOMPUTED_DIR: '', CACHE_TTL_MS: ' ' });
    expect(env.PRECOMPUTED_DIR).toBe(DEFAULT_PRECOMPUTED_DIR);
    expect(env.CACHE_TTL_MS).toBe(3_600_000);
  });

  it('미리 계산 폴더와 캐시 시간을 바꿀 수 있다', () => {
    const env = validateEnv({
      ...VALID,
      PRECOMPUTED_DIR: '/opt/precomputed',
      CACHE_TTL_MS: '60000',
    });
    expect(env.PRECOMPUTED_DIR).toBe('/opt/precomputed');
    expect(env.CACHE_TTL_MS).toBe(60_000);
  });

  it('캐시 시간이 숫자가 아니면 거부한다', () => {
    expect(errorOf({ ...VALID, CACHE_TTL_MS: 'soon' })).toContain('CACHE_TTL_MS(형식 오류)');
  });

  it('숫자 키는 문자열을 숫자로 바꾼다', () => {
    const env = validateEnv({ ...VALID, PORT: '4000', CLICKHOUSE_REQUEST_TIMEOUT_MS: '500' });
    expect(env.PORT).toBe(4000);
    expect(env.CLICKHOUSE_REQUEST_TIMEOUT_MS).toBe(500);
  });

  it('https URL도 받는다', () => {
    expect(validateEnv({ ...VALID, CLICKHOUSE_URL: 'https://db.example.test:8443' })).toBeTruthy();
  });

  it('없는 키는 이름과 "없음"만 알려 준다', () => {
    const message = errorOf({ ...VALID, CLICKHOUSE_PASSWORD: undefined, CLICKHOUSE_DB: '' });
    expect(message).toContain('CLICKHOUSE_PASSWORD(없음)');
    expect(message).toContain('CLICKHOUSE_DB(없음)');
  });

  it('형식이 틀린 키를 알려 주되 값은 출력하지 않는다', () => {
    const badUrl = 'ftp://reader:p4ss-w0rd-never-printed@db.example.test';
    const message = errorOf({ ...VALID, CLICKHOUSE_URL: badUrl, NODE_ENV: 'staging' });
    expect(message).toContain('CLICKHOUSE_URL(형식 오류)');
    expect(message).toContain('NODE_ENV(형식 오류)');
    expect(message).not.toContain('p4ss-w0rd-never-printed');
    expect(message).not.toContain('db.example.test');
    expect(message).not.toContain('staging');
  });

  it('API_KEYS는 쉼표로 나눠 두 개까지 받는다', () => {
    const env = validateEnv({ ...VALID, API_KEYS: ` ${KEY_A} , ${KEY_B} ` });
    expect(env.API_KEYS).toEqual([KEY_A, KEY_B]);
    expect(validateEnv(VALID).API_KEYS).toEqual([]);
  });

  it('API_KEYS가 세 개 이상이거나 너무 짧으면 거부하고 값은 출력하지 않는다', () => {
    const tooMany = errorOf({ ...VALID, API_KEYS: [KEY_A, KEY_B, `${KEY_A}c`].join(',') });
    const tooShort = errorOf({ ...VALID, API_KEYS: 'short-key' });
    expect(tooMany).toContain('API_KEYS(형식 오류)');
    expect(tooShort).toContain('API_KEYS(형식 오류)');
    expect(tooMany).not.toContain(KEY_A);
    expect(tooShort).not.toContain('short-key');
  });

  it('production에서는 API_KEYS와 REVALIDATE_TOKEN이 필수다', () => {
    const message = errorOf({
      ...VALID,
      NODE_ENV: 'production',
      API_KEYS: '',
      REVALIDATE_TOKEN: '',
    });
    expect(message).toContain('API_KEYS(없음)');
    expect(message).toContain('REVALIDATE_TOKEN(없음)');

    const env = validateEnv({
      ...VALID,
      NODE_ENV: 'production',
      API_KEYS: HEX_KEY,
      REVALIDATE_TOKEN: HEX_TOKEN,
    });
    expect(env.API_KEYS).toEqual([HEX_KEY]);
    expect(env.REVALIDATE_TOKEN).toBe(HEX_TOKEN);
  });

  it('production에서는 openssl rand -hex 32 형태(64자 소문자 hex)만 받는다', () => {
    // KEY_A/KEY_B are long enough for development but not hex: e.g. a test key from this repo.
    const message = errorOf({
      ...VALID,
      NODE_ENV: 'production',
      API_KEYS: `${HEX_KEY},${KEY_B}`,
      REVALIDATE_TOKEN: HEX_TOKEN.toUpperCase(),
    });
    expect(message).toContain('API_KEYS(형식 오류');
    expect(message).toContain('REVALIDATE_TOKEN(형식 오류');
    expect(message).not.toContain(KEY_B);
    expect(message).not.toContain(HEX_TOKEN.toUpperCase());
  });

  it('REVALIDATE_TOKEN이 API 키와 같으면 거부한다', () => {
    expect(errorOf({ ...VALID, API_KEYS: `${KEY_A},${KEY_B}`, REVALIDATE_TOKEN: KEY_B })).toContain(
      'REVALIDATE_TOKEN(API_KEYS와 같음)',
    );
  });

  it('공백만 있는 필수 키는 "없음"으로 알린다', () => {
    expect(errorOf({ ...VALID, CLICKHOUSE_PASSWORD: '   ' })).toContain(
      'CLICKHOUSE_PASSWORD(없음)',
    );
  });

  it('다른 키가 틀려도 production 필수 키 문제를 한 번에 알린다', () => {
    const message = errorOf({ ...VALID, NODE_ENV: 'production', CLICKHOUSE_URL: 'not a url' });
    expect(message).toContain('CLICKHOUSE_URL(형식 오류)');
    expect(message).toContain('API_KEYS(없음)');
    expect(message).toContain('REVALIDATE_TOKEN(없음)');
  });

  it('REVALIDATE_TOKEN은 개발에서 비워 둘 수 있고, 짧으면 거부하며 값은 출력하지 않는다', () => {
    expect(validateEnv({ ...VALID, REVALIDATE_TOKEN: '' }).REVALIDATE_TOKEN).toBeUndefined();
    const message = errorOf({ ...VALID, REVALIDATE_TOKEN: 'short-token' });
    expect(message).toContain('REVALIDATE_TOKEN(형식 오류)');
    expect(message).not.toContain('short-token');
  });

  it('URL에 계정이 들어 있으면 거부한다', () => {
    const message = errorOf({
      ...VALID,
      CLICKHOUSE_URL: 'http://reader:secret@db.example.test:8123',
    });
    expect(message).toContain('CLICKHOUSE_URL(형식 오류)');
    expect(message).not.toContain('secret');
  });
});
