import { describe, expect, it } from 'vitest';

import {
  clearStoredPreferences,
  readStoredPreferences,
  writeStoredPreferences,
  PREFERENCES_STORAGE_KEY,
  type PreferenceStore,
} from '../src/live/config';
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  preferencesOf,
  resetActions,
  restoreActions,
  samePreferences,
  serializePreferences,
  type Preferences,
} from '../src/live/preferences';
import { initialState, reduce } from '../src/state/reducer';
import { visibleProfiles } from '../src/state/selectors';
import { createDemoStore } from '../src/state/store';
import type { UiProfile } from '../src/state/types';

/** Storage de mentira: el test cubre el round-trip sin `window`. */
function fakeStore(): PreferenceStore & { dump: Map<string, string> } {
  const dump = new Map<string, string>();
  return {
    dump,
    getItem: (key) => dump.get(key) ?? null,
    setItem: (key, value) => {
      dump.set(key, value);
    },
    removeItem: (key) => {
      dump.delete(key);
    },
  };
}

const CUSTOM: Preferences = {
  radiusM: 1000,
  intentions: ['networking', 'friendship'],
  gender: 'female',
  verifiedOnly: true,
  onlineOnly: true,
  includeBots: false,
  soundEnabled: false,
};

describe('modelo de preferencias', () => {
  it('sin storage o con basura no hay preferencias que hidratar', () => {
    expect(parsePreferences(null)).toBeNull();
    expect(parsePreferences('')).toBeNull();
    expect(parsePreferences('{')).toBeNull();
    expect(parsePreferences('[]')).toBeNull();
    expect(parsePreferences('null')).toBeNull();
  });

  it('round-trip exacto: lo guardado vuelve igual', () => {
    const parsed = parsePreferences(serializePreferences(CUSTOM));
    expect(parsed).toEqual(CUSTOM);
    expect(samePreferences(parsed!, CUSTOM)).toBe(true);
  });

  it('un campo inválido cae a su default y no borra el resto', () => {
    const parsed = parsePreferences(
      JSON.stringify({
        radiusM: 1234,
        intentions: ['networking', 'inventada', 'networking'],
        gender: 'otro',
        verifiedOnly: 'sí',
        onlineOnly: true,
        includeBots: false,
      }),
    );
    expect(parsed).toEqual({
      radiusM: DEFAULT_PREFERENCES.radiusM,
      intentions: ['networking'],
      gender: null,
      verifiedOnly: DEFAULT_PREFERENCES.verifiedOnly,
      onlineOnly: true,
      includeBots: false,
      soundEnabled: DEFAULT_PREFERENCES.soundEnabled,
    });
  });

  it('los filtros del estado se proyectan a preferencias', () => {
    const state = initialState();
    const prefs = preferencesOf(
      { ...state.filters, radiusM: 500, gender: 'male', onlineOnly: true },
      false,
    );
    expect(prefs).toEqual({
      radiusM: 500,
      intentions: null,
      gender: 'male',
      verifiedOnly: false,
      onlineOnly: true,
      includeBots: false,
      soundEnabled: DEFAULT_PREFERENCES.soundEnabled,
    });
  });

  it('serializar es estable: el orden de intenciones no cambia los bytes', () => {
    const a = { ...CUSTOM, intentions: ['networking', 'friendship'] as Preferences['intentions'] };
    const b = { ...CUSTOM, intentions: ['friendship', 'networking'] as Preferences['intentions'] };
    expect(serializePreferences(a)).toBe(serializePreferences(b));
    expect(parsePreferences(serializePreferences(b))!.intentions).toEqual([
      'networking',
      'friendship',
    ]);
  });
});

