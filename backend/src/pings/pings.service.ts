import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { AuthContext, SourceType } from '../auth/session.types';
import { AppProblemError } from '../common/problem';
import {
  isRecord,
  parseProfileId,
  rejectUnknownKeys,
  validationFailed,
} from '../common/validation';
import { PG_POOL } from '../db/database.module';
import {
  PING_INBOX_LIMIT,
  PING_RATE_LIMIT_PER_MINUTE,
  PING_RATE_WINDOW_SECONDS,
  PING_TTL_SECONDS,
  type Match,
  type Ping,
  type PingBox,
  type PingList,
  type PingListItem,
  type PingPeer,
  type PingStatus,
} from './pings.types';

/** Fila de `pings` tal como vuelve de SQL. `dates` llegan como `Date` de `pg`. */
interface PingRow {
  ping_id: string;
  from_profile_id: string;
  to_profile_id: string;
  status: PingStatus;
  created_at: Date;
  expires_at: Date;
  match_id: string | null;
}

/** Fila de la bandeja: el ping + la proyección del otro perfil. */
interface PingListRow extends PingRow {
  peer_profile_id: string;
  peer_nickname: string;
  peer_initials: string;
  peer_intention: string;
  peer_photo_id: string;
  peer_source_type: SourceType;
}

interface MatchRow {
  match_id: string;
  profile_a_id: string;
  profile_b_id: string;
  created_at: Date;
}

/** El match resuelto por `createMatch`: la fila y si la creó esta llamada. */
interface CreatedMatchRow extends MatchRow {
  created: boolean;
}

/** `target` ya validado: el perfil al que apunta un ping. */
interface PingTarget {
  readonly profileId: string;
}

/** `pingId` y `matchId` del path: un id malformado es 422, no 404. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Columnas de cada bandeja. Es un mapa de constantes, no interpolación de
 * entrada: `box` se valida contra `inbox|sent` antes de llegar acá, así que el
 * nombre de columna que entra al SQL es siempre uno de estos dos.
 */
