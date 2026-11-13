/**
 * Configuración del modo live.
 *
 * **Base de la API: build + runtime.** `EXPO_PUBLIC_API_URL` se inlinea al
 * compilar, pero un túnel (ngrok) cambia de URL en cada sesión y no puede exigir
 * un rebuild. Por eso hay dos overrides en runtime, en este orden:
 *
 *   1. `?api=https://...` en la URL de la **página** (el caso del túnel);
 *   2. `localStorage['nearbyig.api']`, que guarda el último `?api=` válido para
 *      que la siguiente visita al mismo túnel no dependa de la query;
 *   3. `EXPO_PUBLIC_API_URL` del build.
 *
 * Un override sólo vale si es `http(s)://host[:port]` con path opcional. Basura
 * (`javascript:`, `ftp://`, espacios, un string vacío) se descarta en silencio y
 * se sigue con la fuente siguiente: nunca se arma un `fetch` con algo que no sea
 * una URL.
 *
 * **CORS.** El origen que el backend tiene que permitir es el de la **página**
 * (de dónde sale el JS), no el de la API: el navegador compara el `Origin` de la
 * página contra lo que la API declare. Un túnel de la app se resuelve en la
 * allowlist del backend, no acá.
 *
 * **Zona demo persistida.** La región de la sesión sale de la zona elegida
 * (`cdmx → mx`, `bogota → co`), no de una variable de build: por eso no existe
 * `EXPO_PUBLIC_DEMO_REGION` ni un default `mx`. La elección se guarda en
 * `localStorage['nearbyig.demoZone']` para que recargar no vuelva a preguntar
 * ni, mucho menos, a abrir una sesión en la ciudad equivocada. `?zone=cdmx` /
 * `?zone=bogota` la fija desde la URL y `?zone=off` la borra; `?api=off` toca
 * **sólo** la base de la API y no la zona.
 */

/** Clave del override persistido. Sólo guarda la base: nunca una coordenada. */
export const API_STORAGE_KEY = 'nearbyig.api';

/** Clave de la zona demo elegida. Sólo guarda la clave (`cdmx`), nunca el punto. */
export const ZONE_STORAGE_KEY = 'nearbyig.demoZone';

/**
 * Clave de las preferencias del usuario: radio, filtros y toggle de bots.
 *
 * Guarda **sólo** decisiones de UI (números de radio, enums del catálogo y
 * booleanos). No hay coordenadas ni identidad de sesión: el punto del GPS sigue
 * viviendo en memoria y el token no se persiste.
 */
export const PREFERENCES_STORAGE_KEY = 'nearbyig.preferences';

export type LiveSettings = {
  /** Base de la API sin barra final. Puede ser relativa (mismo origen). */
  baseUrl: string;
};

/** De dónde salió la base que se está usando. */
export type ApiBaseOrigin = 'query' | 'storage' | 'env';

export type ApiBaseResolution = {
  /** Valor crudo; `readLiveSettings` lo normaliza igual que el del build. */
  raw: string;
  origin: ApiBaseOrigin;
};

/** Forma de una `zoneKey` del contrato (`^[a-z][a-z0-9-]*$`). No valida catálogo. */
const ZONE_KEY = /^[a-z][a-z0-9-]*$/;

/**
 * Normaliza la base: sin espacios y sin barras finales, porque los paths se
 * concatenan con una barra inicial (`/discovery`).
 */
export function normalizeBaseUrl(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || /\s/.test(trimmed)) {
    return null;
  }
  const withoutSlash = trimmed.replace(/\/+$/, '');
  return withoutSlash === '' ? null : withoutSlash;
}

/**
 * Un override de runtime tiene que ser absoluto y `http(s)`: la página se sirve
 * desde un origen y el navegador necesita una URL completa para hablar con otro.
 * Una base relativa (`/api`) sigue siendo válida desde el build, pero no como
 * override: en un túnel no significa nada.
 */
