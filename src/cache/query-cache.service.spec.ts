import type { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema.js';

import { MAX_CACHE_ENTRIES, QueryCacheService } from './query-cache.service.js';

const TTL_MS = 60_000;

const makeCache = (): QueryCacheService => {
  // Only CACHE_TTL_MS is read; a stub keeps the test free of env validation.
  const config = { get: () => TTL_MS } as unknown as ConfigService<Env, true>;
  return new QueryCacheService(config);
};

describe('QueryCacheService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('같은 키는 한 번만 불러오고 결과를 기억한다', async () => {
    const cache = makeCache();
    const load = vi.fn().mockResolvedValue([{ n: 1 }]);

    expect(await cache.wrap(['counts', 'include'], load)).toEqual([{ n: 1 }]);
    expect(await cache.wrap(['counts', 'include'], load)).toEqual([{ n: 1 }]);
    expect(load).toHaveBeenCalledOnce();
  });

  it('불러오는 중에 같은 키가 또 오면 같은 결과를 기다린다', async () => {
    const cache = makeCache();
    const load = vi.fn().mockResolvedValue('rows');

    const results = await Promise.all([
      cache.wrap(['counts'], load),
      cache.wrap(['counts'], load),
      cache.wrap(['counts'], load),
    ]);

    expect(results).toEqual(['rows', 'rows', 'rows']);
    expect(load).toHaveBeenCalledOnce();
  });

  it('키 값이 다르면 따로 불러온다', async () => {
    const cache = makeCache();
    const load = vi.fn().mockResolvedValue('rows');

    await cache.wrap(['counts', 'include', 'current'], load);
    await cache.wrap(['counts', 'exclude', 'current'], load);
    await cache.wrap(['counts', 'include', 'all'], load);

    expect(load).toHaveBeenCalledTimes(3);
  });

  it('CACHE_TTL_MS가 지나면 다시 불러온다', async () => {
    vi.useFakeTimers();
    const cache = makeCache();
    const load = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');

    expect(await cache.wrap(['meta'], load)).toBe('old');
    vi.advanceTimersByTime(TTL_MS - 1);
    expect(await cache.wrap(['meta'], load)).toBe('old');
    vi.advanceTimersByTime(1);
    expect(await cache.wrap(['meta'], load)).toBe('new');
  });

  it('실패는 기억하지 않는다', async () => {
    const cache = makeCache();
    const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('rows');

    await expect(cache.wrap(['counts'], load)).rejects.toThrow('down');
    expect(await cache.wrap(['counts'], load)).toBe('rows');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('load가 바로 던져도 거부된 Promise로 돌려준다', async () => {
    const cache = makeCache();
    const load = (): Promise<never> => {
      throw new Error('sync');
    };

    await expect(cache.wrap(['counts'], load)).rejects.toThrow('sync');
    expect(cache.size).toBe(0);
  });

  it('clear는 모두 비우고 비운 개수를 돌려준다', async () => {
    const cache = makeCache();
    const load = vi.fn().mockResolvedValue('rows');
    await cache.wrap(['a'], load);
    await cache.wrap(['b'], load);

    expect(cache.clear()).toBe(2);
    expect(cache.size).toBe(0);
    await cache.wrap(['a'], load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('clear 전에 시작한 조회가 실패해도 그 뒤에 새로 기억한 값은 지우지 않는다', async () => {
    const cache = makeCache();
    let fail: (error: Error) => void = () => undefined;
    const pending = cache.wrap(
      ['counts'],
      () =>
        new Promise<string>((_resolve, reject) => {
          fail = reject;
        }),
    );
    cache.clear();
    expect(await cache.wrap(['counts'], () => Promise.resolve('fresh'))).toBe('fresh');

    fail(new Error('late'));
    await expect(pending).rejects.toThrow('late');
    expect(await cache.wrap(['counts'], () => Promise.resolve('reloaded'))).toBe('fresh');
  });

  it(`${MAX_CACHE_ENTRIES}개를 넘으면 가장 오래된 것부터 버린다`, async () => {
    const cache = makeCache();
    const keys = Array.from({ length: MAX_CACHE_ENTRIES + 1 }, (_, i) => [`k${i}`]);
    await Promise.all(keys.map((key) => cache.wrap(key, () => Promise.resolve(key[0]))));

    expect(cache.size).toBe(MAX_CACHE_ENTRIES);
    const load = vi.fn().mockResolvedValue('again');
    expect(await cache.wrap(['k0'], load)).toBe('again');
    expect(await cache.wrap([`k${MAX_CACHE_ENTRIES}`], load)).toBe(`k${MAX_CACHE_ENTRIES}`);
    expect(load).toHaveBeenCalledOnce();
  });
});
