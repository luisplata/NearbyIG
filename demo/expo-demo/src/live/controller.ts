import type { DemoSource, DiscoveryFilters, UiProfile } from '../state/types';

import { toUiProfiles, botIdsOf } from './adapter';
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
import type { GeoPoint, GeoResult } from './geolocation';
import { newPendingPeers, toPingRows } from './pings';
import { regionForZone } from './regions';
import {
  emptyLiveState,
  EVENT_TYPES,
  parseEvent,
  type LiveDiagnostics,
  type LiveEvent,
  type LiveLocation,
  type LiveNotice,
  type LiveState,
  type PingStatus,
  type ZonePromptCause,
} from './types';
import { zoneForPoint } from './zones';

/**
 * Controlador de la sesión live. Sin React y sin React Native: todo el I/O pasa
 * por `fetch` inyectable, así los tests lo manejan con un fake y no hay una
 * segunda versión de la lógica en los tests.
 *
 * **Ciclo.** `start()` abre sesión (`POST /auth/demo-session`) **en la región de
 * la zona elegida**, registra la presencia demo de esa zona (`PUT /presence`),
 * pide la primera foto (`GET /discovery` + `GET /demo/profiles`) y abre el
 * stream (`POST /auth/stream-ticket` + `EventSource` sobre `GET /events`).
 *
 * **La zona manda, y no se adivina.** La región nunca sale de una variable de
 * build ni de un default: sale de la zona (`cdmx → mx`, `bogota → co`) que el
 * usuario eligió, que quedó persistida de una visita anterior, o de la zona en
 * la que cae el punto del GPS. Sin zona no hay sesión: el estado queda en
 * `needs-zone` y la UI pregunta. Así no existe el camino "no dio el GPS, abro en
 * CDMX" que mandaba a un usuario de Bogotá a la ciudad equivocada.
 *
 * **El GPS, sólo con gesto.** `start()` no pide la ubicación: `requestLocation()`
 * es el botón "Usar mi ubicación". Pedir la ubicación sin gesto en móvil se
 * rechaza o se ignora, y el usuario ve un error que no llega a leer.
 *
 * **Cambio de región.** Si la zona elegida (o la del punto) es de otra región, la
 * sesión actual no sirve: se cierra (`POST /auth/logout`) y se abre otra en la
 * región correcta. Nunca se manda un punto de Bogotá con una sesión `mx`: el
 * backend deriva la región de la sesión y respondería `fallbackRequired`.
 *
 * **Latido de presencia.** El TTL de presencia del backend es de 12 s y
 * `/discovery` no devuelve nada sin presencia viva ("ver sin ser visto es lo que
 * un ghost no debe poder hacer"). Por eso el latido repite `PUT /presence` cada
 * 8 s (4 s de margen) y, en la misma vuelta, refresca la foto: eso es también el
 * mecanismo que repara cualquier hueco del stream.
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
 * una opción de la UI. Dos latidos fallidos seguidos se tratan igual (la sesión
 * se perdió o la API se cayó), incluso si el stream seguía abierto.
 */

export type EventSourceLike = {
  close(): void;
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  onopen: (() => void) | null;
  onerror: ((event?: unknown) => void) | null;
};

export type LiveActionResult = { ok: boolean; code: string | null };

/**
 * Resultado de una acción de ping. `status` es lo que el server dejó: `pending`
 * para un humano, `accepted` con `matchId` cuando el destino es un bot (acepta
 * solo). `code` es el `Problem.code` cuando falla (`PING_DUPLICATE`,
 * `PING_EXPIRED`, `PING_RESOLVED`, …).
 */
export type PingResult = {
  ok: boolean;
  code: string | null;
  status: PingStatus | null;
  matchId: string | null;
};

const PING_OK = { ok: true, code: null } as const;

