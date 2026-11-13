import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthContext } from '../auth/session.types';
import { BotsService } from '../bots/bots.service';
import { validationFailed } from '../common/validation';
import { AppProblemError } from '../common/problem';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/env';
import { PG_POOL } from '../db/database.module';
import type {
  EventEnvelope,
  EventPayload,
  EventsPage,
  EventType,
  ProfileMovedPayload,
  ProfilePresencePayload,
  VisibleSubjects,
} from './events.types';

/** `id = <regionKey>:<seq:012d>`. El cliente sólo parsea el sufijo. */
export const EVENT_ID_PATTERN = /^([a-z]{2}):([0-9]{12})$/;

export const DEFAULT_POLL_LIMIT = 100;
export const MAX_POLL_LIMIT = 500;

export interface EventCursor {
  readonly id: string;
  readonly seq: number;
}

interface EventRow {
  seq: string;
  event_type: EventType;
  occurred_at: Date;
  payload: ProfileMovedPayload | ProfilePresencePayload;
}

/**
 * Log de eventos y sus dos proyecciones.
 *
 * **Una sola lectura.** `readPage` es el único lugar que proyecta eventos, y SSE
 * y polling la llaman a los dos. La paridad no es un acuerdo entre dos
 * implementaciones que hay que mantener sincronizadas: es que hay una.
 *
 * **Orden.** `seq`, asignado por región con un `UPDATE … RETURNING` sobre
 * `event_seq`. `occurredAt` viaja en el envelope porque el contrato lo exige y
 * porque sirve para depurar, pero no ordena nada: entre requests concurrentes el
 * reloj puede invertirse.
 *
 * **Visibilidad.** El log es de la región; la proyección es del observador: pasan
 * los humanos de la región (menos él) y sus bots visibles, propios incluidos y
 * cortados en el cap de 6 (`BotsService.visibleBotIds`, la misma definición que
 * `GET /discovery`). Los bots de un dueño en ghost no pasan —ni los nuevos ni los
 * que ya estaban en el log— porque el filtro es de lectura y no de escritura.
 *
 * **Frame de las medidas.** `profile.moved` lleva `distanceM`/`bearingDeg` contra
 * el ancla de la zona (el frame del mundo), no contra el observador: el log es
 * uno y append-only, así que un payload por receptor exigiría guardar una
 * coordenada o recalcular en lectura (y el mismo `seq` dejaría de valer lo
 * mismo). `GET /discovery` es la proyección por observador; el detalle y la
 * consecuencia para el cliente están en el README, "Frames de distancia".
 */
