import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureApp } from '../src/app.setup.js';
import { ClickHouseService } from '../src/clickhouse/clickhouse.service.js';
import { API_KEY_HEADER } from '../src/security/api-key.guard.js';

import { TEST_API_KEY } from './test-env.js';

const LIMIT = 3;
// ConfigModule reads process.env when AppModule is imported, so lower the limit first.
// Each test file runs in its own module graph, so this does not leak into other files.
vi.stubEnv('RATE_LIMIT_PER_MINUTE', String(LIMIT));
const { AppModule } = await import('../src/app.module.js');

// No database: checks the global guards (API key, rate limit) with a stubbed ClickHouseService.
describe('API 키와 요청 제한 (e2e)', () => {
  let app: NestExpressApplication;

  // A fresh app per test: the rate-limit counts live in the app's memory.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClickHouseService)
      .useValue({ isReachable: vi.fn().mockResolvedValue(true), onApplicationShutdown: vi.fn() })
      .compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('키가 없으면 401', async () => {
    await request(app.getHttpServer()).get('/health/db').expect(401);
  });

  it('틀린 키는 401이고, 키가 없을 때와 같은 문구다', async () => {
    const missing = await request(app.getHttpServer()).get('/health/db').expect(401);
    const wrong = await request(app.getHttpServer())
      .get('/health/db')
      .set(API_KEY_HEADER, `${TEST_API_KEY}x`)
      .expect(401);
    expect(wrong.body).toEqual(missing.body);
  });

  it('맞는 키는 200', async () => {
    await request(app.getHttpServer())
      .get('/health/db')
      .set(API_KEY_HEADER, TEST_API_KEY)
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/health는 키 없이 200', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it(`같은 IP에서 1분에 ${LIMIT}번을 넘으면 429 (틀린 키 요청도 센다)`, async () => {
    const server = app.getHttpServer();
    await request(server).get('/health/db').set(API_KEY_HEADER, 'wrong').expect(401);
    await request(server).get('/health/db').set(API_KEY_HEADER, TEST_API_KEY).expect(200);
    await request(server).get('/health').expect(200);

    await request(server).get('/health/db').set(API_KEY_HEADER, TEST_API_KEY).expect(429);
  });
});
