import type {
  LiveChatMessage,
  LiveChatState,
  LiveMatchListItem,
  LiveMessage,
  LivePingPeer,
} from './types';
import type { ChatCopyKey } from './chatCopy';

/**
 * Adapter del chat real: de los DTO del contrato a las filas que dibuja la UI.
 *
 * **Qué se valida y qué se descarta.** Una fila de `GET /matches` sin `match.id`
 * o sin `peer.nickname` no se dibuja: preferible una bandeja corta a una tarjeta
 * sin nombre. Un `Message` sin `id` o sin `body` tampoco entra: el server es la
 * autoridad del contenido y una fila vacía no es un mensaje.
 *
 * **Reconciliación por `clientMessageId`, no por texto.** Es la única regla que
 * evita duplicados: un refresh de la página puede traer el mensaje que el
 * cliente ya tiene como burbuja optimista, y comparar por `body` + hora falla en
 * cuanto dos mensajes dicen lo mismo (que en un chat pasa todo el tiempo).
 *
 * **Lo que este archivo NO hace.** No decide si el mensaje es del bot: eso es
 * `peer.sourceType` en la bandeja y `senderProfileId` en la conversación, y la
 * pantalla lo usa sólo para el estilo. Nada de coordenadas, nada de distancias.
 */

/** Fila de la bandeja de matches, ya lista para la lista. */
export type MatchRow = {
  id: string;
  createdAt: string;
  peer: LivePingPeer;
  /** Preview de la lista. `null` = match sin mensajes (recién aceptado). */
  preview: string | null;
  previewAt: string | null;
  /** Quién mandó el último mensaje. `null` cuando no hay último mensaje. */
  previewMine: boolean | null;
  unreadCount: number;
};

/**
 * Una fila válida o `null`. `selfId` decide si el preview es propio: el contrato
 * manda los propios mensajes en `lastMessage` y la lista los rotula distinto.
 */
export function toMatchRow(item: LiveMatchListItem, selfId: string | null): MatchRow | null {
  const id = item.match.id;
  const peer = item.peer;
  if (id === '' || peer.profileId === '' || peer.nickname === '') {
    return null;
  }
  const last = item.lastMessage;
  const preview =
    last === null || last.body === ''
      ? null
      : last.body.length > 120
        ? `${last.body.slice(0, 119)}…`
        : last.body;
  return {
    id,
    createdAt: item.match.createdAt,
    peer,
    preview,
    previewAt: last === null ? null : last.createdAt,
    previewMine: last === null ? null : selfId !== null && last.senderProfileId === selfId,
    unreadCount: Number.isFinite(item.unreadCount) && item.unreadCount > 0 ? item.unreadCount : 0,
  };
}

/**
 * Fila descartada ≠ banda vacía: se filtran, no se rellena. El orden es el del
 * server (`createdAt` descendente: "lo que necesita respuesta arriba").
 */
export function toMatchRows(items: readonly LiveMatchListItem[], selfId: string | null): MatchRow[] {
  const rows: MatchRow[] = [];
  for (const item of items) {
    const row = toMatchRow(item, selfId);
    if (row !== null) {
      rows.push(row);
    }
  }
  return rows;
}

/** Mensaje del server tal como lo ve esta sesión. `sent` siempre: lo confirmó él. */
export function toChatMessage(message: LiveMessage, selfId: string | null): LiveChatMessage {
  const clientMessageId = message.clientMessageId;
  return {
    key: clientMessageId === '' ? message.id : clientMessageId,
    id: message.id,
    clientMessageId,
    senderProfileId: message.senderProfileId,
    body: message.body,
    createdAt: message.createdAt,
    mine: selfId !== null && message.senderProfileId === selfId,
    status: 'sent',
  };
}

/**
 * Burbuja optimista. `createdAt` es la hora del cliente **sólo** para ordenar
 * mientras el server confirma: cuando llega su `Message`, esa fecha se descarta
 * porque el orden de una conversación es el del server.
 */
export function optimisticMessage(input: {
  clientMessageId: string;
  senderProfileId: string;
  body: string;
  createdAt: string;
}): LiveChatMessage {
  return {
    key: input.clientMessageId,
    id: null,
    clientMessageId: input.clientMessageId,
    senderProfileId: input.senderProfileId,
    body: input.body,
    createdAt: input.createdAt,
    mine: true,
    status: 'sending',
  };
}

