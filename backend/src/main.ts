import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/problem.filter';
import { requestContext } from './common/request-context';
import { DEV_JWT_SECRET, loadConfig } from './config/env';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const config = loadConfig();

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  // Primer middleware: todo lo que venga después ya tiene requestId.
  app.use(requestContext);
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();

  const server = app.getHttpAdapter().getInstance();
  server.disable?.('x-powered-by');
  server.set?.('trust proxy', false);

  await app.listen(config.port, '0.0.0.0');

  logger.log(`nearbyig-api escuchando en :${config.port} (${config.nodeEnv})`);
  if (config.jwtSecret === DEV_JWT_SECRET) {
    logger.warn('JWT_SECRET de desarrollo en uso: no usar este valor fuera de local.');
  }
}

bootstrap().catch((error: unknown) => {
  // Un fallo de config (DATABASE_URL/JWT_SECRET) tiene que cortar el arranque,
  // no dejar la API arriba respondiendo 500.
  new Logger('Bootstrap').error(
    `no se pudo arrancar la API: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
