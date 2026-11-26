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

  /** The list re-read in flight, shared by every miss that arrives meanwhile. */
  private refreshing: Promise<readonly string[]> | undefined;

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

  /**
   * Looks the id up in the cached list. On a miss, re-reads the list if the minute is up, and only
   * a successful read replaces it: a failed refresh keeps the old list for every other request
   * (this one gets the 503). Misses during a refresh wait for it instead of starting their own.
   */
  private async isKnownMonster(monster: string): Promise<boolean> {
    if ((await this.knownMonsterIds()).includes(monster)) {
      return true;
    }
    if (this.refreshing === undefined) {
      if (Date.now() - this.knownLoadedAt < KNOWN_MONSTERS_REFRESH_MS) {
        return false;
      }
      // Recorded before the read starts, synchronously: concurrent misses see it at once.
      this.knownLoadedAt = Date.now();
      this.refreshing = this.readMonsterIds()
        .then((ids) => {
          this.cache.set(KNOWN_MONSTERS_KEY, ids);
          return ids;
        })
        .finally(() => {
          this.refreshing = undefined;
        });
    }
    return (await this.refreshing).includes(monster);
  }

  /** Every monster id in the encounters table (a few dozen), cached like any screen query. */
  private knownMonsterIds(): Promise<readonly string[]> {
    return this.cache.wrap(KNOWN_MONSTERS_KEY, () => {
      this.knownLoadedAt = Date.now();
      return this.readMonsterIds();
    });
  }

  private async readMonsterIds(): Promise<readonly string[]> {
    const rows = await this.clickHouse.query<{ monster: string }>(
      'SELECT DISTINCT monster_id AS monster FROM encounters',
    );
    return rows.map((row) => row.monster);
  }
}
