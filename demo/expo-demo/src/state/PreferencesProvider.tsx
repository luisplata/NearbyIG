import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { readStoredPreferences, writeStoredPreferences } from '../live/config';
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  preferencesOf,
  resetActions,
  restoreActions,
  serializePreferences,
} from '../live/preferences';

import { useSoundPreference } from '../sound/useSound';

import { useDemo } from './DemoProvider';

/**
 * Preferencias persistentes del usuario: radio, intenciones, género, verificados,
 * en línea, toggle de bots y toggle de sonidos.
 *
 * **Ciclo.** Al montar lee el storage de preferencias del build,
 * hidrata el store con acciones del reducer (las 27 del contrato, sin inventar
 * ninguna) y aplica el toggle de bots con `setIncludeBots`. Desde ahí, cada
 * cambio del estado se vuelve a escribir en el storage.
 *
 * **Por qué un flag `hydrated`.** Los efectos corren en orden de declaración: si
 * el de guardado se adelantara, la primera render (todavía en defaults) pisaría
 * lo guardado y una recarga perdería las preferencias. Con el flag, el guardado
 * no escribe hasta que la hidratación terminó.
 *
 * **Qué NO toca.** La zona (`nearbyig.demoZone` la maneja el controlador live) y
 * la sesión (el token vive en memoria por contrato). "Restablecer" vuelve los
 * filtros y los bots a fábrica sin mudar al usuario de ciudad ni cerrar sesión.
 */
export type PreferencesBinding = {
  includeBots: boolean;
  /** Bots del catálogo activo. Con 0 no hay nada que apagar y el control se oculta. */
  botCount: number;
  setIncludeBots: (value: boolean) => void;
  toggleBots: () => void;
  /** Avisos sonoros. Apagado, el motor ni siquiera toca el `AudioContext`. */
  soundEnabled: boolean;
  setSoundEnabled: (value: boolean) => void;
  /** Radio, filtros y bots a fábrica. Zona y sesión intactas. */
  reset: () => void;
  /** La hidratación ya leyó el storage (o no había nada que leer). */
  hydrated: boolean;
};

const PreferencesContext = createContext<PreferencesBinding | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { state, dispatch, store } = useDemo();
  const [hydrated, setHydrated] = useState(false);
  /**
   * Los sonidos no son estado del reducer (no hay acción en el contrato), así que
   * el flag vive acá y se hidrata del mismo JSON que el resto de preferencias.
   * Default: activado.
   */
  const [soundEnabled, setSoundEnabled] = useState(DEFAULT_PREFERENCES.soundEnabled);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) {
      return;
    }
    booted.current = true;
    const stored = parsePreferences(readStoredPreferences());
    if (stored === null) {
      setHydrated(true);
      return;
    }
    for (const action of restoreActions(stored)) {
      dispatch(action);
    }
    store.setIncludeBots(stored.includeBots);
    setSoundEnabled(stored.soundEnabled);
    setHydrated(true);
  }, [dispatch, store]);

  // El motor de sonido sigue al toggle: apagado no crea contexto ni suena.
  useSoundPreference(soundEnabled);

  const serialized = serializePreferences(
    preferencesOf(state.filters, state.includeBots, soundEnabled),
  );

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    writeStoredPreferences(serialized);
  }, [hydrated, serialized]);

  const setIncludeBots = useCallback(
    (value: boolean) => {
      store.setIncludeBots(value);
    },
    [store],
  );

  const toggleBots = useCallback(() => {
    store.setIncludeBots(!store.getState().includeBots);
  }, [store]);

  const reset = useCallback(() => {
    for (const action of resetActions()) {
      dispatch(action);
    }
    store.setIncludeBots(DEFAULT_PREFERENCES.includeBots);
    setSoundEnabled(DEFAULT_PREFERENCES.soundEnabled);
  }, [dispatch, store]);

  const binding = useMemo<PreferencesBinding>(
    () => ({
      includeBots: state.includeBots,
      botCount: state.botIds.length,
      setIncludeBots,
      toggleBots,
      soundEnabled,
      setSoundEnabled,
      reset,
      hydrated,
    }),
    [
      state.includeBots,
      state.botIds,
      setIncludeBots,
      toggleBots,
      soundEnabled,
      reset,
      hydrated,
    ],
  );

  return <PreferencesContext.Provider value={binding}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesBinding {
  const binding = useContext(PreferencesContext);
  if (binding === null) {
    throw new Error('usePreferences() requiere <PreferencesProvider>.');
  }
  return binding;
}