export function isHttpBaseUrl(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || /\s/.test(trimmed)) {
    return false;
  }
  return /^https?:\/\/[^/?#]+(?:[/?#].*)?$/i.test(trimmed) && normalizeBaseUrl(trimmed) !== null;
}

/**
 * Precedencia `query > storage > env`. Puro: los tres valores entran por
 * parámetro, así el test cubre la regla sin `window` ni `localStorage`.
 */
export function resolveApiBase(
  envUrl: string | undefined,
  queryUrl: string | null | undefined,
  storedUrl: string | null | undefined,
): ApiBaseResolution | null {
  if (isHttpBaseUrl(queryUrl)) {
    return { raw: (queryUrl as string).trim(), origin: 'query' };
  }
  if (isHttpBaseUrl(storedUrl)) {
    return { raw: (storedUrl as string).trim(), origin: 'storage' };
  }
  const fromEnv = normalizeBaseUrl(envUrl);
  return fromEnv === null ? null : { raw: fromEnv, origin: 'env' };
}

/**
 * Zona demo efectiva del arranque: `?zone=` de la página, si no la persistida.
 * Puro: los dos valores entran por parámetro.
 *
 * `null` **no** es "usá un default": es "todavía no hay zona elegida", y la UI
 * tiene que preguntarla. Es la regla que impide abrir una sesión en una ciudad
 * que el usuario no eligió.
 */
export function resolveZone(
  queryZone: string | null | undefined,
  storedZone: string | null | undefined,
): string | null {
  const fromQuery = normalizeZoneKey(queryZone);
  if (fromQuery !== null) {
    return fromQuery;
  }
  return normalizeZoneKey(storedZone);
}

/** Clave con forma de `zoneKey`, en minúsculas; basura o vacío ⇒ `null`. */
export function normalizeZoneKey(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.trim().toLowerCase();
  return ZONE_KEY.test(trimmed) ? trimmed : null;
}

/** `null` = modo live no configurado en este build (ni por override). */
export function readLiveSettings(apiUrl: string | undefined): LiveSettings | null {
  const baseUrl = normalizeBaseUrl(apiUrl);
  return baseUrl === null ? null : { baseUrl };
}

/** `?zone=...` de la URL actual, o `null` si no hay (o no hay `window`). */
export function readQueryZone(search: string | null): string | null {
  if (search === null || search === '') {
    return null;
  }
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return params.get('zone');
  } catch {
    return null;
  }
}

/** `?api=...` de la URL actual, o `null` si no hay (o no hay `window`). */
export function readQueryApi(search: string | null): string | null {
  if (search === null || search === '') {
    return null;
  }
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return params.get('api');
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage ?? null;
  } catch {
    // Modo privado o storage bloqueado: la demo funciona igual, sin override.
    return null;
  }
}

