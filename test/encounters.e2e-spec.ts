import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { QueryCacheService } from '../src/cache/query-cache.service.js';
import { API_KEY_HEADER } from '../src/security/api-key.guard.js';
import { ClickHouseService } from '../src/clickhouse/clickhouse.service.js';

import { TEST_API_KEY } from './test-env.js';

// No database: checks routing and query validation with a stubbed ClickHouseService.
describe('GET /encounters/count (e2e)', () => {
  let app: NestExpressApplication;
  const query = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClickHouseService)
      .useValue({ query, onApplicationShutdown: vi.fn() })
      .compile();

    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Each test starts cold: results cached by an earlier test would hide its DB calls.
    app.get(QueryCacheService).clear();
    query.mockReset();
    query.mockImplementation((sql: string) =>
      Promise.resolve(
        sql.includes('DISTINCT monster_id')
          ? [{ monster: 'small_zombie' }]
          : [{ encounters: 4429 }],
      ),
    );
  });

  it('기본값(include, current)으로 조회한다', async () => {
    await request(app.getHttpServer())
      .get('/encounters/count?monster=small_zombie')
      .set(API_KEY_HEADER, TEST_API_KEY)
      .expect(200)
      .expect({ monster: 'small_zombie', encounters: 4429 });

    expect(query.mock.lastCall?.[1]).toEqual({
      monster: 'small_zombie',
      heavy: 'include',
      allPeriod: 0,
    });
  });

  it('모르는 몬스터는 200, 0이고 DB도 캐시도 거치지 않는다', async () => {
    const server = app.getHttpServer();
    // Load the known-monster list first, then watch the unknown id alone.
    await request(server)
      .get('/encounters/count?monster=small_zombie')
      .set(API_KEY_HEADER, TEST_API_KEY);
    query.mockClear();
    const cache = app.get(QueryCacheService);
    const sizeBefore = cache.size;

    await request(server)
      .get('/encounters/count?monster=nobody')
      .set(API_KEY_HEADER, TEST_API_KEY)
      .expect(200)
      .expect({ monster: 'nobody', encounters: 0 });

    expect(query).not.toHaveBeenCalled();
    expect(cache.size).toBe(sizeBefore);
  });

  it.each([
    ['monster 없음', '/encounters/count'],
    ['monster 형식 오류', "/encounters/count?monster=x'%20OR%201=1"],
    ['heavy 값 오류', '/encounters/count?monster=small_zombie&heavy=maybe'],
  ])('%s → 400, DB를 부르지 않는다', async (_name, url) => {
    await request(app.getHttpServer()).get(url).set(API_KEY_HEADER, TEST_API_KEY).expect(400);
    expect(query).not.toHaveBeenCalled();
  });
});
