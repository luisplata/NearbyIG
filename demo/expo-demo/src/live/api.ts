import type {
  LiveEventsPage,
  LiveMatch,
  LivePing,
  LivePingItem,
  LivePingPeer,
  LiveProfileRow,
  LiveSession,
  PingBox,
  PingStatus,
  SourceType,
} from './types';
import { isPingStatus } from './types';

/**
 * Cliente de la API del backend de la demo. Sólo las operations que el contrato
 * congela: `POST /auth/demo-session`, `POST /auth/takeover`, `POST /auth/logout`,
 * `POST /auth/stream-ticket`, `PUT /presence`, `GET /demo/profiles`,
 * `GET /discovery`, `GET /events`, `GET /events/poll`, `GET /me` y las cuatro de
 * pings (`POST /pings`, `GET /pings`, accept y reject). Nada más.
 *
 * El token vive **en memoria** en este objeto: no se persiste en ningún storage
 * del navegador ni en una cookie. Es lo que pide el contrato de la demo
 * (refresh = estado inicial) y lo que verifica `privacy.test.ts`.
 */

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    cache?: 'no-store';
    credentials?: 'omit';
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;
/** `Problem` del contrato: `code` es el discriminante que el cliente lee. */
export class LiveApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'LiveApiError';
    this.status = status;
    this.code = code;
  }
}

export type DiscoveryQuery = {
  radiusM: number;
  intention?: string;
  gender?: string;
  verified?: boolean;
  online?: boolean;
};

/**
 * `PresenceUpdate` del contrato: **exactamente uno** de `point` o
 * `demoZoneKey`. El punto va y no vuelve: la respuesta es `PresenceState`.
 */
export type PresenceTarget =
  | { readonly point: { readonly lat: number; readonly lng: number } }
  | { readonly demoZoneKey: string };

/** `PresenceState` (lo que sale): región y zona derivadas, sin coordenadas. */
export type PresenceState = {
  regionKey: string;
  zoneKey: string | null;
  online: boolean;
  fallbackRequired: boolean;
  /** Status HTTP del `PUT /presence`; el debug visible lo muestra tal cual. */
  status: number;
};

export type LiveApi = {
  readonly baseUrl: string;
  setToken(token: string | null): void;
  openSession(regionKey: string): Promise<LiveSession>;
  claimSlot(regionKey: string, demoSlot: number): Promise<LiveSession>;
  takeover(regionKey: string, demoSlot: number): Promise<LiveSession>;
  logout(): Promise<void>;
  /** `PUT /presence`: punto privado o zona demo, nunca los dos. */
  presence(target: PresenceTarget): Promise<PresenceState>;
  listProfiles(regionKey: string): Promise<LiveProfileRow[]>;
  discovery(query: DiscoveryQuery): Promise<LiveProfileRow[]>;
  streamTicket(): Promise<string>;
  poll(cursor: string | null): Promise<LiveEventsPage>;
  /**
   * `GET /me`: el perfil de la sesión. `null` si la operation todavía no existe
   * en el backend (404): el controller cae al catálogo sin romper nada.
   */
  me(): Promise<LiveProfileRow | null>;
  createPing(targetProfileId: string): Promise<LivePing>;
  listPings(box: PingBox): Promise<LivePingItem[]>;
  acceptPing(pingId: string): Promise<LiveMatch>;
  rejectPing(pingId: string): Promise<void>;
  /** URL del stream con el ticket en la query (EventSource no manda headers). */
  streamUrl(ticket: string): string;
};

/** Query string sin `URLSearchParams`: Hermes y el navegador coinciden. */
function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

function readString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  return typeof value === 'string' ? value : '';
}

function readNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readBool(record: Record<string, unknown>, field: string): boolean {
  return record[field] === true;
}

const SOURCE_TYPES: readonly SourceType[] = ['human', 'bot', 'guest'];

function readSession(payload: unknown): LiveSession {
  const record = (payload ?? {}) as Record<string, unknown>;
  const sourceType = readString(record, 'sourceType');
  const demoSlot = record['demoSlot'];
  return {
    token: readString(record, 'token'),
    expiresAt: readString(record, 'expiresAt'),
    regionKey: readString(record, 'regionKey'),
    profileId: readString(record, 'profileId'),
    demoSlot: typeof demoSlot === 'number' ? demoSlot : null,
    sourceType: SOURCE_TYPES.includes(sourceType as SourceType)
      ? (sourceType as SourceType)
      : 'guest',
  };
}

