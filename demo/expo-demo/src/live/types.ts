import type { GeoPoint } from './geolocation';

/**
 * Tipos del borde live: la forma exacta que devuelve la API.
 *
 * Se declaran acá en vez de importar `contract/generated/api.ts` porque el
 * paquete de la demo compila con Metro y no debe salir de su raíz; el contrato
 * está congelado (v0.2), así que estas formas son un espejo legible de
 * `ProfileSummary`, `DemoSession`, `EventEnvelope` y `StreamTicket`. El adapter
 * (`adapter.ts`) es el único punto que las convierte a la forma de la UI.
 */

/** `SourceType` del contrato. */
export type SourceType = 'human' | 'bot' | 'guest';

/**
 * `ProfileSummary`: la fila de `GET /demo/profiles` y la de `GET /discovery`.
 *
 * Los 13 campos del dataset más la identidad (`regionKey`, `demoSlot`,
 * `sourceType`) y `inUse`, que es estado de runtime: dice si hay una sesión viva
 * ocupando el slot.
 */
export type LiveProfileRow = {
  profileId: string;
  regionKey: string;
  demoSlot: number | null;
  sourceType: SourceType;
  nickname: string;
  initials: string;
  intention: string;
  gender: string;
  verified: boolean;
  online: boolean;
  inUse: boolean;
  distanceM: number;
  bearingDeg: number;
  photoId: string;
  instagramHandle: string;
  statusKey: string;
  bioKey: string;
};

/** `DemoSession`: la respuesta de abrir sesión o de un takeover. */
export type LiveSession = {
  token: string;
  expiresAt: string;
  regionKey: string;
  profileId: string;
  demoSlot: number | null;
  sourceType: SourceType;
};

