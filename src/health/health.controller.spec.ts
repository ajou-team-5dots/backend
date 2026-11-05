import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ClickHouseService } from '../clickhouse/clickhouse.service.js';

import { HealthController } from './health.controller.js';

const setup = async (reachable: boolean) => {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      {
        provide: ClickHouseService,
        useValue: { isReachable: vi.fn().mockResolvedValue(reachable) },
      },
    ],
  }).compile();
  return moduleRef.get(HealthController);
};

describe('HealthController', () => {
  it('상태 ok를 돌려준다', async () => {
    expect((await setup(true)).check()).toEqual({ status: 'ok' });
  });

  it('DB에 닿으면 ok, 아니면 503', async () => {
    await expect((await setup(true)).checkDb()).resolves.toEqual({ status: 'ok' });
    await expect((await setup(false)).checkDb()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
