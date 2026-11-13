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
 * - `connecting`: abriendo sesión, presencia y primera foto.
 * - `live`: stream SSE abierto.
 * - `polling`: sin SSE (navegador sin soporte, ticket rechazado o stream caído).
 * - `offline`: no se pudo conectar o se perdió la sesión; la UI vuelve al
 *   dataset del build con un aviso.
 */
export type LiveStatus = 'idle' | 'connecting' | 'live' | 'polling' | 'offline';

/** Aviso para la UI, sin copy adentro: el texto lo resuelve `liveCopy`. */
export type LiveNotice = 'unconfigured' | 'unreachable' | 'session-lost' | 'degraded' | 'outside-zone';

/** Cómo se registró la presencia: ubicación real o zona demo. */
export type LiveLocation = 'gps' | 'demo';

export type LiveState = {
  status: LiveStatus;
  transport: LiveTransport;
  session: LiveSession | null;
  /**
   * `gps` = `PUT /presence` con el punto del navegador; `demo` = con la
   * `demoZoneKey` de la región (sin permiso, sin soporte, contexto inseguro o
   * punto fuera de zona). `null` = todavía no se registró presencia.
   */
  location: LiveLocation | null;
  /** Catálogo de la región (`/demo/profiles`), con `inUse`. */
  rows: LiveProfileRow[];
  /** Última foto de `/discovery`. Es la fuente del catálogo de la UI. */
  discovery: LiveProfileRow[];
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
    rows: [],
    discovery: [],
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
