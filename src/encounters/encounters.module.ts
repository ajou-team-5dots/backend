import { Module } from '@nestjs/common';

import { ClickHouseModule } from '../clickhouse/clickhouse.module.js';

import { EncountersController } from './encounters.controller.js';
import { EncountersService } from './encounters.service.js';

@Module({
  imports: [ClickHouseModule],
  controllers: [EncountersController],
  providers: [EncountersService],
})
export class EncountersModule {}
