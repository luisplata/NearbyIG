import type { Match, PingPeer } from '../pings/pings.types';

/**
 * `contract/schemas/chat.yaml` — el chat de un match (Sprint 4, delta v0.4).
 *
 * La forma de `Match` y `PingPeer` **no se duplica acá**: se importan del módulo
 * de pings, que es donde el contrato los declara (`schemas/pings.yaml`). Un
 * segundo tipo con los mismos campos sería la copia que se desincroniza el día
 * que el match crezca.
 */

/** `Message`: el mensaje persistido. */
export interface Message {
  readonly id: string;
  readonly matchId: string;
  readonly senderProfileId: string;
  /**
   * La clave de idempotencia que puso el emisor, de vuelta en la respuesta.
   *
   * Sin esto, un refresh de la lista no puede reconciliar el mensaje del server
   * con la burbuja optimista que el cliente ya dibujó: tendría que comparar por
   * texto y hora, que es exactamente lo que se rompe con dos mensajes iguales.
   */
  readonly clientMessageId: string;
  readonly body: string;
  readonly createdAt: string;
}

/** `MessagePage`: página cronológica con cursor opaco. */
export interface MessagePage {
  readonly messages: readonly Message[];
  /** `null` cuando no queda nada después de esta página. */
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/** `MatchListItem`: el match, el otro perfil y el estado de la conversación. */
export interface MatchListItem {
  readonly match: Match;
  readonly peer: PingPeer;
  readonly lastMessage: Message | null;
  readonly unreadCount: number;
}

/** `MatchList`: objeto con array adentro, igual que `PingList`. */
export interface MatchList {
  readonly matches: readonly MatchListItem[];
}

/**
 * Mensajes por página. Es el `maxItems: 100` de `MessagePage`: una conversación
 * de demo entra entera en una página y el cursor queda como el mecanismo para
 * cuando no entre.
 */
export const MESSAGE_PAGE_SIZE = 100;

/**
 * Tope de envíos por ventana, por perfil y región. Espeja el de pings: 60
 * mensajes por minuto no limita a nadie escribiendo a mano y corta un loop roto
 * antes de llenar la tabla.
 */
export const MESSAGE_RATE_LIMIT_PER_MINUTE = 60;
export const MESSAGE_RATE_WINDOW_SECONDS = 60;

/** `maxItems: 100` de `MatchList`. La demo no tiene volumen para paginar. */
export const MATCH_LIST_LIMIT = 100;

/** `MessageCreate.body` y `Message.body`: el mismo tope que el schema. */
export const MESSAGE_MAX_LENGTH = 2000;
/** `MessageCreate.clientMessageId`: el mismo `maxLength` que el schema. */
export const CLIENT_MESSAGE_ID_MAX_LENGTH = 100;

/**
 * Cuánto tarda el bot en contestar. ~2 s es lo que hace que la demo se sienta
 * viva sin que el cliente tenga que simular nada: la espera es del server y el
 * mensaje llega por el stream como cualquier otro.
 */
export const BOT_REPLY_DELAY_MS = 2_000;

/**
 * Los textos del bot. Son fijos y **rotan**: dos respuestas consecutivas del
 * mismo bot nunca repiten el mismo texto, que es la regla que pide la demo.
 *
 * No es un LLM ni una plantilla con variables: el bot de la demo dice estas
 * líneas y nada más. Un texto generado costaría plata y haría que dos corridas
 * de la demo no se puedan comparar.
 */
export const BOT_REPLIES = [
  '¡Hola! ¿Cómo va? Me alegra que hayamos conectado.',
  'Jaja, tal cual. ¿Qué estás haciendo por acá?',
  'Me copa la idea. ¿Nos tomamos algo uno de estos días?',
  'Sí, re. Después te cuento cómo me fue con eso.',
] as const;
