import type { DemoSource, DiscoveryFilters, UiProfile } from '../state/types';

import { toUiProfiles } from './adapter';
import {
  createLiveApi,
  LiveApiError,
  type DiscoveryQuery,
  type FetchLike,
  type LiveApi,
  type PresenceTarget,
} from './api';
import type { LiveSettings } from './config';
import { applyEvents } from './events';
import type { GeoResult } from './geolocation';
import { defaultZoneFor } from './regions';
import {
  emptyLiveState,
  EVENT_TYPES,
  parseEvent,
  type LiveEvent,
  type LiveLocation,
  type LiveNotice,
  type LiveState,
} from './types';

/**
 * Controlador de la sesión live. Sin React y sin React Native: todo el I/O pasa
 * por `fetch` inyectable, así los tests lo manejan con un fake y no hay una
 * segunda versión de la lógica en los tests.
 *
 * **Ciclo.** `start()` abre sesión (`POST /auth/demo-session`), registra
 * presencia en la zona por defecto de la región (`PUT /presence`), pide la
 * primera foto (`GET /discovery` + `GET /demo/profiles`) y abre el stream
 * (`POST /auth/stream-ticket` + `EventSource` sobre `GET /events`).
 *
 * **Latido de presencia.** El TTL de presencia del backend es de 12 s y
 * `/discovery` no devuelve nada sin presencia viva ("ver sin ser visto es lo que
 * un ghost no debe poder hacer"). Por eso el latido repite `PUT /presence` cada
 * 8 s (4 s de margen) y, en la misma vuelta, refresca la foto: eso es también el
 * mecanismo que repara cualquier hueco del stream.
 *
 * **Presencia: GPS o zona demo.** Al abrir la sesión se pide el punto una vez
 * (`ports.requestPoint`). Si el navegador lo da, el `PUT /presence` lleva
 * `point`; si lo niega, no hay soporte o el contexto no es seguro, lleva la
 * `demoZoneKey` de la región. Si el server responde `fallbackRequired` (el punto
 * no cae en ninguna zona del catálogo) se re-registra con la zona demo y queda un
 * aviso: el mapa y las distancias son de la zona demo, no de donde está el
 * usuario. El punto no se guarda ni se repite en ningún otro pedido.
 *
 * **Transporte.** SSE es la actualización fina; el polling (`/events/poll` con
 * `cursor`) es el fallback si el navegador no soporta `EventSource`, si el
 * ticket no se puede emitir o si el stream se cae. Los dos caminos aplican los
 * mismos eventos con el mismo dedupe por `seq`, así que degradar no duplica ni
 * pierde: la próxima página de polling arranca en el `cursor` ya aplicado.
 *
 * **Una sola sesión por navegador.** `claim`/`takeover` reemplazan el token y
 * reconectan el stream: el backend revoca la sesión anterior, así que reusar la
 * conexión vieja sólo daría 401.
 *
 * **Falla suave.** Cualquier error de arranque deja `status: 'offline'` y avisa
 * con `onCatalog(null, 'dataset')`: la app vuelve al dataset del build sin
 * romperse. No hay un modo "mock" visible que elegir: el dataset es el piso, no
 * una opción de la UI.
 * Dos latidos fallidos seguidos se tratan igual (la sesión se perdió o la API se
 * cayó), incluso si el stream seguía abierto.
 */

export type EventSourceLike = {
  close(): void;
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  onopen: (() => void) | null;
  onerror: ((event?: unknown) => void) | null;
};

export type LiveActionResult = { ok: boolean; code: string | null };

export type LiveControllerPorts = {
  /** `null` = modo live no configurado en este build. */
  settings: LiveSettings | null;
  fetchImpl?: FetchLike;
  /** `null` = el runtime no tiene `EventSource`; se usa polling. */
  createEventSource?: (url: string) => EventSourceLike | null;
  /**
   * Punto del navegador. `undefined` = no se pide (tests, runtimes sin DOM) y la
   * presencia va con la zona demo, que es el camino sin permiso.
   */
  requestPoint?: () => Promise<GeoResult>;
  /** Catálogo para la UI. `null` significa "volvé al dataset del build". */
  onCatalog?: (profiles: readonly UiProfile[] | null, source: DemoSource) => void;
  heartbeatMs?: number;
  pollMs?: number;
  reseedMs?: number;
};

