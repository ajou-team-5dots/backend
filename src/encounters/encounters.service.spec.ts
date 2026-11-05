import { Test } from '@nestjs/testing';

import { ClickHouseService } from '../clickhouse/clickhouse.service.js';

import { EncountersService } from './encounters.service.js';

describe('EncountersService', () => {
  it('값을 매개변수로 바인딩하고 교전 수를 돌려준다', async () => {
    const query = vi.fn().mockResolvedValue([{ encounters: 4429 }]);
    const moduleRef = await Test.createTestingModule({
      providers: [EncountersService, { provide: ClickHouseService, useValue: { query } }],
    }).compile();
    const service = moduleRef.get(EncountersService);

    const result = await service.countByMonster({
      monster: 'small_zombie',
      heavy: 'include',
      period: 'current',
    });

    expect(result).toEqual({ monster: 'small_zombie', encounters: 4429 });
    const [sql, params] = query.mock.calls[0] as [string, Record<string, unknown>];
    expect(sql).toContain('monster_id = {monster:String}');
    expect(sql).not.toContain('small_zombie');
    expect(params).toEqual({ monster: 'small_zombie', heavy: 'include', allPeriod: 0 });
  });

  it('행이 없으면 0을 돌려준다', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EncountersService,
        { provide: ClickHouseService, useValue: { query: vi.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    const result = await moduleRef
      .get(EncountersService)
      .countByMonster({ monster: 'nobody', heavy: 'exclude', period: 'all' });

    expect(result).toEqual({ monster: 'nobody', encounters: 0 });
  });
});
