import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { AuthContext, SourceType } from '../auth/session.types';
import { AppProblemError } from '../common/problem';
import {
  isRecord,
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

/** `target` ya validado: quién es, si es un bot y quién es su dueño. */
interface PingTarget {
  readonly profileId: string;
  readonly isBot: boolean;
  /** El humano canónico: el propio `profileId`, o el dueño si es un bot. */
  readonly ownerProfileId: string;
  /** Zona del bot al resolver: `null` para un humano. */
  readonly botZoneKey: string | null;
}

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

/** Predicado de "el dueño del bot está vivo y visible": mismo criterio que discovery. */
const OWNER_VISIBLE = `
  EXISTS (
    SELECT 1
      FROM presence pr
      JOIN sessions s ON s.session_id = pr.session_id
     WHERE pr.region_key = b.region_key
       AND s.profile_id = b.owner_profile_id
       AND pr.expires_at > now()
       AND pr.visibility = 'visible'
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
  )`;

/** Un `profileId` de bot: `<owner>-b1` / `<owner>-b2`. */
const BOT_PROFILE_ID = /-b[12]$/;

/** El humano detrás de un `profileId`: el mismo si no es bot, el dueño si lo es. */
function canonicalProfileId(profileId: string): string {
  return profileId.replace(BOT_PROFILE_ID, '');
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

/** `targetProfileId` del body: obligatorio, string y sin campos de más. */
function parseTargetProfileId(body: unknown): string {
  if (!isRecord(body)) {
    throw validationFailed('body debe ser un objeto JSON con targetProfileId.');
  }
  rejectUnknownKeys(body, ['targetProfileId']);
  const value = body['targetProfileId'];
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed('targetProfileId es obligatorio y debe ser un string no vacío.');
  }
  return value;
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
 * **El bot acepta solo.** Si el destinatario es un bot (`<owner>-b1`), el ping se
 * inserta y se acepta en la misma transacción: la demo se siente viva sin un job
 * que despierte bots a los 2 s y el cliente no tiene un caso especial.
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
          'El destinatario no existe en esta región: un ping no cruza regiones y un bot sin dueño vivo no está.',
        );
      }

      // Bloqueo (v0.5): en cualquier dirección, el ping no sale. Se canoniza al
      // dueño porque `blocks` nunca guarda un bot.
      await this.assertNotBlocked(client, session.regionKey, session.profileId, target.ownerProfileId);

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

      if (!target.isBot) {
        // La notificación del ping es parte de la misma transacción que el ping:
        // o quedan los dos, o no queda ninguno. `notify` ignora destinatarios
        // bot (no leen avisos) y al propio actor.
        await this.notify(client, session.regionKey, target.profileId, session.profileId, 'ping.received', {
          pingId: ping.ping_id,
        });
        await client.query('COMMIT');
        committed = true;
        this.logger.log(`ping creado region=${session.regionKey} destino=humano`);
        return toPing(ping);
      }

      // El bot acepta solo: mismo camino que el accept humano, sin esperar.
      const match = await this.createMatch(
        client,
        session.regionKey,
        [session.profileId, targetProfileId],
        target.botZoneKey,
      );
      const accepted = await client.query<PingRow>(
        `UPDATE pings
            SET status = 'accepted', resolved_at = now(), match_id = $2
          WHERE ping_id = $1
          RETURNING ping_id, from_profile_id, to_profile_id, status, created_at, expires_at, match_id`,
        [ping.ping_id, match.match_id],
      );
      // El destinatario es un bot: `notify` no inserta nada. Se llama igual para
      // que la regla "quién genera aviso" viva en un solo lugar.
      await this.notify(client, session.regionKey, targetProfileId, session.profileId, 'match.created', {
        matchId: match.match_id,
      });
      await client.query('COMMIT');
      committed = true;
      this.logger.log(`ping creado region=${session.regionKey} destino=bot match=si`);
      return toPing(accepted.rows[0] ?? { ...ping, status: 'accepted', match_id: match.match_id });
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
   * proyección de perfiles, no un log. El único caso real es un ping a un bot
   * cuyo dueño ya no existe; el respaldo por `<owner>-b<n>` del lateral cubre el
   * caso normal (la fila del bot se va cuando el dueño pierde presencia, pero su
   * perfil de catálogo sigue).
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
         JOIN LATERAL (
           SELECT cand.*
             FROM (
               -- El peer tal cual está en el catálogo (humano).
               SELECT p.profile_id, p.nickname, p.initials, p.intention, p.photo_id, p.source_type
                 FROM profiles p
                WHERE p.region_key = pg.region_key
                  AND p.profile_id = ${columns.peer}
               UNION ALL
               -- Un bot no tiene fila de catálogo: hereda la de su dueño y se
               -- distingue por sourceType. El respaldo por nombre cubre el bot
               -- que el ticker ya retiró (<owner>-b1), así un ping viejo a un
               -- bot no desaparece de la bandeja.
               SELECT ${columns.peer} AS profile_id, o.nickname, o.initials, o.intention, o.photo_id, 'bot'::text
                 FROM profiles o
                WHERE o.region_key = pg.region_key
                  AND ${columns.peer} ~ '-b[12]$'
                  AND o.profile_id = regexp_replace(${columns.peer}, '-b[12]$', '')
             ) cand
            ORDER BY (cand.profile_id = ${columns.peer}) DESC
            LIMIT 1
         ) peer ON true
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
      // conversación no se abre. Se canoniza el emisor por si el ping salió de
      // un bot (hoy no pasa: `pings_from_fk` apunta a `profiles`).
      await this.assertNotBlocked(
        client,
        session.regionKey,
        session.profileId,
        canonicalProfileId(ping.from_profile_id),
      );

      const match = await this.createMatch(
        client,
        session.regionKey,
        [ping.from_profile_id, ping.to_profile_id],
        await this.botZoneOf(client, session.regionKey, ping.to_profile_id),
      );
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
   * El destinatario existe en esta región y sigue vivo.
   *
   * Un humano del catálogo existe mientras el catálogo lo tenga: su bandeja vive
   * en la base y no depende de que su presencia (12 s) esté viva en este
   * instante. Un bot, en cambio, es una proyección de su dueño: sin presencia
   * viva **y visible** no está, igual que en `GET /discovery`. Un bot de un dueño
   * en ghost no se puede pinguear: el ghost también lo esconde de los desconocidos.
   */
  private async resolveTarget(
    client: PoolClient,
    regionKey: string,
    profileId: string,
  ): Promise<PingTarget | undefined> {
    const { rows } = await client.query<{ kind: 'human' | 'bot'; zone_key: string | null }>(
      `SELECT 'human'::text AS kind, NULL::text AS zone_key
         FROM profiles p
        WHERE p.region_key = $1
          AND p.profile_id = $2
          AND p.source_type = 'human'
       UNION ALL
       SELECT 'bot'::text AS kind, b.zone_key
         FROM bots b
        WHERE b.region_key = $1
          AND b.bot_profile_id = $2
          AND ${OWNER_VISIBLE}
       LIMIT 1`,
      [regionKey, profileId],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    return {
      profileId,
      isBot: row.kind === 'bot',
      ownerProfileId: canonicalProfileId(profileId),
      botZoneKey: row.kind === 'bot' ? row.zone_key : null,
    };
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

  /** Zona vigente de un bot, o `null` si el perfil no es un bot. */
  private async botZoneOf(
    client: PoolClient,
    regionKey: string,
    profileId: string,
  ): Promise<string | null> {
    if (!BOT_PROFILE_ID.test(profileId)) return null;
    const { rows } = await client.query<{ zone_key: string }>(
      'SELECT zone_key FROM bots WHERE region_key = $1 AND bot_profile_id = $2',
      [regionKey, profileId],
    );
    return rows[0]?.zone_key ?? null;
  }

  /**
   * Escribe una notificación para `recipientProfileId`, si corresponde.
   *
   * Se ignora cuando el destinatario es un bot (`<owner>-b[12]`: no lee avisos)
   * o cuando es el propio actor (avisarte de tu propia acción no es una
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
    if (BOT_PROFILE_ID.test(recipientProfileId)) return;
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
   *
   * `botZoneKey` (v0.5) es la zona en la que nació la conversación cuando una de
   * las partes es un bot. Un match humano↔humano la deja en `NULL`: la región de
   * una persona no cambia y no hay nada que cerrar.
   */
  private async createMatch(
    client: PoolClient,
    regionKey: string,
    profileIds: readonly [string, string],
    botZoneKey: string | null,
  ): Promise<CreatedMatchRow> {
    const [profileA, profileB] = [...profileIds].sort();
    const { rows } = await client.query<CreatedMatchRow>(
      `INSERT INTO matches (region_key, profile_a_id, profile_b_id, bot_zone_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (region_key, profile_a_id, profile_b_id)
       DO UPDATE SET match_id = matches.match_id
       RETURNING match_id, profile_a_id, profile_b_id, created_at, (xmax = 0) AS created`,
      [regionKey, profileA, profileB, botZoneKey],
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
