import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { DemoAction } from './actions';
import type { DemoStore } from './store';
import type { DemoState } from './types';

const DemoStoreContext = createContext<DemoStore | null>(null);

export type DemoStoreProviderProps = {
  store: DemoStore;
  children: ReactNode;
};

/**
 * Provee el store y corta los timers al desmontar (E-7).
 *
 * No llama a `dispose()`: en desarrollo StrictMode monta, desmonta y vuelve a
 * montar el mismo árbol, y `useMemo` reutiliza la instancia del store. Un
 * `dispose()` en ese cleanup dejaría el store muerto para el segundo montaje y
 * la demo no respondería. Cancelar timers alcanza para la garantía real: no
 * queda ningún timer vivo después del desmontaje; un remount real de `App`
 * crea un store nuevo.
 */
export function DemoStoreProvider({ store, children }: DemoStoreProviderProps) {
  useEffect(() => {
    return () => {
      store.cancelTimers();
    };
  }, [store]);

  return <DemoStoreContext.Provider value={store}>{children}</DemoStoreContext.Provider>;
}

export type DemoBinding = {
  state: DemoState;
  dispatch: (action: DemoAction) => void;
  store: DemoStore;
};

/** Lectura del estado con `useSyncExternalStore` + dispatch estable. */
export function useDemo(): DemoBinding {
  const store = useContext(DemoStoreContext);
  if (store === null) {
    throw new Error('useDemo() requiere <DemoStoreProvider>.');
  }
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { state, dispatch: store.dispatch, store };
}
