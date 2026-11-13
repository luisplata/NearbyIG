import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from './rate-limit.service';

/**
 * Límites de frecuencia en memoria, compartidos por lectura y operación.
 *
 * Global por la misma razón que `ConfigModule`: el estado del bucket es del
 * proceso, no de un módulo. Si cada módulo lo instanciara, `GET /discovery` y
 * `POST /demo/reset` tendrían llaves distintas (no importa) y, sobre todo, una
 * segunda copia de la misma regla podría desincronizarse.
 */
@Global()
@Module({
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class RateLimitModule {}
