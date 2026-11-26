import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * HTTP settings applied to every app instance: main.ts and the e2e tests both call this, so
 * the tests exercise the same server the container runs.
 */
export const configureApp = (app: NestExpressApplication): NestExpressApplication => {
  // Express announces itself in every response by default; there is no reason to tell clients.
  app.disable('x-powered-by');
  // Runs onApplicationShutdown (closes the ClickHouse client) on SIGTERM from Docker.
  app.enableShutdownHooks();
  return app;
};
