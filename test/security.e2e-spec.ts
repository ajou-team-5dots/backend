import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ClickHouseService } from '../src/clickhouse/clickhouse.service.js';
import { API_KEY_HEADER } from '../src/security/api-key.guard.js';

import { TEST_API_KEY } from './test-env.js';

// No database: checks the global API key guard with a stubbed ClickHouseService.
describe('API 키 (e2e)', () => {
  let app: NestExpressApplication;

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
});