describe('hidratación y reset', () => {
  it('restoreActions sólo toca lo que difiere de fábrica', () => {
    expect(restoreActions(DEFAULT_PREFERENCES)).toEqual([]);
    expect(restoreActions({ ...CUSTOM, intentions: null, gender: null })).toEqual([
      { type: 'SET_RADIUS', radiusM: 1000 },
      { type: 'TOGGLE_VERIFIED_ONLY' },
      { type: 'TOGGLE_ONLINE_ONLY' },
    ]);
    expect(restoreActions(CUSTOM)).toEqual([
      { type: 'SET_RADIUS', radiusM: 1000 },
      { type: 'TOGGLE_FILTER_INTENTION', intention: 'networking' },
      { type: 'TOGGLE_FILTER_INTENTION', intention: 'friendship' },
      { type: 'SET_GENDER_FILTER', gender: 'female' },
      { type: 'TOGGLE_VERIFIED_ONLY' },
      { type: 'TOGGLE_ONLINE_ONLY' },
    ]);
  });

  it('las acciones de restore dejan el reducer en el estado guardado', () => {
    let state = initialState();
    for (const action of restoreActions(CUSTOM)) {
      state = reduce(state, action).state;
    }
    expect(state.filters.radiusM).toBe(1000);
    expect(state.filters.intentions).toEqual(['networking', 'friendship']);
    expect(state.filters.gender).toBe('female');
    expect(state.filters.verifiedOnly).toBe(true);
    expect(state.filters.onlineOnly).toBe(true);
    // El sonido es una preferencia más: la foto tiene que reflejar el toggle.
    expect(preferencesOf(state.filters, false, CUSTOM.soundEnabled)).toEqual(CUSTOM);
  });

  it('restablecer vuelve a fábrica sin tocar la zona ni la sesión', () => {
    let state = initialState();
    for (const action of restoreActions(CUSTOM)) {
      state = reduce(state, action).state;
    }
    for (const action of resetActions()) {
      state = reduce(state, action).state;
    }
    expect(preferencesOf(state.filters, true)).toEqual(DEFAULT_PREFERENCES);
    // La zona no es estado del reducer: nada de este reset la puede mover.
    expect(resetActions().some((action) => JSON.stringify(action).includes('Zone'))).toBe(false);
    expect(visibleProfiles(state)).toHaveLength(10);
  });
});

describe('storage de preferencias', () => {
  it('una recarga hidrata el store completo: filtros y bots', () => {
    const storage = fakeStore();
    writeStoredPreferences(serializePreferences(CUSTOM), storage);

    const bot: UiProfile = {
      id: 'mx-p02-b1',
      nickname: 'Fran',
      initials: 'FR',
      gender: 'female',
      intention: 'networking',
      verified: true,
      online: true,
      distanceM: 900,
      bearingDeg: 90,
      photoId: 'ph02',
      instagramHandle: 'fran',
      statusKey: 'status.p02',
      bioKey: 'bio.p02',
    };
    const human: UiProfile = { ...bot, id: 'mx-p02', nickname: 'Nico', distanceM: 320 };
    const store = createDemoStore(initialState([human, bot], 'live', [bot.id]));

    // Exactamente lo que hace PreferencesProvider al montar.
    const stored = parsePreferences(readStoredPreferences(storage))!;
    for (const action of restoreActions(stored)) {
      store.dispatch(action);
    }
    store.setIncludeBots(stored.includeBots);

    const state = store.getState();
    expect(preferencesOf(state.filters, state.includeBots, stored.soundEnabled)).toEqual(CUSTOM);
    expect(state.catalog).toHaveLength(2);
    expect(visibleProfiles(state).map((profile) => profile.id)).toEqual(['mx-p02']);
  });

  it('escribe, lee y borra en la clave del build', () => {
    const store = fakeStore();
    writeStoredPreferences(serializePreferences(CUSTOM), store);
    expect(store.dump.get(PREFERENCES_STORAGE_KEY)).toBe(serializePreferences(CUSTOM));
    expect(parsePreferences(readStoredPreferences(store))).toEqual(CUSTOM);

    clearStoredPreferences(store);
    expect(readStoredPreferences(store)).toBeNull();
  });

  it('sin storage disponible no rompe: lee null y escribe sin error', () => {
    expect(readStoredPreferences(null)).toBeNull();
    expect(() => writeStoredPreferences('{}', null)).not.toThrow();
    expect(() => clearStoredPreferences(null)).not.toThrow();
  });

  it('la clave no guarda coordenadas ni token', () => {
    const raw = serializePreferences(CUSTOM);
    expect(raw).not.toMatch(/lat|lng|token/i);
    expect(PREFERENCES_STORAGE_KEY).toBe('nearbyig.preferences');
  });
});