function byCreatedAt(a: LiveChatMessage, b: LiveChatMessage): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  // Empate determinista: el id del server manda y las optimistas van al final.
  if (a.id !== null && b.id !== null) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }
  if (a.id === null && b.id === null) {
    return 0;
  }
  return a.id === null ? 1 : -1;
}

/**
 * Une una página del server con lo que ya está en pantalla.
 *
 * Tres reglas, en este orden:
 * 1. Lo confirmado que trae el server gana por `id` (el server es la autoridad).
 * 2. Lo confirmado que ya estaba y no vino en la página **se conserva**: una
 *    página de 100 no puede borrar lo que el usuario ya leyó.
 * 3. Las optimistas (`id === null`) sobreviven salvo que el server ya tenga un
 *    mensaje con su `clientMessageId` — ahí se reemplazan, no se duplican.
 */
export function mergeChatMessages(
  server: readonly LiveMessage[],
  local: readonly LiveChatMessage[],
  selfId: string | null,
): LiveChatMessage[] {
  const confirmed = new Map<string, LiveChatMessage>();
  for (const message of local) {
    if (message.id !== null) {
      confirmed.set(message.id, message);
    }
  }
  const serverKeys = new Set<string>();
  for (const message of server) {
    // Un `Message` sin id o sin cuerpo no es un mensaje: se descarta igual que en
    // el lector de la API, para que un payload raro no dibuje una burbuja vacía.
    if (message.id === '' || message.body === '') {
      continue;
    }
    serverKeys.add(message.clientMessageId);
    confirmed.set(message.id, toChatMessage(message, selfId));
  }

  const pending = local.filter(
    (message) => message.id === null && !serverKeys.has(message.clientMessageId),
  );

  return [...[...confirmed.values()].sort(byCreatedAt), ...pending];
}

/**
 * Marca una burbuja con su estado de envío sin tocar las demás. Devuelve el
 * mismo array cuando no hay nada que cambiar: el provider memoiza por referencia.
 */
export function setMessageStatus(
  messages: readonly LiveChatMessage[],
  clientMessageId: string,
  status: LiveChatMessage['status'],
): LiveChatMessage[] {
  let changed = false;
  const next = messages.map((message) => {
    if (message.clientMessageId !== clientMessageId || message.id !== null || message.status === status) {
      return message;
    }
    changed = true;
    return { ...message, status };
  });
  return changed ? next : (messages as LiveChatMessage[]);
}

/** Cuántos mensajes del otro lado sin leer en toda la bandeja. */
export function unreadMatchCount(items: readonly MatchRow[]): number {
  let total = 0;
  for (const item of items) {
    total += item.unreadCount;
  }
  return total;
}

/**
 * Códigos de la familia chat. `CHAT_BLOCKED` es el único que no es obvio: el par
 * se bloqueó y la conversación se apaga sin que el match desaparezca.
 */
const ERROR_KEYS: Readonly<Record<string, ChatCopyKey>> = {
  CHAT_BLOCKED: 'errorBlocked',
  MATCH_NOT_FOUND: 'errorMatchNotFound',
  MATCH_CLOSED: 'errorMatchClosed',
  VALIDATION_FAILED: 'errorValidation',
  RATE_LIMITED: 'errorRate',
  UNAUTHENTICATED: 'errorSession',
  NO_SESSION: 'errorSession',
  NETWORK: 'errorNetwork',
};

export function chatErrorKey(code: string | null): ChatCopyKey {
  if (code === null) {
    return 'errorGeneric';
  }
  return ERROR_KEYS[code] ?? 'errorGeneric';
}

/**
 * Clave de idempotencia. `crypto.randomUUID` existe en el navegador y en Node 19+;
 * sin él se cae a una forma con la misma garantía práctica (tiempo + azar), no a
 * un contador global que se repite entre pestañas.
 */
export function newClientMessageId(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof crypto?.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `cm-${Date.now().toString(36)}-${random}`;
}

/** Chat vacío para un match: la pantalla dibuja el estado de carga, no un error. */
export function emptyChat(matchId: string, peer: LivePingPeer | null): LiveChatState {
  return {
    matchId,
    peer,
    messages: [],
    nextCursor: null,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: null,
  };
}
