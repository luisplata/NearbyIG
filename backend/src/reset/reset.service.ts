import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { AppProblemError } from '../common/problem';
import { RateLimiterService } from '../common/rate-limit.service';
import { APP_CONFIG } from '../config/config.module';
import { isAllowedCorsOrigin, type AppConfig } from '../config/env';
import { PG_POOL } from '../db/database.module';
import type { AuthContext, SourceType } from '../auth/session.types';

/**
 * Reset de la demo, **fuera del contrato**.
 *
 * `docs/plan-sprints-backend-demo.md` §11 lo pone al lado de
 * `docker compose down -v`: es el control de operación que deja la demo
 * reproducible sin borrar el volumen ni volver a migrar. Igual que `/health`,
 * no es dominio de producto (`openapi.yaml` congela S1–S3 y no lo declara), así
 * que su shape es propio y nadie lo consume como cliente.
 *
 * Qué borra y qué no:
 *   * Borra `sessions` (invitados incluidos), `stream_tickets`, `bots`, `events`,
 *     `event_seq`, `messages`, `match_reads`, `pings`, `matches` y —desde S5—
 *     `notifications`, `blocks` y `reports`: es el estado que ocupa slots, que
 *     sobrevive a un refresh, que hace que el stream de una corrida no se mezcle
 *     con el de la anterior, que deja las bandejas vacías y que no arrastra
 *     bloqueos ni avisos de una demo anterior.
 *   * **No** borra `regions`, `zones`, `profiles`, `presence` ni `demo_meta`: el
 *     catálogo lo escribe el seed y la presencia cae en cascada con la sesión.
 *     Los 10 slots quedan libres sólo porque no hay sesiones vivas.
 *   * Es el único punto de limpieza de datos de demo. Toda tabla nueva de estado
 *     efímero se suma acá.
 */
export interface ResetSelfResult {
  readonly scope: 'self';
  readonly sessionsDeleted: number;
  readonly ticketsDeleted: number;
  readonly regionKey: string;
  readonly demoSlot: number | null;
  readonly sourceType: SourceType;
}

export interface ResetGlobalResult {
  readonly scope: 'global';
  readonly sessionsDeleted: number;
  readonly guestsDeleted: number;
  readonly ticketsDeleted: number;
  readonly regions: readonly { readonly regionKey: string; readonly freeSlots: number }[];
}

/** Cabeceras que importan para autorizar el reset global. */
export interface ResetOperatorAuth {
  readonly origin?: string | undefined;
  readonly authorization?: string | undefined;
}

