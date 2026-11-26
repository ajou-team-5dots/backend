import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { QueryCacheService } from '../src/cache/query-cache.service.js';
import { ClickHouseService } from '../src/clickhouse/clickhouse.service.js';
import { API_KEY_HEADER } from '../src/security/api-key.guard.js';
import { REVALIDATE_TOKEN_HEADER } from '../src/security/revalidate-token.guard.js';

import { TEST_API_KEY, TEST_REVALIDATE_TOKEN } from './test-env.js';

const CLEAR = '/admin/cache/clear';

// No database: checks that only REVALIDATE_TOKEN can clear the cache.
describe('POST /admin/cache/clear (e2e)', () => {
  let app: NestExpressApplication;
  let cache: QueryCacheService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClickHouseService)
      .useValue({ onApplicationShutdown: vi.fn() })
      .compile();
    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
    await app.init();
    cache = app.get(QueryCacheService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    cache.clear();
    await cache.wrap(['a'], () => Promise.resolve(1));
    await cache.wrap(['b'], () => Promise.resolve(2));
  });

  it('토큰이 없으면 401이고 캐시는 그대로다', async () => {
    await request(app.getHttpServer()).post(CLEAR).expect(401);
    expect(cache.size).toBe(2);
  });

  it('틀린 토큰은 401', async () => {
    await request(app.getHttpServer())
      .post(CLEAR)
      .set(REVALIDATE_TOKEN_HEADER, `${TEST_REVALIDATE_TOKEN}x`)
      .expect(401);
    expect(cache.size).toBe(2);
  });

  it('API 키로는 비울 수 없다', async () => {
    await request(app.getHttpServer()).post(CLEAR).set(API_KEY_HEADER, TEST_API_KEY).expect(401);
    expect(cache.size).toBe(2);
  });

  it('맞는 토큰이면 API 키 없이도 200, 비운 항목 수를 돌려준다', async () => {
    await request(app.getHttpServer())
      .post(CLEAR)
      .set(REVALIDATE_TOKEN_HEADER, TEST_REVALIDATE_TOKEN)
      .expect(200)
      .expect({ cleared: 2 });
    expect(cache.size).toBe(0);
  });
});