export type LiveController = {
  getSettings(): LiveSettings | null;
  getState(): LiveState;
  subscribe(listener: () => void): () => void;
  /** `false` si no se pudo abrir: la UI se queda con el dataset del build. */
  start(): Promise<boolean>;
  stop(): Promise<void>;
  refresh(): Promise<void>;
  refreshRows(): Promise<void>;
  setFilters(filters: DiscoveryFilters): void;
  /** Reintenta el punto del navegador (botón "Usar mi ubicación"). */
  requestLocation(): Promise<void>;
  claim(slot: number): Promise<LiveActionResult>;
  takeover(slot: number): Promise<LiveActionResult>;
};

const DEFAULT_HEARTBEAT_MS = 8_000;
const DEFAULT_POLL_MS = 3_000;
const DEFAULT_RESEED_MS = 1_200;
/** Default de `DiscoveryQuery.radiusM` en el contrato. */
const DEFAULT_RADIUS_M = 5_000;

function isConnected(status: LiveState['status']): boolean {
  return status === 'live' || status === 'polling';
}

export function createLiveController(ports: LiveControllerPorts): LiveController {
  const settings = ports.settings;
  const api: LiveApi | null =
    settings === null ? null : createLiveApi({ baseUrl: settings.baseUrl, fetchImpl: ports.fetchImpl });

  let state: LiveState = emptyLiveState();
  const listeners = new Set<() => void>();
  let zone: string | null = null;
  /** Lo que se repite en cada latido: el punto (si se pudo) o la zona demo. */
  let presence: PresenceTarget | null = null;
  let cursor: string | null = null;
  let filters: DiscoveryFilters | null = null;
  let queryKey = '';
  let failures = 0;
  let polling = false;
  let source: EventSourceLike | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let reseedTimer: ReturnType<typeof setTimeout> | null = null;

  const notify = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const set = (patch: Partial<LiveState>): void => {
    let changed = false;
    for (const key of Object.keys(patch) as (keyof LiveState)[]) {
      if (patch[key] !== state[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return;
    }
    state = { ...state, ...patch };
    notify();
  };

  const emitCatalog = (): void => {
    ports.onCatalog?.(toUiProfiles(state.discovery), 'live');
  };

  const emitDataset = (): void => {
    ports.onCatalog?.(null, 'dataset');
  };

  const queryFor = (current: DiscoveryFilters): DiscoveryQuery => {
    const intentions = current.intentions;
    return {
      radiusM: current.radiusM,
      // El contrato acepta una sola intención por pedido. Con varias tildadas se
      // pide sin ese filtro y `visibleProfiles` recorta en el cliente: el
      // vocabulario es el mismo, así que el resultado también.
      intention: intentions !== null && intentions.length === 1 ? intentions[0] : undefined,
      gender: current.gender ?? undefined,
      verified: current.verifiedOnly ? true : undefined,
      online: current.onlineOnly ? true : undefined,
    };
  };

  const query = (): DiscoveryQuery =>
    queryFor(
      filters ?? {
        intentions: null,
        gender: null,
        verifiedOnly: false,
        onlineOnly: false,
        radiusM: DEFAULT_RADIUS_M,
      },
    );

  const noticeFor = (error: unknown): LiveNotice => {
    if (error instanceof LiveApiError && error.status === 401) {
      return 'session-lost';
    }
    return 'unreachable';
  };

  /**
   * Decide con qué se registra la presencia y la registra.
   *
   * `gps` sólo si el navegador dio un punto **y** el server lo pudo proyectar a
   * una zona (`fallbackRequired: false`). El punto fuera de zona no es un error
   * del contrato: es el caso "estoy en otra ciudad", y la respuesta correcta es
   * caer a la zona demo con un aviso, no dejar la presencia sin zona.
   */
  const applyPresence = async (demoZoneKey: string): Promise<LiveLocation> => {
    if (api === null) {
      return 'demo';
    }
    const geo = ports.requestPoint === undefined ? null : await ports.requestPoint();
    if (geo !== null && geo.status === 'ok') {
      const projected = await api.presence({ point: geo.point });
      if (!projected.fallbackRequired) {
        presence = { point: geo.point };
        return 'gps';
      }
      // Fuera de la zona demo: la presencia va con zona y el aviso lo explica.
      await api.presence({ demoZoneKey });
      presence = { demoZoneKey };
      set({ notice: 'outside-zone' });
      return 'demo';
    }
    await api.presence({ demoZoneKey });
    presence = { demoZoneKey };
    return 'demo';
  };

  const clearTimers = (): void => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (reseedTimer !== null) {
      clearTimeout(reseedTimer);
      reseedTimer = null;
    }
  };

  const closeStream = (): void => {
    if (source !== null) {
      source.onopen = null;
      source.onerror = null;
      source.close();
      source = null;
    }
  };

  const stopPolling = (): void => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  /** Vuelta al dataset por pérdida de sesión o de red: nunca deja la UI colgada. */
  const degrade = (error: unknown): void => {
    const notice = noticeFor(error);
    const code = error instanceof LiveApiError ? error.code : null;
    clearTimers();
    stopPolling();
    closeStream();
    cursor = null;
    failures = 0;
    presence = null;
    set({ status: 'offline', transport: 'none', notice, error: code, location: null });
    emitDataset();
    if (api !== null && state.session !== null) {
      // Best effort: la sesión ya puede estar revocada.
      void api.logout().catch(() => undefined);
    }
    set({ session: null });
  };

  const apply = (events: readonly LiveEvent[]): void => {
    const result = applyEvents(state.discovery, events, state.lastSeq);
    const patch: Partial<LiveState> = { lastSeq: result.lastSeq, lastEventAt: Date.now() };
    if (result.changed) {
      patch.discovery = result.rows;
    }
    set(patch);
    if (result.changed) {
      emitCatalog();
    }
    if (result.unknownProfile) {
      scheduleReseed();
    }
  };

  const refreshDiscovery = async (): Promise<void> => {
    if (api === null || state.session === null) {
      return;
    }
    const rows = await api.discovery(query());
    set({ discovery: rows, error: null });
    emitCatalog();
  };

  const scheduleReseed = (): void => {
    if (reseedTimer !== null) {
      return;
    }
    reseedTimer = setTimeout(() => {
      reseedTimer = null;
      void refreshDiscovery().catch((error: unknown) => {
        failures += 1;
        if (failures >= 2) {
          degrade(error);
        }
      });
    }, ports.reseedMs ?? DEFAULT_RESEED_MS);
  };

  const pollOnce = async (): Promise<void> => {
    if (api === null || polling || state.session === null) {
      return;
    }
    polling = true;
    try {
      let page = await api.poll(cursor);
      let guard = 0;
      for (;;) {
        if (page.events.length > 0) {
          apply(page.events);
        }
        cursor = page.nextCursor ?? cursor;
        guard += 1;
        if (!page.hasMore || guard >= 5) {
          break;
        }
        page = await api.poll(cursor);
      }
      failures = 0;
      // Un poll exitoso limpia el aviso de degradación: el estado sigue vivo.
      if (state.notice === 'degraded') {
        set({ notice: null });
      }
    } catch (error) {
      failures += 1;
      if (failures >= 2) {
        degrade(error);
      }
    } finally {
      polling = false;
    }
  };

  const startPolling = (): void => {
    if (state.status === 'offline' || state.status === 'idle') {
      return;
    }
    const wasLive = state.status === 'live';
    set({
      transport: 'polling',
      status: 'polling',
      notice: wasLive ? 'degraded' : state.notice,
    });
    if (pollTimer !== null) {
      return;
    }
    pollTimer = setInterval(() => {
      void pollOnce();
    }, ports.pollMs ?? DEFAULT_POLL_MS);
    void pollOnce();
  };

  const onStreamError = (): void => {
    closeStream();
    startPolling();
  };

  const connectStream = async (): Promise<void> => {
    if (api === null) {
      return;
    }
    const factory = ports.createEventSource;
    if (factory === undefined) {
      startPolling();
      return;
    }
    let ticket = '';
    try {
      ticket = await api.streamTicket();
    } catch {
      startPolling();
      return;
    }
    if (ticket === '') {
      startPolling();
      return;
    }
    const next = factory(api.streamUrl(ticket));
    if (next === null) {
      startPolling();
      return;
    }
    source = next;
    next.onopen = () => {
      stopPolling();
      set({ transport: 'sse', status: 'live', notice: null });
    };
    for (const type of EVENT_TYPES) {
      next.addEventListener(type, (event) => {
        const parsed = parseEvent(event?.data);
        if (parsed !== null) {
          apply([parsed]);
        }
      });
    }
    next.onerror = onStreamError;
  };

  const beat = async (): Promise<void> => {
    if (api === null || presence === null || state.session === null) {
      return;
    }
    try {
      await api.presence(presence);
      await refreshDiscovery();
      failures = 0;
    } catch (error) {
      failures += 1;
      if (failures >= 2) {
        degrade(error);
      }
    }
  };

  const startHeartbeat = (): void => {
    if (heartbeatTimer !== null) {
      return;
    }
    heartbeatTimer = setInterval(() => {
      void beat();
    }, ports.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  };

  const refreshRows = async (): Promise<void> => {
    if (api === null || state.session === null) {
      return;
    }
    try {
      const rows = await api.listProfiles(state.session.regionKey);
      set({ rows });
    } catch {
      // La lista del selector es accesoria: su falla no tumba la sesión.
    }
  };

  const afterSlotChange = async (session: LiveState['session']): Promise<void> => {
    if (api !== null) {
      api.setToken(session?.token ?? null);
    }
    cursor = null;
    stopPolling();
    closeStream();
    set({ session, transport: 'none' });
    await refreshRows();
    await refreshDiscovery();
    await connectStream();
    startHeartbeat();
  };

  return {
    getSettings: () => settings,
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: async () => {
      if (settings === null || api === null) {
        set({ status: 'offline', transport: 'none', notice: 'unconfigured' });
        return false;
      }
      if (isConnected(state.status) || state.status === 'connecting') {
        return true;
      }
      const nextZone = defaultZoneFor(settings.region);
      set({ status: 'connecting', transport: 'none', notice: null, error: null });
      if (nextZone === null) {
        set({ status: 'offline', transport: 'none', notice: 'unreachable' });
        emitDataset();
        return false;
      }
      let session: LiveState['session'];
      try {
        session = await api.openSession(settings.region);
      } catch (error) {
        failures = 0;
        set({
          status: 'offline',
          transport: 'none',
          notice: noticeFor(error),
          error: error instanceof LiveApiError ? error.code : null,
        });
        emitDataset();
        return false;
      }
      zone = nextZone;
      api.setToken(session.token);
      set({ session });
      try {
        const location = await applyPresence(nextZone);
        set({ location });
        await refreshDiscovery();
      } catch (error) {
        degrade(error);
        return false;
      }
      void refreshRows();
      await connectStream();
      startHeartbeat();
      return true;
    },
    stop: async () => {
      const hadSession = state.session !== null;
      clearTimers();
      stopPolling();
      closeStream();
      cursor = null;
      failures = 0;
      zone = null;
      presence = null;
      state = emptyLiveState();
      notify();
      emitDataset();
      if (api !== null && hadSession) {
        await api.logout().catch(() => undefined);
      }
    },
    requestLocation: async () => {
      if (api === null || zone === null || state.session === null) {
        return;
      }
      try {
        const location = await applyPresence(zone);
        set({ location });
        await refreshDiscovery();
      } catch (error) {
        failures += 1;
        if (failures >= 2) {
          degrade(error);
        }
      }
    },
    refresh: async () => {
      await refreshDiscovery().catch((error: unknown) => {
        failures += 1;
        if (failures >= 2) {
          degrade(error);
        }
      });
    },
    refreshRows,
    setFilters: (next) => {
      const nextKey = JSON.stringify(queryFor(next));
      const sameFilters = nextKey === queryKey;
      filters = next;
      queryKey = nextKey;
      if (sameFilters || !isConnected(state.status)) {
        return;
      }
      void refreshDiscovery().catch((error: unknown) => {
        failures += 1;
        if (failures >= 2) {
          degrade(error);
        }
      });
    },
    claim: async (slot) => {
      if (api === null || state.session === null || settings === null) {
        return { ok: false, code: 'NO_SESSION' };
      }
      try {
        const session = await api.claimSlot(settings.region, slot);
        await afterSlotChange(session);
        return { ok: true, code: null };
      } catch (error) {
        return { ok: false, code: error instanceof LiveApiError ? error.code : 'NETWORK' };
      }
    },
    takeover: async (slot) => {
      if (api === null || state.session === null || settings === null) {
        return { ok: false, code: 'NO_SESSION' };
      }
      try {
        const session = await api.takeover(settings.region, slot);
        await afterSlotChange(session);
        return { ok: true, code: null };
      } catch (error) {
        return { ok: false, code: error instanceof LiveApiError ? error.code : 'NETWORK' };
      }
    },
  };
}
