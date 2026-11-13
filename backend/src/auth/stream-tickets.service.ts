import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { AppProblemError } from '../common/problem';
import { PG_POOL } from '../db/database.module';
import type { AuthContext, SourceType, StreamTicket } from './session.types';

/**
 * Ticket de un solo uso para `GET /events` (S2).
 *
 * `EventSource` no puede mandar headers, así que el stream se autentica con un
 * ticket en la query. El JWT de sesión no puede ir ahí: se filtra por logs,
 * `Referer` e historial. Por eso el ticket vive 30 s, se usa una vez y sólo lo
 * consume `GET /events`.
 *
 * Se persiste el **sha256** del valor, no el valor: la tabla es la que decide
 * si el ticket sigue sirviendo, y una copia de la base no entrega tickets
 * válidos. El valor en claro sólo existe en la respuesta HTTP de emisión.
 *
 * `consume` es la costura que S2 cablea en `GET /events`; este batch la deja
 * implementada y testeada aunque todavía no haya stream, porque la
 * invalidación es lo que hay que probar antes de exponer el endpoint.
 */
@Injectable()
export class StreamTicketsService {
  private readonly logger = new Logger(StreamTicketsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** `POST /auth/stream-ticket`: emite y persiste el hash, devuelve el valor. */
  async issue(session: AuthContext): Promise<StreamTicket> {
    const ticket = randomBytes(32).toString('base64url');
    const ttl = this.config.streamTicketTtlSeconds;
    const expiresAt = new Date(Date.now() + ttl * 1_000);
    await this.pool.query(
      `INSERT INTO stream_tickets (ticket_hash, session_id, expires_at)
       VALUES ($1, $2, $3)`,
      [hashStreamTicket(ticket), session.sessionId, expiresAt],
    );
    // Sólo el id interno de sesión: el valor del ticket nunca entra al log.
    this.logger.log(`ticket de stream emitido session=${session.sessionId} ttl=${ttl}s`);
    return { ticket, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Consume el ticket y devuelve la sesión que lo pidió.
   *
   * Un solo `UPDATE` atómico: dos pedidos simultáneos con el mismo ticket no
   * pueden ganar los dos (el segundo reevalúa `consumed_at IS NULL` sobre la
   * fila ya actualizada). El `LEFT JOIN` con `sessions` exige que la sesión
   * siga viva: un ticket emitido antes de un logout no abre nada.
   */
  async consume(ticket: string): Promise<AuthContext> {
    const hash = hashStreamTicket(ticket);
    const { rows } = await this.pool.query<ConsumeRow>(
      `WITH consumed AS (
         UPDATE stream_tickets
            SET consumed_at = now()
          WHERE ticket_hash = $1
            AND consumed_at IS NULL
            AND expires_at > now()
        RETURNING session_id
       )
       SELECT t.consumed_at,
              t.expires_at,
              s.session_id,
              s.region_key,
              s.profile_id,
              s.demo_slot,
              s.source_type
         FROM stream_tickets t
         LEFT JOIN consumed c ON true
         LEFT JOIN sessions s
                ON s.session_id = c.session_id
               AND s.revoked_at IS NULL
               AND s.expires_at > now()
        WHERE t.ticket_hash = $1`,
      [hash],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new AppProblemError('TICKET_EXPIRED', 'El ticket de stream no existe.');
    }
    if (row.consumed_at !== null) {
      throw new AppProblemError('TICKET_REUSED', 'El ticket de stream ya se usó.');
    }
    if (row.expires_at.getTime() <= Date.now()) {
      throw new AppProblemError('TICKET_EXPIRED', 'El ticket de stream venció.');
    }
    if (row.session_id === null || row.region_key === null || row.profile_id === null) {
      // El ticket se quemó en este pedido, pero la sesión que lo pidió ya no
      // está viva (logout, reset o expiración). Mismo 401, otro motivo.
      throw new AppProblemError('TICKET_EXPIRED', 'La sesión del ticket de stream ya no está viva.');
    }
    return {
      sessionId: row.session_id,
      regionKey: row.region_key,
      profileId: row.profile_id,
      demoSlot: row.demo_slot,
      sourceType: row.source_type as SourceType,
    };
  }
}

/** El hash es la única forma del ticket que toca la base. */
export function hashStreamTicket(ticket: string): string {
  return createHash('sha256').update(ticket, 'utf8').digest('hex');
}

interface ConsumeRow {
  consumed_at: Date | null;
  expires_at: Date;
  session_id: string | null;
  region_key: string | null;
  profile_id: string | null;
  demo_slot: number | null;
  source_type: string | null;
}
