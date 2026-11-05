import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';

// Needs a real ClickHouse (CLICKHOUSE_* in .env). Run with `pnpm test:db`; not part of
// `pnpm check` or CI. The DB is shared, so keep this to a couple of light queries.
describe('ClickHouse (실제 DB)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/db → 200', async () => {
    await request(app.getHttpServer()).get('/health/db').expect(200).expect({ status: 'ok' });
  });

  it('small_zombie 교전 4,429 (고활동 포함, 현재 수치: front와 같은 조건)', async () => {
    await request(app.getHttpServer())
      .get('/encounters/count?monster=small_zombie')
      .expect(200)
      .expect({ monster: 'small_zombie', encounters: 4429 });
  });
});
