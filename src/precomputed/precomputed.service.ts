import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable } from '@nestjs/common';
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
  private readonly dir: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly cache: QueryCacheService,
  ) {
    this.dir = path.resolve(config.get('PRECOMPUTED_DIR', { infer: true }));
  }

  /** One precomputed JSON file, parsed and cached. The caller states its shape with T. */
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
        throw new Error(`미리 계산 파일을 읽지 못했습니다: ${file} (${codeOf(error)})`);
      }
    });
  }

  /** meta.json: batch time and data range. */
  readMeta(): Promise<MetaFile> {
    return this.read<MetaFile>('meta');
  }

  /** Monster patches only (H2 uses kind = 'monster'), oldest first. */
  async readMonsterPatches(): Promise<MonsterPatch[]> {
    const patches = await this.read<MonsterPatch[]>('patches');
    return patches
      .filter((patch) => patch.kind === 'monster')
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  }
}
