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

import { readLiveSettings, type LiveSettings } from './config';
import {
  createLiveController,
  type EventSourceLike,
  type LiveActionResult,
  type LiveController,
} from './controller';
import { emptyLiveState, type LiveState } from './types';

/**
 * Puente entre el controlador live (puro) y React.
 *
 * Es lo único que conoce las dos mitades: cuando el controlador publica un
 * catálogo, el provider llama `store.setCatalog(...)`; cuando el usuario cambia
 * los filtros en el reducer, el provider los empuja al controlador. El
 * controlador no sabe que existe un store y el reducer no sabe que existe una
 * red: si el modo live desapareciera, la demo mock seguiría igual.
 */

export type LiveBinding = {
  /** `false` si el build no tiene base de API configurada. */
  available: boolean;
  settings: LiveSettings | null;
  state: LiveState;
  /** Hay una sesión abierta (viva o degradada a polling). */
  enabled: boolean;
  /** Abre (o reintenta abrir) la sesión. La UI no ofrece "apagar el live". */
  enable: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshRows: () => Promise<void>;
  claim: (slot: number) => Promise<LiveActionResult>;
  takeover: (slot: number) => Promise<LiveActionResult>;
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
  const settings = useMemo(
    () => readLiveSettings(process.env.EXPO_PUBLIC_API_URL, process.env.EXPO_PUBLIC_DEMO_REGION),
    [],
  );

  const [controller] = useState<LiveController>(() =>
    createLiveController({
      settings,
      createEventSource: createEventSource ?? defaultEventSource,
      onCatalog: (profiles, source) => {
        store.setCatalog(profiles === null ? fixtures.profiles : profiles, source);
      },
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

  const enabled = live.status !== 'idle' && live.status !== 'offline';

  useEffect(() => {
    if (!enabled) {
      return;
    }
    controller.setFilters(filters);
  }, [controller, enabled, filters]);

  const refresh = useCallback(async () => {
    await controller.refresh();
  }, [controller]);

  const refreshRows = useCallback(async () => {
    await controller.refreshRows();
  }, [controller]);

  const claim = useCallback(async (slot: number) => controller.claim(slot), [controller]);
  const takeover = useCallback(async (slot: number) => controller.takeover(slot), [controller]);

  return (
    <LiveContext.Provider
      value={{
        available: settings !== null,
        settings,
        state: live,
        enabled,
        enable,
        refresh,
        refreshRows,
        claim,
        takeover,
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
