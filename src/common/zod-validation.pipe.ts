import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates external input (query, params, body) against a zod schema.
 * The 400 response names the bad fields only, never the received values.
 */
@Injectable()
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
      throw new BadRequestException(`잘못된 입력: ${fields.join(', ')}`);
    }
    return result.data;
  }
}
