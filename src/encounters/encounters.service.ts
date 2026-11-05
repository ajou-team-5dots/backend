import { Injectable } from '@nestjs/common';

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
  constructor(private readonly clickHouse: ClickHouseService) {}

  async countByMonster({
    monster,
    heavy,
    period,
  }: EncounterCountQueryDto): Promise<EncounterCount> {
    // count() is UInt64, which JSON returns as a string; toUInt32 keeps it a number.
    const [row] = await this.clickHouse.query<{ encounters: number }>(
      `SELECT toUInt32(count()) AS encounters
       FROM encounters
       WHERE monster_id = {monster:String} AND ${SCOPE_FILTER}`,
      { monster, heavy, allPeriod: period === 'all' ? 1 : 0 },
    );
    return { monster, encounters: row?.encounters ?? 0 };
  }
}
