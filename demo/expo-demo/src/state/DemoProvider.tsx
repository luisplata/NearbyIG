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

/** Provee el store y lo descarta al desmontar (E-7: no quedan timers vivos). */
export function DemoStoreProvider({ store, children }: DemoStoreProviderProps) {
  useEffect(() => {
    return () => {
      store.dispose();
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