function readProfileRow(payload: unknown): LiveProfileRow | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const profileId = readString(record, 'profileId');
  if (profileId === '') {
    return null;
  }
  const sourceType = readString(record, 'sourceType');
  const demoSlot = record['demoSlot'];
  return {
    profileId,
    regionKey: readString(record, 'regionKey'),
    demoSlot: typeof demoSlot === 'number' ? demoSlot : null,
    sourceType: SOURCE_TYPES.includes(sourceType as SourceType)
      ? (sourceType as SourceType)
      : 'human',
    nickname: readString(record, 'nickname'),
    initials: readString(record, 'initials'),
    intention: readString(record, 'intention'),
    gender: readString(record, 'gender'),
    verified: readBool(record, 'verified'),
    online: readBool(record, 'online'),
    inUse: readBool(record, 'inUse'),
    distanceM: readNumber(record, 'distanceM'),
    bearingDeg: readNumber(record, 'bearingDeg'),
    photoId: readString(record, 'photoId'),
    instagramHandle: readString(record, 'instagramHandle'),
    statusKey: readString(record, 'statusKey'),
    bioKey: readString(record, 'bioKey'),
  };
}

function readRows(payload: unknown, field: string): LiveProfileRow[] {
  const record = (payload ?? {}) as Record<string, unknown>;
  const list = record[field];
  if (!Array.isArray(list)) {
    return [];
  }
  const rows: LiveProfileRow[] = [];
  for (const item of list) {
    const row = readProfileRow(item);
    if (row !== null) {
      rows.push(row);
    }
  }
  return rows;
}

export type CreateLiveApiOptions = {
  baseUrl: string;
  fetchImpl?: FetchLike;
};

/**
 * `Ping` del contrato. Un campo faltante no rompe la bandeja: la fila se
 * descarta en `toPingRow` (adapter), no acá, para que el error quede en un solo
 * lugar testeado.
 */
function readPing(payload: unknown): LivePing | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const id = readString(record, 'id');
  const status = record['status'];
  if (id === '' || !isPingStatus(status)) {
    return null;
  }
  const matchId = record['matchId'];
  return {
    id,
    fromProfileId: readString(record, 'fromProfileId'),
    toProfileId: readString(record, 'toProfileId'),
    status: status as PingStatus,
    createdAt: readString(record, 'createdAt'),
    expiresAt: readString(record, 'expiresAt'),
    matchId: typeof matchId === 'string' ? matchId : null,
  };
}

function readPingPeer(payload: unknown): LivePingPeer | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const profileId = readString(record, 'profileId');
  if (profileId === '') {
    return null;
  }
  const sourceType = readString(record, 'sourceType');
  return {
    profileId,
    nickname: readString(record, 'nickname'),
    initials: readString(record, 'initials'),
    intention: readString(record, 'intention'),
    photoId: readString(record, 'photoId'),
    sourceType: SOURCE_TYPES.includes(sourceType as SourceType)
      ? (sourceType as SourceType)
      : 'human',
  };
}

function readPingItem(payload: unknown): LivePingItem | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const ping = readPing(record['ping']);
  const peer = readPingPeer(record['peer']);
  return ping === null || peer === null ? null : { ping, peer };
}

function readPingItems(payload: unknown): LivePingItem[] {
  const record = (payload ?? {}) as Record<string, unknown>;
  const list = record['pings'];
  if (!Array.isArray(list)) {
    return [];
  }
  const items: LivePingItem[] = [];
  for (const item of list) {
    const parsed = readPingItem(item);
    if (parsed !== null) {
      items.push(parsed);
    }
  }
  return items;
}

