import { validateEnv } from './env.schema.js';

const VALID = {
  CLICKHOUSE_URL: 'http://db.example.test:8123',
  CLICKHOUSE_USER: 'reader',
  CLICKHOUSE_PASSWORD: 'p4ss-w0rd-never-printed',
  CLICKHOUSE_DB: 'default',
};

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
    expect(validateEnv(VALID)).toEqual({
      ...VALID,
      NODE_ENV: 'development',
      PORT: 3000,
      CLICKHOUSE_REQUEST_TIMEOUT_MS: 10_000,
    });
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

  it('URL에 계정이 들어 있으면 거부한다', () => {
    const message = errorOf({
      ...VALID,
      CLICKHOUSE_URL: 'http://reader:secret@db.example.test:8123',
    });
    expect(message).toContain('CLICKHOUSE_URL(형식 오류)');
    expect(message).not.toContain('secret');
  });
});
