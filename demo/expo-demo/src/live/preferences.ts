import { fixtures } from '../generated/fixtures';
import type { Gender, Intention } from '../generated/fixtures';
import type { DemoAction } from '../state/actions';
import type { DiscoveryFilters } from '../state/types';

/**
 * Preferencias del usuario que sobreviven a una recarga.
 *
 * **Qué guarda.** Sólo decisiones de UI que el usuario tomó a mano: radio,
 * intenciones, género, verificados, en línea, el toggle de bots y el de sonidos.
 * La zona ya tiene su propia clave (`nearbyig.demoZone`) y la sesión es efímera
 * por contrato: el token no se persiste, así que recargar abre una sesión nueva.
 *
 * **Por qué un módulo aparte.** No es estado de la máquina de estados (el
 * reducer tiene 27 acciones congeladas y el golden de paridad no puede moverse).
 * Es un almacén de preferencias que hidrata el store y vuelve a escribir cuando
 * el usuario cambia algo. Puro: entra un string, sale un objeto validado; el
 * storage lo toca `live/config.ts`.
 *
 * **Validación liberal, campo por campo.** Un JSON corrupto o un valor fuera del
 * vocabulario no borra todas las preferencias: cada campo inválido cae a su
 * default. Así una versión vieja del storage no deja al usuario sin nada.
 */
export type Preferences = {
  radiusM: number;
  intentions: Intention[] | null;
  gender: Gender | null;
  verifiedOnly: boolean;
  onlineOnly: boolean;
  includeBots: boolean;
  /**
   * Sonidos de la demo. Es una preferencia de UI más (no estado del reducer) y
   * vive en el mismo JSON: apagarla tiene que sobrevivir a la recarga igual que
   * el toggle de bots.
   */
  soundEnabled: boolean;
};

/** Los valores de fábrica: mismo estado que `initialState()` del reducer. */
export const DEFAULT_PREFERENCES: Preferences = {
  radiusM: fixtures.filters.defaultRadiusM,
  intentions: null,
  gender: null,
  verifiedOnly: false,
  onlineOnly: false,
  includeBots: true,
  soundEnabled: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const RADII: readonly number[] = fixtures.filters.radiiM;
const INTENTIONS: readonly Intention[] = fixtures.filters.intentions;
const GENDERS: readonly Gender[] = fixtures.filters.genders;

function readRadius(value: unknown): number {
  return typeof value === 'number' && RADII.includes(value)
    ? value
    : DEFAULT_PREFERENCES.radiusM;
}

function readIntentions(value: unknown): Intention[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const selected = value.filter(
    (item): item is Intention => typeof item === 'string' && INTENTIONS.includes(item as Intention),
  );
  if (selected.length === 0) {
    return null;
  }
  // Mismo orden que el catálogo: dos listas equivalentes no producen distinto JSON.
  return INTENTIONS.filter((intention) => selected.includes(intention));
}

function readGender(value: unknown): Gender | null {
  if (typeof value !== 'string') {
    return null;
  }
  return GENDERS.includes(value as Gender) ? (value as Gender) : null;
}

function readFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Preferencias guardadas, o `null` si no hay nada legible (basura, `null`, `{}`). */
export function parsePreferences(raw: string | null | undefined): Preferences | null {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  return {
    radiusM: readRadius(parsed['radiusM']),
    intentions: readIntentions(parsed['intentions']),
    gender: readGender(parsed['gender']),
    verifiedOnly: readFlag(parsed['verifiedOnly'], DEFAULT_PREFERENCES.verifiedOnly),
    onlineOnly: readFlag(parsed['onlineOnly'], DEFAULT_PREFERENCES.onlineOnly),
    includeBots: readFlag(parsed['includeBots'], DEFAULT_PREFERENCES.includeBots),
    soundEnabled: readFlag(parsed['soundEnabled'], DEFAULT_PREFERENCES.soundEnabled),
  };
}

/**
 * Normaliza el orden de las intenciones al del catálogo. Dos listas equivalentes
 * —mismo conjunto, distinto orden— tienen que producir los mismos bytes, o el
 * efecto de guardado escribiría en cada render.
 */
export function normalizePreferences(prefs: Preferences): Preferences {
  return {
    ...prefs,
    intentions:
      prefs.intentions === null ? null : INTENTIONS.filter((item) => prefs.intentions!.includes(item)),
  };
}

/** JSON estable: mismas preferencias ⇒ mismos bytes (el efecto de guardado dedupea por esto). */
export function serializePreferences(prefs: Preferences): string {
  const normalized = normalizePreferences(prefs);
  return JSON.stringify({
    radiusM: normalized.radiusM,
    intentions: normalized.intentions,
    gender: normalized.gender,
    verifiedOnly: normalized.verifiedOnly,
    onlineOnly: normalized.onlineOnly,
    includeBots: normalized.includeBots,
    soundEnabled: normalized.soundEnabled,
  });
}

/**
 * Foto de las preferencias a partir del estado del store. `soundEnabled` no
 * vive en el reducer (no es una acción del contrato): lo aporta el provider.
 */
export function preferencesOf(
  filters: DiscoveryFilters,
  includeBots: boolean,
  soundEnabled: boolean = DEFAULT_PREFERENCES.soundEnabled,
): Preferences {
  return {
    radiusM: filters.radiusM,
    intentions: filters.intentions === null ? null : [...filters.intentions],
    gender: filters.gender,
    verifiedOnly: filters.verifiedOnly,
    onlineOnly: filters.onlineOnly,
    includeBots,
    soundEnabled,
  };
}

export function samePreferences(a: Preferences, b: Preferences): boolean {
  return serializePreferences(a) === serializePreferences(b);
}

/**
 * Acciones que llevan un store **recién creado** (defaults) al estado guardado.
 *
 * Se derivan de los defaults, no del estado actual, porque la hidratación corre
 * una sola vez al montar. Cada intención guardada se prende con su TOGGLE (el
 * reducer las ordena y valida), y los booleanos sólo si difieren del default.
 * `includeBots` no es acción: el store lo aplica con `setIncludeBots`.
 */
export function restoreActions(prefs: Preferences): DemoAction[] {
  const actions: DemoAction[] = [];
  if (prefs.radiusM !== DEFAULT_PREFERENCES.radiusM) {
    actions.push({ type: 'SET_RADIUS', radiusM: prefs.radiusM });
  }
  for (const intention of prefs.intentions ?? []) {
    actions.push({ type: 'TOGGLE_FILTER_INTENTION', intention });
  }
  if (prefs.gender !== null) {
    actions.push({ type: 'SET_GENDER_FILTER', gender: prefs.gender });
  }
  if (prefs.verifiedOnly) {
    actions.push({ type: 'TOGGLE_VERIFIED_ONLY' });
  }
  if (prefs.onlineOnly) {
    actions.push({ type: 'TOGGLE_ONLINE_ONLY' });
  }
  return actions;
}

/**
 * Acciones del botón "Restablecer": radio de fábrica y filtros limpios.
 *
 * No toca la zona (`nearbyig.demoZone`) ni la sesión: son decisiones distintas y
 * restablecer filtros no tiene por qué mover al usuario de ciudad. El toggle de
 * bots lo resetea el provider con `setIncludeBots`.
 */
export function resetActions(): DemoAction[] {
  return [
    { type: 'CLEAR_FILTERS' },
    { type: 'SET_RADIUS', radiusM: DEFAULT_PREFERENCES.radiusM },
  ];
}
