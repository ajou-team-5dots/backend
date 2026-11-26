import { Injectable } from '@nestjs/common';

import { QueryCacheService } from '../cache/query-cache.service.js';
import { ClickHouseService } from '../clickhouse/clickhouse.service.js';

import type { EncounterCountQueryDto } from './dto/encounter-count-query.dto.js';

export interface EncounterCount {
  monster: string;
  encounters: number;
  /** False when the id is not in the encounters table (encounters is then 0). */
  known: boolean;
}

/**
 * An unknown id makes the service re-read the monster list (a monster may have arrived with a new
 * load), but at most this often for the whole process: a flood of made-up ids costs one query a
 * minute, not one each.
 */
export const KNOWN_MONSTERS_REFRESH_MS = 60_000;

const KNOWN_MONSTERS_KEY = ['known-monster-ids'] as const;

// Same scope filter as front-demo SCOPE_FILTER (src/server/data/monster-counts.ts).
// Ops accounts (/su) are already removed when the encounters table is built.
const SCOPE_FILTER = `({allPeriod:UInt8} = 1 OR NOT pre_patch_entity)
  AND ({heavy:String} = 'include' OR NOT heavy_account)`;

@Injectable()
export class EncountersService {
  /** When the monster list was last (re)loaded; drives KNOWN_MONSTERS_REFRESH_MS. */
  private knownLoadedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly clickHouse: ClickHouseService,
    private readonly cache: QueryCacheService,
  ) {}

  /**
   * Cached per (monster, heavy, period). An id missing from the encounters table has 0 encounters
   * by definition, so it gets a constant 0 (`known: false`) without a count query or a cache
   * slot: otherwise a few thousand made-up ids could cost a query each and push every real result
   * out of the cache.
   */
  async countByMonster({
    monster,
    heavy,
    period,
  }: EncounterCountQueryDto): Promise<EncounterCount> {
    if (!(await this.isKnownMonster(monster))) {
      return { monster, encounters: 0, known: false };
    }
    return this.cache.wrap(['encounter-count', monster, heavy, period], async () => {
      // count() is UInt64, which JSON returns as a string; toUInt32 keeps it a number.
      const [row] = await this.clickHouse.query<{ encounters: number }>(
        `SELECT toUInt32(count()) AS encounters
         FROM encounters
         WHERE monster_id = {monster:String} AND ${SCOPE_FILTER}`,
        { monster, heavy, allPeriod: period === 'all' ? 1 : 0 },
      );
      return { monster, encounters: row?.encounters ?? 0, known: true };
    });
  }

  /** Looks the id up in the cached list; on a miss, re-reads the list if the minute is up. */
  private async isKnownMonster(monster: string): Promise<boolean> {
    if ((await this.knownMonsterIds()).includes(monster)) {
      return true;
    }
    if (Date.now() - this.knownLoadedAt < KNOWN_MONSTERS_REFRESH_MS) {
      return false;
    }
    this.cache.delete(KNOWN_MONSTERS_KEY);
    return (await this.knownMonsterIds()).includes(monster);
  }

  /** Every monster id in the encounters table (a few dozen), cached like any screen query. */
  private knownMonsterIds(): Promise<readonly string[]> {
    return this.cache.wrap(KNOWN_MONSTERS_KEY, async () => {
      // Set when the load starts, so concurrent misses do not all trigger their own reload.
      this.knownLoadedAt = Date.now();
      const rows = await this.clickHouse.query<{ monster: string }>(
        'SELECT DISTINCT monster_id AS monster FROM encounters',
      );
      return rows.map((row) => row.monster);
    });
  }
}
