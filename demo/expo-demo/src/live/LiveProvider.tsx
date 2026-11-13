import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { fixtures } from '../generated/fixtures';
import { useDemo } from '../state/DemoProvider';
import type { DemoStore } from '../state/store';

import {
  readRuntimeLiveSettings,
  readRuntimeZone,
  readStoredVisibility,
  writeStoredVisibility,
  writeStoredZone,
  type LiveSettings,
} from './config';
import {
  createLiveController,
  type BlockResult,
  type EventSourceLike,
  type LiveActionResult,
  type LiveController,
  type MarkReadResult,
  type PingResult,
} from './controller';
import { requestBrowserPoint } from './geolocation';
import { toBlockRows, type BlockRow } from './safety';
import { toNotificationRows, type NotificationRow } from './notifications';
import { pendingCount, toPingRows } from './pings';
import type { PingRow } from './pings';
import { emptyLiveState, type LiveState, type ReportReason, type Visibility } from './types';

/**
 * Puente entre el controlador live (puro) y React.
 *
 * Es lo único que conoce las dos mitades: cuando el controlador publica un
 * catálogo, el provider llama `store.setCatalog(...)`; cuando el usuario cambia
 * los filtros en el reducer, el provider los empuja al controlador. El
 * controlador no sabe que existe un store y el reducer no sabe que existe una
 * red: si el modo live desapareciera, la demo mock seguiría igual.
 *
 * **Arranque.** La sesión arranca sola, pero sólo si ya hay una zona elegida
 * (persistida de una visita anterior). Sin zona, el controlador queda en
 * `needs-zone` y la UI pregunta: el mapa/lista siguen con el dataset del build.
 * La ubicación **no** se pide al montar; se pide desde el botón.
 */

export type LiveBinding = {
  /** `false` si el build no tiene base de API configurada. */
  available: boolean;
  settings: LiveSettings | null;
  state: LiveState;
  /** Hay una sesión abierta (viva o degradada a polling). */
  enabled: boolean;
  /** Abre (o reintenta abrir) la sesión con la zona ya elegida. */
  enable: () => Promise<void>;
  /** El gesto "Usar mi ubicación": un solo pedido, sin seguimiento. */
  requestLocation: () => Promise<void>;
  /** Elige la zona demo (CDMX/Bogotá). Recrea la sesión si cambia de región. */
  chooseZone: (zoneKey: string) => Promise<void>;
  openZoneSheet: () => void;
  dismissZoneSheet: () => void;
  refresh: () => Promise<void>;
  refreshRows: () => Promise<void>;
  claim: (slot: number) => Promise<LiveActionResult>;
  takeover: (slot: number) => Promise<LiveActionResult>;
  /** Bandejas ya adaptadas a filas de UI, más nuevo primero. */
  pings: { inbox: PingRow[]; sent: PingRow[]; pending: number; error: string | null };
  refreshPings: () => Promise<void>;
  sendPing: (targetProfileId: string) => Promise<PingResult>;
  acceptPing: (pingId: string) => Promise<PingResult>;
  rejectPing: (pingId: string) => Promise<PingResult>;
  /** Visibilidad vigente en el server (`ghost` = online pero invisible). */
  visibility: Visibility;
  setVisibility: (visibility: Visibility) => Promise<LiveActionResult>;
  /** Bloqueos propios ya adaptados, con el otro proyectado. */
  blocks: BlockRow[];
  block: (profileId: string) => Promise<BlockResult>;
  unblock: (profileId: string) => Promise<BlockResult>;
  /** Reportes enviados en esta sesión (acuse local, el contrato no los lista). */
  reported: string[];
  report: (profileId: string, reason: ReportReason) => Promise<LiveActionResult>;
  blockError: string | null;
  reportError: string | null;
  /** Campana real (`GET /notifications`) ya adaptada. */
  notifications: NotificationRow[];
  unreadCount: number;
  notificationError: string | null;
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: (notificationIds?: readonly string[]) => Promise<MarkReadResult>;
  /** Reset propio (`POST /demo/reset/self`): cierra la sesión y limpia lo propio. */
  resetSelf: () => Promise<LiveActionResult>;
};