function readMatch(payload: unknown): LiveMatch {
  const record = (payload ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(record['profileIds']) ? record['profileIds'] : [];
  return {
    id: readString(record, 'id'),
    profileIds: ids.filter((id): id is string => typeof id === 'string'),
    createdAt: readString(record, 'createdAt'),
  };
}

/**
 * `GET /me` puede devolver el `ProfileSummary` pelado o envuelto en `profile`.
 * Se aceptan las dos formas y cualquier otra cosa cae al fallback del catálogo.
 */
function readMe(payload: unknown): LiveProfileRow | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const nested = record['profile'];
  if (typeof nested === 'object' && nested !== null) {
    return readProfileRow(nested);
  }
  return readProfileRow(record);
}
export function createLiveApi({ baseUrl, fetchImpl }: CreateLiveApiOptions): LiveApi {
  const doFetch: FetchLike =
    fetchImpl ??
    ((input, init) => {
      const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
      if (globalFetch === undefined) {
        return Promise.reject(new Error('fetch no está disponible en este runtime'));
      }
      return globalFetch(input, init);
    });

  let token: string | null = null;

  const headers = (withBody: boolean): Record<string, string> => {
    const result: Record<string, string> = {
      accept: 'application/json',
      // ngrok free sirve un interstitial HTML a los navegadores. El header lo
      // saltea y el backend lo ignora; sin esto el JSON llega como HTML.
      'ngrok-skip-browser-warning': '1',
    };
    if (withBody) {
      result['content-type'] = 'application/json';
    }
    if (token !== null) {
      result['authorization'] = `Bearer ${token}`;
    }
    return result;
  };

  const request = async (
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ status: number; payload: unknown }> => {
    const withBody = init?.body !== undefined;
    const response = await doFetch(`${baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: headers(withBody),
      body: withBody ? JSON.stringify(init?.body) : undefined,
      cache: 'no-store',
      credentials: 'omit',
    });
    const text = await response.text();
    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      let message = '';
      try {
        const problem = JSON.parse(text) as Record<string, unknown>;
        if (typeof problem.code === 'string') {
          code = problem.code;
        }
        if (typeof problem.detail === 'string') {
          message = problem.detail;
        } else if (typeof problem.title === 'string') {
          message = problem.title;
        }
      } catch {
        // Un error sin `Problem`: queda el status como código.
      }
      throw new LiveApiError(response.status, code, message);
    }
    if (text === '') {
      return { status: response.status, payload: null };
    }
    try {
      return { status: response.status, payload: JSON.parse(text) as unknown };
    } catch {
      return { status: response.status, payload: null };
    }
  };

  const sessionWithToken = (payload: unknown): LiveSession => {
    const session = readSession(payload);
    token = session.token === '' ? null : session.token;
    return session;
  };

  return {
    baseUrl,
    setToken: (next) => {
      token = next;
    },
    openSession: async (regionKey) =>
      sessionWithToken(
        (await request('/auth/demo-session', { method: 'POST', body: { regionKey } })).payload,
      ),
    claimSlot: async (regionKey, demoSlot) =>
      sessionWithToken(
        (await request('/auth/demo-session', { method: 'POST', body: { regionKey, demoSlot } }))
          .payload,
      ),
    takeover: async (regionKey, demoSlot) =>
      sessionWithToken(
        (await request('/auth/takeover', { method: 'POST', body: { regionKey, demoSlot } })).payload,
      ),
    logout: async () => {
      try {
        await request('/auth/logout', { method: 'POST' });
      } finally {
        token = null;
      }
    },
    presence: async (target) => {
      const body =
        'point' in target ? { point: { lat: target.point.lat, lng: target.point.lng } } : target;
      const response = await request('/presence', { method: 'PUT', body });
      const payload = response.payload as Record<string, unknown> | null;
      const zoneKey = payload?.['zoneKey'];
      return {
        regionKey: readString(payload ?? {}, 'regionKey'),
        zoneKey: typeof zoneKey === 'string' ? zoneKey : null,
        online: readBool(payload ?? {}, 'online'),
        fallbackRequired: readBool(payload ?? {}, 'fallbackRequired'),
        status: response.status,
      };
    },
    listProfiles: async (regionKey) =>
      readRows(
        (await request(`/demo/profiles${queryString({ regionKey })}`)).payload,
        'profiles',
      ),
    discovery: async (query) => {
      const response = await request(
        `/discovery${queryString({
          radiusM: query.radiusM,
          intention: query.intention,
          gender: query.gender,
          verified: query.verified,
          online: query.online,
        })}`,
      );
      return readRows(response.payload, 'results');
    },

    streamTicket: async () => {
      const response = await request('/auth/stream-ticket', { method: 'POST' });
      const payload = response.payload as Record<string, unknown> | null;
      return typeof payload?.['ticket'] === 'string' ? payload['ticket'] : '';
    },
    poll: async (cursor) => {
      const response = await request(
        `/events/poll${queryString({ cursor: cursor ?? undefined, limit: 100 })}`,
      );
      const payload = response.payload as Record<string, unknown> | null;
      const events = Array.isArray(payload?.['events']) ? payload?.['events'] : [];
      const nextCursor = payload?.['nextCursor'];
      return {
        events: events as LiveEventsPage['events'],
        nextCursor: typeof nextCursor === 'string' ? nextCursor : null,
        hasMore: payload?.['hasMore'] === true,
      };
    },
    me: async () => {
      try {
        const response = await request('/me');
        return readMe(response.payload);
      } catch (error) {
        // El backend todavía no tiene `/me`: no es un error de la sesión, es una
        // operation que falta. El controller resuelve el perfil desde el catálogo.
        if (error instanceof LiveApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    createPing: async (targetProfileId) => {
      const response = await request('/pings', { method: 'POST', body: { targetProfileId } });
      const ping = readPing(response.payload);
      if (ping === null) {
        throw new LiveApiError(
          response.status,
          'INVALID_PING',
          'El ping no vino con la forma esperada.',
        );
      }
      return ping;
    },
    listPings: async (box) =>
      readPingItems((await request(`/pings${queryString({ box })}`)).payload),
    acceptPing: async (pingId) => {
      const response = await request(`/pings/${encodeURIComponent(pingId)}/accept`, {
        method: 'POST',
      });
      return readMatch(response.payload);
    },
    rejectPing: async (pingId) => {
      await request(`/pings/${encodeURIComponent(pingId)}/reject`, { method: 'POST' });
    },
    streamUrl: (ticket) => `${baseUrl}/events${queryString({ ticket })}`,
  };
}
