import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { QueryCacheModule } from './cache/query-cache.module.js';
import { validateEnv } from './config/env.schema.js';
import { EncountersModule } from './encounters/encounters.module.js';
import { HealthModule } from './health/health.module.js';
import { SecurityModule } from './security/security.module.js';

@Module({
  imports: [
    // Reads .env (if present) and process.env, then validates once at startup.
    // A missing or malformed key stops the app before it listens.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    SecurityModule,
    QueryCacheModule,
    HealthModule,
    EncountersModule,
  ],
})
export class AppModule {}
