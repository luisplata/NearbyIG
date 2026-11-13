import type { SourceType } from '../auth/session.types';

/**
 * `contract/schemas/pings.yaml` — tipos del flujo de conexión de S4.
 *
 * La fila `Ping` es la del recurso; la bandeja no la devuelve pelada, la anida en
 * `PingListItem { ping, peer }` porque cada fila muestra **al otro** perfil. Eso
 * evita que el cliente cruce el ping contra `/demo/profiles` (que además no
 * conoce a los bots).
 */

/** Los cuatro estados del contrato. `pending` es el único del que se sale. */
export type PingStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

/** Lado de la bandeja de `GET /pings?box=`. */
export type PingBox = 'inbox' | 'sent';

/** `PingPeer`: el otro lado del ping, sin coordenadas ni distancias. */
export interface PingPeer {
  readonly profileId: string;
  readonly nickname: string;
  readonly initials: string;
  readonly intention: string;
  readonly photoId: string;
  readonly sourceType: SourceType;
}

/** `Ping`: la fila del recurso, con `matchId` como puente al match. */
export interface Ping {
  readonly id: string;
  readonly fromProfileId: string;
  readonly toProfileId: string;
  readonly status: PingStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly matchId: string | null;
}

/** `PingListItem`: el ping y la proyección del otro perfil. */
export interface PingListItem {
  readonly ping: Ping;
  readonly peer: PingPeer;
}

/** `PingList`: objeto con array adentro, igual que `ProfileList`. */
export interface PingList {
  readonly pings: readonly PingListItem[];
}

/** `Match`: uno por par, con `profileIds` ordenado ascendente. */
export interface Match {
  readonly id: string;
  readonly profileIds: readonly [string, string];
  readonly createdAt: string;
}

/**
 * Vida de un ping pendiente. No se lee de `process.env` por la misma razón que
 * el TTL de presencia o del ticket: no es una perilla de operación, es la
 * ventana que el cliente ve en `expiresAt`. 24 h deja que un ping espere una
 * respuesta sin que la bandeja se llene de pendientes eternos.
 */
export const PING_TTL_SECONDS = 24 * 60 * 60;

/**
 * Tope de envíos por ventana. La demo es de 10 humanos por región: 30 pings por
 * minuto por perfil no limita a nadie real y corta un loop roto antes de que
 * llene la tabla. Es lo que hace `429 RATE_LIMITED` real en vez de declarado.
 */
export const PING_RATE_LIMIT_PER_MINUTE = 30;
export const PING_RATE_WINDOW_SECONDS = 60;

/**
 * Filas por bandeja. Es el `maxItems: 100` de `PingList`: la demo no tiene
 * volumen para paginar y un cursor inventado obligaría al cliente a un loop que
 * no necesita.
 */
export const PING_INBOX_LIMIT = 100;
