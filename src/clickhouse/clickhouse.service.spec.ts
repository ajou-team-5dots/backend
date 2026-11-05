import type { ClickHouseClient } from '@clickhouse/client';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { CLICKHOUSE_CLIENT } from './clickhouse.constants.js';
import { ClickHouseService } from './clickhouse.service.js';

const SECRET_URL = 'http://10.0.0.5:8123';

const setup = async (query: ReturnType<typeof vi.fn>) => {
  const close = vi.fn().mockResolvedValue(undefined);
  const client = { query, close } as unknown as ClickHouseClient;
  const moduleRef = await Test.createTestingModule({
    providers: [ClickHouseService, { provide: CLICKHOUSE_CLIENT, useValue: client }],
  }).compile();
  return { service: moduleRef.get(ClickHouseService), close };
};

const resultOf = (rows: unknown[]) => ({ json: vi.fn().mockResolvedValue(rows) });

describe('ClickHouseService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('값을 query_params로 넘기고 clickhouse_settings는 보내지 않는다', async () => {
    const query = vi.fn().mockResolvedValue(resultOf([{ n: 1 }]));
    const { service } = await setup(query);

    const rows = await service.query('SELECT {m:String} AS m', { m: 'small_zombie' });

    expect(rows).toEqual([{ n: 1 }]);
    expect(query).toHaveBeenCalledWith({
      query: 'SELECT {m:String} AS m',
      query_params: { m: 'small_zombie' },
      format: 'JSONEachRow',
    });
    expect(query.mock.calls[0]?.[0]).not.toHaveProperty('clickhouse_settings');
  });

  it('실패하면 503을 던지고, 로그에 오류 원문과 주소를 남기지 않는다', async () => {
    const failure = Object.assign(new Error(`connect ECONNREFUSED ${SECRET_URL}`), {
      code: 'ECONNREFUSED',
    });
    const { service } = await setup(vi.fn().mockRejectedValue(failure));
    const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const error: unknown = await service.query('SELECT 1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as Error).message).not.toContain('ECONNREFUSED');
    const logged = logError.mock.calls.flat().join(' ');
    expect(logged).toContain('ECONNREFUSED');
    expect(logged).not.toContain('10.0.0.5');
  });

  it('isReachable은 SELECT 1 결과로 true/false를 돌려준다', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const ok = await setup(vi.fn().mockResolvedValue(resultOf([{ ok: 1 }])));
    const down = await setup(vi.fn().mockRejectedValue(new Error('down')));

    expect(await ok.service.isReachable()).toBe(true);
    expect(await down.service.isReachable()).toBe(false);
  });

  it('앱 종료 때 클라이언트를 닫는다', async () => {
    const { service, close } = await setup(vi.fn());
    await service.onApplicationShutdown();
    expect(close).toHaveBeenCalledOnce();
  });
});
