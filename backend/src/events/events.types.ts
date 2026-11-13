/**
 * Tipos de eventos, alineados con `contract/schemas/events.yaml`.
 *
 * La unión `EventPayload` del contrato cubre los seis tipos: S2 emite dos y los
 * otros cuatro quedan declarados para S4/S5. Acá se tipan **sólo los dos que se
 * emiten**: un `EventType` con los seis obligaría a escribir código muerto para
 * payloads que todavía no tienen productor, y el día que S4 los emita el tipo se
 * amplía con su payload real, no con un `unknown`.
 */

/** Los dos tipos que S2 emite. Los cuatro restantes son de S4/S5. */
export type EventType = 'profile.moved' | 'profile.presence';

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

export type EventPayload = ProfileMovedPayload | ProfilePresencePayload;

/**
 * Envelope único, idéntico en `data:` del SSE y en `events[]` del polling.
 *
 * `id` es opaco salvo el sufijo: el cliente deduplica con `seq <= lastSeen` y
 * `occurredAt` es informativo (no ordena). `type` y `payload` se dejan como la
 * unión del contrato —no como un discriminante cerrado— porque el validador del
 * cliente es quien ata cada `type` a su payload; acá el server sólo emite dos.
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
 * se apagó tiene que llegar); los bots sólo si su dueño tiene presencia viva y
 * entran en el cap de 6. Nunca entran los bots propios ni el propio perfil: el
 * humano no se ve a sí mismo.
 */
export interface VisibleSubjects {
  readonly humans: readonly string[];
  readonly bots: readonly string[];
}
