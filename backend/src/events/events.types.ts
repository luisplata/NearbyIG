/**
 * Tipos de eventos, alineados con `contract/schemas/events.yaml`.
 *
 * Ojo con el conteo: el contrato declara **cuatro** tipos en la unión
 * (`profile.presence`, `ping.received`, `match.created`, `message.created`) y
 * acá se tipan **los dos que tienen productor**: `profile.presence` desde
 * `PresenceService` y `message.created` desde `ChatService`. `ping.received` y
 * `match.created` siguen declarados en el contrato y sin productor: tiparlos hoy
 * obligaría a escribir código muerto para un payload que nadie emite, y el día
 * que se emitan el tipo se amplía con su payload real, no con un `unknown`.
 *
 * No es una contradicción por capa: el CHECK de `events` y este tipo son la
 * lista de lo que el server escribe. Que el contrato admita un tipo de más es la
 * deuda documentada de esos dos productores.
 */

/** Los dos tipos que hoy emite el server. */
export type EventType = 'profile.presence' | 'message.created';

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

export type EventPayload = ProfilePresencePayload | MessageCreatedPayload;

/**
 * Payload que corresponde a cada tipo. Es lo que hace que `append` no acepte un
 * `profile.presence` con la forma de un mensaje: el contrato ata el `type` al
 * `payload` y el tipo de TypeScript también.
 */
export type PayloadFor<T extends EventType> = T extends 'profile.presence'
  ? ProfilePresencePayload
  : MessageCreatedPayload;

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
 * se apagó tiene que llegar); el propio humano nunca entra.
 *
 * Los eventos de chat **no** se filtran por esta lista: un `message.created`
 * lleva `matchId`, no `profileId`, y la regla es otra (ver `EventsService`).
 */
export interface VisibleSubjects {
  readonly humans: readonly string[];
}
