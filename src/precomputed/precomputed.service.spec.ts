import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { QueryCacheService } from '../cache/query-cache.service.js';
import type { Env } from '../config/env.schema.js';

import { PrecomputedService } from './precomputed.service.js';
import type { HeavyResults, MonsterPatch, PentagonResult } from './precomputed.types.js';

const configWith = (values: Partial<Env>): ConfigService<Env, true> =>
  // Only PRECOMPUTED_DIR and CACHE_TTL_MS are read; a stub keeps env validation out of the test.
  ({
    get: (key: keyof Env) =>
      ({ CACHE_TTL_MS: 60_000, CLICKHOUSE_REQUEST_TIMEOUT_MS: 10_000, ...values })[key],
  }) as unknown as ConfigService<Env, true>;

const setup = (dir: string) => {
  const config = configWith({ PRECOMPUTED_DIR: dir });
  const cache = new QueryCacheService(config);
  return { service: new PrecomputedService(config, cache), cache };
};

describe('PrecomputedService', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'precomputed-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it('저장소 data/precomputed의 배치 결과를 읽는다', async () => {
    const { service } = setup('data/precomputed');

    const meta = await service.readMeta();
    const pentagon = await service.read<HeavyResults<PentagonResult>>('pentagon');

    expect(meta.dataFrom).toBe('2026-10-12');
    expect(meta.dataTo).toBe('2026-10-22');
    expect(pentagon.include.small_zombie?.axes.length).toBeGreaterThan(0);
  });

  it('같은 파일은 한 번만 읽고, 캐시를 비우면 다시 읽는다', async () => {
    const { service, cache } = setup(dir);
    await writeFile(path.join(dir, 'meta.json'), JSON.stringify({ dataFrom: '2026-10-12' }));
    expect((await service.readMeta()).dataFrom).toBe('2026-10-12');

    await writeFile(path.join(dir, 'meta.json'), JSON.stringify({ dataFrom: '2026-11-01' }));
    expect((await service.readMeta()).dataFrom).toBe('2026-10-12');

    cache.clear();
    expect((await service.readMeta()).dataFrom).toBe('2026-11-01');
  });

  it('몬스터 패치만 오래된 순으로 돌려준다', async () => {
    const patches: MonsterPatch[] = [
      { id: 'b', ts: '2026-10-18T10:00:00+09:00', kind: 'monster', label: 'B' },
      { id: 'item', ts: '2026-10-13T10:00:00+09:00', kind: 'item', label: 'item' },
      { id: 'a', ts: '2026-10-14T14:40:00+09:00', kind: 'monster', label: 'A' },
    ];
    await writeFile(path.join(dir, 'patches.json'), JSON.stringify(patches));
    const { service } = setup(dir);

    expect((await service.readMonsterPatches()).map((patch) => patch.id)).toEqual(['a', 'b']);
    // The cached file itself keeps its order: sorting works on a filtered copy.
    expect((await service.read<MonsterPatch[]>('patches')).map((patch) => patch.id)).toEqual([
      'b',
      'item',
      'a',
    ]);
  });

  it('경로가 될 수 있는 이름은 거부한다', async () => {
    const { service } = setup(dir);

    await expect(service.read('../meta')).rejects.toThrow('잘못된 미리 계산 파일 이름');
    await expect(service.read('Meta')).rejects.toThrow('잘못된 미리 계산 파일 이름');
  });

  it('읽지 못하면 고정 문구의 503을 던지고, 로그에는 파일 이름과 오류 코드만 남긴다', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service } = setup(dir);
    await writeFile(path.join(dir, 'broken.json'), '{ not json');

    const missing: unknown = await service.read('missing').catch((e: unknown) => e);
    const broken: unknown = await service.read('broken').catch((e: unknown) => e);

    expect(missing).toBeInstanceOf(ServiceUnavailableException);
    expect(broken).toBeInstanceOf(ServiceUnavailableException);
    expect((missing as Error).message).toBe('미리 계산 데이터를 사용할 수 없습니다.');
    const lines = logged.mock.calls.map(([line]) => String(line));
    expect(lines).toEqual([
      expect.stringContaining('missing.json (ENOENT)'),
      expect.stringContaining('broken.json (SyntaxError)'),
    ]);
    expect(lines.join('\n')).not.toContain(dir);
  });

  it('시각을 읽지 못한 패치는 빼고 정렬한다', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const patches: MonsterPatch[] = [
      { id: 'late', ts: '2026-10-18T10:00:00+09:00', kind: 'monster', label: 'late' },
      { id: 'bad', ts: 'not a date', kind: 'monster', label: 'bad' },
      { id: 'early', ts: '2026-10-14T14:40:00+09:00', kind: 'monster', label: 'early' },
    ];
    await writeFile(path.join(dir, 'patches.json'), JSON.stringify(patches));
    const { service } = setup(dir);

    expect((await service.readMonsterPatches()).map((patch) => patch.id)).toEqual([
      'early',
      'late',
    ]);
  });
});