export type LiveControllerPorts = {
  /** `null` = modo live no configurado en este build. */
  settings: LiveSettings | null;
  fetchImpl?: FetchLike;
  /** `null` = el runtime no tiene `EventSource`; se usa polling. */
  createEventSource?: (url: string) => EventSourceLike | null;
  /**
   * Punto del navegador. Sólo lo llama `requestLocation()` (el gesto del
   * usuario), nunca `start()`. `undefined` = runtime sin DOM (tests).
   */
  requestPoint?: () => Promise<GeoResult>;
  /** Zona persistida de una visita anterior. `null` = todavía no eligió. */
  initialZoneKey?: string | null;
  /** Persiste la zona elegida o resuelta por GPS (`cdmx`/`bogota`, nunca un punto). */
  onZoneChange?: (zoneKey: string) => void;
  /**
   * Aviso de ping nuevo: se llama una sola vez por ping que **aparece** en la
   * bandeja (el adapter dedupea). La primera foto no avisa: los pendientes que
   * ya estaban no son noticia.
   */
  onNewPings?: (count: number) => void;
  /**
   * Log de diagnóstico con prefijo `[geo]`. La app pasa `console.info`; los tests
   * no, así el ruido queda en el navegador y no en la salida de vitest.
   */
  log?: (message: string) => void;
  /** Catálogo para la UI. `null` significa "volvé al dataset del build". */
  onCatalog?: (
    profiles: readonly UiProfile[] | null,
    source: DemoSource,
    botIds: readonly string[],
  ) => void;
  heartbeatMs?: number;
  pollMs?: number;
  reseedMs?: number;
  /** Cada cuánto se refresca la bandeja. El contrato no tiene push de pings. */
  pingsMs?: number;
};

export type LiveController = {
  getSettings(): LiveSettings | null;
  getState(): LiveState;
  subscribe(listener: () => void): () => void;
  /** `false` si no se pudo abrir (sin zona, sin API): la UI se queda con el dataset. */
  start(): Promise<boolean>;
  stop(): Promise<void>;
  refresh(): Promise<void>;
  refreshRows(): Promise<void>;
  /** Vuelve a pedir las dos bandejas (`inbox` + `sent`). */
  refreshPings(): Promise<void>;
  /** `POST /pings`: devuelve el estado que quedó (`pending` o `accepted`). */
  sendPing(targetProfileId: string): Promise<PingResult>;
  /** `POST /pings/{id}/accept`: crea el match y refresca la bandeja. */
  acceptPing(pingId: string): Promise<PingResult>;
  /** `POST /pings/{id}/reject`: sin match, la fila queda `rejected`. */
  rejectPing(pingId: string): Promise<PingResult>;
  setFilters(filters: DiscoveryFilters): void;
  /** El gesto "Usar mi ubicación": un solo pedido, sin seguimiento. */
  requestLocation(): Promise<void>;
  /** Elige la zona demo. Recrea la sesión si la zona es de otra región. */
  chooseZone(zoneKey: string): Promise<void>;
  /** Vuelve a mostrar el sheet de zona (después de un "Ahora no"). */
  openZoneSheet(): void;
  dismissZoneSheet(): void;
  claim(slot: number): Promise<LiveActionResult>;
  takeover(slot: number): Promise<LiveActionResult>;
};

const DEFAULT_HEARTBEAT_MS = 8_000;
const DEFAULT_POLL_MS = 3_000;
const DEFAULT_RESEED_MS = 1_200;
/** 5 s: la bandeja no es un chat, pero el ping tiene que sentirse vivo. */
const DEFAULT_PINGS_MS = 5_000;
/** Default de `DiscoveryQuery.radiusM` en el contrato. */
const DEFAULT_RADIUS_M = 5_000;

function isConnected(status: LiveState['status']): boolean {
  return status === 'live' || status === 'polling';
}

/** `GeoResult` sin `ok` → causa del sheet. Nunca se llama con `ok`. */
function failureCause(status: Exclude<GeoResult['status'], 'ok'>): ZonePromptCause {
  return status;
}

