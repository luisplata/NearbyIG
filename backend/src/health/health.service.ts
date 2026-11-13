import { Injectable, Module } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/database.module';

/**
 * Health de infraestructura, fuera del contrato.
 *
 * El contrato congela la superficie de producto S1–S3 y no declara `/health`:
 * un endpoint de liveness no es parte del dominio de la demo, es cómo el
 * compose decide si reiniciar el contenedor. Por eso vive al lado, no adentro
 * de `openapi.yaml`, y su shape es libre (nadie lo consume como cliente).
 *
 *   GET /health        liveness: el proceso responde. No toca la base.
 *   GET /health/ready  readiness: la base responde (SELECT 1). 503 si no.
 */
export interface LivenessBody {
  readonly status: 'ok';
  readonly service: 'nearbyig-api';
  readonly version: string;
  readonly uptimeSeconds: number;
  readonly timestamp: string;
}

export interface ReadinessBody {
  readonly status: 'ready' | 'unavailable';
  readonly checks: {
    readonly db: {
      readonly status: 'up' | 'down';
      readonly latencyMs: number | null;
    };
  };
  readonly timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  liveness(version: string): LivenessBody {
    return {
      status: 'ok',
      service: 'nearbyig-api',
      version,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessBody> {
    const started = process.hrtime.bigint();
    try {
      await this.pool.query('SELECT 1');
      return {
        status: 'ready',
        checks: { db: { status: 'up', latencyMs: Number(process.hrtime.bigint() - started) / 1e6 } },
        timestamp: new Date().toISOString(),
      };
    } catch {
      // El error crudo de pg puede traer host, usuario o string de conexión:
      // no se serializa. El log del pool ya lo registra.
      return {
        status: 'unavailable',
        checks: { db: { status: 'down', latencyMs: null } },
        timestamp: new Date().toISOString(),
      };
    }
  }
}

@Module({
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthServiceModule {}
