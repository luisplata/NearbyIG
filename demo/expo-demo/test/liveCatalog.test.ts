import { describe, expect, it } from 'vitest';

import { fixtures } from '../src/generated/fixtures';
import { toUiProfiles } from '../src/live/adapter';
import type { LiveProfileRow } from '../src/live/types';
import { projectState } from '../src/state/projection';
import { initialState, reduce } from '../src/state/reducer';
import { profileById, visibleProfiles } from '../src/state/selectors';
import { createDemoStore } from '../src/state/store';
import type { UiProfile } from '../src/state/types';

const LIVE_PROFILE = (overrides: Partial<UiProfile> = {}): UiProfile => ({
  id: 'mx-p02',
  nickname: 'Nico',
  initials: 'NI',
  gender: 'male',
  intention: 'friendship',
  verified: false,
  online: true,
  distanceM: 320,
  bearingDeg: 118,
  photoId: 'ph02',
  instagramHandle: 'nico.andando',
  statusKey: 'status.p02',
  bioKey: 'bio.p02',
  ...overrides,
});

const LIVE_CATALOG: readonly UiProfile[] = [
  LIVE_PROFILE({ id: 'mx-p02', distanceM: 320 }),
  LIVE_PROFILE({ id: 'mx-p01-b1', nickname: 'Vale', distanceM: 910, intention: 'networking' }),
];

describe('catálogo del estado', () => {
  it('arranca con el dataset del build', () => {
    const state = initialState();
    expect(state.source).toBe('dataset');
    expect(state.catalog).toHaveLength(fixtures.profiles.length);
    expect(visibleProfiles(state)).toHaveLength(10);
  });

  it('el store puede cambiar el dataset sin una acción del reducer', () => {
    const store = createDemoStore();
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });

    store.setCatalog(LIVE_CATALOG, 'live');
    expect(notified).toBe(1);
    expect(store.getState().source).toBe('live');
    expect(visibleProfiles(store.getState()).map((profile) => profile.id)).toEqual([
      'mx-p02',
      'mx-p01-b1',
    ]);
    expect(profileById('mx-p02', store.getState().catalog)?.nickname).toBe('Nico');
    expect(profileById('p01', store.getState().catalog)).toBeNull();
  });

  it('setCatalog con el mismo catálogo no avisa de nuevo', () => {
    const store = createDemoStore();
    store.setCatalog(LIVE_CATALOG, 'live');
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.setCatalog(LIVE_CATALOG, 'live');
    expect(notified).toBe(0);
  });

  it('los guards del reducer leen el catálogo activo (abrir el perfil de un bot live)', () => {
    const store = createDemoStore();
    store.setCatalog(LIVE_CATALOG, 'live');

    store.dispatch({ type: 'OPEN_OVERLAY', overlay: 'profile', profileId: 'mx-p01-b1' });
    expect(store.getState().profileId).toBe('mx-p01-b1');
    expect(store.getState().overlay).toBe('profile');

    store.dispatch({ type: 'SEND_PING', profileId: 'mx-p02' });
    expect(store.getState().pingsSent).toEqual(['mx-p02']);
  });

  it('un id que no está en el catálogo live sigue bloqueado por el guard', () => {
    const store = createDemoStore();
    store.setCatalog(LIVE_CATALOG, 'live');
    store.dispatch({ type: 'OPEN_OVERLAY', overlay: 'profile', profileId: 'p01' });
    expect(store.getState().overlay).toBeNull();
    expect(store.getState().profileId).toBeNull();
  });

  it('RESET reinicia la demo sobre el catálogo vivo en vez de saltar al dataset', () => {
    const store = createDemoStore();
    store.setCatalog(LIVE_CATALOG, 'live');
    store.dispatch({ type: 'OPEN_OVERLAY', overlay: 'profile', profileId: 'mx-p02' });

    store.dispatch({ type: 'RESET' });
    expect(store.getState().view).toBe('list');
    expect(store.getState().overlay).toBeNull();
    expect(store.getState().source).toBe('live');
    expect(visibleProfiles(store.getState()).map((profile) => profile.id)).toEqual([
      'mx-p02',
      'mx-p01-b1',
    ]);
  });

  it('volver al dataset restaura los 10 perfiles del build', () => {
    const store = createDemoStore();
    store.setCatalog(LIVE_CATALOG, 'live');
    store.setCatalog(fixtures.profiles, 'dataset');
    expect(store.getState().source).toBe('dataset');
    expect(visibleProfiles(store.getState())).toHaveLength(10);
  });

  it('el catálogo no entra en la proyección: el golden de paridad no se mueve', () => {
    const base = initialState();
    const live = { ...base, catalog: LIVE_CATALOG, source: 'live' as const };
    expect(projectState(live)).toBe(projectState(base));
  });

  it('los filtros existentes funcionan contra el catálogo del backend', () => {
    const base = initialState(LIVE_CATALOG, 'live');
    const narrowed = reduce(base, { type: 'TOGGLE_FILTER_INTENTION', intention: 'friendship' }).state;
    expect(visibleProfiles(narrowed).map((profile) => profile.id)).toEqual(['mx-p02']);

    const small = reduce(base, { type: 'SET_RADIUS', radiusM: 500 }).state;
    expect(visibleProfiles(small).map((profile) => profile.id)).toEqual(['mx-p02']);

    const online = reduce(base, { type: 'TOGGLE_ONLINE_ONLY' }).state;
    expect(visibleProfiles(online)).toHaveLength(2);
  });
});

describe('catálogo live desde el adapter', () => {
  it('el adapter produce un catálogo que el estado acepta tal cual', () => {
    const row = (overrides: Partial<LiveProfileRow> = {}): LiveProfileRow => ({
      profileId: 'mx-p01',
      regionKey: 'mx',
      demoSlot: 1,
      sourceType: 'human',
      nickname: 'Vale',
      initials: 'VA',
      intention: 'networking',
      gender: 'female',
      verified: true,
      online: true,
      inUse: false,
      distanceM: 240,
      bearingDeg: 32,
      photoId: 'ph01',
      instagramHandle: 'vale.works',
      statusKey: 'status.p01',
      bioKey: 'bio.p01',
      ...overrides,
    });
    const store = createDemoStore();
    store.setCatalog(toUiProfiles([row(), row({ profileId: 'mx-p01-b1', distanceM: 900 })]), 'live');

    expect(store.getState().catalog.map((profile) => profile.id)).toEqual(['mx-p01', 'mx-p01-b1']);
    expect(visibleProfiles(store.getState()).map((profile) => profile.distanceM)).toEqual([240, 900]);
  });
});
