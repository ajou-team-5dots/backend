import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { QueryCacheService } from '../cache/query-cache.service.js';
import type { Env } from '../config/env.schema.js';

import type { MetaFile, MonsterPatch } from './precomputed.types.js';

// Names become file paths, so only plain names are allowed (no "../").
const NAME = /^[a-z0-9][a-z0-9_-]*$/;

/** Error code (ENOENT, SyntaxError, ...) without the message, which carries the full path. */
const codeOf = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return 'UnknownError';
  }
  const { code } = error as Error & { code?: unknown };
  return typeof code === 'string' ? code : error.name;
};

/**
 * Values SQL alone cannot produce (H2 same-condition ratio, risk vs expected, pentagon) are
 * computed in Python after each load and written as `<name>.json` into PRECOMPUTED_DIR.
 * Moved from front-demo src/server/data/precomputed.ts (local folder only; S3 comes later).
 */
@Injectable()
export class PrecomputedService {
  private readonly logger = new Logger(PrecomputedService.name);

  private readonly dir: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly cache: QueryCacheService,
  ) {
    this.dir = path.resolve(config.get('PRECOMPUTED_DIR', { infer: true }));
  }

  /**
   * One precomputed JSON file, parsed and cached (deep-frozen: copy before changing it). The caller
   * states its shape with T. A missing or broken file is a 503 with a fixed message, like a DB
   * failure; the log names the file and error code only, never the folder.
   */
  async read<T>(name: string): Promise<T> {
    if (!NAME.test(name)) {
      throw new Error(`잘못된 미리 계산 파일 이름입니다: ${name} (소문자, 숫자, _, -만)`);
    }
    return this.cache.wrap(['precomputed', name], async () => {
      const file = `${name}.json`;
      try {
        // Safe: our own batch output, typed by the caller (no runtime validation by convention).
        return JSON.parse(await readFile(path.join(this.dir, file), 'utf8')) as T;
      } catch (error) {
        this.logger.error(`미리 계산 파일을 읽지 못했습니다: ${file} (${codeOf(error)})`);
        throw new ServiceUnavailableException('미리 계산 데이터를 사용할 수 없습니다.');
      }
    });
  }

  /** meta.json: batch time and data range. */
  readMeta(): Promise<MetaFile> {
    return this.read<MetaFile>('meta');
  }

  /**
   * Monster patches only (H2 uses kind = 'monster'), oldest first. A patch whose `ts` does not
   * parse is left out (and counted in the log): one NaN in the comparator makes the whole sort
   * order unpredictable.
   */
  async readMonsterPatches(): Promise<MonsterPatch[]> {
    const patches = await this.read<MonsterPatch[]>('patches');
    const monster = patches
      .filter((patch) => patch.kind === 'monster')
      .map((patch) => ({ patch, time: Date.parse(patch.ts) }));
    const dated = monster.filter(({ time }) => !Number.isNaN(time));
    if (dated.length < monster.length) {
      this.logger.warn(
        `patches.json: 시각을 읽지 못한 몬스터 패치 ${monster.length - dated.length}개 제외`,
      );
    }
    return dated.sort((a, b) => a.time - b.time).map(({ patch }) => patch);
  }
}
