import type { LivePingItem, LivePingPeer, PingBox, PingStatus } from './types';
import { isPingStatus } from './types';
import type { PingsCopyKey } from './pingsCopy';

/**
 * Adapter de pings: de `PingListItem` (contrato) a la fila que dibuja la UI.
 *
 * **Por qué una fila propia.** La bandeja necesita el `peer` ya proyectado por
 * el server —nickname, iniciales, foto e intención del otro— y el ping con su
 * estado. El cliente no cruza el ping contra `/demo/profiles` porque no conoce a
 * los bots y una segunda copia del shape se desincroniza en cuanto el ping
 * crece. Acá sólo se valida y se ordena; nada se inventa.
 *
 * **Qué se descarta.** `fromProfileId`/`toProfileId` no se dibujan: la
 * dirección ya la dice la bandeja (`box`) y el "otro" es `peer`. `expiresAt`
 * queda en la fila porque la UI puede explicar un vencimiento, pero el server es
 * la autoridad: la app no recalcula el estado con el reloj del cliente.
 */

export type PingRow = {
  id: string;
  /** Lado de la bandeja en el que se listó esta fila. */
  box: PingBox;
  status: PingStatus;
  createdAt: string;
  expiresAt: string;
  matchId: string | null;
  peer: LivePingPeer;
};

/** Una fila válida o `null`: preferible una bandeja corta a un `undefined` en pantalla. */
export function toPingRow(item: LivePingItem, box: PingBox): PingRow | null {
  const ping = item.ping;
  const peer = item.peer;
  if (ping.id === '' || !isPingStatus(ping.status)) {
    return null;
  }
  if (peer.profileId === '' || peer.nickname === '') {
    return null;
  }
  return {
    id: ping.id,
    box,
    status: ping.status,
    createdAt: ping.createdAt,
    expiresAt: ping.expiresAt,
    matchId: ping.matchId,
    peer,
  };
}

export function toPingRows(items: readonly LivePingItem[], box: PingBox): PingRow[] {
  const rows: PingRow[] = [];
  for (const item of items) {
    const row = toPingRow(item, box);
    if (row !== null) {
      rows.push(row);
    }
  }
  return sortPings(rows);
}

/**
 * `createdAt` descendente, que es "lo más nuevo arriba". El server ya manda ese
 * orden; se reordena por si una fila viene de un refresh optimista. Empate por
 * `id` para que el orden sea determinista.
 */
export function sortPings(rows: readonly PingRow[]): PingRow[] {
  return [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** Pings que todavía esperan respuesta. Es el número del badge. */
export function pendingPings(rows: readonly PingRow[]): PingRow[] {
  return rows.filter((row) => row.status === 'pending');
}

export function pendingCount(rows: readonly PingRow[]): number {
  return pendingPings(rows).length;
}

/**
 * El ping más reciente hacia/desde un par. `sent` decide qué lado mirar: los
 * enviados cuentan para bloquear el botón del perfil, los recibidos para las
 * acciones de la bandeja.
 */
export function pingForPeer(rows: readonly PingRow[], profileId: string): PingRow | null {
  for (const row of sortPings(rows)) {
    if (row.peer.profileId === profileId) {
      return row;
    }
  }
  return null;
}

/**
 * Peers cuyo ping pendiente **apareció** desde la última foto. Es lo que hace
 * que el toast no se repita: un ping que sigue pendiente ya estaba en `previous`
 * y no vuelve a avisar, y uno que pasó a `accepted` tampoco.
 */
export function newPendingPeers(
  previous: readonly PingRow[],
  next: readonly PingRow[],
): string[] {
  const known = new Set(previous.map((row) => row.peer.profileId));
  const fresh: string[] = [];
  for (const row of pendingPings(next)) {
    if (!known.has(row.peer.profileId) && !fresh.includes(row.peer.profileId)) {
      fresh.push(row.peer.profileId);
    }
  }
  return fresh;
}

/**
 * Texto de cada `Problem.code` de la familia de pings. Un código desconocido cae
 * en el genérico con el código entre paréntesis: nunca se muestra un `HTTP_409`
 * pelado.
 */
const ERROR_KEYS: Readonly<Record<string, PingsCopyKey>> = {
  PING_DUPLICATE: 'errorDuplicate',
  PING_EXPIRED: 'errorExpired',
  PING_RESOLVED: 'errorResolved',
  PING_FORBIDDEN: 'errorForbidden',
  PING_NOT_FOUND: 'errorTarget',
  PROFILE_NOT_FOUND: 'errorTarget',
  RATE_LIMITED: 'errorRate',
  UNAUTHENTICATED: 'errorSession',
  NO_SESSION: 'errorSession',
  NETWORK: 'errorNetwork',
};

const DEFAULT_ERROR_KEY: PingsCopyKey = 'errorGeneric';

export function pingErrorKey(code: string | null): PingsCopyKey {
  if (code === null) {
    return DEFAULT_ERROR_KEY;
  }
  return ERROR_KEYS[code] ?? DEFAULT_ERROR_KEY;
}

/**
 * Hora local de la fila (`HH:MM`). Un `createdAt` inválido devuelve cadena
 * vacía: la fila se dibuja sin hora en vez de con un `Invalid Date`.
 */
export function formatPingTime(iso: string): string {
  if (iso === '') {
    return '';
  }
  const date = new Date(iso);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    return '';
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** `pending` es el único estado del que salen acciones (aceptar / rechazar). */
export function canResolve(row: PingRow): boolean {
  return row.box === 'inbox' && row.status === 'pending';
}

/** ¿Se puede mandar un ping a este perfil? Un pendiente o un match lo bloquean. */
export function pingSendBlock(row: PingRow | null): 'sent' | 'matched' | null {
  if (row === null) {
    return null;
  }
  if (row.status === 'pending') {
    return 'sent';
  }
  return row.status === 'accepted' ? 'matched' : null;
}
