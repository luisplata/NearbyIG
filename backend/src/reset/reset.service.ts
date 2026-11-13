import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
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
 *   * Borra `sessions` (invitados incluidos), `stream_tickets`, `bots`, `events`
 *     y `event_seq`: es el estado que ocupa slots, que sobrevive a un refresh y
 *     que hace que el stream de una corrida no se mezcle con el de la anterior.
 *   * **No** borra `regions`, `zones`, `profiles`, `presence` ni `demo_meta`: el
 *     catálogo lo escribe el seed y la presencia cae en cascada con la sesión.
 *     Los 10 slots quedan libres sólo porque no hay sesiones vivas.
 *   * Pings, matches y chat todavía no existen (S4+). Cuando existan, se suman
 *     acá: éste es el único punto de limpieza de datos de demo.
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

@Injectable()
export class ResetService {
  private readonly logger = new Logger(ResetService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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
        `reset propio sessions=${result.sessionsDeleted} tickets=${result.ticketsDeleted}`,
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
   * Reset global: deja la demo como recién migrada, sin tocar el catálogo.
   *
   * Es un `DELETE` y no un `TRUNCATE` a propósito: `TRUNCATE` no es
   * transaccional con el resto del esquema en todos los casos y pediría
   * `CASCADE` sobre tablas que no queremos vaciar. Correrlo dos veces deja 0
   * filas la segunda: idempotente.
   */
  async resetGlobal(): Promise<ResetGlobalResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // El log de eventos y los bots son estado de demo: un reset global tiene
      // que dejar la demo como recién migrada, con el stream vacío y el `seq` de
      // cada región volviendo a 1. La presencia cae en cascada con las sesiones.
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
        `reset global sessions=${result.sessionsDeleted} guests=${result.guestsDeleted} tickets=${result.ticketsDeleted}`,
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
