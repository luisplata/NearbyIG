import { fixtures } from '../generated/fixtures';

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
   * usuario (el dataset nunca lo fue, se importaba). El modo live lo reemplaza con
   * cada foto de `/discovery`; `RESET` lo conserva. `DemoAction` sigue teniendo
   * las 27 acciones del contrato y el golden de paridad no cambia.
   *
   * `botIds` viaja al lado del catálogo porque `UiProfile` es el espejo de los 13
   * campos del dataset: la identidad de origen no se dibuja pero el filtro de
   * bots la necesita.
   */
  setCatalog(catalog: readonly UiProfile[], source: DemoSource, botIds?: readonly string[]): void;
  /**
   * Preferencia de UI: incluir los bots en lista, radar y mapa.
   *
   * Igual que `setCatalog`, no es una acción del contrato: es una decisión que
   * el usuario cambia desde un switch y que se persiste fuera del estado.
   */
  setIncludeBots(value: boolean): void;
  /**
   * Toast de un evento que no nace en el reducer (un ping live). Usa el mismo
   * timer y el mismo host que los toasts del guion, así no hay dos componentes
   * de aviso conviviendo. `textKey` tiene que existir en el catálogo.
   */
  pushToast(textKey: string): void;
};

/** Igualdad por contenido: el provider puede pasar un array nuevo en cada render. */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((id, index) => id === b[index]));
}

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
    setCatalog: (catalog, source, botIds) => {
      if (disposed) {
        return;
      }
      const nextBotIds = botIds ?? state.botIds;
      if (state.catalog === catalog && state.source === source && sameIds(state.botIds, nextBotIds)) {
        return;
      }
      state = { ...state, catalog, source, botIds: nextBotIds };
      notify();
    },
    setIncludeBots: (value) => {
      if (disposed || state.includeBots === value) {
        return;
      }
      state = { ...state, includeBots: value };
      notify();
    },
    pushToast: (textKey) => {
      if (disposed) {
        return;
      }
      const seq = state.toastSeq + 1;
      const toast = { id: `t${seq}`, textKey };
      state = { ...state, toastSeq: seq, toast };
      schedule({ kind: 'toast', id: toast.id, delayMs: fixtures.timers.toastMs });
      notify();
    },
  };
}
