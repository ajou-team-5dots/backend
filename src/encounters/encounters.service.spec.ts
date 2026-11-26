import type { ConfigService } from '@nestjs/config';

import { QueryCacheService } from '../cache/query-cache.service.js';
import type { ClickHouseService } from '../clickhouse/clickhouse.service.js';
import type { Env } from '../config/env.schema.js';

import { EncountersService, KNOWN_MONSTERS_REFRESH_MS } from './encounters.service.js';

const KNOWN = [{ monster: 'small_zombie' }, { monster: 'blink_imp' }];
const CONFIG: Partial<Env> = { CACHE_TTL_MS: 3_600_000, CLICKHOUSE_REQUEST_TIMEOUT_MS: 10_000 };

/** Answers the known-monster query with KNOWN and the count query with `count`. */
const setup = (count: { encounters: number }[] = [{ encounters: 4429 }]) => {
  let known = KNOWN;
  const query = vi.fn((sql: string) =>
    Promise.resolve(sql.includes('DISTINCT monster_id') ? known : count),
  );
  /** Simulates a data load that adds monsters to the table. */
  const addMonster = (monster: string) => {
    known = [...known, { monster }];
  };
  const config = {
    get: (key: keyof Env) => CONFIG[key],
  } as unknown as ConfigService<Env, true>;
  const cache = new QueryCacheService(config);
  const service = new EncountersService({ query } as unknown as ClickHouseService, cache);
  const countCalls = () =>
    query.mock.calls.filter(([sql]) => sql.includes('count()')) as unknown as [
      string,
      Record<string, unknown>,
    ][];
  const listCalls = () => query.mock.calls.filter(([sql]) => sql.includes('DISTINCT')).length;
  return { service, query, cache, countCalls, listCalls, addMonster };
};

describe('EncountersService', () => {
  it('값을 매개변수로 바인딩하고 교전 수를 돌려준다', async () => {
    const { service, countCalls } = setup();

    const result = await service.countByMonster({
      monster: 'small_zombie',
      heavy: 'include',
      period: 'current',
    });

    expect(result).toEqual({ monster: 'small_zombie', encounters: 4429, known: true });
    const [[sql, params]] = countCalls();
    expect(sql).toContain('monster_id = {monster:String}');
    expect(sql).not.toContain('small_zombie');
    expect(params).toEqual({ monster: 'small_zombie', heavy: 'include', allPeriod: 0 });
  });

  it('행이 없으면 0을 돌려준다', async () => {
    const { service } = setup([]);

    const result = await service.countByMonster({
      monster: 'blink_imp',
      heavy: 'exclude',
      period: 'all',
    });

    expect(result).toEqual({ monster: 'blink_imp', encounters: 0, known: true });
  });

  it('같은 조건은 캐시에서 돌려주고, 조건이 다르면 다시 조회한다', async () => {
    const { service, query, countCalls } = setup();
    const dto = { monster: 'small_zombie', heavy: 'include', period: 'current' } as const;

    await service.countByMonster(dto);
    await service.countByMonster(dto);
    await service.countByMonster({ ...dto, period: 'all' });

    expect(countCalls()).toHaveLength(2);
    // The monster list is fetched once and reused.
    expect(query.mock.calls.filter(([sql]) => sql.includes('DISTINCT'))).toHaveLength(1);
  });

  it('모르는 몬스터는 0이고, 교전 수를 조회하지도 캐시하지도 않는다', async () => {
    const { service, cache, countCalls } = setup();
    await service.countByMonster({ monster: 'small_zombie', heavy: 'include', period: 'current' });
    const sizeBefore = cache.size;

    const result = await service.countByMonster({
      monster: 'nobody',
      heavy: 'include',
      period: 'current',
    });

    expect(result).toEqual({ monster: 'nobody', encounters: 0, known: false });
    expect(countCalls()).toHaveLength(1);
    expect(cache.size).toBe(sizeBefore);
  });

  describe('모르는 ID가 오면 몬스터 목록을 다시 읽는다', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it(`${KNOWN_MONSTERS_REFRESH_MS}ms 안에는 DB를 다시 부르지 않는다`, async () => {
      vi.useFakeTimers();
      const { service, query } = setup();
      const dto = { monster: 'nobody', heavy: 'include', period: 'current' } as const;
      await service.countByMonster(dto);
      query.mockClear();

      await vi.advanceTimersByTimeAsync(KNOWN_MONSTERS_REFRESH_MS - 1);
      await service.countByMonster(dto);
      await service.countByMonster({ ...dto, monster: 'another' });

      expect(query).not.toHaveBeenCalled();
    });

    it('간격이 지나면 다시 읽어, 새로 적재된 몬스터는 known: true로 센다', async () => {
      vi.useFakeTimers();
      const { service, listCalls, addMonster } = setup();
      const dto = { monster: 'new_boss', heavy: 'include', period: 'current' } as const;
      expect(await service.countByMonster(dto)).toEqual({
        monster: 'new_boss',
        encounters: 0,
        known: false,
      });

      addMonster('new_boss');
      await vi.advanceTimersByTimeAsync(KNOWN_MONSTERS_REFRESH_MS);

      expect(await service.countByMonster(dto)).toEqual({
        monster: 'new_boss',
        encounters: 4429,
        known: true,
      });
      expect(listCalls()).toBe(2);
    });
  });
});