const LiveContext = createContext<LiveBinding | null>(null);

/** `EventSource` real, o `null` si el runtime no lo tiene (⇒ polling). */
function defaultEventSource(url: string): EventSourceLike | null {
  const ctor = (globalThis as { EventSource?: new (target: string) => unknown }).EventSource;
  if (ctor === undefined) {
    return null;
  }
  return new ctor(url) as unknown as EventSourceLike;
}

export type LiveProviderProps = {
  store: DemoStore;
  children: ReactNode;
  /** Inyectable en tests; en la app es el `EventSource` del navegador. */
  createEventSource?: (url: string) => EventSourceLike | null;
  /**
   * `false` apaga el arranque automático (tests de render o una pantalla que
   * quiera decidir cuándo abrir la sesión). En la app siempre arranca.
   */
  autoStart?: boolean;
};

export function LiveProvider({
  store,
  children,
  createEventSource,
  autoStart = true,
}: LiveProviderProps) {
  // `EXPO_PUBLIC_*` se inlinea al compilar: el acceso tiene que ser estático.
  // El override de runtime (`?api=` y storage) entra después, en `config`.
  // La región no entra: sale de la zona elegida (`cdmx → mx`, `bogota → co`).
  const settings = useMemo(
    () => readRuntimeLiveSettings(process.env.EXPO_PUBLIC_API_URL),
    [],
  );

  /**
   * Zona persistida de una visita anterior. Se lee **una vez**, antes de crear
   * el controlador: es el arranque sin gesto que no adivina la ciudad.
   */
  const [initialZone] = useState<string | null>(() => readRuntimeZone());

  /**
   * Visibilidad persistida. Es la elección del usuario, no el estado del server:
   * viaja al controlador para reaplicarla en el primer `PUT /presence` de la
   * sesión, porque una sesión nueva nace `visible`.
   */
  const [initialVisibility] = useState<Visibility>(() => readStoredVisibility());

  const [controller] = useState<LiveController>(() =>
    createLiveController({
      settings,
      initialZoneKey: initialZone,
      initialVisibility,
      onZoneChange: writeStoredZone,
      onVisibilityChange: writeStoredVisibility,
      createEventSource: createEventSource ?? defaultEventSource,
      requestPoint: requestBrowserPoint,
      // El usuario puede copiar estos logs cuando algo no cuadra. Sin coordenadas.
      log: (message) => console.info(message),
      onCatalog: (profiles, source, botIds) => {
        store.setCatalog(profiles === null ? fixtures.profiles : profiles, source, botIds);
      },
      // Un ping nuevo usa el mismo host de toasts del guion: una sola pila de
      // avisos y el mismo timer de 4 s.
      onNewPings: () => store.pushToast('notif.ping'),
    }),
  );

  const live = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const { state } = useDemo();
  const filters = state.filters;

  /**
   * **Default: live cuando el build tiene API.** El dataset del build no es una
   * elección visible: es el catálogo con el que la app arranca y al que vuelve
   * si la API no responde. El `EventSource`/fetch reales se abren acá y no en un
   * chip, así que no hay forma de quedar en un modo que nadie pidió.
   */
  const enable = useCallback(async () => {
    await controller.start();
  }, [controller]);

  useEffect(() => {
    if (!autoStart || settings === null) {
      return;
    }
    void enable();
  }, [autoStart, enable, settings]);

  useEffect(() => {
    return () => {
      void controller.stop();
    };
  }, [controller]);

  /** Con sesión abierta: `live`, `polling` o el `connecting` del arranque. */
  const enabled =
    live.status === 'live' || live.status === 'polling' || live.status === 'connecting';

  useEffect(() => {
    if (!enabled) {
      return;
    }
    controller.setFilters(filters);
  }, [controller, enabled, filters]);

  const refresh = useCallback(async () => {
    await controller.refresh();
  }, [controller]);

  const requestLocation = useCallback(async () => {
    await controller.requestLocation();
  }, [controller]);

  const chooseZone = useCallback(
    async (zoneKey: string) => {
      await controller.chooseZone(zoneKey);
    },
    [controller],
  );

  const openZoneSheet = useCallback(() => {
    controller.openZoneSheet();
  }, [controller]);

  const dismissZoneSheet = useCallback(() => {
    controller.dismissZoneSheet();
  }, [controller]);

  const refreshRows = useCallback(async () => {
    await controller.refreshRows();
  }, [controller]);

  const claim = useCallback(async (slot: number) => controller.claim(slot), [controller]);
  const takeover = useCallback(async (slot: number) => controller.takeover(slot), [controller]);

  const refreshPings = useCallback(async () => {
    await controller.refreshPings();
  }, [controller]);
  const sendPing = useCallback(
    async (targetProfileId: string) => controller.sendPing(targetProfileId),
    [controller],
  );
  const acceptPing = useCallback(async (pingId: string) => controller.acceptPing(pingId), [
    controller,
  ]);
  const rejectPing = useCallback(async (pingId: string) => controller.rejectPing(pingId), [
    controller,
  ]);
  const setVisibility = useCallback(
    async (visibility: Visibility) => controller.setVisibility(visibility),
    [controller],
  );
  const block = useCallback(async (profileId: string) => controller.block(profileId), [
    controller,
  ]);
  const unblock = useCallback(async (profileId: string) => controller.unblock(profileId), [
    controller,
  ]);
  const report = useCallback(
    async (profileId: string, reason: ReportReason) => controller.report(profileId, reason),
    [controller],
  );
  const refreshNotifications = useCallback(async () => {
    await controller.refreshNotifications();
  }, [controller]);
  const markNotificationsRead = useCallback(
    async (notificationIds?: readonly string[]) =>
      controller.markNotificationsRead(notificationIds),
    [controller],
  );
  const resetSelf = useCallback(async () => controller.resetSelf(), [controller]);

  const blocks = useMemo(() => toBlockRows(live.blocks), [live.blocks]);
  const notifications = useMemo(
    () => toNotificationRows(live.notifications),
    [live.notifications],
  );

  /**
   * Bandejas adaptadas. Se memoiza por referencia de `state.pings` /
   * `state.sentPings`: el controlador las reemplaza enteras en cada foto, así
   * que no hay re-render por un array nuevo en cada render de React.
   */
  const inbox = useMemo(() => toPingRows(live.pings, 'inbox'), [live.pings]);
  const sent = useMemo(() => toPingRows(live.sentPings, 'sent'), [live.sentPings]);
  const pings = useMemo(
    () => ({ inbox, sent, pending: pendingCount(inbox), error: live.pingError }),
    [inbox, sent, live.pingError],
  );

  return (
    <LiveContext.Provider
      value={{
        available: settings !== null,
        settings,
        state: live,
        enabled,
        enable,
        requestLocation,
        chooseZone,
        openZoneSheet,
        dismissZoneSheet,
        refresh,
        refreshRows,
        claim,
        takeover,
        pings,
        refreshPings,
        sendPing,
        acceptPing,
        rejectPing,
        visibility: live.visibility,
        setVisibility,
        blocks,
        block,
        unblock,
        reported: live.reported,
        report,
        blockError: live.blockError,
        reportError: live.reportError,
        notifications,
        unreadCount: live.unreadCount,
        notificationError: live.notificationError,
        refreshNotifications,
        markNotificationsRead,
        resetSelf,
      }}
    >
      {children}
    </LiveContext.Provider>
  );
}

export function useLive(): LiveBinding {
  const binding = useContext(LiveContext);
  if (binding === null) {
    throw new Error('useLive() requiere <LiveProvider>.');
  }
  return binding;
}

export { emptyLiveState };