/** `EventEnvelope`: mismo objeto por SSE y por polling. */
export type LiveEvent = {
  id: string;
  type: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

/** `EventsPage`: la página de `/events/poll`. */
export type LiveEventsPage = {
  events: LiveEvent[];
  nextCursor: string | null;
  hasMore: boolean;
};

/** `PingStatus` del contrato: `pending` es el único del que se puede salir. */
export type PingStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

const PING_STATUSES: readonly PingStatus[] = ['pending', 'accepted', 'rejected', 'expired'];

/** `Ping`: la fila cruda del recurso. `matchId` es el puente al `Match`. */
export type LivePing = {
  id: string;
  fromProfileId: string;
  toProfileId: string;
  status: PingStatus;
  createdAt: string;
  expiresAt: string;
  matchId: string | null;
};

/**
 * `PingPeer`: el otro lado del ping, ya proyectado por el server.
 *
 * No lleva medidas ni coordenadas a propósito: la bandeja cuenta quién
 * escribió, no dónde está. Un bot se distingue por `sourceType` + `profileId`,
 * igual que en `GET /discovery`.
 */
export type LivePingPeer = {
  profileId: string;
  nickname: string;
  initials: string;
  intention: string;
  photoId: string;
  sourceType: SourceType;
};

/** `PingListItem`: la fila de `GET /pings` — el ping y el otro perfil. */
export type LivePingItem = {
  ping: LivePing;
  peer: LivePingPeer;
};

/** `Match`: uno por par, `profileIds` ordenado por id ascendente. */
export type LiveMatch = {
  id: string;
  profileIds: string[];
  createdAt: string;
};

/** Lado de la bandeja. El contrato lo exige explícito: no hay default. */
export type PingBox = 'inbox' | 'sent';

/** De dónde salió el perfil propio que muestra el tab Perfil. */
export type LiveSelfSource = 'me' | 'catalog' | null;

export function isPingStatus(value: unknown): value is PingStatus {
  return typeof value === 'string' && PING_STATUSES.includes(value as PingStatus);
}

/** Los seis tipos del enum `EventType`. */
export const EVENT_TYPES = [
  'profile.moved',
  'profile.presence',
  'ping.received',
  'match.created',
  'message.created',
  'typing.started',
] as const;

export type LiveEventType = (typeof EVENT_TYPES)[number];

/** Transporte de la actualización en vivo. */
export type LiveTransport = 'none' | 'sse' | 'polling';

/**
 * Estado de la sesión live.
 *
 * - `idle`: nunca se abrió (o se cerró por el usuario).
 * - `needs-zone`: todavía no hay zona elegida, así que no hay región con la que
 *   abrir sesión. La UI pide la zona demo o el gesto de ubicación.
 * - `connecting`: abriendo sesión, presencia y primera foto.
 * - `live`: stream SSE abierto.
 * - `polling`: sin SSE (navegador sin soporte, ticket rechazado o stream caído).
 * - `offline`: no se pudo conectar o se perdió la sesión; la UI vuelve al
 *   dataset del build con un aviso.
 */
export type LiveStatus = 'idle' | 'needs-zone' | 'connecting' | 'live' | 'polling' | 'offline';

/** Aviso para la UI, sin copy adentro: el texto lo resuelve `liveCopy`. */
export type LiveNotice =
  | 'unconfigured'
  | 'unreachable'
  | 'session-lost'
  | 'degraded'
  | 'outside-zone';

/**
 * Por qué la UI tiene que pedir una zona. Cada causa tiene su texto: un "no hay
 * ubicación" genérico no le dice al usuario si tiene el permiso bloqueado, si el
 * navegador no la soporta o si está fuera de México y Colombia.
 *
 * - `initial`: primera visita, todavía no eligió (no es un error).
 * - `outside-zone`: el punto no cae en ninguna zona del catálogo.
 * - el resto: por qué falló el pedido de ubicación (`GeoResult` sin `ok`).
 */
export type ZonePromptCause =
  | 'initial'
  | 'outside-zone'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported'
  | 'insecure';

/** Cómo se registró la presencia: ubicación real o zona demo. */
export type LiveLocation = 'gps' | 'demo';

/** Final del último pedido de ubicación, para el debug visible. */
export type LiveGeoStatus = 'ok' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure';

/**
 * Diagnóstico del flujo de ubicación, sin coordenadas.
 *
 * Es lo que el usuario puede leer en pantalla y copiar de la consola cuando
 * "el mapa muestra otra ciudad": si el pedido salió `ok`, qué contestó el
 * `PUT /presence`, en qué región quedó la sesión y qué zona está activa. Con eso
 * el problema se diagnostica sin adivinar, y sin exponer dónde está la persona.
 */
export type LiveDiagnostics = {
  geo: LiveGeoStatus | null;
  /** Precisión reportada por el navegador, redondeada a 10 m. */
  accuracyM: number | null;
  /** Status HTTP del último `PUT /presence`. */
  presenceStatus: number | null;
  presenceZoneKey: string | null;
  fallbackRequired: boolean | null;
};

export function emptyDiagnostics(): LiveDiagnostics {
  return {
    geo: null,
    accuracyM: null,
    presenceStatus: null,
    presenceZoneKey: null,
    fallbackRequired: null,
  };
}

export type LiveState = {
  status: LiveStatus;
  transport: LiveTransport;
  session: LiveSession | null;
  /**
   * `gps` = `PUT /presence` con el punto del navegador; `demo` = con la
   * `demoZoneKey` elegida (o a la que se cayó por un punto fuera de zona).
   * `null` = todavía no se registró presencia.
   */
  location: LiveLocation | null;
  /**
   * Zona demo en uso: define la **región** de la sesión (`cdmx → mx`,
   * `bogota → co`). `null` = todavía no se eligió ninguna.
   */
  zoneKey: string | null;
  /** Causa del sheet de zona. `null` = no hay nada que preguntar. */
  zonePrompt: ZonePromptCause | null;
  /**
   * Punto del GPS, **sólo en memoria del cliente**: centra el mapa y no se
   * persiste, no se reenvía y no se manda a otro request que el `PUT /presence`
   * que ya se hizo. `null` = sin ubicación (se usa el centroide de la zona).
   */
  point: GeoPoint | null;
  /** Último pedido de ubicación y su resultado, para el debug visible. */
  diagnostics: LiveDiagnostics;
  /** Catálogo de la región (`/demo/profiles`), con `inUse`. */
  rows: LiveProfileRow[];
  /** Última foto de `/discovery`. Es la fuente del catálogo de la UI. */
  discovery: LiveProfileRow[];
  /** Bandeja de entrada (`GET /pings?box=inbox`), más nuevo primero. */
  pings: LivePingItem[];
  /** Pings enviados (`box=sent`), con su estado actual. */
  sentPings: LivePingItem[];
  /** Cuándo se leyó la bandeja. `null` = todavía no hubo una foto. */
  pingsAt: number | null;
  /** `Problem.code` de la última acción de ping fallida. */
  pingError: string | null;
  /** Perfil propio de la sesión (`GET /me`, o su fallback del catálogo). */
  self: LiveProfileRow | null;
  selfSource: LiveSelfSource;
  lastSeq: number;
  lastEventAt: number | null;
  /** Código del último error del server (`Problem.code`). */
  error: string | null;
  notice: LiveNotice | null;
};

export function emptyLiveState(): LiveState {
  return {
    status: 'idle',
    transport: 'none',
    session: null,
    location: null,
    zoneKey: null,
    zonePrompt: null,
    point: null,
    diagnostics: emptyDiagnostics(),
    rows: [],
    discovery: [],
    pings: [],
    sentPings: [],
    pingsAt: null,
    pingError: null,
    self: null,
    selfSource: null,
    lastSeq: 0,
    lastEventAt: null,
    error: null,
    notice: null,
  };
}

/** `id` del envelope: `<regionKey>:<seq:012d>`. */
export function seqOf(id: string): number | null {
  const match = /^[a-z]{2}:([0-9]{12})$/.exec(id);
  return match === null ? null : Number(match[1]);
}

/** Envelope desde el `data:` del SSE. Basura ⇒ `null`, nunca una excepción. */
export function parseEvent(raw: unknown): LiveEvent | null {
  if (typeof raw !== 'string' || raw === '') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isEvent(parsed) ? parsed : null;
}

export function isEvent(value: unknown): value is LiveEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.type === 'string' &&
    typeof record.occurredAt === 'string' &&
    typeof record.payload === 'object' &&
    record.payload !== null
  );
}
