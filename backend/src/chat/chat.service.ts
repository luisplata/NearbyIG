import { Inject, Injectable, Logger } from '@nestjs/common';
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
  /** El otro lado tiene fila en `profiles`: si no, la conversación está cerrada. */
  readonly peerProjectable: boolean;
  /** El par está bloqueado en cualquier dirección (v0.5). */
  readonly blocked: boolean;
}

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
 * **Lo que nunca sale ni se loguea.** Ni coordenadas, ni `distanceM`/`bearingDeg`
 * (este módulo no consulta geometría), ni el `body` en un log, ni el `profileId`
 * de nadie: los logs llevan región, `matchId` y conteos.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly events: EventsService,
  ) {}

  /**
   * `GET /matches`: la bandeja del perfil de la sesión, más reciente primero.
   *
   * Un match cuyo peer no se puede proyectar no se lista: la fila de la bandeja
   * es una proyección de perfiles, no un log. Es el mismo criterio que la
   * bandeja de pings, y el caso real es el mismo: un match viejo con un peer que
   * ya no está en el catálogo.
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
         JOIN profiles peer
           ON peer.region_key = m.region_key
          AND peer.profile_id = CASE
                                  WHEN m.profile_a_id = $2 THEN m.profile_b_id
                                  ELSE m.profile_a_id
                                END
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

    // Cerrada por un solo motivo: el otro lado ya no está en el catálogo. La
    // historia queda legible y escribir es 409.
    if (!access.peerProjectable) {
      throw new AppProblemError(
        'MATCH_CLOSED',
        'La conversación está cerrada: el otro lado ya no está en la demo. La historia sigue legible.',
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

    // La campana del otro lado. El propio emisor no se notifica. El aviso va
    // después del insert y no en la misma transacción —el insert ya commiteó—:
    // si fallara, el mensaje sigue siendo la fuente de verdad y `GET /matches`
    // lo muestra con su unreadCount.
    await this.notifyMessage(session.regionKey, access.peerProfileId, session.profileId, inserted, matchId);

    this.logger.log(`mensaje creado region=${session.regionKey}`);
    return toMessage(inserted);
  }

  /**
   * Resuelve el match y la participación de la sesión en una sola consulta.
   *
   * `peer_projectable` es una sola pregunta: ¿el otro lado tiene fila en
   * `profiles`? Un match donde no la tiene está cerrado: se puede leer, no
   * escribir. El match no tiene FK a `profiles` (`005_pings.sql`), así que la
   * pregunta hay que hacerla acá y no darla por hecha.
   */
  private async resolveAccess(session: AuthContext, matchId: string): Promise<MatchAccess> {
    const { rows } = await this.pool.query<{
      peer_id: string | null;
      peer_projectable: boolean;
      blocked: boolean;
    }>(
      `SELECT other.peer_id,
              EXISTS (
                SELECT 1 FROM profiles p
                 WHERE p.region_key = m.region_key
                   AND p.profile_id = other.peer_id
              ) AS peer_projectable,
              -- Bloqueo (v0.5): en cualquier dirección. Se compara contra el
              -- perfil del otro lado, que es la identidad que guarda blocks.
              EXISTS (
                SELECT 1 FROM blocks bl
                 WHERE bl.region_key = m.region_key
                   AND (
                        (bl.blocker_profile_id = $3 AND bl.blocked_profile_id = other.peer_id)
                     OR (bl.blocker_profile_id = other.peer_id AND bl.blocked_profile_id = $3)
                   )
              ) AS blocked
         FROM matches m
         CROSS JOIN LATERAL (
           SELECT CASE
                    WHEN m.profile_a_id = $3 THEN m.profile_b_id
                    WHEN m.profile_b_id = $3 THEN m.profile_a_id
                    ELSE NULL
                  END AS peer_id
         ) other
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
      peerProjectable: row.peer_projectable,
      blocked: row.blocked,
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

  /** Emite `message.created`; el aviso no puede tumbar el mensaje. */
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
    if (recipientProfileId === actorProfileId) return;
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