/** Comparación de secretos en tiempo constante, sin filtrar el largo. */
function secretMatches(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

@Injectable()
export class ResetService {
  private readonly logger = new Logger(ResetService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly rateLimit: RateLimiterService,
  ) {}

  /**
   * Reset por usuario: cierra **su** sesión y retira lo que colgaba de ella.
   *
   * Se llama con `TeardownSessionGuard`, así que el `sessionId` sale del JWT y
   * no de la fila: si la sesión ya no existe (reset anterior, logout, o reset
   * global en el medio) el resultado es `sessionsDeleted: 0` y 200. Eso es la
   * idempotencia que pide el batch: repetirlo no rompe ni toca a nadie más.
   */
  async resetSelf(session: AuthContext): Promise<ResetSelfResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tickets = await client.query('DELETE FROM stream_tickets WHERE session_id = $1', [
        session.sessionId,
      ]);
      const sessions = await client.query<SessionIdentity>(
        `DELETE FROM sessions
          WHERE session_id = $1
        RETURNING region_key, profile_id, demo_slot, source_type`,
        [session.sessionId],
      );
      // Los bots son del perfil, no de la sesión: al irse la sesión se van los
      // suyos. Sin esto quedarían huérfanos hasta el próximo tick del mundo.
      if (sessions.rows[0] !== undefined) {
        await client.query('DELETE FROM bots WHERE region_key = $1 AND owner_profile_id = $2', [
          sessions.rows[0].region_key,
          sessions.rows[0].profile_id,
        ]);
      }

      // Privacidad (v0.5): se borra lo **propio**, no lo ajeno. Un bloqueo que
      // otra persona puso sobre mí es estado de esa persona: mi reset no puede
      // liberar a alguien más de su decisión ("reset por usuario no afecta a
      // otros"). Las notificaciones son mías por definición.
      const notifications = await client.query(
        'DELETE FROM notifications WHERE region_key = $1 AND recipient_profile_id = $2',
        [session.regionKey, session.profileId],
      );
      const blocks = await client.query(
        'DELETE FROM blocks WHERE region_key = $1 AND blocker_profile_id = $2',
        [session.regionKey, session.profileId],
      );
      const reports = await client.query(
        'DELETE FROM reports WHERE region_key = $1 AND reporter_profile_id = $2',
        [session.regionKey, session.profileId],
      );
      await client.query('COMMIT');

      const row = sessions.rows[0];
      const result: ResetSelfResult = {
        scope: 'self',
        sessionsDeleted: sessions.rowCount ?? 0,
        ticketsDeleted: tickets.rowCount ?? 0,
        regionKey: row?.region_key ?? session.regionKey,
        demoSlot: row?.demo_slot ?? session.demoSlot,
        sourceType: (row?.source_type ?? session.sourceType) as SourceType,
      };
      this.logger.log(
        `reset propio sessions=${result.sessionsDeleted} tickets=${result.ticketsDeleted} ` +
          `notifications=${notifications.rowCount ?? 0} blocks=${blocks.rowCount ?? 0} reports=${reports.rowCount ?? 0}`,
      );
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* la conexión se cayó */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Política del reset global, en el orden en que se decide:
   *
   *   1. **Origen de navegador.** Si la request trae `Origin`, tiene que estar
   *      en la allowlist de CORS; un origen ajeno no ejecuta el reset. `curl`
   *      desde una terminal no manda `Origin` y sigue funcionando: el endpoint
   *      existe para el operador, no para el navegador de la demo.
   *   2. **Token de operador.** Si `DEMO_RESET_TOKEN` está configurado, se exige
   *      `Authorization: Bearer <token>` (comparación en tiempo constante). Si
   *      no está configurado, en producción el endpoint **no existe** (401): la
   *      demo pública no puede tener un botón de "borrar todo" sin llave. En
   *      desarrollo queda abierto, que es como lo usa la suite y el runbook
   *      local.
   *   3. **Ritmo.** PS-11: uno cada 10 s en producción (token bucket de
   *      capacidad 1). En desarrollo la ventana es 0 para que la suite no
   *      dependa del reloj.
   *
   * Las tres usan `UNAUTHENTICATED` (401) y no un código nuevo: el reset global
   * está **fuera del contrato**, así que no hay `code` que inventar ni gate que
   * romper. El detalle explica cuál de las tres reglas falló.
   */
  private assertOperator(auth: ResetOperatorAuth): void {
    const { origin, authorization } = auth;

    if (
      origin !== undefined &&
      origin !== '' &&
      !isAllowedCorsOrigin(origin, this.config.corsAllowedOrigins, this.config.corsAllowTunnelOrigins)
    ) {
      throw new AppProblemError(
        'UNAUTHENTICATED',
        'El reset global no está habilitado para este origen. Se ejecuta desde la terminal del operador.',
      );
    }

    if (this.config.demoResetToken === '') {
      if (this.config.isProduction) {
        throw new AppProblemError(
          'UNAUTHENTICATED',
          'Reset global deshabilitado: configurá DEMO_RESET_TOKEN en el entorno para habilitarlo.',
        );
      }
    } else {
      const header = authorization ?? '';
      const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
      if (!secretMatches(provided, this.config.demoResetToken)) {
        throw new AppProblemError('UNAUTHENTICATED', 'Token de operador inválido para el reset global.');
      }
    }

    if (this.config.demoResetMinIntervalMs > 0) {
      this.rateLimit.assertWithin(
        'demo-reset:global',
        { capacity: 1, refillPerSecond: 1_000 / this.config.demoResetMinIntervalMs },
        `El reset global está limitado a uno cada ${this.config.demoResetMinIntervalMs / 1_000} s.`,
      );
    }
  }

  /**
   * Reset global: deja la demo como recién migrada, sin tocar el catálogo.
   *
   * Es un `DELETE` y no un `TRUNCATE` a propósito: `TRUNCATE` no es
   * transaccional con el resto del esquema en todos los casos y pediría
   * `CASCADE` sobre tablas que no queremos vaciar. Correrlo dos veces deja 0
   * filas la segunda: idempotente.
   *
   * **Es la operación más destructiva de la API**, así que pasa por
   * `assertOperator` antes de tocar una fila.
   */
  async resetGlobal(auth: ResetOperatorAuth = {}): Promise<ResetGlobalResult> {
    this.assertOperator(auth);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // El log de eventos y los bots son estado de demo: un reset global tiene
      // que dejar la demo como recién migrada, con el stream vacío y el `seq` de
      // cada región volviendo a 1. La presencia cae en cascada con las sesiones.
      // Pings antes que matches: `pings.match_id` apunta a `matches`, así que
      // las dos tablas no se pueden vaciar en cualquier orden. El chat va antes
      // por la misma razón: `messages` y `match_reads` cuelgan de un match.
      //
      // Las notificaciones van primero: referencian pings, matches y messages
      // con CASCADE, así que borrarlas explícitamente es el orden que no depende
      // del cascade para ser correcto. Bloqueos y reportes no tienen
      // dependencias y se borran al final del grupo.
      const notifications = await client.query('DELETE FROM notifications');
      const messages = await client.query('DELETE FROM messages');
      const reads = await client.query('DELETE FROM match_reads');
      const pings = await client.query('DELETE FROM pings');
      const matches = await client.query('DELETE FROM matches');
      const blocks = await client.query('DELETE FROM blocks');
      const reports = await client.query('DELETE FROM reports');
      await client.query('DELETE FROM bots');
      await client.query('DELETE FROM events');
      await client.query('DELETE FROM event_seq');
      const tickets = await client.query('DELETE FROM stream_tickets');
      const sessions = await client.query<{ source_type: string }>(
        'DELETE FROM sessions RETURNING source_type',
      );
      const regions = await client.query<{ region_key: string }>(
        'SELECT region_key FROM regions ORDER BY region_key',
      );
      await client.query('COMMIT');

      const guests = sessions.rows.filter((row) => row.source_type === 'guest').length;
      const result: ResetGlobalResult = {
        scope: 'global',
        sessionsDeleted: sessions.rowCount ?? 0,
        guestsDeleted: guests,
        ticketsDeleted: tickets.rowCount ?? 0,
        regions: regions.rows.map((row) => ({
          regionKey: row.region_key,
          freeSlots: this.config.slotCount,
        })),
      };
      this.logger.log(
        `reset global sessions=${result.sessionsDeleted} guests=${result.guestsDeleted} tickets=${result.ticketsDeleted} pings=${pings.rowCount ?? 0} matches=${matches.rowCount ?? 0} messages=${messages.rowCount ?? 0} reads=${reads.rowCount ?? 0} notifications=${notifications.rowCount ?? 0} blocks=${blocks.rowCount ?? 0} reports=${reports.rowCount ?? 0}`,
      );
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* la conexión se cayó */
      }
      throw error;
    } finally {
      client.release();
    }
  }
}

interface SessionIdentity {
  region_key: string;
  profile_id: string;
  demo_slot: number | null;
  source_type: string;
}
