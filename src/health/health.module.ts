import { Module } from '@nestjs/common';

import { ClickHouseModule } from '../clickhouse/clickhouse.module.js';

import { HealthController } from './health.controller.js';

@Module({
  imports: [ClickHouseModule],
  controllers: [HealthController],
})
export class HealthModule {}