const BOX_COLUMNS: Readonly<Record<PingBox, { readonly filter: string; readonly peer: string }>> = {
  inbox: { filter: 'pg.to_profile_id', peer: 'pg.from_profile_id' },
  sent: { filter: 'pg.from_profile_id', peer: 'pg.to_profile_id' },
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

/**
 * `targetProfileId` del body: obligatorio, sin campos de más y con forma de
 * `profileId`. La forma se valida acá y no en el SQL: un NUL o 70 KB de basura
 * no son "un perfil inexistente" (404), son un pedido inválido (422), y además
 * un NUL revienta en Postgres con 500.
 */
function parseTargetProfileId(body: unknown): string {
  if (!isRecord(body)) {
    throw validationFailed('body debe ser un objeto JSON con targetProfileId.');
  }
  rejectUnknownKeys(body, ['targetProfileId']);
  return parseProfileId(body['targetProfileId'], 'targetProfileId');
}

/** `box` de query: obligatorio, uno de los dos valores del contrato. */
function parseBox(raw: unknown): PingBox {
  if (raw === 'inbox' || raw === 'sent') return raw;
  if (raw === undefined) {
    throw validationFailed('box es obligatorio: "inbox" o "sent".');
  }
  throw validationFailed('box debe ser "inbox" o "sent".');
}

/** `pingId` del path: un id malformado es 422, no 404. */
function parsePingId(raw: unknown): string {
  if (typeof raw !== 'string' || !UUID.test(raw)) {
    throw validationFailed('pingId debe ser un uuid.');
  }
  return raw.toLowerCase();
}

function toPing(row: PingRow): Ping {
  return {
    id: row.ping_id,
    fromProfileId: row.from_profile_id,
    toProfileId: row.to_profile_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    matchId: row.match_id,
  };
}

function toMatch(row: MatchRow): Match {
  return {
    id: row.match_id,
    profileIds: [row.profile_a_id, row.profile_b_id],
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Pings y matches (Sprint 4): el slice mínimo del flujo de conexión.
 *
 * **Una máquina de estados, no cuatro endpoints sueltos.** `pending` es el único
 * estado del que se sale y la transición la decide el server:
 *
 * | Acción | Resultado |
 * |---|---|
 * | destinatario acepta un pendiente vivo | `accepted` + un `Match` por par |
 * | destinatario rechaza un pendiente vivo | `rejected`, sin match |
 * | alguien resuelve un ping vencido | `410 PING_EXPIRED` y el ping queda `expired` |
 * | alguien resuelve un ping ya resuelto | `409 PING_RESOLVED` |
 * | cualquiera que no sea el destinatario | `403 PING_FORBIDDEN` |
 *
 * **Un pendiente por par dirigido.** El índice único parcial es la autoridad:
 * dos `POST /pings` simultáneos no pueden dejar dos pendientes del mismo par y
 * el perdedor recibe `409 PING_DUPLICATE`.
 *
 * **Nadie acepta por su cuenta.** Un ping queda `pending` hasta que el
 * destinatario llama a `accept` o `reject`: no hay job ni rama que lo resuelva
 * solo. El match nace de una acción humana, no de un temporizador.
 *
 * **Lo que nunca sale.** Ni coordenadas ni `distanceM`/`bearingDeg`: un ping no
 * es un resultado de descubrimiento. Los logs no llevan `profileId` ni nickname;
 * sólo región y conteos.
 */
@Injectable()
export class PingsService {
  private readonly logger = new Logger(PingsService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * `POST /pings`: crea el ping del perfil de la sesión hacia `targetProfileId`.
   *
   * Orden de las guardas, todas con `code` propio porque el cliente decide con
   * él: invitado (403), auto-ping (422), destinatario inexistente o de otra
   * región (404), cuota (429), pendiente vencido del par (410) y duplicado
   * (409). La última la resuelve el índice, no un `SELECT`.
   */
  async create(session: AuthContext, body: unknown): Promise<Ping> {
    const targetProfileId = parseTargetProfileId(body);

    // Un invitado es una sesión de relleno: no tiene fila de catálogo y nadie
    // podría contestarle. Pinguear con él dejaría una bandeja imposible.
    if (session.sourceType !== 'human') {
      throw new AppProblemError(
        'PING_FORBIDDEN',
        'La sesión actual no tiene un perfil propio con el que enviar pings.',
      );
    }
    if (targetProfileId === session.profileId) {
      throw validationFailed('No podés enviarte un ping a vos mismo.');
    }

    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');

      const target = await this.resolveTarget(client, session.regionKey, targetProfileId);
      if (target === undefined) {
        throw new AppProblemError(
          'PROFILE_NOT_FOUND',
          'El destinatario no existe en esta región: un ping no cruza regiones.',
        );
      }

      // Bloqueo (v0.5): en cualquier dirección, el ping no sale.
      await this.assertNotBlocked(client, session.regionKey, session.profileId, target.profileId);

      await this.assertWithinRateLimit(client, session);

      const swept = await client.query(
        `UPDATE pings
            SET status = 'expired', resolved_at = now()
          WHERE region_key = $1
            AND from_profile_id = $2
            AND to_profile_id = $3
            AND status = 'pending'
            AND expires_at <= now()`,
        [session.regionKey, session.profileId, targetProfileId],
      );
      if ((swept.rowCount ?? 0) > 0) {
        // El pendiente del par ya había vencido. Se cierra y se avisa: el
        // cliente reintenta y crea uno nuevo. Devolver 409 mentiría sobre un
        // ping que ya no existe como pendiente.
        await client.query('COMMIT');
        committed = true;
        throw new AppProblemError(
          'PING_EXPIRED',
          'El ping pendiente de este par venció. Reintentá para enviar uno nuevo.',
        );
      }

      const { rows } = await client.query<PingRow>(
        `INSERT INTO pings (region_key, from_profile_id, to_profile_id, status, expires_at)
         VALUES ($1, $2, $3, 'pending', now() + make_interval(secs => $4))
         RETURNING ping_id, from_profile_id, to_profile_id, status, created_at, expires_at, match_id`,
        [session.regionKey, session.profileId, targetProfileId, PING_TTL_SECONDS],
      );
      const ping = rows[0];
      if (ping === undefined) {
        throw new AppProblemError('INTERNAL', 'El ping no se pudo crear.');
      }

      // La notificación del ping es parte de la misma transacción que el ping:
      // o quedan los dos, o no queda ninguno. `notify` ignora al propio actor.
      await this.notify(client, session.regionKey, target.profileId, session.profileId, 'ping.received', {
        pingId: ping.ping_id,
      });
      await client.query('COMMIT');
      committed = true;
      this.logger.log(`ping creado region=${session.regionKey}`);
      return toPing(ping);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppProblemError(
          'PING_DUPLICATE',
          'Ese par ya tiene un ping pendiente. Esperá la respuesta o que venza.',
        );
      }
      throw error;
    } finally {
      if (!committed) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* la conexión se cayó o ya se había cerrado la transacción */
        }
      }
      client.release();
    }
  }

  /**
   * `GET /pings?box=`: la bandeja del perfil de la sesión, más nuevo primero.
   *
   * Antes de leer se aplica el vencimiento perezoso: si el test vio `pending`,
   * todavía se puede aceptar. No hay cron ni job de barrido.
   *
   * Un ping cuyo peer no se puede resolver no se lista: la bandeja es una
   * proyección de perfiles, no un log. El caso real es un ping a un perfil que
   * ya no está en el catálogo.
   */
  async list(session: AuthContext, rawBox: unknown): Promise<PingList> {
    const box = parseBox(rawBox);

    await this.pool.query(
      `UPDATE pings
          SET status = 'expired', resolved_at = now()
        WHERE region_key = $1
          AND status = 'pending'
          AND expires_at <= now()
          AND (to_profile_id = $2 OR from_profile_id = $2)`,
      [session.regionKey, session.profileId],
    );

    const columns = BOX_COLUMNS[box];
    const { rows } = await this.pool.query<PingListRow>(
      `SELECT pg.ping_id, pg.from_profile_id, pg.to_profile_id, pg.status,
              pg.created_at, pg.expires_at, pg.match_id,
              peer.profile_id    AS peer_profile_id,
              peer.nickname      AS peer_nickname,
              peer.initials      AS peer_initials,
              peer.intention     AS peer_intention,
              peer.photo_id      AS peer_photo_id,
              peer.source_type   AS peer_source_type
         FROM pings pg
         JOIN profiles peer
           ON peer.region_key = pg.region_key
          AND peer.profile_id = ${columns.peer}
        WHERE pg.region_key = $1
          AND ${columns.filter} = $2
        ORDER BY pg.created_at DESC, pg.ping_id DESC
        LIMIT $3`,
      [session.regionKey, session.profileId, PING_INBOX_LIMIT],
    );

    this.logger.debug(`bandeja region=${session.regionKey} box=${box} filas=${rows.length}`);
    return { pings: rows.map(toListItem) };
  }

  /**
   * `POST /pings/{pingId}/accept`: sólo el destinatario, y crea **un** match por
   * par.
   *
   * `SELECT … FOR UPDATE` serializa dos aceptaciones del mismo ping: la segunda
   * espera, ve `accepted` y recibe 409. Aun si el ping no fuera el mismo, el
   * único `(region_key, a, b)` de `matches` impide el segundo match: la garantía
   * es de la tabla, no de este método.
   */
  async accept(session: AuthContext, rawPingId: unknown): Promise<Match> {
    const match = await this.resolve(session, rawPingId, 'accept');
    if (match === undefined) {
      throw new AppProblemError('INTERNAL', 'Aceptar un ping tiene que producir un match.');
    }
    return match;
  }

  /**
   * `POST /pings/{pingId}/reject`: sólo el destinatario, no crea match. Repetirlo
   * es `409 PING_RESOLVED`, no un 204 silencioso: el cliente tiene que saber que
   * su segundo toque no cambió nada.
   */
  async reject(session: AuthContext, rawPingId: unknown): Promise<void> {
    await this.resolve(session, rawPingId, 'reject');
  }

  private async resolve(
    session: AuthContext,
    rawPingId: unknown,
    action: 'accept' | 'reject',
  ): Promise<Match | undefined> {
    const pingId = parsePingId(rawPingId);

    const client = await this.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<PingRow>(
        `SELECT ping_id, from_profile_id, to_profile_id, status, created_at, expires_at, match_id
           FROM pings
          WHERE ping_id = $1
            AND region_key = $2
          FOR UPDATE`,
        [pingId, session.regionKey],
      );
      const ping = rows[0];
      if (ping === undefined) {
        throw new AppProblemError('PING_NOT_FOUND', 'El ping no existe en esta región.');
      }
      if (ping.to_profile_id !== session.profileId) {
        throw new AppProblemError(
          'PING_FORBIDDEN',
          'Sólo el destinatario puede aceptar o rechazar este ping.',
        );
      }
      if (ping.status !== 'pending') {
        throw new AppProblemError(
          'PING_RESOLVED',
          `El ping ya está ${ping.status}: no hay nada que resolver.`,
        );
      }
      if (ping.expires_at.getTime() <= Date.now()) {
        await client.query(
          `UPDATE pings SET status = 'expired', resolved_at = now() WHERE ping_id = $1`,
          [pingId],
        );
        // El vencimiento se confirma aunque la acción falle: el ping ya no
        // estaba pendiente y la bandeja lo tiene que ver así.
        await client.query('COMMIT');
        committed = true;
        throw new AppProblemError(
          'PING_EXPIRED',
          'El ping venció antes de resolverse. Pedile al otro que te pinguee de nuevo.',
        );
      }

      if (action === 'reject') {
        await client.query(
          `UPDATE pings SET status = 'rejected', resolved_at = now() WHERE ping_id = $1`,
          [pingId],
        );
        await client.query('COMMIT');
        committed = true;
        this.logger.log(`ping rechazado region=${session.regionKey}`);
        return undefined;
      }

      // Bloquear es más fuerte que "aceptar tarde": si el par está bloqueado, la
      // conversación no se abre.
      await this.assertNotBlocked(client, session.regionKey, session.profileId, ping.from_profile_id);

      const match = await this.createMatch(client, session.regionKey, [
        ping.from_profile_id,
        ping.to_profile_id,
      ]);
      await client.query(
        `UPDATE pings SET status = 'accepted', resolved_at = now(), match_id = $2 WHERE ping_id = $1`,
        [pingId, match.match_id],
      );
      // Sólo un match **nuevo** avisa. Un segundo ping aceptado del mismo par
      // reusa la fila y no genera otra notificación: sería un aviso de algo que
      // ya estaba en la bandeja.
      if (match.created) {
        await this.notify(client, session.regionKey, ping.from_profile_id, session.profileId, 'match.created', {
          matchId: match.match_id,
        });
      }
      await client.query('COMMIT');
      committed = true;
      this.logger.log(`ping aceptado region=${session.regionKey}`);
      return toMatch(match);
    } finally {
      if (!committed) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* la conexión se cayó */
        }
      }
      client.release();
    }
  }

  /**
   * El destinatario existe en esta región.
   *
   * Un humano del catálogo existe mientras el catálogo lo tenga: su bandeja vive
   * en la base y no depende de que su presencia (12 s) esté viva en este
   * instante.
   */
  private async resolveTarget(
    client: PoolClient,
    regionKey: string,
    profileId: string,
  ): Promise<PingTarget | undefined> {
    const { rowCount } = await client.query(
      `SELECT 1
         FROM profiles p
        WHERE p.region_key = $1
          AND p.profile_id = $2
          AND p.source_type = 'human'`,
      [regionKey, profileId],
    );
    if ((rowCount ?? 0) === 0) return undefined;
    return { profileId };
  }

  /** `403 CHAT_BLOCKED` si el par está bloqueado en cualquier dirección. */
  private async assertNotBlocked(
    client: PoolClient,
    regionKey: string,
    profileId: string,
    otherProfileId: string,
  ): Promise<void> {
    const { rows } = await client.query(
      `SELECT 1
         FROM blocks
        WHERE region_key = $1
          AND (
               (blocker_profile_id = $2 AND blocked_profile_id = $3)
            OR (blocker_profile_id = $3 AND blocked_profile_id = $2)
          )
        LIMIT 1`,
      [regionKey, profileId, otherProfileId],
    );
    if (rows.length > 0) {
      throw new AppProblemError(
        'CHAT_BLOCKED',
        'El par está bloqueado: no hay ping ni conversación posible. El mensaje no dice quién bloqueó a quién.',
      );
    }
  }

  /**
   * Escribe una notificación para `recipientProfileId`, si corresponde.
   *
   * Se ignora cuando es el propio actor (avisarte de tu propia acción no es una
   * notificación). El helper vive acá y no en `NotificationsService` porque el
   * insert tiene que ir en la **misma transacción** que el hecho: un ping sin su
   * aviso es una campana que miente.
   */
  private async notify(
    client: PoolClient,
    regionKey: string,
    recipientProfileId: string,
    actorProfileId: string,
    kind: 'ping.received' | 'match.created' | 'message.created',
    refs: { pingId?: string; matchId?: string; messageId?: string },
  ): Promise<void> {
    if (recipientProfileId === actorProfileId) return;
    await client.query(
      `INSERT INTO notifications
         (region_key, recipient_profile_id, actor_profile_id, kind, ping_id, match_id, message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        regionKey,
        recipientProfileId,
        actorProfileId,
        kind,
        refs.pingId ?? null,
        refs.matchId ?? null,
        refs.messageId ?? null,
      ],
    );
  }

  /** `429 RATE_LIMITED` cuando el perfil superó su ventana de envíos. */
  private async assertWithinRateLimit(client: PoolClient, session: AuthContext): Promise<void> {
    const { rows } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM pings
        WHERE region_key = $1
          AND from_profile_id = $2
          AND created_at > now() - make_interval(secs => $3)`,
      [session.regionKey, session.profileId, PING_RATE_WINDOW_SECONDS],
    );
    const used = rows[0]?.count ?? 0;
    if (used >= PING_RATE_LIMIT_PER_MINUTE) {
      throw new AppProblemError(
        'RATE_LIMITED',
        `Superaste el tope de ${PING_RATE_LIMIT_PER_MINUTE} pings por minuto. Esperá y reintentá.`,
      );
    }
  }

  /**
   * Inserta (o reusa) el match del par. El par se ordena para que `A↔B` y `B↔A`
   * caigan en la misma fila: es la garantía de "un match por par".
   *
   * `DO UPDATE SET match_id = matches.match_id` no cambia nada: es el truco para
   * que `RETURNING` devuelva la fila existente en el conflicto. `DO NOTHING` no
   * devuelve nada y obligaría a un segundo `SELECT`. `xmax = 0` distingue "esta
   * llamada la creó" de "ya existía": sin eso, un segundo ping aceptado del mismo
   * par volvería a notificar un match que ya estaba en la bandeja.
   */
  private async createMatch(
    client: PoolClient,
    regionKey: string,
    profileIds: readonly [string, string],
  ): Promise<CreatedMatchRow> {
    const [profileA, profileB] = [...profileIds].sort();
    const { rows } = await client.query<CreatedMatchRow>(
      `INSERT INTO matches (region_key, profile_a_id, profile_b_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (region_key, profile_a_id, profile_b_id)
       DO UPDATE SET match_id = matches.match_id
       RETURNING match_id, profile_a_id, profile_b_id, created_at, (xmax = 0) AS created`,
      [regionKey, profileA, profileB],
    );
    const row = rows[0];
    if (row === undefined) {
      throw new AppProblemError('INTERNAL', 'El match no se pudo crear.');
    }
    return row;
  }
}

function toListItem(row: PingListRow): PingListItem {
  const peer: PingPeer = {
    profileId: row.peer_profile_id,
    nickname: row.peer_nickname,
    initials: row.peer_initials,
    intention: row.peer_intention,
    photoId: row.peer_photo_id,
    sourceType: row.peer_source_type,
  };
  return { ping: toPing(row), peer };
}
