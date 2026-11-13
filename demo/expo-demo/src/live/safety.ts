import type { LiveBlockItem, LivePingPeer } from './types';

/**
 * Adapter de bloqueos: de `BlockListItem` (contrato) a la fila de la lista.
 *
 * **Por qué hay un adapter.** La lista de bloqueados no puede cruzar el
 * `profileId` contra `/discovery`: el bloqueado justamente ya no está ahí. El
 * server manda la proyección pública (`PingPeer`) y acá sólo se valida y ordena.
 *
 * **Qué significa el alias.** `POST /blocks` canoniza un bot a su dueño, así que
 * la respuesta puede traer un `profileId` distinto del pedido. El controlador
 * guarda ese mapa (`blockAliases`) para que la tarjeta del bot también muestre
 * "Bloqueado" en la misma sesión, sin repetir en el cliente la regla de nombres
 * de bots.
 */
export type BlockRow = {
  profileId: string;
  createdAt: string;
  peer: LivePingPeer;
};

export function toBlockRow(item: LiveBlockItem): BlockRow | null {
  const profileId = item.block.profileId;
  if (profileId === '' || item.peer.profileId === '') {
    return null;
  }
  return { profileId, createdAt: item.block.createdAt, peer: item.peer };
}

export function toBlockRows(items: readonly LiveBlockItem[]): BlockRow[] {
  const rows: BlockRow[] = [];
  for (const item of items) {
    const row = toBlockRow(item);
    if (row !== null) {
      rows.push(row);
    }
  }
  return sortBlocks(rows);
}

/** Más reciente primero; empate por `profileId` para que el orden sea estable. */
export function sortBlocks(rows: readonly BlockRow[]): BlockRow[] {
  return [...rows].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return a.profileId < b.profileId ? 1 : a.profileId > b.profileId ? -1 : 0;
  });
}

/**
 * ¿Este perfil está bloqueado? Mira el `profileId` directo y el alias que dejó
 * el bloqueo de un bot (que se canonizó a su dueño). Sólo aplica a la sesión
 * viva: la lista del dataset vive en `state.blocked`.
 */
export function isBlockedPeer(
  rows: readonly BlockRow[],
  aliases: Readonly<Record<string, string>>,
  profileId: string,
): boolean {
  if (rows.some((row) => row.profileId === profileId)) {
    return true;
  }
  const canonical = aliases[profileId];
  return canonical !== undefined && rows.some((row) => row.profileId === canonical);
}

/**
 * `Problem.code` de bloqueos y reportes, como clave de copy. Un código
 * desconocido cae en el genérico con el código entre paréntesis: nunca se
 * muestra un `HTTP_422` pelado.
 */
const ERROR_KEYS = {
  PROFILE_REQUIRED: 'errorGuest',
  PROFILE_NOT_FOUND: 'errorTarget',
  VALIDATION_FAILED: 'errorValidation',
  UNAUTHENTICATED: 'errorSession',
  NO_SESSION: 'errorSession',
  CHAT_BLOCKED: 'errorBlocked',
  RATE_LIMITED: 'errorRate',
  NETWORK: 'errorNetwork',
} as const;

export type SafetyErrorKey =
  | (typeof ERROR_KEYS)[keyof typeof ERROR_KEYS]
  | 'errorGeneric';

export function safetyErrorKey(code: string | null): SafetyErrorKey {
  if (code === null) {
    return 'errorGeneric';
  }
  return ERROR_KEYS[code as keyof typeof ERROR_KEYS] ?? 'errorGeneric';
}
