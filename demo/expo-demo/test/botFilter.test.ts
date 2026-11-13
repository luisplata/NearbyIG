import { describe, expect, it } from 'vitest';

import { fixtures } from '../src/generated/fixtures';
import { initialState } from '../src/state/reducer';
import { bellBadgeCount, pingsBadgeCount, visibleProfiles } from '../src/state/selectors';
import { createDemoStore } from '../src/state/store';
import type { DemoState, UiProfile } from '../src/state/types';

const PROFILE = (id: string, distanceM: number): UiProfile => ({
  id,
  nickname: id,
  initials: id.slice(0, 2).toUpperCase(),
  gender: 'female',
  intention: 'networking',
  verified: false,
  online: true,
  distanceM,
  bearingDeg: 90,
  photoId: 'ph01',
  instagramHandle: id,
  statusKey: 'status.p01',
  bioKey: 'bio.p01',
});

/** Un humano y dos bots, como los entrega `GET /discovery` en modo live. */
const HUMAN = PROFILE('mx-p02', 320);
const BOT_1 = PROFILE('mx-p02-b1', 900);
const BOT_2 = PROFILE('mx-p03-b1', 1200);
const CATALOG: readonly UiProfile[] = [HUMAN, BOT_1, BOT_2];
const BOT_IDS = [BOT_1.id, BOT_2.id];

function liveState(overrides: Partial<DemoState> = {}): DemoState {
  return {
    ...initialState(CATALOG, 'live', BOT_IDS),
    ...overrides,
  };
}

const ids = (state: DemoState): string[] =>
  visibleProfiles(state).map((profile) => profile.id);

describe('filtro de bots', () => {
  it('por defecto los bots están incluidos', () => {
    const state = liveState();
    expect(state.includeBots).toBe(true);
    expect(ids(state)).toEqual(['mx-p02', 'mx-p02-b1', 'mx-p03-b1']);
  });

  it('apagados, lista, radar y mapa pierden los bots (mismo selector)', () => {
    const state = liveState({ includeBots: false });
    expect(ids(state)).toEqual(['mx-p02']);
  });

  it('el filtro es del cliente: no toca el catálogo ni el resto de los filtros', () => {
    const state = liveState({
      includeBots: false,
      filters: { ...liveState().filters, radiusM: 1000 },
    });
    expect(state.catalog).toHaveLength(3);
    expect(state.botIds).toEqual(BOT_IDS);
    expect(ids(state)).toEqual(['mx-p02']);
  });

  it('el dataset del build no tiene bots: el toggle no recorta nada', () => {
    const state = initialState();
    expect(state.botIds).toEqual([]);
    expect(ids(state)).toHaveLength(fixtures.profiles.length);
    expect(ids({ ...state, includeBots: false })).toHaveLength(fixtures.profiles.length);
  });
});

describe('toggle de bots en el store', () => {
  it('setIncludeBots avisa una vez y no cambia el catálogo', () => {
    const store = createDemoStore();
    store.setCatalog(CATALOG, 'live', BOT_IDS);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.setIncludeBots(false);
    expect(notified).toBe(1);
    expect(store.getState().catalog).toBe(CATALOG);
    expect(store.getState().botIds).toEqual(BOT_IDS);
    expect(ids(store.getState())).toEqual(['mx-p02']);

    store.setIncludeBots(false);
    expect(notified).toBe(1);
  });

  it('setCatalog compara los botIds por contenido, no por referencia', () => {
    const store = createDemoStore();
    store.setCatalog(CATALOG, 'live', [...BOT_IDS]);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.setCatalog(CATALOG, 'live', [...BOT_IDS]);
    expect(notified).toBe(0);
    store.setCatalog(CATALOG, 'live', [BOT_1.id]);
    expect(notified).toBe(1);
  });

  it('sin botIds explícitos conserva los que ya tenía', () => {
    const store = createDemoStore();
    store.setCatalog(CATALOG, 'live', BOT_IDS);
    store.setCatalog([HUMAN], 'live');
    expect(store.getState().botIds).toEqual(BOT_IDS);
  });
});

describe('badge de pings y notificaciones', () => {
  it('en live el badge es la bandeja real, no el guion del mock', () => {
    const state = liveState({ incomingPings: ['mx-p02', 'mx-p03'] });
    expect(pingsBadgeCount(state, 1)).toBe(1);
  });

  it('en dataset el badge sigue siendo el guion', () => {
    const state = initialState();
    expect(pingsBadgeCount({ ...state, incomingPings: ['p01', 'p02'] }, 0)).toBe(2);
  });

  it('la campana suma notificaciones sin leer + pings pendientes live', () => {
    const state = liveState({
      notifications: [
        { id: 'n1', kind: 'match', profileId: 'mx-p02', read: false },
        { id: 'n2', kind: 'ping', profileId: 'mx-p03', read: true },
      ],
    });
    expect(bellBadgeCount(state, 2)).toBe(3);
    // Sin sesión live no se suma nada: el número es el del guion.
    expect(bellBadgeCount(initialState(), 2)).toBe(0);
  });
});