export function readStoredApi(): string | null {
  try {
    return storage()?.getItem(API_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeStoredApi(value: string): void {
  try {
    storage()?.setItem(API_STORAGE_KEY, value);
  } catch {
    // Sin storage el override vive lo que dura esta carga: no es un error.
  }
}

export function clearStoredApi(): void {
  try {
    storage()?.removeItem(API_STORAGE_KEY);
  } catch {
    // Igual que arriba: no hay nada que limpiar si no hay storage.
  }
}

export function readStoredZone(): string | null {
  try {
    return normalizeZoneKey(storage()?.getItem(ZONE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredZone(zoneKey: string): void {
  try {
    storage()?.setItem(ZONE_STORAGE_KEY, zoneKey);
  } catch {
    // Sin storage la elección vive lo que dura esta carga: no es un error.
  }
}

export function clearStoredZone(): void {
  try {
    storage()?.removeItem(ZONE_STORAGE_KEY);
  } catch {
    // Lo mismo: si no hay storage no hay nada que borrar.
  }
}

/**
 * Storage mínimo que necesitan las preferencias. Es estructuralmente `Storage`,
 * y entra por parámetro para que el test cubra el round-trip sin `window`.
 */
export type PreferenceStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Preferencias guardadas en crudo. El parseo/validación vive en `preferences`. */
export function readStoredPreferences(target: PreferenceStore | null = storage()): string | null {
  try {
    return target?.getItem(PREFERENCES_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeStoredPreferences(
  value: string,
  target: PreferenceStore | null = storage(),
): void {
  try {
    target?.setItem(PREFERENCES_STORAGE_KEY, value);
  } catch {
    // Sin storage las preferencias viven lo que dura esta carga: no es un error.
  }
}

export function clearStoredPreferences(target: PreferenceStore | null = storage()): void {
  try {
    target?.removeItem(PREFERENCES_STORAGE_KEY);
  } catch {
    // Igual que arriba: no hay nada que limpiar si no hay storage.
  }
}

/**
 * `?zone=off` borra la zona elegida. Es el reset de la elección: sin esto, un
 * usuario que eligió la ciudad equivocada no tendría forma de volver a elegir
 * desde la URL. `?api=off` **no** la toca: son overrides independientes.
 */
export function isClearZoneCommand(raw: string | null | undefined): boolean {
  return raw !== null && raw !== undefined && raw.trim().toLowerCase() === 'off';
}

/**
 * `?api=off` borra el override guardado y vuelve a la base del build. Sin esto,
 * un túnel viejo quedaría pegado en `localStorage` y la próxima visita seguiría
 * apuntando a una URL muerta sin forma de salir desde la UI.
 *
 * No toca la zona demo: son dos overrides distintos y apagar la API no tiene por
 * qué olvidar en qué ciudad está el usuario.
 */
export function isClearApiCommand(raw: string | null | undefined): boolean {
  return raw !== null && raw !== undefined && raw.trim().toLowerCase() === 'off';
}

/**
 * Zona demo efectiva para este arranque. `?zone=` válido se persiste (es el
 * atajo de demo más cómodo); `?zone=off` borra lo guardado; sin query manda la
 * elección persistida y, si no hay ninguna, `null`.
 *
 * Sólo toca `window`/`localStorage` cuando existen: en el export web y en
 * `expo start` sí, en un runtime sin DOM devuelve `null`.
 */
export function readRuntimeZone(): string | null {
  const search = typeof window === 'undefined' ? null : window.location.search;
  const query = readQueryZone(search);
  if (isClearZoneCommand(query)) {
    clearStoredZone();
    return null;
  }
  const resolved = resolveZone(query, readStoredZone());
  if (normalizeZoneKey(query) !== null && resolved !== null) {
    writeStoredZone(resolved);
  }
  return resolved;
}

/**
 * Base de la API efectiva para este arranque. Un `?api=` válido se persiste para
 * la próxima visita; uno inválido se ignora (y no pisa lo guardado); `?api=off`
 * borra lo guardado.
 *
 * Sólo toca `window`/`localStorage` cuando existen: en el export web y en
 * `expo start` sí, en un runtime sin DOM devuelve la del build.
 */
export function readRuntimeApiBase(envUrl: string | undefined): ApiBaseResolution | null {
  const search = typeof window === 'undefined' ? null : window.location.search;
  const query = readQueryApi(search);
  if (isClearApiCommand(query)) {
    clearStoredApi();
    return resolveApiBase(envUrl, null, null);
  }
  const resolved = resolveApiBase(envUrl, query, readStoredApi());
  if (resolved !== null && resolved.origin === 'query') {
    writeStoredApi(resolved.raw);
  }
  return resolved;
}

/** Settings del arranque: build + overrides de runtime ya resueltos. */
export function readRuntimeLiveSettings(envUrl: string | undefined): LiveSettings | null {
  const resolved = readRuntimeApiBase(envUrl);
  return readLiveSettings(resolved?.raw);
}