@Injectable()
export class EventsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly bots: BotsService,
  ) {}

  /**
   * Agrega un evento al log de la región y devuelve su envelope.
   *
   * La retención se aplica en la misma sentencia: el log nunca guarda más de
   * `eventRetention` eventos por región, y `CURSOR_EXPIRED` tiene un borde
   * medible en vez de "cuando la tabla creció demasiado".
   */
  async append<T extends EventType>(
    regionKey: string,
    type: T,
    payload: T extends 'profile.moved' ? ProfileMovedPayload : ProfilePresencePayload,
  ): Promise<EventEnvelope> {
    const { rows } = await this.pool.query<{ seq: string; occurred_at: Date }>(
      `WITH next AS (
         INSERT INTO event_seq (region_key, last_seq) VALUES ($1, 1)
         ON CONFLICT (region_key) DO UPDATE
            SET last_seq = event_seq.last_seq + 1
         RETURNING last_seq
       ), inserted AS (
         INSERT INTO events (region_key, seq, event_type, occurred_at, payload)
         SELECT $1, next.last_seq, $2, now(), $3::jsonb
           FROM next
         RETURNING seq, occurred_at
       ), pruned AS (
         DELETE FROM events e
          USING next
          WHERE e.region_key = $1
            AND e.seq <= next.last_seq - $4
       )
       SELECT seq, occurred_at FROM inserted`,
      [regionKey, type, JSON.stringify(payload), this.config.eventRetention],
    );

    const row = rows[0];
    if (row === undefined) throw new Error('el log de eventos no devolvió el seq asignado');

    return {
      id: formatEventId(regionKey, Number(row.seq)),
      type,
      occurredAt: row.occurred_at.toISOString(),
      payload,
    } as EventEnvelope;
  }

  /**
   * Convierte el cursor de entrada (`Last-Event-ID` o `?cursor=`) en `seq`.
   *
   * Malformado o de otra región es 422 `VALIDATION_FAILED`; fuera de la
   * retención es 410 `CURSOR_EXPIRED`. Un cursor al futuro no es ninguno de los
   * dos: devuelve una página vacía y el cursor no se mueve.
   */
  async resolveCursor(regionKey: string, raw: string | null | undefined): Promise<EventCursor | null> {
    if (raw === null || raw === undefined || raw === '') return null;

    const match = typeof raw === 'string' ? EVENT_ID_PATTERN.exec(raw) : null;
    if (match === null) {
      throw validationFailed(
        `El cursor está malformado: se esperaba <regionKey>:<seq de 12 dígitos> (por ejemplo "mx:000000000042").`,
      );
    }
    const [, cursorRegion, seqText] = match as RegExpExecArray;
    if (cursorRegion !== regionKey) {
      throw validationFailed(`El cursor "${raw}" no es de la región ${regionKey}.`);
    }

    const seq = Number(seqText);
    const minSeq = await this.minSeq(regionKey);
    if (minSeq > 0 && seq < minSeq - 1) {
      throw new AppProblemError(
        'CURSOR_EXPIRED',
        `El cursor "${raw}" quedó fuera de la retención del log de ${regionKey}. Reabrí el stream sin cursor.`,
      );
    }
    return { id: raw, seq };
  }

  /** `limit` de `?limit=`: entero 1..500, default 100. Fuera de rango es 422. */
  parseLimit(raw: unknown): number {
    if (raw === undefined || raw === null || raw === '') return DEFAULT_POLL_LIMIT;
    const value = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : Number.NaN;
    if (!Number.isInteger(value) || value < 1 || value > MAX_POLL_LIMIT) {
      throw validationFailed(`limit debe ser un entero entre 1 y ${MAX_POLL_LIMIT}.`);
    }
    return value;
  }

  /**
   * Una página del mismo stream, desde `cursor` (exclusivo), ascendente por `seq`.
   *
   * `nextCursor` es el `id` del último entregado; una página vacía devuelve el
   * cursor tal como llegó (`null` si no había). `hasMore` dice si quedó algo
   * después de esta página.
   */
  async readPage(session: AuthContext, cursor: EventCursor | null, limit: number): Promise<EventsPage> {
    const subjects = await this.bots.visibleSubjects(session);
    const page = await this.readRows(session.regionKey, cursor, limit, subjects);

    return {
      events: page,
      nextCursor:
        page.length > 0 ? page[page.length - 1]!.id : (cursor?.id ?? null),
      hasMore: page.length === limit,
    };
  }

  /**
   * Filas del log ya filtradas por observador. El filtro va en SQL —no en
   * JavaScript— para que "una página" sea una página del conjunto visible: si se
   * filtrara después del `LIMIT`, dos lecturas del mismo cursor podrían devolver
   * páginas distintas según lo que hubiera caído en el borde.
   */
  private async readRows(
    regionKey: string,
    cursor: EventCursor | null,
    limit: number,
    subjects: VisibleSubjects,
  ): Promise<readonly EventEnvelope[]> {
    const { rows } = await this.pool.query<EventRow>(
      `SELECT seq, event_type, occurred_at, payload
         FROM events
        WHERE region_key = $1
          AND seq > $2
          AND (
               (event_type = 'profile.presence' AND payload->>'profileId' = ANY($3::text[]))
            OR (event_type = 'profile.moved'    AND payload->>'profileId' = ANY($4::text[]))
          )
        ORDER BY seq
        LIMIT $5`,
      [regionKey, cursor?.seq ?? 0, subjects.humans, subjects.bots, limit + 1],
    );

    return rows.slice(0, limit).map((row) => ({
      id: formatEventId(regionKey, Number(row.seq)),
      type: row.event_type,
      occurredAt: row.occurred_at.toISOString(),
      payload: row.payload as EventPayload,
    }));
  }

  private async minSeq(regionKey: string): Promise<number> {
    const { rows } = await this.pool.query<{ min_seq: string }>(
      `SELECT coalesce(min(seq), 0) AS min_seq FROM events WHERE region_key = $1`,
      [regionKey],
    );
    return Number(rows[0]?.min_seq ?? 0);
  }
}

function formatEventId(regionKey: string, seq: number): string {
  return `${regionKey}:${String(seq).padStart(12, '0')}`;
}
