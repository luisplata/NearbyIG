import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { AuthContext, SourceType } from '../auth/session.types';
import { AppProblemError } from '../common/problem';
import {
  isRecord,
  rejectUnknownKeys,
  validationFailed,
} from '../common/validation';
import { PG_POOL } from '../db/database.module';
import { EventsService } from '../events/events.service';
import type { Match, PingPeer } from '../pings/pings.types';
import {
  BOT_REPLIES,
  BOT_REPLY_DELAY_MS,
  CLIENT_MESSAGE_ID_MAX_LENGTH,
  MATCH_LIST_LIMIT,
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  MESSAGE_RATE_LIMIT_PER_MINUTE,
  MESSAGE_RATE_WINDOW_SECONDS,
  type MatchList,
  type MatchListItem,
  type Message,
  type MessagePage,
} from './chat.types';

/** Fila de `messages` tal como vuelve de SQL. */
interface MessageRow {
  message_seq: string;
  message_id: string;
  match_id: string;
  sender_profile_id: string;
  client_message_id: string;
  body: string;
  created_at: Date;
}

/** Fila de la bandeja: el match + la proyección del otro + el último mensaje. */
interface MatchListRow {
  match_id: string;
  created_at: Date;
  profile_a_id: string;
  profile_b_id: string;
  peer_profile_id: string;
  peer_nickname: string;
  peer_initials: string;
  peer_intention: string;
  peer_photo_id: string;
  peer_source_type: SourceType;
  last_message_id: string | null;
  last_message_sender: string | null;
  last_message_client_id: string | null;
  last_message_body: string | null;
  last_message_created_at: Date | null;
  unread_count: number;
}

/** El match resuelto para una operación: quién es el otro y si se puede escribir. */
interface MatchAccess {
  readonly matchId: string;
  readonly peerProfileId: string;
  /** El otro lado es un bot: no tiene fila de catálogo. */
  readonly isBot: boolean;
  /** El otro lado se puede proyectar (humano del catálogo o bot con dueño). */
  readonly peerProjectable: boolean;
  /** El par está bloqueado en cualquier dirección (v0.5). */
  readonly blocked: boolean;
  /** Zona en la que nació el match, si una parte es un bot. `null` si no. */
  readonly botZoneKey: string | null;
  /** Zona vigente del bot del otro lado; `null` si no es bot o ya no está. */
  readonly peerBotZone: string | null;
}

/** Un `profileId` de bot: `<owner>-b1` / `<owner>-b2`. */
const BOT_PROFILE_ID = /-b[12]$/;

/** `matchId` del path: un id malformado es 422, no 404. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GET /matches`, `GET|POST /matches/{id}/messages` y `POST /matches/{id}/read`
 * — `contract/paths/matches.yaml`, delta v0.4.
 *
 * **Un match es una conversación, no un recurso del mundo.** Las cuatro
 * operations comparten una sola pregunta: *¿esta sesión es parte de este match?*
 *
 * | Caso | Respuesta |
 * |---|---|
 * | el match no existe en la región | `404 MATCH_NOT_FOUND` |
 * | existe y la sesión no es parte | `403 CHAT_BLOCKED` |
 * | es parte, pero el otro lado ya no se proyecta | `409 MATCH_CLOSED` al escribir |
 * | es parte y el otro está | la operación |
 *
 * El 404 y el 403 no se colapsan: un match de otra región no existe para esta
 * sesión y uno ajeno existe pero no es suyo. Son dos mensajes distintos en
 * pantalla ("este chat ya no está" vs. "este chat no es tuyo").
 *
 * **Idempotencia del envío.** `clientMessageId` es única por `(match, emisor)` y
 * la impone un índice único, no un `SELECT` previo: dos reintentos simultáneos
 * no pueden dejar dos mensajes. El que pierde la carrera lee la fila que ganó y
 * devuelve **ese** mensaje, sin emitir un segundo evento.
 *
 * **El bot.** Si el otro lado es un bot, el server agenda su respuesta a los
 * ~2 s y emite `typing.started` en el acto. El timer vive en este proceso y hay
 * **uno por match** (`pendingBotReplies`): tres mensajes seguidos producen una
 * respuesta, no tres, y el cliente no simula nada. Un reinicio de la API pierde
 * la respuesta pendiente; la demo es efímera y el mensaje del humano ya está
 * persistido.
 *
 * **Lo que nunca sale ni se loguea.** Ni coordenadas, ni `distanceM`/`bearingDeg`
 * (este módulo no consulta geometría), ni el `body` en un log, ni el `profileId`
 * de nadie: los logs llevan región, `matchId` y conteos.
 */
