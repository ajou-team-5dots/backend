import type { ClickHouseClient } from '@clickhouse/client';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';

import { CLICKHOUSE_CLIENT } from './clickhouse.constants.js';

export type QueryParams = Record<string, unknown>;

/**
 * Describes a failure without its message. Driver messages can carry the server address,
 * and DB messages can quote the query, so only the error class and code are logged.
 */
const describeError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return 'UnknownError';
  }
  const { code, type } = error as Error & { code?: unknown; type?: unknown };
  return [error.name, code, type].filter((part) => typeof part === 'string' && part).join(' ');
};

@Injectable()
export class ClickHouseService implements OnApplicationShutdown {
  private readonly logger = new Logger(ClickHouseService.name);

  constructor(@Inject(CLICKHOUSE_CLIENT) private readonly client: ClickHouseClient) {}

  /**
   * Runs a read query. Bind every value with {name:Type} placeholders and `params`;
   * never build SQL by string concatenation.
   */
  async query<T>(sql: string, params: QueryParams = {}): Promise<T[]> {
    try {
      const result = await this.client.query({
        query: sql,
        query_params: params,
        format: 'JSONEachRow',
      });
      return await result.json<T>();
    } catch (error) {
      this.logger.error(`ClickHouse 조회 실패: ${describeError(error)}`);
      throw new ServiceUnavailableException('데이터베이스를 사용할 수 없습니다.');
    }
  }

  /** `SELECT 1` round trip. False instead of throwing, for health checks. */
  async isReachable(): Promise<boolean> {
    try {
      const [row] = await this.query<{ ok: number }>('SELECT 1 AS ok');
      return row?.ok === 1;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
