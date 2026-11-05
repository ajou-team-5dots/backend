import { Controller, Get, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../common/zod-validation.pipe.js';

import {
  type EncounterCountQueryDto,
  encounterCountQuerySchema,
} from './dto/encounter-count-query.dto.js';
import { type EncounterCount, EncountersService } from './encounters.service.js';

@Controller('encounters')
export class EncountersController {
  constructor(private readonly encountersService: EncountersService) {}

  /** GET /encounters/count?monster=small_zombie&heavy=include&period=current */
  @Get('count')
  count(
    @Query(new ZodValidationPipe(encounterCountQuerySchema)) query: EncounterCountQueryDto,
  ): Promise<EncounterCount> {
    return this.encountersService.countByMonster(query);
  }
}
