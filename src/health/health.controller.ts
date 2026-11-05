import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { ClickHouseService } from '../clickhouse/clickhouse.service.js';

export interface HealthStatus {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(private readonly clickHouse: ClickHouseService) {}

  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }

  /** SELECT 1 against ClickHouse. 503 when it cannot be reached. */
  @Get('db')
  async checkDb(): Promise<HealthStatus> {
    if (!(await this.clickHouse.isReachable())) {
      throw new ServiceUnavailableException('데이터베이스를 사용할 수 없습니다.');
    }
    return { status: 'ok' };
  }
}
