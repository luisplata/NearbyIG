/**
 * Tipos de eventos, alineados con `contract/schemas/events.yaml`.
 *
 * La unión `EventPayload` del contrato cubre los seis tipos. Acá se tipan **los
 * que tienen productor**: los dos de S2 (`profile.moved`, `profile.presence`) y
 * los dos del chat de S4 (`message.created`, `typing.started`). `ping.received` y
 * `match.created` siguen declarados en el contrato y sin productor: tiparlos hoy
 * obligaría a escribir código muerto para un payload que nadie emite, y el día
 * que se emitan el tipo se amplía con su payload real, no con un `unknown`.
 */

/** Los cuatro tipos que hoy emiten S2 y el chat de S4. */
export type EventType = 'profile.moved' | 'profile.presence' | 'message.created' | 'typing.started';

export interface ProfileMovedPayload {
  readonly profileId: string;
  /** Metros contra el ancla de la zona, ya calculados por el server. */
  readonly distanceM: number;
  /** Grados desde el norte, sentido horario, 0–359. */
  readonly bearingDeg: number;
}

export interface ProfilePresencePayload {
  readonly profileId: string;
  readonly online: boolean;
}

/**
 * Mensaje nuevo en un match. **No lleva el body** —el contrato lo dice a
 * propósito—: el evento avisa que hay algo nuevo y el cliente pide la página de
 * la conversación. Un body en el log sería contenido de dos personas en el
 * stream de la región, y el evento no tiene por qué ser la fuente del texto.
 */
export interface MessageCreatedPayload {
  readonly matchId: string;
  readonly messageId: string;
  readonly senderProfileId: string;
}

/**
 * La otra parte está escribiendo. Efímero: no se persiste ni se replica; el
 * único productor de la demo es el bot, que lo emite al recibir un mensaje y
 * antes de contestar.
 */
export interface TypingStartedPayload {
  readonly matchId: string;
  readonly profileId: string;
}

export type EventPayload =
  | ProfileMovedPayload
  | ProfilePresencePayload
  | MessageCreatedPayload
  | TypingStartedPayload;

/**
 * Payload que corresponde a cada tipo. Es lo que hace que `append` no acepte un
 * `profile.presence` con la forma de un mensaje: el contrato ata el `type` al
 * `payload` y el tipo de TypeScript también.
 */
export type PayloadFor<T extends EventType> = T extends 'profile.moved'
  ? ProfileMovedPayload
  : T extends 'profile.presence'
    ? ProfilePresencePayload
    : T extends 'message.created'
      ? MessageCreatedPayload
      : TypingStartedPayload;

/**
 * Envelope único, idéntico en `data:` del SSE y en `events[]` del polling.
 *
 * `id` es opaco salvo el sufijo: el cliente deduplica con `seq <= lastSeen` y
 * `occurredAt` es informativo (no ordena).
 */
export interface EventEnvelope {
  readonly id: string;
  readonly type: EventType;
  readonly occurredAt: string;
  readonly payload: EventPayload;
}

/** `EventsPage` del contrato: tres campos planos, `additionalProperties: false`. */
export interface EventsPage {
  readonly events: readonly EventEnvelope[];
  /** `id` del último entregado; una página vacía devuelve el recibido. */
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * Sujetos que este observador puede ver en el stream.
 *
 * Los humanos de la región se ven siempre (un `profile.presence` de alguien que
 * se apagó tiene que llegar); los bots entran según `BotsService.visibleBotIds`:
 * los propios **sí** (el observador ve sus 2 bots), los ajenos si su dueño tiene
 * presencia viva, todos cortados en el cap de 6. El propio humano nunca entra.
 *
 * Los eventos de chat **no** se filtran por esta lista: un `message.created`
 * lleva `matchId`, no `profileId`, y la regla es otra (ver `EventsService`).
 */
export interface VisibleSubjects {
  readonly humans: readonly string[];
  readonly bots: readonly string[];
}