@Injectable()
export class ChatService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatService.name);

  /**
   * Un timer de respuesta por match. La clave es el `matchId`: es lo que hace
   * que "sin timers duplicados" sea estructural y no una promesa — dos mensajes
   * seguidos al mismo bot no agendan dos respuestas.
   */
  private readonly pendingBotReplies = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly events: EventsService,
  ) {}

  /** Apaga los timers pendientes para que un shutdown no deje trabajo colgado. */
  onModuleDestroy(): void {
    for (const timer of this.pendingBotReplies.values()) clearTimeout(timer);
    this.pendingBotReplies.clear();
  }

  /**
   * `GET /matches`: la bandeja del perfil de la sesión, más reciente primero.
   *
   * Un match cuyo peer no se puede proyectar no se lista: la fila de la bandeja
   * es una proyección de perfiles, no un log. Es el mismo criterio que la
   * bandeja de pings, y el caso real es el mismo: un match con un bot cuyo dueño
   * desapareció del catálogo.
   */
  async listMatches(session: AuthContext): Promise<MatchList> {
    const { rows } = await this.pool.query<MatchListRow>(
      `SELECT m.match_id, m.created_at, m.profile_a_id, m.profile_b_id,
              peer.profile_id   AS peer_profile_id,
              peer.nickname     AS peer_nickname,
              peer.initials     AS peer_initials,
              peer.intention    AS peer_intention,
              peer.photo_id     AS peer_photo_id,
              peer.source_type  AS peer_source_type,
              lm.message_id     AS last_message_id,
              lm.sender_profile_id AS last_message_sender,
              lm.client_message_id AS last_message_client_id,
              lm.body           AS last_message_body,
              lm.created_at     AS last_message_created_at,
              (
                SELECT count(*)::int
                  FROM messages unread
                 WHERE unread.match_id = m.match_id
                   AND unread.sender_profile_id <> $2
                   AND unread.message_seq > coalesce(r.last_read_seq, 0)
              ) AS unread_count
         FROM matches m
         CROSS JOIN LATERAL (
           SELECT CASE
                    WHEN m.profile_a_id = $2 THEN m.profile_b_id
                    ELSE m.profile_a_id
                  END AS peer_id
         ) other
         JOIN LATERAL (
           SELECT cand.*
             FROM (
               -- El peer humano: la fila del catálogo, tal cual.
               SELECT p.profile_id, p.nickname, p.initials, p.intention, p.photo_id, p.source_type
                 FROM profiles p
                WHERE p.region_key = m.region_key
                  AND p.profile_id = other.peer_id
               UNION ALL
               -- Un bot no tiene fila de catálogo: hereda la de su dueño y se
               -- distingue por sourceType, igual que en la bandeja de pings. El
               -- respaldo por nombre cubre al bot que el ticker ya retiró, así
               -- una conversación vieja no desaparece de la lista.
               SELECT other.peer_id AS profile_id, o.nickname, o.initials, o.intention,
                      o.photo_id, 'bot'::text
                 FROM profiles o
                WHERE o.region_key = m.region_key
                  AND other.peer_id ~ '-b[12]$'
                  AND o.profile_id = regexp_replace(other.peer_id, '-b[12]$', '')
             ) cand
            ORDER BY (cand.profile_id = other.peer_id) DESC
            LIMIT 1
         ) peer ON true
         LEFT JOIN LATERAL (
           SELECT msg.message_id, msg.sender_profile_id, msg.client_message_id, msg.body, msg.created_at
             FROM messages msg
            WHERE msg.match_id = m.match_id
            ORDER BY msg.message_seq DESC
            LIMIT 1
         ) lm ON true
         LEFT JOIN match_reads r
                ON r.match_id = m.match_id AND r.profile_id = $2
        WHERE m.region_key = $1
          AND (m.profile_a_id = $2 OR m.profile_b_id = $2)
        ORDER BY m.created_at DESC, m.match_id DESC
        LIMIT $3`,
      [session.regionKey, session.profileId, MATCH_LIST_LIMIT],
    );

    this.logger.debug(
      `bandeja de matches region=${session.regionKey} filas=${rows.length}`,
    );
    return { matches: rows.map((row) => toListItem(row, session.profileId)) };
  }

  /**
   * `GET /matches/{matchId}/messages`: una página cronológica de la conversación.
   *
   * El orden es el del server (`message_seq`), no `createdAt`: dos mensajes con
   * la misma marca de tiempo se desempatan igual en las dos direcciones del
   * cursor, así que una página no puede perder ni repetir filas.
   */
  async listMessages(
    session: AuthContext,
    rawMatchId: unknown,
    rawCursor: unknown,
  ): Promise<MessagePage> {
    const matchId = parseMatchId(rawMatchId);
    const afterSeq = parseCursor(rawCursor);
    await this.resolveAccess(session, matchId);

    const { rows } = await this.pool.query<MessageRow>(
      `SELECT message_seq, message_id, match_id, sender_profile_id, client_message_id, body, created_at
         FROM messages
        WHERE match_id = $1
          AND ($2::bigint IS NULL OR message_seq > $2::bigint)
        ORDER BY message_seq
        LIMIT $3`,
      [matchId, afterSeq, MESSAGE_PAGE_SIZE + 1],
    );

    const page = rows.slice(0, MESSAGE_PAGE_SIZE);
    const hasMore = rows.length > MESSAGE_PAGE_SIZE;
    return {
      messages: page.map(toMessage),
      nextCursor:
        hasMore && page.length > 0
          ? encodeCursor(String(page[page.length - 1]!.message_seq))
          : null,
      hasMore,
    };
  }

  /**
   * `POST /matches/{matchId}/read`: marca leídos los mensajes del otro lado.
   *
   * Es un watermark (`last_read_seq`), no un recibo por mensaje: `unreadCount`
   * es una cuenta, y `GREATEST` impide que un pedido viejo y uno nuevo en
   * paralelo retrocedan la marca. Repetirlo es idempotente por resultado.
   */
  async markRead(session: AuthContext, rawMatchId: unknown): Promise<void> {
    const matchId = parseMatchId(rawMatchId);
    await this.resolveAccess(session, matchId);

    await this.pool.query(
      `INSERT INTO match_reads (match_id, profile_id, last_read_seq)
       VALUES (
         $1,
         $2,
         coalesce((SELECT max(message_seq) FROM messages WHERE match_id = $1), 0)
       )
       ON CONFLICT (match_id, profile_id) DO UPDATE
          SET last_read_seq = GREATEST(match_reads.last_read_seq, EXCLUDED.last_read_seq),
              updated_at = now()`,
      [matchId, session.profileId],
    );
    this.logger.debug(`conversación marcada como leída region=${session.regionKey}`);
  }

  /**
   * `POST /matches/{matchId}/messages`: escribe en la conversación.
   *
   * Orden de las guardas: participación (403), estado del match (409), body
   * (422) y cuota (429). El body se valida **antes** de tocar la base para que
   * un pedido mal formado no gaste una consulta.
   *
   * Si el otro lado es un bot, la respuesta del bot se agenda acá: una sola vez
   * por match, con `typing.started` emitido en el acto (`emitTyping`).
   */
  async send(session: AuthContext, rawMatchId: unknown, body: unknown): Promise<Message> {
    const matchId = parseMatchId(rawMatchId);
    const input = parseMessageBody(body);
    const access = await this.resolveAccess(session, matchId);

    // Bloqueo primero: es un 403 (derecho), no un 409 (estado). La conversación
    // sigue legible; escribirla no.
    if (access.blocked) {
      throw new AppProblemError(
        'CHAT_BLOCKED',
        'La conversación está bloqueada: no acepta mensajes nuevos. La historia sigue legible.',
      );
    }

    // Cerrada por dos motivos: el otro lado ya no existe para la demo, o el bot
    // del otro lado se volvió a sembrar en otra zona porque su dueño se mudó
    // (v0.5). En los dos casos la historia queda legible y escribir es 409.
    if (!access.peerProjectable || (access.botZoneKey !== null && access.peerBotZone !== access.botZoneKey)) {
      throw new AppProblemError(
        'MATCH_CLOSED',
        'La conversación está cerrada: el otro lado ya no está en la demo o cambió de zona. La historia sigue legible.',
      );
    }

    await this.assertWithinRateLimit(session);

    const { rows } = await this.pool.query<MessageRow>(
      `INSERT INTO messages (region_key, match_id, sender_profile_id, client_message_id, body)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (match_id, sender_profile_id, client_message_id) DO NOTHING
       RETURNING message_seq, message_id, match_id, sender_profile_id, client_message_id, body, created_at`,
      [session.regionKey, matchId, session.profileId, input.clientMessageId, input.body],
    );

    const inserted = rows[0];
    if (inserted === undefined) {
      // Reintento: el mensaje ya existía con esta clave. Se devuelve **ese**, sin
      // emitir un segundo `message.created`.
      const existing = await this.pool.query<MessageRow>(
        `SELECT message_seq, message_id, match_id, sender_profile_id, client_message_id, body, created_at
           FROM messages
          WHERE match_id = $1 AND sender_profile_id = $2 AND client_message_id = $3`,
        [matchId, session.profileId, input.clientMessageId],
      );
      const row = existing.rows[0];
      if (row === undefined) {
        throw new AppProblemError('INTERNAL', 'El mensaje no se pudo leer después del conflicto.');
      }
      this.logger.debug(`mensaje repetido region=${session.regionKey} sin duplicar`);
      return toMessage(row);
    }

    await this.emitCreated(session.regionKey, inserted);

    // La campana del otro lado. Sólo si es humano: un bot no lee avisos y el
    // propio emisor no se notifica. El aviso va después del insert y no en la
    // misma transacción —el insert ya commiteó—: si fallara, el mensaje sigue
    // siendo la fuente de verdad y `GET /matches` lo muestra con su unreadCount.
    if (!access.isBot) {
      await this.notifyMessage(session.regionKey, access.peerProfileId, session.profileId, inserted, matchId);
    }

    if (access.isBot) {
      await this.emitTyping(session.regionKey, matchId, access.peerProfileId);
      this.scheduleBotReply(session.regionKey, matchId, access.peerProfileId);
    }

    this.logger.log(`mensaje creado region=${session.regionKey} bot=${access.isBot}`);
    return toMessage(inserted);
  }

  /**
   * Resuelve el match y la participación de la sesión en una sola consulta.
   *
   * `peer_projectable` mira las dos formas en que el otro lado existe: una fila
   * de catálogo (humano) o el dueño de un bot (`<owner>-b1|b2` → `owner`). Un
   * match donde ninguna de las dos aplica está cerrado: se puede leer, no
   * escribir.
   */
  private async resolveAccess(session: AuthContext, matchId: string): Promise<MatchAccess> {
    const { rows } = await this.pool.query<{
      peer_id: string | null;
      peer_in_catalog: boolean;
      bot_owner_in_catalog: boolean;
      blocked: boolean;
      bot_zone_key: string | null;
      peer_bot_zone: string | null;
    }>(
      `SELECT other.peer_id,
              EXISTS (
                SELECT 1 FROM profiles p
                 WHERE p.region_key = m.region_key
                   AND p.profile_id = other.peer_id
              ) AS peer_in_catalog,
              EXISTS (
                SELECT 1 FROM profiles o
                 WHERE o.region_key = m.region_key
                   AND other.peer_id ~ '-b[12]$'
                   AND o.profile_id = regexp_replace(other.peer_id, '-b[12]$', '')
              ) AS bot_owner_in_catalog,
              -- Bloqueo (v0.5): en cualquier dirección. Se compara contra el
              -- humano detrás del perfil, porque blocks nunca guarda un bot.
              EXISTS (
                SELECT 1 FROM blocks bl
                 WHERE bl.region_key = m.region_key
                   AND (
                        (bl.blocker_profile_id = $3 AND bl.blocked_profile_id = owner.peer_owner_id)
                     OR (bl.blocker_profile_id = owner.peer_owner_id AND bl.blocked_profile_id = $3)
                   )
              ) AS blocked,
              m.bot_zone_key,
              (
                SELECT b.zone_key FROM bots b
                 WHERE b.region_key = m.region_key
                   AND b.bot_profile_id = other.peer_id
              ) AS peer_bot_zone
         FROM matches m
         CROSS JOIN LATERAL (
           SELECT CASE
                    WHEN m.profile_a_id = $3 THEN m.profile_b_id
                    WHEN m.profile_b_id = $3 THEN m.profile_a_id
                    ELSE NULL
                  END AS peer_id
         ) other
         CROSS JOIN LATERAL (
           SELECT CASE
                    WHEN other.peer_id ~ '-b[12]$'
                      THEN regexp_replace(other.peer_id, '-b[12]$', '')
                    ELSE other.peer_id
                  END AS peer_owner_id
         ) owner
        WHERE m.match_id = $1
          AND m.region_key = $2`,
      [matchId, session.regionKey, session.profileId],
    );

    const row = rows[0];
    if (row === undefined) {
      throw new AppProblemError('MATCH_NOT_FOUND', 'El match no existe en esta región.');
    }
    if (row.peer_id === null) {
      // El match está en la región pero la sesión no es parte: el recurso existe
      // y el derecho no. Es el 403 del contrato, no un 404 que mentiría.
      throw new AppProblemError(
        'CHAT_BLOCKED',
        'Esta sesión no es parte de ese match: no puede leer ni escribir su conversación.',
      );
    }

    return {
      matchId,
      peerProfileId: row.peer_id,
      isBot: !row.peer_in_catalog,
      peerProjectable: row.peer_in_catalog || row.bot_owner_in_catalog,
      blocked: row.blocked,
      botZoneKey: row.bot_zone_key,
      peerBotZone: row.peer_bot_zone,
    };
  }

  /** `429 RATE_LIMITED` cuando el perfil superó su ventana de mensajes. */
  private async assertWithinRateLimit(session: AuthContext): Promise<void> {
    const { rows } = await this.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM messages
        WHERE region_key = $1
          AND sender_profile_id = $2
          AND created_at > now() - make_interval(secs => $3)`,
      [session.regionKey, session.profileId, MESSAGE_RATE_WINDOW_SECONDS],
    );
    const used = rows[0]?.count ?? 0;
    if (used >= MESSAGE_RATE_LIMIT_PER_MINUTE) {
      throw new AppProblemError(
        'RATE_LIMITED',
        `Superaste el tope de ${MESSAGE_RATE_LIMIT_PER_MINUTE} mensajes por minuto. Esperá y reintentá.`,
      );
    }
  }

  /**
   * Emite `typing.started`. Un fallo del log **no** hace fallar el envío: el
   * mensaje ya está persistido y `GET .../messages` sigue siendo la fuente de
   * verdad; el aviso es una notificación, no el dato.
   */
  private async emitTyping(regionKey: string, matchId: string, profileId: string): Promise<void> {
    try {
      await this.events.append(regionKey, 'typing.started', { matchId, profileId });
    } catch (error) {
      this.warnEmit('typing.started', regionKey, error);
    }
  }

  /** Emite `message.created`; misma regla: el aviso no puede tumbar el mensaje. */
  private async emitCreated(regionKey: string, row: MessageRow): Promise<void> {
    try {
      await this.events.append(regionKey, 'message.created', {
        matchId: row.match_id,
        messageId: row.message_id,
        senderProfileId: row.sender_profile_id,
      });
    } catch (error) {
      this.warnEmit('message.created', regionKey, error);
    }
  }

  private warnEmit(type: string, regionKey: string, error: unknown): void {
    this.logger.warn(
      `no se pudo emitir ${type} region=${regionKey}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  /**
   * Escribe la notificación de un mensaje nuevo para el otro lado.
   *
   * No es parte del camino crítico: el mensaje ya está persistido y
   * `GET /matches/{id}/messages` es la fuente de verdad. Un fallo acá se loguea
   * sin datos personales —sólo región y `matchId`— y no tumba el envío.
   */
  private async notifyMessage(
    regionKey: string,
    recipientProfileId: string,
    actorProfileId: string,
    row: MessageRow,
    matchId: string,
  ): Promise<void> {
    if (recipientProfileId === actorProfileId || BOT_PROFILE_ID.test(recipientProfileId)) return;
    try {
      await this.pool.query(
        `INSERT INTO notifications
           (region_key, recipient_profile_id, actor_profile_id, kind, match_id, message_id)
         VALUES ($1, $2, $3, 'message.created', $4, $5)`,
        [regionKey, recipientProfileId, actorProfileId, matchId, row.message_id],
      );
    } catch (error) {
      this.logger.warn(
        `no se pudo registrar la notificación del mensaje region=${regionKey} match=${matchId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Agenda la respuesta del bot. Un timer por match: el segundo mensaje no agrega otro. */
  private scheduleBotReply(regionKey: string, matchId: string, botProfileId: string): void {
    if (this.pendingBotReplies.has(matchId)) return;
    const timer = setTimeout(() => {
      void this.replyAsBot(regionKey, matchId, botProfileId);
    }, BOT_REPLY_DELAY_MS);
    // Sin `unref` el timer mantiene vivo el proceso en un shutdown limpio.
    timer.unref();
    this.pendingBotReplies.set(matchId, timer);
  }

  /**
   * El bot contesta. Texto fijo de `BOT_REPLIES`, elegido para no repetir el
   * último que dijo: dos respuestas consecutivas del mismo bot nunca son iguales.
   */
  private async replyAsBot(regionKey: string, matchId: string, botProfileId: string): Promise<void> {
    this.pendingBotReplies.delete(matchId);
    try {
      const { rows: previous } = await this.pool.query<{ body: string }>(
        `SELECT body
           FROM messages
          WHERE match_id = $1 AND sender_profile_id = $2
          ORDER BY message_seq DESC
          LIMIT 1`,
        [matchId, botProfileId],
      );
      const lastBody = previous[0]?.body;
      const reply = BOT_REPLIES.find((text) => text !== lastBody) ?? BOT_REPLIES[0];

      const { rows } = await this.pool.query<MessageRow>(
        `INSERT INTO messages (region_key, match_id, sender_profile_id, client_message_id, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING message_seq, message_id, match_id, sender_profile_id, client_message_id, body, created_at`,
        [regionKey, matchId, botProfileId, `bot-${randomUUID()}`, reply],
      );
      const inserted = rows[0];
      if (inserted === undefined) return;

      await this.emitCreated(regionKey, inserted);
      // El aviso de la respuesta del bot es para el humano de la conversación.
      const { rows: peers } = await this.pool.query<{ recipient: string }>(
        `SELECT CASE WHEN profile_a_id = $2 THEN profile_b_id ELSE profile_a_id END AS recipient
           FROM matches
          WHERE match_id = $1`,
        [matchId, botProfileId],
      );
      const recipient = peers[0]?.recipient;
      if (recipient !== undefined) {
        await this.notifyMessage(regionKey, recipient, botProfileId, inserted, matchId);
      }
      this.logger.log(`respuesta de bot region=${regionKey}`);
    } catch (error) {
      // El match o su región pueden haberse ido entre el envío y la respuesta
      // (reset global, logout del dueño). No hay cliente esperando esto: se
      // loguea sin datos personales y se deja el timer limpio.
      this.logger.warn(
        `respuesta de bot descartada region=${regionKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.message_id,
    matchId: row.match_id,
    senderProfileId: row.sender_profile_id,
    clientMessageId: row.client_message_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

function toListItem(row: MatchListRow, observerProfileId: string): MatchListItem {
  const peer: PingPeer = {
    profileId: row.peer_profile_id,
    nickname: row.peer_nickname,
    initials: row.peer_initials,
    intention: row.peer_intention,
    photoId: row.peer_photo_id,
    sourceType: row.peer_source_type,
  };
  const match: Match = {
    id: row.match_id,
    profileIds: [row.profile_a_id, row.profile_b_id],
    createdAt: row.created_at.toISOString(),
  };
  const lastMessage: Message | null =
    row.last_message_id === null
      ? null
      : {
          id: row.last_message_id,
          matchId: row.match_id,
          senderProfileId: row.last_message_sender ?? observerProfileId,
          clientMessageId: row.last_message_client_id ?? '',
          body: row.last_message_body ?? '',
          createdAt: (row.last_message_created_at ?? row.created_at).toISOString(),
        };
  return { match, peer, lastMessage, unreadCount: row.unread_count };
}

function parseMatchId(raw: unknown): string {
  if (typeof raw !== 'string' || !UUID.test(raw)) {
    throw validationFailed('matchId debe ser un uuid.');
  }
  return raw.toLowerCase();
}

/**
 * `MessageCreate` validado a mano: dos campos obligatorios, ninguno de más y los
 * topes del schema. El body se **recorta** acá, antes de guardarse, para que
 * "hola " y "hola" sean el mismo mensaje y un body de sólo espacios sea 422.
 */
function parseMessageBody(body: unknown): { clientMessageId: string; body: string } {
  if (!isRecord(body)) {
    throw validationFailed('body debe ser un objeto JSON con clientMessageId y body.');
  }
  rejectUnknownKeys(body, ['clientMessageId', 'body']);

  const clientMessageId = body['clientMessageId'];
  if (typeof clientMessageId !== 'string' || clientMessageId.trim() === '') {
    throw validationFailed('clientMessageId es obligatorio y debe ser un string no vacío.');
  }
  if (clientMessageId.length > CLIENT_MESSAGE_ID_MAX_LENGTH) {
    throw validationFailed(`clientMessageId no puede superar ${CLIENT_MESSAGE_ID_MAX_LENGTH} caracteres.`);
  }

  const text = body['body'];
  if (typeof text !== 'string') {
    throw validationFailed('body del mensaje es obligatorio y debe ser un string.');
  }
  const trimmed = text.trim();
  if (trimmed === '') {
    throw validationFailed('El mensaje no puede estar vacío.');
  }
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    throw validationFailed(`El mensaje no puede superar ${MESSAGE_MAX_LENGTH} caracteres.`);
  }
  return { clientMessageId, body: trimmed };
}

/**
 * Cursor de `MessagePage`: base64url del `message_seq`.
 *
 * **Opaco a propósito.** El cliente no lo parsea ni lo construye; el server lo
 * emite y lo acepta tal cual. Adentro hay un `bigint` y no un `createdAt` porque
 * dos mensajes en el mismo milisegundo necesitan un desempate que no dependa del
 * reloj.
 */
function encodeCursor(seq: string): string {
  return Buffer.from(seq, 'utf8').toString('base64url');
}

function parseCursor(raw: unknown): string | null {
  // Vacío es "sin cursor": el cliente que manda `?cursor=` cuando no hay más
  // páginas no tiene que comerse un 422. Es el mismo criterio que el cursor de
  // `GET /events`.
  if (raw === undefined || raw === '') return null;
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw validationFailed('cursor está malformado: devolvé el nextCursor tal como lo recibiste.');
  }
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  if (!/^[0-9]{1,19}$/.test(decoded)) {
    throw validationFailed('cursor está malformado: devolvé el nextCursor tal como lo recibiste.');
  }
  return decoded;
}
