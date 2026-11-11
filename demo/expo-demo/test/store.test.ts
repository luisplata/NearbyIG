import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../src/generated/fixtures';
import { initialState } from '../src/state/reducer';
import { createDemoStore } from '../src/state/store';

const firstPingId = fixtures.script.firstPingTargetId;

afterEach(() => {
  vi.useRealTimers();
});

describe('store: ciclo de vida de los timers', () => {
  it('RESET cancela los timers pendientes y no deja trabajo agendado', () => {
    vi.useFakeTimers();
    const store = createDemoStore(initialState());

    store.dispatch({ type: 'SEND_PING', profileId: firstPingId });
    expect(store.pendingTimers()).toBeGreaterThan(0);

    store.dispatch({ type: 'RESET' });
    expect(store.pendingTimers()).toBe(0);

    vi.runAllTimers();
    expect(store.pendingTimers()).toBe(0);
    expect(store.getState().incomingPings).toEqual([]);
  });

  it('cancelTimers (cleanup del provider) no deja el store muerto', () => {
    // El provider cancela timers en el cleanup; con StrictMode el mismo store
    // se vuelve a montar y tiene que seguir respondiendo.
    vi.useFakeTimers();
    const store = createDemoStore(initialState());

    store.dispatch({ type: 'SET_VIEW', view: 'list' });
    store.cancelTimers();
    expect(store.pendingTimers()).toBe(0);

    store.dispatch({ type: 'SET_VIEW', view: 'map' });
    expect(store.getState().view).toBe('map');

    store.dispatch({ type: 'SEND_PING', profileId: firstPingId });
    expect(store.pendingTimers()).toBeGreaterThan(0);

    store.cancelTimers();
    expect(store.pendingTimers()).toBe(0);
  });
});
