import type { LiveNotification, LiveNotificationKind, LivePingPeer } from './types';
import { isLiveNotificationKind } from './types';

/**
 * Adapter de notificaciones: de `NotificationItem` (contrato) a la fila que
 * dibuja la campana.
 *
 * **`readAt` es el estado.** No hay `read: boolean` en la fila que pueda
 * contradecir la fecha: una notificación es no leída si y sólo si `readAt ===
 * null`. `POST /notifications/read` completa esa fecha, y el `unreadCount` del
 * server es el número del badge.
 *
 * **Qué se descarta.** Una fila sin `id`, con un `kind` fuera del enum o sin
 * proyección del peer no se dibuja: la campana prefiere una fila menos a un
 * icono sin sentido.
 */
export type NotificationRow = {
  id: string;
  kind: LiveNotificationKind;
  createdAt: string;
  readAt: string | null;
  peer: LivePingPeer;
  pingId: string | null;
  matchId: string | null;
  messageId: string | null;
};

export function toNotificationRow(item: LiveNotification): NotificationRow | null {
  if (item.id === '' || !isLiveNotificationKind(item.kind) || item.peer.profileId === '') {
    return null;
  }
  return {
    id: item.id,
    kind: item.kind,
    createdAt: item.createdAt,
    readAt: item.readAt,
    peer: item.peer,
    pingId: item.pingId,
    matchId: item.matchId,
    messageId: item.messageId,
  };
}

export function toNotificationRows(items: readonly LiveNotification[]): NotificationRow[] {
  const rows: NotificationRow[] = [];
  for (const item of items) {
    const row = toNotificationRow(item);
    if (row !== null) {
      rows.push(row);
    }
  }
  return sortNotifications(rows);
}

/** Más reciente primero; empate por `id` para que el orden sea determinista. */
export function sortNotifications(rows: readonly NotificationRow[]): NotificationRow[] {
  return [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export function isUnread(row: NotificationRow): boolean {
  return row.readAt === null;
}

/** No leídas de la página; el badge usa el `unreadCount` del server. */
export function unreadNotifications(rows: readonly NotificationRow[]): NotificationRow[] {
  return rows.filter(isUnread);
}
