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
  writeStoredZone,
  type LiveSettings,
} from './config';
import {
  createLiveController,
  type EventSourceLike,
  type LiveActionResult,
  type LiveController,
  type PingResult,
} from './controller';
import { requestBrowserPoint } from './geolocation';
import { pendingCount, toPingRows } from './pings';
import type { PingRow } from './pings';
import { emptyLiveState, type LiveState } from './types';

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

  const [controller] = useState<LiveController>(() =>
    createLiveController({
      settings,
      initialZoneKey: initialZone,
      onZoneChange: writeStoredZone,
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
