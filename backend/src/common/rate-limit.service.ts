import { Injectable } from '@nestjs/common';
import { AppProblemError } from './problem';

/**
 * Límite de frecuencia en memoria, por llave (token bucket).
 *
 * **Por qué en memoria y no en la base.** Los productores de escritura ya tienen
 * su límite exacto en SQL (`pings` y `messages` cuentan filas de la ventana),
 * porque ahí el contador es el mismo hecho que se está limitando. Un endpoint de
 * lectura no tiene fila propia que contar: crear una tabla de "requests" sería
 * escribir en la base para poder no leerla, y el volumen de la demo (20 humanos)
 * no necesita un contador compartido entre procesos. La API es **un solo
 * proceso** (BC-10), así que un `Map` es exactamente tan correcto como la base.
 *
 * **Token bucket, no ventana fija.** Una ventana fija castiga al que hace 2
 * pedidos legítimos al borde del segundo; el bucket da una ráfaga acotada y una
 * tasa sostenida. `retryAfterMs` sale del tiempo que falta para el token
 * siguiente, no de "esperá un segundo".
 *
 * **Sin fuga de memoria.** Las entradas se podan cuando el mapa crece: una llave
 * que no se tocó en `IDLE_MS` no puede volver a pedir nada (el bucket ya está
 * lleno) y se descarta. El tope de `MAX_BUCKETS` es la red de seguridad para un
 * ataque que invente llaves: al llegar, se poda primero lo más viejo.
 */
export interface RateLimitRule {
  /** Ráfaga: cuántos pedidos se aceptan de golpe con el bucket lleno. */
  readonly capacity: number;
  /** Tasa sostenida de recarga, en pedidos por segundo. */
  readonly refillPerSecond: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** Una llave sin uso durante esto ya está llena: no hay nada que conservar. */
const IDLE_MS = 10 * 60_000;
const MAX_BUCKETS = 10_000;
const PRUNE_EVERY = 500;

@Injectable()
export class RateLimiterService {
  private readonly buckets = new Map<string, Bucket>();
  private operations = 0;

  /**
   * Consume un token si hay. Devuelve `retryAfterMs` sólo cuando no hay, que es
   * lo único que el cliente necesita para reintentar sin adivinar.
   */
  take(key: string, rule: RateLimitRule): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    this.operations += 1;
    if (this.operations % PRUNE_EVERY === 0) this.prune(now);

    const bucket = this.buckets.get(key) ?? { tokens: rule.capacity, updatedAt: now };
    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1_000;
    bucket.tokens = Math.min(rule.capacity, bucket.tokens + elapsedSeconds * rule.refillPerSecond);
    bucket.updatedAt = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.buckets.set(key, bucket);
      return { allowed: true, retryAfterMs: 0 };
    }

    this.buckets.set(key, bucket);
    const missing = 1 - bucket.tokens;
    return {
      allowed: false,
      retryAfterMs: Math.max(1, Math.ceil((missing / rule.refillPerSecond) * 1_000)),
    };
  }

  /**
   * `take` + `429 RATE_LIMITED`. El `code` es el del contrato; el detalle lleva
   * `retryAfterMs` porque `Problem` es un shape cerrado y no tiene un campo
   * propio para el header `Retry-After`.
   */
  assertWithin(key: string, rule: RateLimitRule, message: string): void {
    const result = this.take(key, rule);
    if (result.allowed) return;
    throw new AppProblemError('RATE_LIMITED', `${message} Reintentá en ${result.retryAfterMs} ms.`);
  }

  /** Sólo para tests: estado limpio sin reiniciar el proceso. */
  reset(): void {
    this.buckets.clear();
    this.operations = 0;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updatedAt > IDLE_MS) this.buckets.delete(key);
    }
    if (this.buckets.size <= MAX_BUCKETS) return;
    // Ataque de llaves: se van las más viejas hasta volver al tope.
    const ordered = [...this.buckets.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    const excess = this.buckets.size - MAX_BUCKETS;
    for (let index = 0; index < excess; index += 1) this.buckets.delete(ordered[index]![0]);
  }
}
