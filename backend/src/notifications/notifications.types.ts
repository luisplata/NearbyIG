import type { PingPeer } from '../pings/pings.types';

/**
 * Tipos de notificación, alineados con `contract/schemas/notifications.yaml`.
 *
 * `readAt` es la única autoridad de lectura: `null` = no leída. No hay un
 * booleano `unread` que pueda contradecir la fecha.
 */
export type NotificationKind = 'ping.received' | 'match.created' | 'message.created';

export interface NotificationItem {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly peer: PingPeer;
  readonly pingId: string | null;
  readonly matchId: string | null;
  readonly messageId: string | null;
}

export interface NotificationList {
  readonly notifications: readonly NotificationItem[];
  /** No leídas del perfil, contadas sobre la tabla (no sobre la página). */
  readonly unreadCount: number;
}

export interface NotificationReadResult {
  readonly marked: number;
  readonly unreadCount: number;
}
