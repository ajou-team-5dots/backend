import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { ClickHouseService } from '../clickhouse/clickhouse.service.js';
import { Public } from '../security/public.decorator.js';

export interface HealthStatus {
  status: 'ok';
}

@Controller('health')
export class HealthController {
  constructor(private readonly clickHouse: ClickHouseService) {}

  /** Liveness only (Docker healthcheck, load balancer): no key needed, reveals nothing. */
  @Public()
  @Get()
  check(): HealthStatus {
    return { status: 'ok' };
  }

  /** SELECT 1 against ClickHouse. 503 when it cannot be reached. Needs the API key. */
  @Get('db')
  async checkDb(): Promise<HealthStatus> {
    if (!(await this.clickHouse.isReachable())) {
      throw new ServiceUnavailableException('데이터베이스를 사용할 수 없습니다.');
    }
    return { status: 'ok' };
  }
}
