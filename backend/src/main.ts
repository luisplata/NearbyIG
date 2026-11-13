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

  // CORS antes de escuchar: el preflight `OPTIONS` de un `PUT /presence` o un
  // `GET /discovery` con `Authorization` es una request real, y sin esto el
  // navegador la bloquea aunque el endpoint responda 200 a `curl`.
  //
  // Sin `credentials`: la demo autentica con Bearer en el header, no con cookie,
  // así que `Access-Control-Allow-Credentials` sería una concesión que nadie usa.
  // `last-event-id` va en la lista porque el `EventSource` lo manda solo al
  // reconectar y no es un header "simple" para el preflight.
  if (config.corsAllowedOrigins.length > 0) {
    app.enableCors({
      origin: [...config.corsAllowedOrigins],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['authorization', 'content-type', 'last-event-id'],
      maxAge: 600,
      credentials: false,
    });
  } else {
    logger.warn(
      'CORS apagado: declarí CORS_ALLOWED_ORIGINS con el origen del cliente (por ejemplo https://usuario.github.io en S6).',
    );
  }

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