export function createLiveController(ports: LiveControllerPorts): LiveController {
  const settings = ports.settings;
  const api: LiveApi | null =
    settings === null ? null : createLiveApi({ baseUrl: settings.baseUrl, fetchImpl: ports.fetchImpl });

  let state: LiveState = emptyLiveState();
  const listeners = new Set<() => void>();
  /** Zona demo en uso. Es la que define la región de la sesión. */
  let zone: string | null = ports.initialZoneKey ?? null;
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
  let pingsTimer: ReturnType<typeof setInterval> | null = null;

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
    ports.onCatalog?.(toUiProfiles(state.discovery), 'live', botIdsOf(state.discovery));
  };

  const emitDataset = (): void => {
    ports.onCatalog?.(null, 'dataset', []);
  };

  const log = ports.log ?? ((): void => undefined);

  /** Actualiza un subconjunto del diagnóstico sin pisar el resto. */
  const diagnose = (patch: Partial<LiveDiagnostics>): void => {
    set({ diagnostics: { ...state.diagnostics, ...patch } });
  };

  /** Fija la zona activa y la persiste: una recarga no vuelve a preguntar. */
  const applyZone = (zoneKey: string): void => {
    const changed = zone !== zoneKey;
    zone = zoneKey;
    set({ zoneKey });
    if (changed) {
      ports.onZoneChange?.(zoneKey);
    }
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
   * Registra la presencia del objetivo y devuelve de dónde salieron las
   * distancias.
   *
   * El punto fuera de la zona de la región no es un error del contrato: es el
   * caso "estoy en otra ciudad". El server responde `fallbackRequired` y acá se
   * re-registra con la zona demo de la región + un aviso, en vez de dejar la
   * presencia sin zona. El cliente ya descarta el punto antes de mandarlo cuando
   * no cae en ninguna zona (`zoneForPoint`), así que esto es la red del server.
   */
  const registerPresence = async (
    target: PresenceTarget,
    zoneKey: string,
  ): Promise<LiveLocation> => {
    if (api === null) {
      return 'demo';
    }
    const result = await api.presence(target);
    diagnose({
      presenceStatus: result.status,
      presenceZoneKey: result.zoneKey,
      fallbackRequired: result.fallbackRequired,
    });
    log(
      `[geo] presence=${result.status} region=${result.regionKey} zone=${result.zoneKey ?? 'none'} fallback=${result.fallbackRequired}`,
    );
    if ('point' in target && result.fallbackRequired) {
      const fallback = await api.presence({ demoZoneKey: zoneKey });
      diagnose({
        presenceStatus: fallback.status,
        presenceZoneKey: fallback.zoneKey,
        fallbackRequired: fallback.fallbackRequired,
      });
      log(
        `[geo] presence=${fallback.status} region=${fallback.regionKey} zone=${fallback.zoneKey ?? 'none'} fallback=${fallback.fallbackRequired}`,
      );
      presence = { demoZoneKey: zoneKey };
      set({ notice: 'outside-zone', zonePrompt: 'outside-zone', point: null });
      return 'demo';
    }
    presence = target;
    // Un punto que sí se pudo proyectar cierra el sheet y borra el aviso.
    set({ notice: null, zonePrompt: null });
    return 'point' in target ? 'gps' : 'demo';
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
    if (pingsTimer !== null) {
      clearInterval(pingsTimer);
      pingsTimer = null;
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
    set({
      status: 'offline',
      transport: 'none',
      notice,
      error: code,
      location: null,
      point: null,
      pings: [],
      sentPings: [],
      pingsAt: null,
      pingError: null,
      self: null,
      selfSource: null,
    });
    emitDataset();
    if (api !== null && state.session !== null) {
      // Best effort: la sesión ya puede estar revocada.
      void api.logout().catch(() => undefined);
    }
    set({ session: null });
  };

  /**
   * Cierra la sesión actual sin tocar la zona elegida: es el paso previo a
   * abrir otra en la región correcta. `silent` evita el parpadeo al dataset en
   * medio de un cambio de zona (la nueva sesión llega en el mismo gesto).
   */
  const closeSession = async (silent: boolean): Promise<void> => {
    const hadSession = state.session !== null;
    clearTimers();
    stopPolling();
    closeStream();
    cursor = null;
    failures = 0;
    presence = null;
    set({
      session: null,
      discovery: [],
      rows: [],
      pings: [],
      sentPings: [],
      pingsAt: null,
      pingError: null,
      self: null,
      selfSource: null,
      lastSeq: 0,
      lastEventAt: null,
      location: null,
      transport: 'none',
      status: 'idle',
      point: null,
    });
    if (silent) {
      return;
    }
    emitDataset();
    if (api !== null && hadSession) {
      await api.logout().catch(() => undefined);
    }
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
    // Un ping o un match del stream no esperan al próximo tick de la bandeja: se
    // piden en el acto. El dedupe por peer evita que esto duplique el toast.
    if (events.some((event) => event.type === 'ping.received' || event.type === 'match.created')) {
      void refreshPings();
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

  /**
   * Foto de las dos bandejas. Es laxo a propósito: la bandeja es accesoria, y un
   * 500 en `/pings` no puede tumbar una sesión que está sirviendo descubrimiento.
   *
   * **Toast sin duplicados.** Sólo avisa si ya había una foto anterior (`pingsAt`)
   * y el ping es nuevo (`newPendingPeers` compara por peer). Un refresh que
   * repite exactamente los mismos pendientes no vuelve a avisar, y la primera
   * carga no convierte pendientes viejos en noticias.
   */
  const refreshPings = async (): Promise<void> => {
    if (api === null || state.session === null) {
      return;
    }
    try {
      const [inbox, sent] = await Promise.all([api.listPings('inbox'), api.listPings('sent')]);
      const hadPhoto = state.pingsAt !== null;
      const previous = toPingRows(state.pings, 'inbox');
      set({ pings: inbox, sentPings: sent, pingsAt: Date.now() });
      if (hadPhoto) {
        const fresh = newPendingPeers(previous, toPingRows(inbox, 'inbox'));
        if (fresh.length > 0) {
          ports.onNewPings?.(fresh.length);
        }
      }
    } catch (error) {
      // Un 401 acá no significa que la sesión murió: el latido lo decide.
      log(
        `[ping] bandeja sin respuesta status=${error instanceof LiveApiError ? error.status : 'network'}`,
      );
    }
  };

  const startPingPoll = (): void => {
    if (pingsTimer !== null) {
      return;
    }
    pingsTimer = setInterval(() => {
      void refreshPings();
    }, ports.pingsMs ?? DEFAULT_PINGS_MS);
    void refreshPings();
  };

  /**
   * Perfil propio de la sesión: `GET /me` y, si esa operation todavía no existe
   * (404), la fila del catálogo con el mismo `profileId`. El fallback es
   * explícito (`selfSource: 'catalog'`) para que la UI pueda aclarar de dónde
   * salió el perfil en vez de mostrar el `self` del dataset como si fuera real.
   */
  const loadSelf = async (): Promise<void> => {
    if (api === null || state.session === null) {
      return;
    }
    const profileId = state.session.profileId;
    try {
      const me = await api.me();
      if (me !== null) {
        set({ self: me, selfSource: 'me' });
        return;
      }
    } catch (error) {
      log(`[ping] me sin respuesta status=${error instanceof LiveApiError ? error.status : 'network'}`);
    }
    const row =
      state.rows.find((candidate) => candidate.profileId === profileId) ??
      state.discovery.find((candidate) => candidate.profileId === profileId);
    set({ self: row ?? null, selfSource: row === undefined ? null : 'catalog' });
  };

  const pingFailure = (error: unknown): PingResult => {
    const code = error instanceof LiveApiError ? error.code : 'NETWORK';
    set({ pingError: code });
    return { ok: false, code, status: null, matchId: null };
  };

  const afterSlotChange = async (session: LiveState['session']): Promise<void> => {
    if (api !== null) {
      api.setToken(session?.token ?? null);
    }
    cursor = null;
    stopPolling();
    closeStream();
    set({ session, transport: 'none', self: null, selfSource: null, pings: [], sentPings: [], pingsAt: null });
    await refreshRows();
    await refreshDiscovery();
    await loadSelf();
    await connectStream();
    startHeartbeat();
    startPingPoll();
  };

  /**
   * Abre la sesión en la región de la zona y registra la presencia con la que se
   * arranca: el punto si hay un gesto de ubicación, la zona demo si no.
   *
   * Es el único camino que crea sesión, así que la región siempre es la de una
   * zona del catálogo: no hay una "región por defecto" que pueda aparecer.
   */
  const openSessionWith = async (zoneKey: string, geoPoint: GeoPoint | null): Promise<boolean> => {
    if (api === null) {
      return false;
    }
    const regionKey = regionForZone(zoneKey);
    if (regionKey === null) {
      set({ status: 'needs-zone', transport: 'none', zonePrompt: 'initial' });
      emitDataset();
      return false;
    }
    set({ status: 'connecting', transport: 'none', notice: null, error: null });
    let session: LiveState['session'];
    try {
      // Sin `demoSlot`: el backend toma el primer slot libre y, si los 10 están
      // ocupados, entra como invitado. Nunca hay que adivinar un slot.
      session = await api.openSession(regionKey);
    } catch (error) {
      failures = 0;
      set({
        status: 'offline',
        transport: 'none',
        notice: noticeFor(error),
        error: error instanceof LiveApiError ? error.code : null,
        session: null,
        location: null,
      });
      emitDataset();
      return false;
    }
    applyZone(zoneKey);
    api.setToken(session.token);
    set({ session, zoneKey, zonePrompt: null });
    log(
      `[geo] session region=${session.regionKey} slot=${session.demoSlot ?? 'invitado'} profile=${session.profileId}`,
    );
    try {
      const target: PresenceTarget = geoPoint === null ? { demoZoneKey: zoneKey } : { point: geoPoint };
      const location = await registerPresence(target, zoneKey);
      set({ location, point: location === 'gps' ? geoPoint : null });
      await refreshDiscovery();
    } catch (error) {
      degrade(error);
      return false;
    }
    await connectStream();
    startHeartbeat();
    startPingPoll();
    // El perfil propio no bloquea el arranque: llega un instante después y la UI
    // ya está dibujando el catálogo.
    void refreshRows().then(loadSelf);
    return true;
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
      /**
       * Sin zona no se abre nada. La única forma de arrancar en `mx`/`co` es una
       * zona elegida (ahora o en una visita anterior): no hay default mudo, y la
       * ubicación no se pide sin un gesto.
       */
      if (zone === null || regionForZone(zone) === null) {
        set({
          status: 'needs-zone',
          transport: 'none',
          notice: null,
          error: null,
          location: null,
          point: null,
          zonePrompt: 'initial',
        });
        emitDataset();
        return false;
      }
      return openSessionWith(zone, null);
    },
    stop: async () => {
      const hadSession = state.session !== null;
      await closeSession(true);
      zone = null;
      state = emptyLiveState();
      notify();
      emitDataset();
      if (api !== null && hadSession) {
        await api.logout().catch(() => undefined);
      }
    },
    requestLocation: async () => {
      if (api === null || ports.requestPoint === undefined) {
        return;
      }
      const geo = await ports.requestPoint();
      diagnose({
        geo: geo.status,
        accuracyM: geo.status === 'ok' ? geo.accuracyM : null,
      });
      if (geo.status !== 'ok') {
        log(`[geo] request=${geo.status} zone=${zone ?? 'none'}`);
        // La sesión (si existe) sigue con su zona demo; el sheet explica el motivo.
        set({ zonePrompt: failureCause(geo.status) });
        return;
      }
      const zoneKey = zoneForPoint(geo.point);
      log(
        `[geo] request=ok accuracy=${geo.accuracyM === null ? 'desconocida' : `${geo.accuracyM}m`} zone=${zoneKey ?? 'none'}`,
      );
      if (zoneKey === null) {
        // Fuera de México y Colombia: no se manda un punto que el server va a
        // rechazar ni se abre una sesión en una región que no es la del usuario.
        set({ zonePrompt: 'outside-zone', point: null });
        return;
      }
      const regionKey = regionForZone(zoneKey);
      if (regionKey === null) {
        set({ zonePrompt: 'outside-zone' });
        return;
      }
      const current = state.session;
      if (current === null) {
        applyZone(zoneKey);
        await openSessionWith(zoneKey, geo.point);
        return;
      }
      if (current.regionKey !== regionKey) {
        // La zona del punto es de otra región: la sesión actual no sirve.
        await closeSession(true);
        if (api !== null) {
          await api.logout().catch(() => undefined);
        }
        applyZone(zoneKey);
        await openSessionWith(zoneKey, geo.point);
        return;
      }
      try {
        applyZone(zoneKey);
        const location = await registerPresence({ point: geo.point }, zoneKey);
        set({ location, point: location === 'gps' ? geo.point : null });
        await refreshDiscovery();
      } catch (error) {
        failures += 1;
        if (failures >= 2) {
          degrade(error);
        }
      }
    },
    chooseZone: async (zoneKey) => {
      if (api === null) {
        return;
      }
      const regionKey = regionForZone(zoneKey);
      if (regionKey === null) {
        return;
      }
      // La elección se persiste antes de abrir: si la API está caída, recargar
      // respeta lo que el usuario eligió en vez de volver a preguntar.
      applyZone(zoneKey);
      const current = state.session;
      if (current !== null && current.regionKey === regionKey) {
        // Misma región: sólo cambia la zona demo de la presencia.
        try {
          presence = { demoZoneKey: zoneKey };
          await api.presence(presence);
          set({ location: 'demo', notice: null, zonePrompt: null, error: null });
          await refreshDiscovery();
        } catch (error) {
          failures += 1;
          if (failures >= 2) {
            degrade(error);
          }
        }
        return;
      }
      if (current !== null) {
        // Otra región: cerrar y abrir de nuevo. Mandar presencia de `co` con un
        // token `mx` sólo devolvería `fallbackRequired` y dejaría al usuario en
        // la ciudad equivocada.
        await closeSession(true);
        if (api !== null) {
          await api.logout().catch(() => undefined);
        }
      }
      await openSessionWith(zoneKey, null);
    },
    openZoneSheet: () => {
      if (state.zonePrompt !== null) {
        return;
      }
      set({ zonePrompt: zone === null ? 'initial' : 'outside-zone' });
    },
    dismissZoneSheet: () => {
      set({ zonePrompt: null });
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
    refreshPings,
    sendPing: async (targetProfileId) => {
      if (api === null || state.session === null) {
        return { ok: false, code: 'NO_SESSION', status: null, matchId: null };
      }
      try {
        const ping = await api.createPing(targetProfileId);
        set({ pingError: null });
        await refreshPings();
        return { ok: true, code: null, status: ping.status, matchId: ping.matchId };
      } catch (error) {
        return pingFailure(error);
      }
    },
    acceptPing: async (pingId) => {
      if (api === null || state.session === null) {
        return { ok: false, code: 'NO_SESSION', status: null, matchId: null };
      }
      try {
        const match = await api.acceptPing(pingId);
        set({ pingError: null });
        await refreshPings();
        return { ok: true, code: null, status: 'accepted', matchId: match.id };
      } catch (error) {
        // El estado que diga el server manda: un accept repetido es 409 y la
        // bandeja se refresca igual para mostrar el estado real.
        const failure = pingFailure(error);
        await refreshPings();
        return failure;
      }
    },
    rejectPing: async (pingId) => {
      if (api === null || state.session === null) {
        return { ok: false, code: 'NO_SESSION', status: null, matchId: null };
      }
      try {
        await api.rejectPing(pingId);
        set({ pingError: null });
        await refreshPings();
        return { ...PING_OK, status: 'rejected', matchId: null };
      } catch (error) {
        const failure = pingFailure(error);
        await refreshPings();
        return failure;
      }
    },
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
      const regionKey = state.session?.regionKey ?? regionForZone(zone);
      if (api === null || state.session === null || regionKey === null) {
        return { ok: false, code: 'NO_SESSION' };
      }
      try {
        const session = await api.claimSlot(regionKey, slot);
        await afterSlotChange(session);
        return { ok: true, code: null };
      } catch (error) {
        return { ok: false, code: error instanceof LiveApiError ? error.code : 'NETWORK' };
      }
    },
    takeover: async (slot) => {
      const regionKey = state.session?.regionKey ?? regionForZone(zone);
      if (api === null || state.session === null || regionKey === null) {
        return { ok: false, code: 'NO_SESSION' };
      }
      try {
        const session = await api.takeover(regionKey, slot);
        await afterSlotChange(session);
        return { ok: true, code: null };
      } catch (error) {
        return { ok: false, code: error instanceof LiveApiError ? error.code : 'NETWORK' };
      }
    },
  };
}
