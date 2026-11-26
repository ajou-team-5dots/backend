import { Injectable } from '@nestjs/common';

import { QueryCacheService } from '../cache/query-cache.service.js';
import { ClickHouseService } from '../clickhouse/clickhouse.service.js';

import type { EncounterCountQueryDto } from './dto/encounter-count-query.dto.js';

export interface EncounterCount {
  monster: string;
  encounters: number;
}

// Same scope filter as front-demo SCOPE_FILTER (src/server/data/monster-counts.ts).
// Ops accounts (/su) are already removed when the encounters table is built.
const SCOPE_FILTER = `({allPeriod:UInt8} = 1 OR NOT pre_patch_entity)
  AND ({heavy:String} = 'include' OR NOT heavy_account)`;

@Injectable()
export class EncountersService {
  constructor(
    private readonly clickHouse: ClickHouseService,
    private readonly cache: QueryCacheService,
  ) {}

  /**
   * Cached per (monster, heavy, period). An id missing from the encounters table has 0 encounters
   * by definition, so it gets a constant 0 without a query or a cache slot: otherwise a few
   * thousand made-up ids could cost a query each and push every real result out of the cache.
   */
  async countByMonster({
    monster,
    heavy,
    period,
  }: EncounterCountQueryDto): Promise<EncounterCount> {
    const known = await this.knownMonsterIds();
    if (!known.includes(monster)) {
      return { monster, encounters: 0 };
    }
    return this.cache.wrap(['encounter-count', monster, heavy, period], async () => {
      // count() is UInt64, which JSON returns as a string; toUInt32 keeps it a number.
      const [row] = await this.clickHouse.query<{ encounters: number }>(
        `SELECT toUInt32(count()) AS encounters
         FROM encounters
         WHERE monster_id = {monster:String} AND ${SCOPE_FILTER}`,
        { monster, heavy, allPeriod: period === 'all' ? 1 : 0 },
      );
      return { monster, encounters: row?.encounters ?? 0 };
    });
  }

  /** Every monster id in the encounters table (a few dozen), cached like any screen query. */
  private knownMonsterIds(): Promise<readonly string[]> {
    return this.cache.wrap(['known-monster-ids'], async () => {
      const rows = await this.clickHouse.query<{ monster: string }>(
        'SELECT DISTINCT monster_id AS monster FROM encounters',
      );
      return rows.map((row) => row.monster);
    });
  }
}
