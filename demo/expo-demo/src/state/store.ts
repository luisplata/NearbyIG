import type { DemoAction } from './actions';
import { initialState, reduce } from './reducer';
import type { DemoEffect, DemoSource, DemoState, UiProfile } from './types';
import { effectTimerKey } from './types';

/**
 * Dueño de los timers: el reducer es puro y sólo emite efectos como datos.
 *
 * Los timers viven en un `Map<string, Timeout>` con clave `kind:id`; un efecto
 * nuevo con la misma clave reprograma el anterior. `RESET` y `dispose` cancelan
 * todo (state-machine.md §4).
 */
export type DemoStore = {
  getState(): DemoState;
  dispatch(action: DemoAction): void;
  subscribe(listener: () => void): () => void;
  cancelTimers(): void;
  dispose(): void;
  pendingTimers(): number;
  /**
   * Cambia el dataset activo sin pasar por el reducer.
   *
   * No es una acción de la máquina de estados: el catálogo no es estado de
   * usuario (el mock nunca lo fue, se importaba). El modo live lo reemplaza con
   * cada foto de `/discovery`; `RESET` lo conserva. `DemoAction` sigue teniendo
   * las 27 acciones del contrato y el golden de paridad no cambia.
   */
  setCatalog(catalog: readonly UiProfile[], source: DemoSource): void;
};

export function createDemoStore(initial: DemoState = initialState()): DemoStore {
  let state = initial;
  let disposed = false;
  const listeners = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const notify = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const cancelTimers = (): void => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  };

  const schedule = (effect: DemoEffect): void => {
    const key = effectTimerKey(effect);
    const previous = timers.get(key);
    if (previous !== undefined) {
      clearTimeout(previous);
    }
    const timer = setTimeout(() => {
      timers.delete(key);
      dispatch({ type: 'TIMER_FIRED', kind: effect.kind, id: effect.id });
    }, effect.delayMs);
    timers.set(key, timer);
  };

  const dispatch = (action: DemoAction): void => {
    if (disposed) {
      return;
    }
    if (action.type === 'RESET') {
      cancelTimers();
    }
    const result = reduce(state, action);
    state = result.state;
    for (const effect of result.effects) {
      schedule(effect);
    }
    notify();
  };

  return {
    getState: () => state,
    dispatch,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancelTimers,
    dispose: () => {
      disposed = true;
      listeners.clear();
      cancelTimers();
    },
    pendingTimers: () => timers.size,
    setCatalog: (catalog, source) => {
      if (disposed) {
        return;
      }
      if (state.catalog === catalog && state.source === source) {
        return;
      }
      state = { ...state, catalog, source };
      notify();
    },
  };
}
