import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';

export const PG_POOL = 'PG_POOL';

@Injectable()
export class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Un solo `Pool` para todo el proceso. Sin ORM: las consultas son SQL explícito
 * y las filas se mapean a mano, así lo que sale por HTTP se ve en el código y no
 * depende de un decorador que agregue campos.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const pool = new Pool({
          connectionString: config.databaseUrl,
          max: 10,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 3_000,
          statement_timeout: 5_000,
          application_name: 'nearbyig-api',
        });
        // Sin handler, un cliente idle que se cae (reinicio de Postgres, red)
        // emite 'error' y Node tumba el proceso. Se loguea y se deja que el pool
        // reconecte en la próxima query.
        pool.on('error', (error: Error) => {
          new Logger('PgPool').warn(`cliente idle con error: ${error.message}`);
        });
        return pool;
      },
    },
    DatabaseLifecycle,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
