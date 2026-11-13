import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import type { AuthContext, SourceType } from '../auth/session.types';
import {
  asOptionalRecord,
  rejectUnknownKeys,
  validationFailed,
} from '../common/validation';
import { PG_POOL } from '../db/database.module';
import type { PingPeer } from '../pings/pings.types';
import type {
  NotificationItem,
  NotificationKind,
  NotificationList,
  NotificationReadResult,
} from './notifications.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NotificationRow {
  notification_id: string;
  kind: NotificationKind;
  created_at: Date;
  read_at: Date | null;
  ping_id: string | null;
  match_id: string | null;
  message_id: string | null;
  peer_profile_id: string;
  peer_nickname: string;
  peer_initials: string;
  peer_intention: string;
  peer_photo_id: string;
  peer_source_type: SourceType;
  unread_total: number;
}

/**
 * `notificationIds` del body (v0.5): ausente = marcar todas.
 *
 * Un array vacío se trata como "todas" por la misma razón que el body vacío: el
 * cliente que manda `[]` no está pidiendo "ninguna" con un contrato que declara
 * `minItems: 1`. Si lo mandó como array, el contrato lo rechaza (422); acá se
 * distingue para no castigar al que quiso decir "todas".
 */
function parseNotificationIds(body: unknown): readonly string[] | null {
  const record = asOptionalRecord(body);
  rejectUnknownKeys(record, ['notificationIds']);
  const value = record['notificationIds'];
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw validationFailed('notificationIds debe ser un array de ids.');
  }
  if (value.length === 0) return null;
  if (value.length > 100) {
    throw validationFailed('notificationIds no puede tener más de 100 ids.');
  }
  for (const entry of value) {
    if (typeof entry !== 'string' || !UUID.test(entry)) {
      throw validationFailed('Cada notificationId debe ser un uuid.');
    }
  }
  return value.map((entry) => entry.toLowerCase());
}

