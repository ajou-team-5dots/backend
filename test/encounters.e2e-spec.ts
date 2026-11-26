import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ClickHouseService } from '../src/clickhouse/clickhouse.service.js';

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
      .expect(200)
      .expect({ monster: 'small_zombie', encounters: 4429 });

    expect(query.mock.lastCall?.[1]).toEqual({
      monster: 'small_zombie',
      heavy: 'include',
      allPeriod: 0,
    });
  });

  it('모르는 몬스터는 404', async () => {
    await request(app.getHttpServer()).get('/encounters/count?monster=nobody').expect(404);
  });

  it.each([
    ['monster 없음', '/encounters/count'],
    ['monster 형식 오류', "/encounters/count?monster=x'%20OR%201=1"],
    ['heavy 값 오류', '/encounters/count?monster=small_zombie&heavy=maybe'],
  ])('%s → 400, DB를 부르지 않는다', async (_name, url) => {
    await request(app.getHttpServer()).get(url).expect(400);
    expect(query).not.toHaveBeenCalled();
  });
});
