import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { ClickHouseService } from '../src/clickhouse/clickhouse.service.js';

// No database: ClickHouseService is replaced, so this runs in `pnpm check` and CI.
describe('health (e2e)', () => {
  let app: NestExpressApplication;
  const isReachable = vi.fn<() => Promise<boolean>>();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClickHouseService)
      .useValue({ isReachable, onApplicationShutdown: vi.fn() })
      .compile();

    app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 { status: ok }', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });

  it('응답에 X-Powered-By 헤더가 없다', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('GET /health/db → DB에 닿으면 200', async () => {
    isReachable.mockResolvedValueOnce(true);
    await request(app.getHttpServer()).get('/health/db').expect(200).expect({ status: 'ok' });
  });

  it('GET /health/db → DB에 못 닿으면 503', async () => {
    isReachable.mockResolvedValueOnce(false);
    await request(app.getHttpServer()).get('/health/db').expect(503);
  });
});