/**
 * Notificaciones (Sprint 5, delta v0.5) — `contract/paths/notifications.yaml`.
 *
 * **Persistidas, no derivadas.** Los productores (`PingsService`,
 * `ChatService`) escriben la fila en el momento del hecho: crear un ping,
 * aceptarlo o mandar un mensaje. Leer no calcula nada; una notificación leída
 * sigue leída aunque el recurso cambie de estado.
 *
 * **Aditiva.** No reemplaza a las bandejas de S4: `GET /pings?box=inbox`,
 * `GET /matches` y el `unreadCount` de cada match siguen como estaban. El badge
 * del cliente (`bellBadgeCount(state, live.pings.pending)`) no se toca; esta
 * campana es la que puede reemplazarlo cuando la app lo decida.
 *
 * **Contador sobre el perfil.** `unreadCount` cuenta la tabla, no la página de
 * 100: el badge no puede mentir por un `LIMIT`.
 *
 * **Sin PII de más.** El item lleva la proyección pública del otro (`PingPeer`) y
 * las referencias; el texto del mensaje no viaja, se lee por la API del match.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** `GET /notifications` → 200 `NotificationList`. */
  async list(session: AuthContext): Promise<NotificationList> {
    const { rows } = await this.pool.query<NotificationRow>(
      `WITH mine AS (
         SELECT notification_id, kind, created_at, read_at, ping_id, match_id, message_id,
                actor_profile_id
           FROM notifications
          WHERE region_key = $1
            AND recipient_profile_id = $2
          ORDER BY created_at DESC, notification_id DESC
          LIMIT 100
       ), totals AS (
         SELECT count(*)::int AS unread_total
           FROM notifications
          WHERE region_key = $1
            AND recipient_profile_id = $2
            AND read_at IS NULL
       )
       SELECT m.notification_id, m.kind, m.created_at, m.read_at,
              m.ping_id, m.match_id, m.message_id,
              peer.profile_id   AS peer_profile_id,
              peer.nickname     AS peer_nickname,
              peer.initials     AS peer_initials,
              peer.intention    AS peer_intention,
              peer.photo_id     AS peer_photo_id,
              peer.source_type  AS peer_source_type,
              t.unread_total
         FROM mine m
         CROSS JOIN totals t
         -- Misma proyección que la bandeja de pings y el chat: humano del
         -- catálogo o bot con la fila de su dueño. Si el otro lado ya no está,
         -- la fila no se dibuja pero sigue contando para unreadCount.
         JOIN LATERAL (
           SELECT cand.*
             FROM (
               SELECT p.profile_id, p.nickname, p.initials, p.intention, p.photo_id, p.source_type
                 FROM profiles p
                WHERE p.region_key = $1
                  AND p.profile_id = m.actor_profile_id
               UNION ALL
               SELECT m.actor_profile_id AS profile_id, o.nickname, o.initials, o.intention,
                      o.photo_id, 'bot'::text
                 FROM profiles o
                WHERE o.region_key = $1
                  AND m.actor_profile_id ~ '-b[12]$'
                  AND o.profile_id = regexp_replace(m.actor_profile_id, '-b[12]$', '')
             ) cand
            ORDER BY (cand.profile_id = m.actor_profile_id) DESC
            LIMIT 1
         ) peer ON true
        ORDER BY m.created_at DESC, m.notification_id DESC`,
      [session.regionKey, session.profileId],
    );

    this.logger.debug(
      `notificaciones region=${session.regionKey} filas=${rows.length} unread=${rows[0]?.unread_total ?? 0}`,
    );

    return {
      notifications: rows.map(toItem),
      // `totals` es una CTE sin FROM: siempre devuelve una fila, pero si `mine`
      // está vacía el CROSS JOIN no devuelve nada. El contador se lee aparte
      // para no atarlo a que haya al menos una notificación.
      unreadCount: rows[0]?.unread_total ?? (await this.unreadCount(session)),
    };
  }

  /**
   * `POST /notifications/read` → 200 `NotificationReadResult`.
   *
   * Marca todas las no leídas (sin body o sin `notificationIds`) o sólo las
   * nombradas. `GREATEST`-style: sólo toca `read_at IS NULL`, así que repetir la
   * llamada no mueve la fecha de una notificación ya leída y `marked` es 0.
   *
   * Un id de otro perfil se ignora: el `WHERE` ya está acotado a la sesión, y
   * devolver 403 por "id ajeno" convertiría un intento en una confirmación de que
   * ese id existe.
   */
  async markRead(session: AuthContext, body: unknown): Promise<NotificationReadResult> {
    const ids = parseNotificationIds(body);

    const { rowCount } = await this.pool.query(
      `UPDATE notifications
          SET read_at = now()
        WHERE region_key = $1
          AND recipient_profile_id = $2
          AND read_at IS NULL
          AND ($3::uuid[] IS NULL OR notification_id = ANY($3::uuid[]))`,
      [session.regionKey, session.profileId, ids],
    );

    const marked = rowCount ?? 0;
    const unreadCount = await this.unreadCount(session);
    this.logger.debug(`notificaciones leídas region=${session.regionKey} marked=${marked}`);
    return { marked, unreadCount };
  }

  /** No leídas del perfil. */
  private async unreadCount(session: AuthContext): Promise<number> {
    const { rows } = await this.pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM notifications
        WHERE region_key = $1
          AND recipient_profile_id = $2
          AND read_at IS NULL`,
      [session.regionKey, session.profileId],
    );
    return rows[0]?.count ?? 0;
  }
}

function toItem(row: NotificationRow): NotificationItem {
  const peer: PingPeer = {
    profileId: row.peer_profile_id,
    nickname: row.peer_nickname,
    initials: row.peer_initials,
    intention: row.peer_intention,
    photoId: row.peer_photo_id,
    sourceType: row.peer_source_type,
  };
  return {
    id: row.notification_id,
    kind: row.kind,
    createdAt: row.created_at.toISOString(),
    readAt: row.read_at === null ? null : row.read_at.toISOString(),
    peer,
    pingId: row.ping_id,
    matchId: row.match_id,
    messageId: row.message_id,
  };
}
